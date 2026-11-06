import argparse,json,pathlib,hashlib,tarfile,shutil,subprocess,time,urllib.request,datetime
ROOT=pathlib.Path('/opt/tdh-relay-distribution')
def run(args):
    result=subprocess.run(args,capture_output=True,text=True,timeout=45)
    if result.returncode:raise RuntimeError('command_failed')
    return result.stdout
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
args=argparse.ArgumentParser();args.add_argument('--archive',required=True);args.add_argument('--sha256',required=True);options=args.parse_args()
archive=pathlib.Path(options.archive)
if sha(archive)!=options.sha256:raise RuntimeError('archive_hash_mismatch')
stage=ROOT/('release-stage-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'));stage.mkdir(mode=0o700)
with tarfile.open(archive) as tar:
    for m in tar.getmembers():
        if not m.isfile() or m.size>10000000 or m.name.startswith('/') or '..' in pathlib.PurePosixPath(m.name).parts:raise RuntimeError('unsafe_archive')
    tar.extractall(stage,filter='data')
manifest=json.loads((stage/'distribution-manifest.json').read_text())
if manifest['version']!='0.3.1':raise RuntimeError('wrong_release')
for name,value in manifest['files'].items():
    if sha(stage/name)!=value:raise RuntimeError('file_hash_mismatch')
public=stage/'public'
if (public/'releases/0.2.0').exists() or (public/'LICENSE-ADMIN.md').exists():raise RuntimeError('private_or_obsolete_file')
before={name:json.loads(run(['docker','inspect',name]))[0]['State']['StartedAt'] for name in ['sub2api','independent-relay-test-self-relay-1','independent-relay-test-relay-ui-1']}
run(['docker','stop','tdh-relay-distribution'])
withdrawn=ROOT/('withdrawn-'+stage.name);shutil.move(ROOT/'public',withdrawn);withdrawn.chmod(0o700)
try:
    shutil.move(public,ROOT/'public')
    for p in [ROOT/'public',*(ROOT/'public').rglob('*')]:p.chmod(0o755 if p.is_dir() else 0o644)
    shutil.copy2(stage/'distribution-server.mjs',ROOT/'distribution-server.mjs');(ROOT/'distribution-server.mjs').chmod(0o644)
    run(['docker','start','tdh-relay-distribution'])
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:18330/manifest.json',timeout=2) as response:
                if json.load(response)['version']=='0.3.1':break
        except OSError:time.sleep(.5)
    else:raise RuntimeError('new_release_not_ready')
except Exception:
    (ROOT/'public/maintenance.flag').touch()
    raise
after={name:json.loads(run(['docker','inspect',name]))[0]['State']['StartedAt'] for name in before}
if before!=after:raise RuntimeError('peer_container_changed')
report={'result':'published','version':'0.3.1','public_source_removed':True,'peers_unchanged':True,'sha256':options.sha256}
(ROOT/'licensed-publish-result.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
