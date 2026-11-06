import json,pathlib,subprocess,tarfile,urllib.request,urllib.error,time,os,uuid
ROOT=pathlib.Path('/opt/tdh-relay-product-verification')
IMAGE='node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205'
NAME='tdh-product-proxy-verify'
ROOT.mkdir(mode=0o700,exist_ok=True)
APP=ROOT/('app-'+uuid.uuid4().hex)
APP.mkdir()
archive=pathlib.Path('/opt/tdh-relay-distribution/public/releases/0.3.1/tdh-relay.tar.gz')
with tarfile.open(archive) as t:
    for m in t.getmembers():
        if not m.isfile() or m.name.startswith('/') or '..' in pathlib.PurePosixPath(m.name).parts:raise RuntimeError('archive_unsafe')
    t.extractall(APP,filter='data')
for p in [APP,*APP.rglob('*')]:p.chmod(0o755 if p.is_dir() else 0o644)
def run(args,input=None,env=None):
    p=subprocess.run(args,input=input,env=env,capture_output=True,text=True,timeout=90)
    if p.returncode:raise RuntimeError('verification_command_failed_'+args[0])
    return p.stdout
def request(base,route,key=None,body=None):
    req=urllib.request.Request(base+route,data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type':'application/json',**({'Host':'127.0.0.1:18320'} if base.endswith(':18332') else {}),**({'Authorization':'Bearer '+key} if key else {})})
    try:
        with urllib.request.urlopen(req,timeout=90) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
issued=[json.loads(p.read_text()) for p in pathlib.Path('/opt/tdh-relay-license/data/issued').glob('*.json')]
issued=[r for r in issued if r['label']=='Linux proxy verification 0.3.1']
if len(issued)!=1:raise RuntimeError('test_license_ambiguous')
license=issued[0]
devices=json.loads(run(['docker','exec','tdh-relay-license','node','/app/license-admin.mjs','devices','--id',license['id']]))
for device in devices:run(['docker','exec','tdh-relay-license','node','/app/license-admin.mjs','reset-device','--id',device['id']])
owner=pathlib.Path('/opt/independent-relay-test')
env=dict(line.split('=',1) for line in (owner/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
status,_=request('http://127.0.0.1:18320','/v1/models',env['RELAY_API_KEY'])
if status!=200:raise RuntimeError('credential_owner_not_ready')
child=os.environ.copy();child['RELAY_MASTER_KEY']=env['RELAY_MASTER_KEY']
tokens=json.loads(run(['docker','run','--rm','--user','1000:1000','--cap-drop','ALL','-e','RELAY_MASTER_KEY',
    '-v',str(owner/'relay-data')+':/owner:ro','-v',str(owner/'self_relay')+':/source:ro',
    '-v','/tmp/vps_borrow_access_token_20261030.mjs:/probe.mjs:ro',IMAGE,'node','/probe.mjs'],env=child))
run(['docker','run','-d','--name',NAME,'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--tmpfs','/data:rw,uid=1000,gid=1000,mode=0700','-p','127.0.0.1:18332:8320',
    '-v',str(APP)+':/app:ro','-v','/etc/machine-id:/run/tdh-machine-id:ro',
    '-v','/tmp/vps_start_licensed_proxy_20261030.mjs:/start.mjs:ro',IMAGE,'sleep','infinity'])
try:
    run(['docker','exec',NAME,'node','/app/relay_product/proxy-init.mjs','--home','/data'])
    denied=subprocess.run(['docker','exec',NAME,'node','/start.mjs'],capture_output=True,text=True,timeout=20)
    if denied.returncode==0:raise RuntimeError('unlicensed_proxy_started')
    activation=json.loads(run(['docker','exec','-i',NAME,'node','/app/relay_product/cli.mjs','activate','--home','/data'],input=license['key']+'\n'))
    if not activation.get('active'):raise RuntimeError('license_not_active')
    values=run(['docker','exec',NAME,'cat','/data/secrets.env'])
    secret=dict(line.split('=',1) for line in values.strip().splitlines())
    run(['docker','exec','-d',NAME,'node','/start.mjs'])
    for attempt in range(30):
        try:
            status,health=request('http://127.0.0.1:18332','/healthz')
            if status==200:break
        except OSError:time.sleep(.3)
    else:raise RuntimeError('proxy_start_failed')
    base='http://127.0.0.1:18332'
    status,account=request(base,'/admin/accounts/import',secret['RELAY_ADMIN_KEY'],
        {'adapter':'codex','label':'Temporary borrowed access; no refresh token','exclusive_refresh_owner':True,'tokens':tokens})
    if status!=201:raise RuntimeError('test_import_failed')
    status,models=request(base,'/v1/models',secret['RELAY_API_KEY'])
    if status!=200 or not any(m['id']=='gpt-6-astra' for m in models.get('data',[])):raise RuntimeError('models_failed')
    status,body=request(base,'/v1/responses',secret['RELAY_API_KEY'],
        {'model':'gpt-6-astra','stream':False,'input':'Reply exactly TDH_LICENSED_PROXY_OK. Do not use tools.','reasoning':{'effort':'low'}})
    answer=''.join(p.get('text','') for item in body.get('output',[]) if item.get('type')=='message' for p in item.get('content',[]) if p.get('type')=='output_text').strip()
    if status!=200 or answer!='TDH_LICENSED_PROXY_OK':raise RuntimeError('inference_failed_'+str(status))
    run(['docker','exec','tdh-relay-license','node','/app/license-admin.mjs','revoke','--id',license['id']])
    renewal=subprocess.run(['docker','exec',NAME,'node','/app/relay_product/cli.mjs','license','--home','/data'],capture_output=True,text=True,timeout=30)
    if renewal.returncode==0:raise RuntimeError('revoked_license_renewed')
    status,_=request(base,'/v1/models',secret['RELAY_API_KEY'])
    if status!=403:raise RuntimeError('revoked_proxy_not_blocked_'+str(status))
    report={'result':'passed','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'version':'0.3.1',
      'platform':'Linux ARM64','unactivated_start_blocked':True,'signed_activation':True,'models':True,'real_inference':True,
      'answer':answer,'revocation_blocked':True,'credential_handling':'Borrowed access token only; no refresh token copied; temporary database in tmpfs',
      'production_modified':False,'quota_equivalence_proven':False}
    (ROOT/'result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
finally:
    run(['docker','rm','-f',NAME])
