"""Build an allowlisted, credential-free relay product and distribution payload."""
import datetime, hashlib, json, pathlib, shutil, tarfile, zipfile, subprocess, argparse
ROOT=pathlib.Path(__file__).resolve().parent.parent
EVIDENCE=ROOT/'test/ch-relay-evidence/product-20261030'
VERSION='0.3.3'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--node-path',default='node')
parser.add_argument('--ssh-target',default='ubuntu@134.185.93.244')
parser.add_argument('--report-dir',default='artifacts/product-0.3.3')
options=parser.parse_args()
REPORT=ROOT/options.report_dir;REPORT.mkdir(parents=True,exist_ok=True)
node=shutil.which(options.node_path)
if not node:raise SystemExit('Node.js 24.22.1 is required; pass --node-path or add node to PATH.')
BUILD=ROOT/'test'/('relay-product-build-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
APP=BUILD/'app';PUBLIC=BUILD/'public';RELEASE=PUBLIC/'releases'/VERSION
for p in [APP,RELEASE]:p.mkdir(parents=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
subprocess.run([node,str(ROOT/'test/bundle_relay_product_20261030.mjs'),str(APP)],check=True)
selected=[*sorted((ROOT/'relay_product/deploy').glob('*'))]
for source in selected:
    if source.name=='distribution-server.mjs':continue
    target=APP/source.relative_to(ROOT);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
files={p.relative_to(APP).as_posix():sha(p) for p in APP.rglob('*') if p.is_file()}
assert not any(name.endswith(('.sqlite','.dpapi','.env')) or 'snapshot' in name for name in files)
assert sha(ROOT/'self_relay/policy-engine.generated.mjs')=='e33bef7634f0d01b92eb9691d49f9eee140da6dea5c44cd89b1a93182013ec46'
release={'kind':'tdh-relay-release-v1','version':VERSION,'files':files}
signed=subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',options.ssh_target,
    'sudo','-n','python3','/tmp/vps_sign_relay_release_20261030.py'],input=json.dumps(release),
    capture_output=True,text=True,timeout=45,check=True)
envelope=json.loads(signed.stdout)
assert set(envelope)=={'payload','signature'}
(APP/'release.signed.json').write_text(json.dumps(envelope)+'\n')
files['release.signed.json']=sha(APP/'release.signed.json')
zip_path=RELEASE/'tdh-relay.zip'
with zipfile.ZipFile(zip_path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for relative in files:z.write(APP/relative,relative)
tgz=RELEASE/'tdh-relay.tar.gz'
with tarfile.open(tgz,'x:gz') as t:
    for relative in files:t.add(APP/relative,arcname=relative,recursive=False)
checksums={}
for line in (EVIDENCE/'node-SHASUMS256.txt').read_text().splitlines():
    value,name=line.split(None,1);checksums[name.strip()]=value
replacements={'@@VERSION@@':VERSION,'@@NODE_VERSION@@':'24.22.1','@@ZIP_SHA@@':sha(zip_path),'@@TGZ_SHA@@':sha(tgz),
    '@@WIN_X64_SHA@@':checksums['win-x64/node.exe'],'@@WIN_ARM64_SHA@@':checksums['win-arm64/node.exe'],
    '@@MAC_X64_SHA@@':checksums['node-v24.22.1-darwin-x64.tar.gz'],'@@MAC_ARM64_SHA@@':checksums['node-v24.22.1-darwin-arm64.tar.gz']}
for name in ['setup.ps1','setup.sh']:
    content=(ROOT/'relay_product/install'/(name+'.in')).read_text()
    for key,value in replacements.items():content=content.replace(key,value)
    assert '@@' not in content
    (PUBLIC/name).write_text(content,encoding='utf-8',newline='\n')
for name in ['uninstall.ps1','uninstall.sh']:shutil.copy2(ROOT/'relay_product/install'/name,PUBLIC/name)
for name in ['README.md','PROXY.md']:shutil.copy2(ROOT/'docs/relay-product'/name,PUBLIC/name)
manifest={'product':'tdh-relay','version':VERSION,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'domain':'https://codex.tudonghoa.me','node_version':'24.22.1','activation':'server_signed_device_bound_license',
    'policy_revision':'4287bfe46f9e4a0c8e40c0a61e7986d1bb46a4639788a79db163674d1affe79a',
    'artifacts':{p.name:{'url':'https://codex.tudonghoa.me/releases/'+VERSION+'/'+p.name,'sha256':sha(p),'bytes':p.stat().st_size} for p in [zip_path,tgz]},
    'release_hashes':files,'credentials_packaged':False,'issuer_tools_packaged':False,'clear_source_packaged':False,
    'verification':{'status':'awaiting_release_verification','macos_native_install':'not_tested_no_mac_host','quota_parity':'not_proven'},
    'desktop_limits':{'request_body_bytes':67108864,'applies_to':'wire_and_decoded_body','preserves_explicit_custom_limit':True},
    'release_notes':['Repair reinstall after the user returned Codex to its direct default configuration; back up the current settings before reapplying relay routing.',
                     'Recover equivalent TOML formatting using a verified backup; refuse real routing conflicts.',
                     'Keep the desktop 64 MiB request limit and avoid repeated failing sync attempts during installer rollback.',
                     'Existing keys, activation dates, ChatGPT credentials and policy stay unchanged.']}
(PUBLIC/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
shutil.copy2(ROOT/'relay_product/admin/web/public.html',PUBLIC/'index.html')
shutil.copy2(ROOT/'relay_product/install/diagnose.mjs',PUBLIC/'diagnose.mjs')
diagnose=(ROOT/'relay_product/install/diagnose.ps1').read_text().replace('@@DIAGNOSE_SHA@@',sha(PUBLIC/'diagnose.mjs'))
(PUBLIC/'diagnose.ps1').write_text(diagnose,encoding='utf-8',newline='\n')
shutil.copy2(ROOT/'relay_product/distribution-server.mjs',BUILD/'distribution-server.mjs')
distribution={'version':VERSION,'files':{p.relative_to(BUILD).as_posix():sha(p) for p in BUILD.rglob('*') if p.is_file() and not p.is_relative_to(APP)}}
(BUILD/'distribution-manifest.json').write_text(json.dumps(distribution,indent=2))
archive=BUILD/'distribution.tar'
with tarfile.open(archive,'x') as t:
    for relative in [*distribution['files'],'distribution-manifest.json']:t.add(BUILD/relative,arcname=relative,recursive=False)
report={'build':str(BUILD),'archive':str(archive),'sha256':sha(archive),'version':VERSION,'application_files':len(files),'zip_bytes':zip_path.stat().st_size}
(REPORT/'build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
