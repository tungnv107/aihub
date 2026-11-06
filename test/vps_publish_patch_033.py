"""Stage immutable 0.3.3 artifacts, then advertise only after release verification."""
import argparse, datetime, hashlib, json, pathlib, shutil, subprocess, tarfile, tempfile
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive',required=True);parser.add_argument('--sha256',required=True)
parser.add_argument('--phase',choices=['stage','publish'],required=True)
parser.add_argument('--verification')
args=parser.parse_args()
ROOT=pathlib.Path('/opt/tdh-relay-distribution');PUBLIC=ROOT/'public';VERSION='0.3.3'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def atomic(file,data):
    temporary=file.with_name(file.name+'.patch-new');temporary.write_bytes(data);temporary.chmod(0o644);temporary.replace(file)
def containers():
    names=['tdh-relay-license','tdh-relay-admin','tdh-relay-distribution','sub2api','independent-relay-test-self-relay-1','independent-relay-test-relay-ui-1']
    output=subprocess.check_output(['docker','inspect',*names],text=True,timeout=20)
    return {row['Name']:(row['State']['Running'],row['State']['StartedAt']) for row in json.loads(output)}
archive=pathlib.Path(args.archive)
if sha(archive)!=args.sha256:raise RuntimeError('archive_checksum_mismatch')
old=json.loads((PUBLIC/'manifest.json').read_text())
if old['version']!='0.3.2':raise RuntimeError('unexpected_current_release')
before=containers()
with tempfile.TemporaryDirectory(prefix='tdh-patch-') as directory:
    stage=pathlib.Path(directory)
    with tarfile.open(archive) as tar:
        names=[]
        for member in tar.getmembers():
            name=pathlib.PurePosixPath(member.name)
            if not member.isfile() or member.size>10000000 or name.is_absolute() or '..' in name.parts:raise RuntimeError('unsafe_archive')
            names.append(member.name)
        if len(names)!=len(set(names)):raise RuntimeError('duplicate_path')
        tar.extractall(stage,filter='data')
    manifest=json.loads((stage/'distribution-manifest.json').read_text())
    if manifest['version']!=VERSION or set(names)!=set(manifest['files'])|{'distribution-manifest.json'}:raise RuntimeError('unexpected_distribution')
    for name,digest in manifest['files'].items():
        if sha(stage/name)!=digest:raise RuntimeError('distribution_checksum_mismatch')
    current=json.loads((stage/'public/manifest.json').read_text())
    if current['version']!=VERSION or current['policy_revision']!=old['policy_revision']:raise RuntimeError('unexpected_release')
    archive_names=['tdh-relay.zip','tdh-relay.tar.gz']
    old_hashes={name:sha(PUBLIC/'releases/0.3.2'/name) for name in archive_names}
    for name in archive_names:
        if old_hashes[name]!=old['artifacts'][name]['sha256']:raise RuntimeError('old_release_changed')
        source=stage/'public/releases'/VERSION/name
        if sha(source)!=current['artifacts'][name]['sha256']:raise RuntimeError('new_release_checksum_mismatch')
    release=PUBLIC/'releases'/VERSION;release.mkdir(mode=0o755,exist_ok=True)
    for name in archive_names:
        source=stage/'public/releases'/VERSION/name;target=release/name
        if target.exists():
            if sha(target)!=sha(source):raise RuntimeError('immutable_release_conflict')
        else:
            atomic(target,source.read_bytes())
    result={'version':VERSION,'phase':args.phase,'client_archives_staged':True}
    if args.phase=='publish':
        if not args.verification:raise RuntimeError('verification_required')
        checks=json.loads(pathlib.Path(args.verification).read_text())
        required=['regression_suite','signed_bundle_config_recovery','windows_upgrade_032_to_033','license_activation_preserved','config_credentials_preserved','direct_reset_recovered','conflict_rollback_verified']
        if checks.get('version')!=VERSION or any(checks.get(key) is not True for key in required):raise RuntimeError('release_not_verified')
        current['verification']={**checks,'macos_native_install':'not_tested_no_mac_host','quota_parity':'not_proven'}
        for key in ['admin','portal','diagnostics','license_term']:
            if key in old:current[key]=old[key]
        replacements={PUBLIC/name:(stage/'public'/name).read_bytes() for name in ['setup.ps1','setup.sh','README.md','PROXY.md','index.html']}
        replacements[PUBLIC/'manifest.json']=(json.dumps(current,indent=2)+'\n').encode()
        for name in ['setup.ps1','setup.sh']:
            text=replacements[PUBLIC/name].decode()
            if '@@' in text or '/releases/' not in text:raise RuntimeError('bad_installer')
        backup=ROOT/'backups'/('patch-033-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
        backup.mkdir(parents=True,mode=0o700)
        for target in replacements:shutil.copy2(target,backup/target.name)
        try:
            # Versioned artifacts exist before any installer can point at them.
            for target,content in replacements.items():atomic(target,content)
        except Exception:
            for target in replacements:atomic(target,(backup/target.name).read_bytes())
            raise
        result['backup']=str(backup);result['installer_updated']=True
    if containers()!=before:raise RuntimeError('unexpected_service_restart')
    if any(sha(PUBLIC/'releases/0.3.2'/name)!=digest for name,digest in old_hashes.items()):raise RuntimeError('old_archive_changed')
    result.update({'old_archives_preserved':True,'containers_unchanged':True})
    print(json.dumps(result))
