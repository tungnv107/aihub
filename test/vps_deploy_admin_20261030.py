"""Deploy an isolated admin service while preserving license keys, data and peer services."""
import argparse,datetime,hashlib,json,os,pathlib,re,shutil,sqlite3,subprocess,tarfile,time,urllib.request
parser=argparse.ArgumentParser();parser.add_argument('--archive',required=True);parser.add_argument('--sha256',required=True);args=parser.parse_args()
ROOT=pathlib.Path('/opt/tdh-relay-admin');LICENSE=pathlib.Path('/opt/tdh-relay-license')
DIST=pathlib.Path('/opt/tdh-relay-distribution');CADDY=pathlib.Path('/opt/apibank/infra/docker/caddy/Caddyfile')
IMAGE='node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205'
def run(command,**kwargs):
    result=subprocess.run(command,capture_output=True,text=True,timeout=60,**kwargs)
    if result.returncode:raise RuntimeError('command_failed_'+command[0])
    return result.stdout
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def atomic(file,data,mode=0o644):
    temporary=file.with_name(file.name+'.tdh-new');temporary.write_bytes(data);temporary.chmod(mode);temporary.replace(file)
def ready(url,service):
    for _ in range(30):
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if json.load(response).get('service')==service:return
        except OSError:time.sleep(.25)
    raise RuntimeError('service_not_ready_'+service)
archive=pathlib.Path(args.archive)
if sha(archive)!=args.sha256:raise RuntimeError('bundle_checksum_mismatch')
if ROOT.exists():raise RuntimeError('admin_already_deployed_use_reviewed_update')
if not (LICENSE/'data/signing-private.pem').is_file():raise RuntimeError('existing_signing_key_required')
key_hash=sha(LICENSE/'data/signing-private.pem')
peers=['tdh-relay-license','sub2api','independent-relay-test-self-relay-1','independent-relay-test-relay-ui-1']
before={name:json.loads(run(['docker','inspect',name]))[0]['State']['StartedAt'] for name in peers}
ROOT.mkdir(mode=0o700);stage=ROOT/'stage';stage.mkdir(mode=0o700);backup=ROOT/'backup';backup.mkdir(mode=0o700)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        if not member.isfile() or member.size>2000000 or member.name.startswith('/') or '..' in pathlib.PurePosixPath(member.name).parts:raise RuntimeError('unsafe_bundle')
    tar.extractall(stage,filter='data')
manifest=json.loads((stage/'admin-bundle.json').read_text())
for name,value in manifest['files'].items():
    if not re.fullmatch(r'[A-Za-z0-9._/-]+',name) or '..' in name.split('/') or sha(stage/name)!=value:raise RuntimeError('file_checksum_mismatch')
db=sqlite3.connect('file:'+str(LICENSE/'data/licenses.sqlite')+'?mode=ro',uri=True)
destination=sqlite3.connect(backup/'licenses.sqlite');db.backup(destination);destination.close();db.close();(backup/'licenses.sqlite').chmod(0o600)
app=ROOT/'app';(app/'relay_product').mkdir(parents=True)
for name in manifest['files']:
    if name.startswith('relay_product/admin/') or name in ['relay_product/license-server.mjs','relay_product/license-protocol.mjs']:
        target=app/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(stage/name,target);target.chmod(0o644)
for directory in [app,*[p for p in app.rglob('*') if p.is_dir()]]:directory.chmod(0o755)
old_caddy=CADDY.read_bytes();(backup/'Caddyfile').write_bytes(old_caddy);(backup/'Caddyfile').chmod(0o600)
old=old_caddy.decode()
needle='    handle /api/licenses/* {'
if old.count(needle)!=1:raise RuntimeError('ambiguous_license_route')
addition='''    @tdh_admin path /admin /admin/*
    handle @tdh_admin {
        reverse_proxy tdh-relay-admin:8082 {
            header_up X-TDH-Client-IP {remote_host}
        }
    }
'''
new=old.replace(needle,addition+needle)
run(['docker','exec','-i','docker-caddy-1','caddy','adapt','--config','-','--adapter','caddyfile','--validate'],input=new)
public=DIST/'public'
replacements={'index.html':(stage/'relay_product/admin/web/public.html').read_bytes(),
              'diagnose.mjs':(stage/'relay_product/install/diagnose.mjs').read_bytes(),
              'README.md':(stage/'docs/relay-product/README.md').read_bytes()}
diagnose=(stage/'relay_product/install/diagnose.ps1').read_text().replace('@@DIAGNOSE_SHA@@',sha(stage/'relay_product/install/diagnose.mjs'))
replacements['diagnose.ps1']=diagnose.encode()
# Preserve immutable 0.3.1 artifacts; only installer help text changes.
ps=(public/'setup.ps1').read_text()
anchor="        Write-Host ('Downloading TDH Relay ' + $Version + '...')"
if ps.count(anchor)!=1:raise RuntimeError('unexpected_windows_installer')
ps=ps.replace(anchor,"        Write-Host 'TDH Relay cho Codex tren may ca nhan. Khong cai ung dung Codex hoac Sub2API.'\n"+anchor)
ps=ps.replace("Installed. Close and reopen Codex, then sign in with your own ChatGPT account.","TDH Relay installed. Reopen your existing Codex app; sign in to ChatGPT if needed.")
replacements['setup.ps1']=ps.encode()
mac=(public/'setup.sh').read_text()
if mac.count('main() {')!=1:raise RuntimeError('unexpected_macos_installer')
replacements['setup.sh']=mac.replace('main() {',"main() {\n  printf '%s\\n' 'TDH Relay for an existing Codex app; not the Sub2API server installer.'").encode()
prior_manifest=json.loads((public/'manifest.json').read_text())
prior_manifest['admin']={'version':'1.0.0','url':'https://codex.tudonghoa.me/admin'}
prior_manifest['diagnostics']={'mode':'manual_local_export','sha256':sha(stage/'relay_product/install/diagnose.mjs')}
replacements['manifest.json']=(json.dumps(prior_manifest,indent=2)+'\n').encode()
for name in replacements:
    if (public/name).exists():shutil.copy2(public/name,backup/name)
shutil.copy2(DIST/'distribution-server.mjs',backup/'distribution-server.mjs')
container_created=False;caddy_changed=False;public_changed=False
try:
    run(['docker','run','--rm','--user','1000:1000','--cap-drop','ALL','-v',str(app)+':/app:ro','-v',str(LICENSE/'data')+':/data',IMAGE,
         'node','/app/relay_product/admin/provision.mjs','/data/admin-bootstrap.json'])
    run(['docker','run','-d','--name','tdh-relay-admin','--restart','unless-stopped','--init','--read-only','--user','1000:1000',
         '--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','128',
         '--network','docker_default','--network-alias','tdh-relay-admin','-p','127.0.0.1:18332:8082',
         '-v',str(app)+':/app:ro','-v',str(LICENSE/'data')+':/data',IMAGE,'node','/app/relay_product/admin/server.mjs'])
    container_created=True;ready('http://127.0.0.1:18332/healthz','tdh-admin')
    if CADDY.read_bytes()!=old_caddy:raise RuntimeError('caddy_concurrent_change')
    CADDY.write_text(new);caddy_changed=True
    run(['docker','exec','docker-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    public_changed=True
    for name,data in replacements.items():atomic(public/name,data)
    # Existing bind mount may pin the inode; write source in place and restart only distribution.
    (DIST/'distribution-server.mjs').write_bytes((stage/'relay_product/distribution-server.mjs').read_bytes())
    run(['docker','restart','tdh-relay-distribution']);ready('http://127.0.0.1:18330/healthz','tdh-relay-distribution')
    request=urllib.request.Request('http://127.0.0.1:18332/admin',headers={'Host':'codex.tudonghoa.me'})
    with urllib.request.urlopen(request,timeout=5) as response:
        if response.status!=200:raise RuntimeError('admin_page_unavailable')
    after={name:json.loads(run(['docker','inspect',name]))[0]['State']['StartedAt'] for name in peers}
    if before!=after or sha(LICENSE/'data/signing-private.pem')!=key_hash:raise RuntimeError('protected_state_changed')
    report={'deployed':True,'version':'1.0.0','admin_url':'https://codex.tudonghoa.me/admin','backup':str(backup),'peers_unchanged':True,'signing_key_unchanged':True,
            'credentials_file':'/opt/tdh-relay-license/data/admin-bootstrap.json'}
    (ROOT/'deployment.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
except Exception:
    if caddy_changed:
        CADDY.write_bytes(old_caddy);run(['docker','exec','docker-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    if public_changed:
        for name in replacements:
            if (backup/name).exists():atomic(public/name,(backup/name).read_bytes())
            elif (public/name).exists():(public/name).unlink()
        (DIST/'distribution-server.mjs').write_bytes((backup/'distribution-server.mjs').read_bytes())
        run(['docker','restart','tdh-relay-distribution'])
    if container_created:run(['docker','stop','tdh-relay-admin'])
    raise
