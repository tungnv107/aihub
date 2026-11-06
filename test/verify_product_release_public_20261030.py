import json,pathlib,hashlib,datetime,zipfile,io,subprocess,tempfile,os,argparse
ROOT=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--version',default='0.3.2');parser.add_argument('--report-dir',default='artifacts/product-0.3.2');args=parser.parse_args()
E=ROOT/args.report_dir;E.mkdir(parents=True,exist_ok=True)
BASE='https://codex.tudonghoa.me'
def get(route):
    fd,name=tempfile.mkstemp(prefix='public-check-',dir=E);os.close(fd)
    try:
        p=subprocess.run(['curl.exe','--silent','--show-error','--noproxy','*','--max-time','40',
            '--output',name,'--write-out','%{http_code}',BASE+route],capture_output=True,text=True,timeout=45,check=True)
        return int(p.stdout),pathlib.Path(name).read_bytes(),{}
    finally:pathlib.Path(name).unlink()
status,data,response_headers=get('/manifest.json');assert status==200,(status,response_headers.get('Server'),data[:200])
manifest=json.loads(data);assert manifest['version']==args.version
assert manifest['activation']=='server_signed_device_bound_license'
paths={}
for route in ['/setup.ps1','/setup.sh','/setup.ps1?remove=1','/setup.sh?remove=1','/README.md','/PROXY.md']:
    status,data,_=get(route);assert status==200,(route,status)
    assert b'@@' not in data
    paths[route]={'status':status,'sha256':hashlib.sha256(data).hexdigest()}
for route in ['/releases/0.2.0/tdh-relay.zip','/releases/0.2.0/tdh-relay.tar.gz','/LICENSE-ADMIN.md','/license-admin.mjs','/license-server.mjs','/TECHNICAL.md']:
    status,_,headers=get(route);assert status in [404,410],(route,status,headers.get('CF-Cache-Status'))
    paths[route]={'status':status}
archive=manifest['artifacts']['tdh-relay.zip']
status,body,_=get('/releases/'+args.version+'/tdh-relay.zip');assert status==200
assert hashlib.sha256(body).hexdigest()==archive['sha256']
with zipfile.ZipFile(io.BytesIO(body)) as z:
    names=z.namelist()
    assert set(names)==set(manifest['release_hashes'])
    for name in names:assert hashlib.sha256(z.read(name)).hexdigest()==manifest['release_hashes'][name]
    assert not any('license-admin' in n or 'policy.local-reference' in n or n.startswith('self_relay/') for n in names)
report={'result':'passed','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':args.version,'domain':BASE,
  'tls_verified':True,'egress':'curl direct HTTPS using public DNS; ambient machine proxy disabled for verification',
  'release_zip_hash_verified':True,'customer_files':names,'paths':paths}
(E/'public-release.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
