import sys,json,pathlib,uuid,os,subprocess,re
value=json.load(sys.stdin)
if value.get('kind')!='tdh-relay-release-v1' or value.get('version')!='0.3.3':raise RuntimeError('invalid_manifest')
files=value.get('files',{})
if not 5<=len(files)<=50:raise RuntimeError('invalid_file_count')
for name,digest in files.items():
    if not re.fullmatch(r'[A-Za-z0-9._/-]+',name) or '..' in name.split('/') or name.startswith('/') or not re.fullmatch(r'[a-f0-9]{64}',digest):raise RuntimeError('invalid_file')
root=pathlib.Path('/opt/tdh-relay-license/data/releases');root.mkdir(mode=0o700,exist_ok=True);os.chown(root,1000,1000)
identity='release-'+uuid.uuid4().hex
source=root/(identity+'.json');target=root/(identity+'.signed.json')
source.write_text(json.dumps(value));os.chown(source,1000,1000);source.chmod(0o600)
p=subprocess.run(['docker','exec','tdh-relay-license','node','/app/license-admin.mjs','sign-release',
    '--input','/data/releases/'+source.name,'--out','/data/releases/'+target.name],capture_output=True,text=True,timeout=20)
if p.returncode:raise RuntimeError('signing_failed')
print(target.read_text())
