"""Scoped VPS hotfix for sub2api-test; never prints credentials or request bodies.

Run with sudo on its host: --probe, --apply, --verify, or --boundaries. --apply changes only
the test gateway's two body limits and the relay's persistent runtime setting.
It snapshots configuration, validates the complete Compose diff, recreates only
relay-ui, and restores the previous limits if deployment/verification fails.
"""
import argparse
import copy
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import time

ROOT = pathlib.Path('/opt/independent-relay-test')
COMPOSE = ROOT / 'compose.yaml'
GATEWAY = 'independent-relay-test-relay-ui-1'
RELAY = 'independent-relay-test-self-relay-1'
PUBLIC = 'https://sub2api-test.tudonghoa.me'
LOCAL = 'http://127.0.0.1:18320'
LIMIT = 64 * 1024 * 1024
PROBE_SIZE = 9 * 1024 * 1024
LIMIT_KEYS = ('GATEWAY_MAX_BODY_SIZE', 'GATEWAY_TEXT_MAX_BODY_SIZE')
PEERS = (RELAY, 'independent-relay-test-postgres-1',
         'independent-relay-test-redis-1', 'sub2api', 'docker-caddy-1',
         'tdh-relay-admin', 'tdh-relay-license', 'tdh-relay-distribution')


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def run(args, timeout=90):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    require(result.returncode == 0, 'command_failed_' + args[0])
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def snapshot(name):
    item = inspect(name)
    return {'id': item['Id'], 'image': item['Image'],
            'started_at': item['State']['StartedAt'],
            'health': item['State'].get('Health', {}).get('Status')}


def credentials():
    # Values stay in memory, never command-line arguments or reports.
    env = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines()
               if '=' in line and not line.startswith('#'))
    live = dict(v.split('=', 1) for v in inspect(RELAY)['Config']['Env'] if '=' in v)
    return {**env, **{k: live[k] for k in ('RELAY_ADMIN_KEY', 'RELAY_API_KEY')}}


def request(base, route, key=None, payload=None, timeout=180):
    if isinstance(payload, dict):
        payload = json.dumps(payload).encode()
    headers = ['Content-Type: application/json']
    if key:
        headers.append('Authorization: Bearer ' + key)
    descriptors = []

    def memory_file(data):
        descriptor = os.memfd_create('tdh-body-limit-probe', os.MFD_CLOEXEC)
        descriptors.append(descriptor)
        with os.fdopen(os.dup(descriptor), 'wb') as handle:
            handle.write(data)
        os.lseek(descriptor, 0, os.SEEK_SET)
        return '@/proc/self/fd/' + str(descriptor)

    # curl can read an early 413 while uploading. urllib may instead surface an
    # SSL EOF when the server closes the large upload after its smaller limit.
    # Headers and body are anonymous memory files; secrets never enter argv/disk.
    try:
        args = ['curl', '--silent', '--show-error', '--max-time', str(timeout),
                '--header', memory_file(('\n'.join(headers) + '\n').encode()),
                '--write-out', '\n%{http_code}']
        if payload is not None:
            args += ['--data-binary', memory_file(payload)]
        result = subprocess.run(args + [base + route], capture_output=True,
                                pass_fds=descriptors, timeout=timeout + 5)
        raw, _, status = result.stdout.rpartition(b'\n')
        require(result.returncode == 0, 'http_transport_failed_' + str(result.returncode))
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError):
            body = {}
        return int(status), body
    finally:
        for descriptor in descriptors:
            os.close(descriptor)


def relay_limit(env):
    status, body = request(LOCAL, '/admin/settings', env['RELAY_ADMIN_KEY'])
    require(status == 200, 'relay_settings_read_failed')
    return body['settings']['relay.max_body_bytes']


def set_relay_limit(env, value):
    status, body = request(LOCAL, '/admin/settings', env['RELAY_ADMIN_KEY'],
                           {'key': 'relay.max_body_bytes', 'value': value})
    require(status == 200 and body.get('ok'), 'relay_settings_write_failed')
    require(relay_limit(env) == value, 'relay_settings_not_persisted')


def probes(env, expected_limit):
    result = []
    for label, base, key in (('public_gateway', PUBLIC, env['TEST_API_KEY']),
                            ('private_relay', LOCAL, env['RELAY_API_KEY'])):
        for size in (1024, PROBE_SIZE):
            # Invalid JSON proves the body reader was reached without inference.
            payload = b' ' * (size - 1) + b'{'
            status, body = request(base, '/v1/responses', key, payload)
            expected = 413 if size > expected_limit else 400
            require(status == expected, f'{label}_size_{size}_status_{status}_expected_{expected}')
            result.append({'target': label, 'bytes': size, 'status': status,
                           'body_reader_reached': True})
    return result


def health_wait():
    for _ in range(60):
        if snapshot(GATEWAY)['health'] == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('gateway_health_timeout')


def compose_up():
    run(['docker', 'compose', '-f', str(COMPOSE), 'up', '-d',
         '--no-deps', '--no-build', '--pull', 'never', 'relay-ui'], timeout=120)
    health_wait()


def current_limits(env):
    gateway_env = dict(v.split('=', 1) for v in inspect(GATEWAY)['Config']['Env'] if '=' in v)
    return {**{k: int(gateway_env[k]) for k in LIMIT_KEYS},
            'relay.max_body_bytes': relay_limit(env)}


def apply(env):
    before_limits = current_limits(env)
    require(len(set(before_limits.values())) == 1, 'unexpected_mixed_limits')
    old_limit = before_limits['relay.max_body_bytes']
    require(old_limit in (2 * 1024 * 1024, LIMIT), 'unexpected_previous_limit')
    if old_limit == LIMIT:
        return {'changed': False, 'limits': before_limits, 'probes': probes(env, LIMIT)}

    # The baseline proves this is a size rejection, not an authentication failure.
    baseline = probes(env, old_limit)
    original = COMPOSE.read_bytes()
    original_mode = COMPOSE.stat().st_mode & 0o777
    original_config = json.loads(run(['docker', 'compose', '-f', str(COMPOSE),
                                     'config', '--format', 'json']))
    candidate_text = original.decode()
    for key in LIMIT_KEYS:
        candidate_text, count = re.subn(r'(?m)^(\s+)' + key + r': "2097152"$',
                                        r'\g<1>' + key + ': "67108864"', candidate_text)
        require(count == 1, 'compose_limit_not_unique_' + key)
    candidate = ROOT / 'compose.body-limit-candidate.yaml'
    with candidate.open('x') as handle:
        handle.write(candidate_text)
    candidate.chmod(original_mode)
    try:
        actual_config = json.loads(run(['docker', 'compose', '-f', str(candidate),
                                       'config', '--format', 'json']))
        expected_config = copy.deepcopy(original_config)
        for key in LIMIT_KEYS:
            expected_config['services']['relay-ui']['environment'][key] = str(LIMIT)
        require(actual_config == expected_config, 'unexpected_compose_changes')
    except Exception:
        candidate.unlink(missing_ok=True)
        raise

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = ROOT / 'backups' / ('body-limit-' + stamp)
    backup.mkdir(parents=True, mode=0o700)
    saved_compose = backup / 'compose.yaml'
    saved_compose.write_bytes(original)
    saved_compose.chmod(0o600)
    before_peers = {name: snapshot(name) for name in PEERS}
    before_gateway = snapshot(GATEWAY)
    before = {'limits': before_limits, 'peers': before_peers, 'gateway': before_gateway,
              'compose_sha256': hashlib.sha256(original).hexdigest()}
    (backup / 'before.json').write_text(json.dumps(before, indent=2))
    print(json.dumps({'event': 'baseline_confirmed', 'probes': baseline,
                      'backup': str(backup)}), flush=True)
    compose_changed = False
    try:
        require(COMPOSE.read_bytes() == original, 'compose_changed_concurrently')
        set_relay_limit(env, LIMIT)
        os.replace(candidate, COMPOSE)
        compose_changed = True
        compose_up()
        limits = current_limits(env)
        require(all(v == LIMIT for v in limits.values()), 'limits_not_effective')
        after_gateway = snapshot(GATEWAY)
        require(after_gateway['image'] == before_gateway['image'], 'gateway_image_changed')
        after_peers = {name: snapshot(name) for name in PEERS}
        require(all(after_peers[n]['id'] == before_peers[n]['id'] and
                    after_peers[n]['started_at'] == before_peers[n]['started_at']
                    for n in PEERS), 'unrelated_container_restarted')
        after_probes = probes(env, LIMIT)
        report = {'changed': True, 'backup': str(backup), 'limits': limits,
                  'baseline': baseline, 'probes': after_probes,
                  'gateway': after_gateway, 'unrelated_services_preserved': True,
                  'relay_restarted': False}
        (backup / 'result.json').write_text(json.dumps(report, indent=2))
        return report
    except Exception:
        set_relay_limit(env, old_limit)
        if compose_changed:
            COMPOSE.write_bytes(original)
            COMPOSE.chmod(original_mode)
            compose_up()
        print(json.dumps({'event': 'previous_limits_restored', 'backup': str(backup)}), flush=True)
        raise
    finally:
        candidate.unlink(missing_ok=True)


def verify(env):
    limits = current_limits(env)
    require(all(v == LIMIT for v in limits.values()), 'unexpected_limits')
    result = {'limits': limits, 'probes': probes(env, LIMIT), 'live_inference': []}
    # Large HTTP body, tiny semantic prompt: padding does not consume model tokens.
    # Two direct probes establish that both body readers accept >2 MiB.
    for label, base, key in (('public_gateway', PUBLIC, env['TEST_API_KEY']),
                            ('private_relay', LOCAL, env['RELAY_API_KEY'])):
        marker = 'TDH_BODY_LIMIT_OK'
        small = json.dumps({'model': 'gpt-6-astra', 'stream': False,
                            'input': f'Reply exactly {marker}. Do not use tools.',
                            'reasoning': {'effort': 'low'}}).encode()
        payload = b' ' * (PROBE_SIZE - len(small)) + small
        status, body = request(base, '/v1/responses', key, payload)
        answer = ''.join(part.get('text', '') for item in body.get('output', [])
                         if item.get('type') == 'message' for part in item.get('content', [])
                         if part.get('type') == 'output_text').strip()
        require(status == 200 and answer == marker, f'{label}_live_inference_failed_{status}')
        result['live_inference'].append({'target': label, 'bytes': len(payload),
                                         'status': status, 'expected_answer': True})
    return result


def boundaries(env):
    require(all(v == LIMIT for v in current_limits(env).values()), 'unexpected_limits')
    result = []
    for label, base, key in (('public_gateway', PUBLIC, env['TEST_API_KEY']),
                            ('private_relay', LOCAL, env['RELAY_API_KEY'])):
        for size, expected in ((LIMIT, 400), (LIMIT + 1, 413)):
            status, _ = request(base, '/v1/responses', key, b' ' * (size - 1) + b'{')
            require(status == expected, f'{label}_boundary_{size}_status_{status}')
            result.append({'target': label, 'bytes': size, 'status': status})
    return {'boundary_probes': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--probe', action='store_true')
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--boundaries', action='store_true')
    args = parser.parse_args()
    env = credentials()
    if args.apply:
        result = apply(env)
    elif args.verify:
        result = verify(env)
    elif args.boundaries:
        result = boundaries(env)
    else:
        limits = current_limits(env)
        require(len(set(limits.values())) == 1, 'unexpected_mixed_limits')
        result = {'limits': limits, 'probes': probes(env, limits['relay.max_body_bytes'])}
    report = {'result': 'passed', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), **result}
    if args.verify:
        (ROOT / 'body-limit-verification.json').write_text(json.dumps(report, indent=2))
    if args.boundaries:
        (ROOT / 'body-limit-boundaries.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid traceback, HTTP response bodies, and subprocess output with secrets.
        code = str(error) if isinstance(error, RuntimeError) and re.fullmatch(r'[a-zA-Z0-9_]+', str(error)) else type(error).__name__
        print(json.dumps({'result': 'failed', 'error': code}), flush=True)
        raise SystemExit(1)
