"""Update admin/license services with first-activation terms. Run --check before --apply.

The fresh SQLite backup can be restored only before services resume. Once traffic
resumes, preserve the new schema/data and repair forward; never rewind customer data.
"""
import argparse, datetime, hashlib, json, pathlib, re, shutil, sqlite3, subprocess, tarfile, tempfile, time, urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', required=True)
parser.add_argument('--sha256', required=True)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.apply == args.check:
    parser.error('Choose exactly one of --check or --apply')
ROOT = pathlib.Path('/opt/tdh-relay-admin')
LICENSE = pathlib.Path('/opt/tdh-relay-license')
PUBLIC = pathlib.Path('/opt/tdh-relay-distribution/public')
CADDY = pathlib.Path('/opt/apibank/infra/docker/caddy/Caddyfile')
IMAGE = 'node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205'
SERVICES = ['tdh-relay-admin', 'tdh-relay-license']
PEERS = ['sub2api', 'independent-relay-test-self-relay-1', 'independent-relay-test-relay-ui-1', 'tdh-relay-distribution']

def run(command, **kwargs):
    result = subprocess.run(command, capture_output=True, text=True, timeout=60, **kwargs)
    if result.returncode:
        raise RuntimeError('command_failed_' + command[0])
    return result.stdout

def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def atomic(file, data):
    temporary = file.with_name(file.name + '.tdh-new')
    temporary.write_bytes(data)
    temporary.chmod(0o644)
    temporary.replace(file)

def state(names):
    result = {}
    for name in names:
        item = json.loads(run(['docker', 'inspect', name]))[0]
        if not item['State']['Running']:
            raise RuntimeError('service_not_running_' + name)
        result[name] = item['State']['StartedAt']
    return result

def ready(url, service):
    for _ in range(30):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if json.load(response).get('service') == service:
                    return
        except OSError:
            time.sleep(.25)
    raise RuntimeError('service_not_ready_' + service)

def snapshot():
    with sqlite3.connect('file:' + str(LICENSE/'data/licenses.sqlite') + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        licenses = [dict(r) for r in db.execute('SELECT l.*,COALESCE((SELECT MIN(at) FROM audit WHERE license_id=l.id AND kind=\'activated\'),(SELECT MIN(created_at) FROM activations WHERE license_id=l.id)) first_activation FROM licenses l ORDER BY id')]
        # Compare password hashes without printing or exporting them.
        users = hashlib.sha256(json.dumps([list(r) for r in db.execute('SELECT * FROM admin_users ORDER BY username')]).encode()).hexdigest()
        return licenses, users

def pinned(pattern, source):
    matches = re.findall(pattern, source)
    if len(matches) != 1:
        raise RuntimeError('unexpected_installer_pin')
    return matches[0]

archive = pathlib.Path(args.archive)
if sha(archive) != args.sha256:
    raise RuntimeError('bundle_checksum_mismatch')
if not (ROOT/'app/relay_product/admin/server.mjs').is_file():
    raise RuntimeError('existing_admin_required')
old_caddy = CADDY.read_bytes()
needle = '    @tdh_admin path /admin /admin/*'
if old_caddy.decode().count(needle) != 1 or '/portal' in old_caddy.decode():
    raise RuntimeError('unexpected_caddy_routes')
new_caddy = old_caddy.decode().replace(needle, needle + ' /portal /portal/*')
run(['docker', 'exec', '-i', 'docker-caddy-1', 'caddy', 'adapt', '--config', '-', '--adapter', 'caddyfile', '--validate'], input=new_caddy)
peer_state = state(PEERS)
state(SERVICES)
signing_hash = sha(LICENSE/'data/signing-private.pem')

with tempfile.TemporaryDirectory(prefix='tdh-portal-update-') as temporary:
    stage = pathlib.Path(temporary)
    with tarfile.open(archive) as tar:
        names = []
        for member in tar.getmembers():
            pure = pathlib.PurePosixPath(member.name)
            if not member.isfile() or member.size > 2000000 or pure.is_absolute() or '..' in pure.parts:
                raise RuntimeError('unsafe_bundle')
            names.append(member.name)
        if len(names) != len(set(names)):
            raise RuntimeError('duplicate_bundle_path')
        tar.extractall(stage, filter='data')
    manifest = json.loads((stage/'admin-bundle.json').read_text())
    if manifest['version'] != '1.1.0' or set(names) != set(manifest['files']) | {'admin-bundle.json'}:
        raise RuntimeError('unexpected_bundle')
    for name, digest in manifest['files'].items():
        if not re.fullmatch(r'[A-Za-z0-9._/-]+', name) or '..' in name.split('/') or sha(stage/name) != digest:
            raise RuntimeError('file_checksum_mismatch')
    live_manifest = json.loads((PUBLIC/'manifest.json').read_text())
    if live_manifest['version'] != '0.3.1' or live_manifest['node_version'] != '24.22.1':
        raise RuntimeError('unexpected_client_release')
    release_hashes = {}
    for name in ['tdh-relay.zip', 'tdh-relay.tar.gz']:
        release_hashes[name] = sha(PUBLIC/'releases/0.3.1'/name)
        if release_hashes[name] != live_manifest['artifacts'][name]['sha256']:
            raise RuntimeError('release_checksum_mismatch')
    old_ps = (PUBLIC/'setup.ps1').read_text()
    old_sh = (PUBLIC/'setup.sh').read_text()
    win_hashes = pinned(r"\$NodeHash = if \(\$Arch -eq 'arm64'\) \{ '([a-f0-9]{64})' \} else \{ '([a-f0-9]{64})' \}", old_ps)
    pins = {'@@VERSION@@': '0.3.1', '@@NODE_VERSION@@': '24.22.1', '@@ZIP_SHA@@': release_hashes['tdh-relay.zip'], '@@TGZ_SHA@@': release_hashes['tdh-relay.tar.gz'],
            '@@WIN_ARM64_SHA@@': win_hashes[0], '@@WIN_X64_SHA@@': win_hashes[1],
            '@@MAC_ARM64_SHA@@': pinned(r"arm64\) node_arch=arm64;node_hash='([a-f0-9]{64})'", old_sh),
            '@@MAC_X64_SHA@@': pinned(r"x86_64\) node_arch=x64;node_hash='([a-f0-9]{64})'", old_sh)}
    replacements = {}
    for name in manifest['files']:
        if name.startswith('relay_product/admin/') and pathlib.Path(name).suffix in {'.mjs', '.html', '.css', '.js'} or name in ['relay_product/license-server.mjs', 'relay_product/license-protocol.mjs']:
            replacements[ROOT/'app'/name] = (stage/name).read_bytes()
    for name in ['license-server.mjs', 'license-protocol.mjs']:
        if not (LICENSE/'app'/name).is_file():
            raise RuntimeError('unexpected_license_layout')
        replacements[LICENSE/'app'/name] = (stage/'relay_product'/name).read_bytes()
    for name in ['setup.ps1', 'setup.sh']:
        source = (stage/'relay_product/install'/(name + '.in')).read_text()
        for token, value in pins.items():
            source = source.replace(token, value)
        if '@@' in source:
            raise RuntimeError('unresolved_template')
        replacements[PUBLIC/name] = source.encode()
        (stage/name).write_text(source)
    run(['bash', '-n', str(stage/'setup.sh')])
    replacements[PUBLIC/'index.html'] = (stage/'relay_product/admin/web/public.html').read_bytes()
    replacements[PUBLIC/'README.md'] = (stage/'docs/relay-product/README.md').read_bytes()
    live_manifest['admin'] = {'version': '1.1.0', 'url': 'https://codex.tudonghoa.me/admin'}
    live_manifest['portal'] = {'version': '1.1.0', 'url': 'https://codex.tudonghoa.me/portal', 'statistics': 'manual_report_only'}
    live_manifest['license_term'] = 'first_successful_device_activation'
    replacements[PUBLIC/'manifest.json'] = (json.dumps(live_manifest, indent=2) + '\n').encode()
    rows, credentials = snapshot()
    if any('duration_ms' in r for r in rows):
        raise RuntimeError('activation_migration_already_applied')
    review = {'version': '1.1.0', 'licenses': len(rows), 'previously_activated': sum(r['first_activation'] is not None for r in rows), 'pending_to_migrate': sum(r['first_activation'] is None for r in rows), 'files': len(replacements)}
    if args.check:
        print(json.dumps({'preflight': 'passed', **review}))
    else:
        backup = ROOT/'backups'/('portal-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
        backup.mkdir(mode=0o700, parents=True)
        saved = {}
        for target in replacements:
            saved[target] = target.read_bytes() if target.exists() else None
            if saved[target] is not None:
                destination = backup/'files'/target.relative_to('/opt')
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(saved[target])
        (backup/'Caddyfile').write_bytes(old_caddy)
        resumed = False
        stopped = False
        changed_caddy = False
        try:
            run(['docker', 'stop', '--time', '5', *SERVICES]);stopped = True
            # Refresh state after writes have stopped, then take a consistent backup.
            before, credentials = snapshot()
            source = sqlite3.connect(LICENSE/'data/licenses.sqlite')
            destination = sqlite3.connect(backup/'licenses.sqlite')
            source.backup(destination);destination.close();source.close()
            (backup/'licenses.sqlite').chmod(0o600)
            for target, content in replacements.items():
                target.parent.mkdir(parents=True, exist_ok=True)
                atomic(target, content)
            run(['docker', 'run', '--rm', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL',
                 '-v', str(ROOT/'app') + ':/app:ro', '-v', str(LICENSE/'data') + ':/data', IMAGE,
                 'node', '--input-type=module', '-e', "import {LicenseAuthority} from '/app/relay_product/license-server.mjs';import {createAdminServer} from '/app/relay_product/admin/server.mjs';const a=new LicenseAuthority('/data');createAdminServer(a);a.close();"])
            after, after_credentials = snapshot()
            old = {r['id']: r for r in before}
            if len(after) != len(before) or credentials != after_credentials:
                raise RuntimeError('identity_preservation_failed')
            for row in after:
                previous = old[row['id']]
                for field in ['key_hash', 'label', 'max_devices', 'revoked', 'created_at']:
                    if row[field] != previous[field]:
                        raise RuntimeError('license_identity_changed')
                expected_expiry = previous['expires_at'] if previous['first_activation'] is not None else 0
                if row['expires_at'] != expected_expiry or row['started_at'] != previous['first_activation'] or row['duration_ms'] != max(1, previous['expires_at']-previous['created_at']):
                    raise RuntimeError('migration_contract_failed')
            if sha(LICENSE/'data/signing-private.pem') != signing_hash:
                raise RuntimeError('signing_key_changed')
            # From this point customers can write again. Never restore an old DB.
            resumed = True
            run(['docker', 'start', *SERVICES])
            ready('http://127.0.0.1:18331/healthz', 'tdh-license')
            ready('http://127.0.0.1:18332/healthz', 'tdh-admin')
            request = urllib.request.Request('http://127.0.0.1:18332/portal', headers={'Host': 'codex.tudonghoa.me'})
            with urllib.request.urlopen(request, timeout=5) as response:
                if response.status != 200 or b'/portal/assets/portal.js' not in response.read():
                    raise RuntimeError('portal_page_failed')
            if CADDY.read_bytes() != old_caddy:
                raise RuntimeError('caddy_concurrent_change')
            CADDY.write_text(new_caddy);changed_caddy = True
            run(['docker', 'exec', 'docker-caddy-1', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
            if state(PEERS) != peer_state or sha(LICENSE/'data/signing-private.pem') != signing_hash:
                raise RuntimeError('protected_state_changed')
            for name, digest in release_hashes.items():
                if sha(PUBLIC/'releases/0.3.1'/name) != digest:
                    raise RuntimeError('immutable_release_changed')
            result = {'deployed': True, **review, 'backup': str(backup), 'existing_activated_expiry_preserved': True, 'credentials_preserved': True, 'signing_key_preserved': True, 'peers_unchanged': True, 'client_archives_unchanged': True}
            (ROOT/'portal-deployment.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result))
        except Exception:
            if stopped and not resumed:
                for target, content in saved.items():
                    if content is None:
                        target.unlink(missing_ok=True)
                    else:
                        atomic(target, content)
                if (backup/'licenses.sqlite').exists():
                    # Both processes remain stopped; restoring cannot lose new writes.
                    for suffix in ['-wal', '-shm']:
                        (LICENSE/('data/licenses.sqlite' + suffix)).unlink(missing_ok=True)
                    shutil.copyfile(backup/'licenses.sqlite', LICENSE/'data/licenses.sqlite')
                    shutil.chown(LICENSE/'data/licenses.sqlite', 1000, 1000)
                run(['docker', 'start', *SERVICES])
            if changed_caddy:
                CADDY.write_bytes(old_caddy)
                run(['docker', 'exec', 'docker-caddy-1', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
            if resumed:
                print(json.dumps({'repair_forward_required': True, 'database_not_rewound': True, 'backup': str(backup)}))
            raise
