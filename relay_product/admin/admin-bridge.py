"""SSH-only administration. Never mount this file or issued keys in the public server."""
import sys,json,pathlib,uuid,subprocess,os
request=json.load(sys.stdin);action=request.get('action')
allowed={'issue','list','devices','revoke','extend','revoke-device','reset-device'}
if action not in allowed:raise SystemExit('invalid_action')
args=['docker','exec','tdh-relay-license','node','/app/license-admin.mjs',action]
keyfile=None
if action=='issue':
    label=request.get('label')
    if not isinstance(label,str) or not label.strip() or len(label)>120:raise SystemExit('invalid_label')
    days=float(request.get('days',1));devices=int(request.get('maxDevices',1))
    if not 0<days<=3660 or not 1<=devices<=100:raise SystemExit('invalid_parameters')
    root=pathlib.Path('/opt/tdh-relay-license/data/issued');root.mkdir(mode=0o700,exist_ok=True);os.chown(root,1000,1000)
    keyfile=root/(uuid.uuid4().hex+'.json')
    args+=['--label',label,'--days',str(days),'--max-devices',str(devices),'--out','/data/issued/'+keyfile.name]
elif action!='list':
    identity=str(uuid.UUID(request.get('id','')));args+=['--id',identity]
    if action=='extend':args+=['--days',str(float(request.get('days',1)))]
result=subprocess.run(args,capture_output=True,text=True,timeout=30)
if result.returncode:raise SystemExit('admin_operation_failed')
if keyfile:print(keyfile.read_text())
else:print(result.stdout)
