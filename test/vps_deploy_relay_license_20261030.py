import json,pathlib,subprocess,shutil,os,time,urllib.request
ROOT=pathlib.Path('/opt/tdh-relay-license')
IMAGE='node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205'
CONFIG=pathlib.Path('/opt/apibank/infra/docker/caddy/Caddyfile')
def command(args,**kwargs):
    p=subprocess.run(args,capture_output=True,text=True,timeout=60,**kwargs)
    if p.returncode:raise RuntimeError('command_failed_'+args[0])
    return p.stdout
if ROOT.exists():raise RuntimeError('existing_license_service_requires_reviewed_update')
ROOT.mkdir(mode=0o700)
for name in ['app','data']:(ROOT/name).mkdir(mode=0o700 if name=='data' else 0o755)
os.chown(ROOT/'data',1000,1000)
for name in ['license-server.mjs','license-admin.mjs','license-protocol.mjs']:
    shutil.copy2('/tmp/'+name,ROOT/'app'/name);(ROOT/'app'/name).chmod(0o644)
result=command(['docker','run','--rm','--user','1000:1000','--cap-drop','ALL','-v',str(ROOT/'app')+':/app:ro',
    '-v',str(ROOT/'data')+':/data',IMAGE,'node','/app/license-admin.mjs','public-key'])
public=json.loads(result)
command(['docker','run','-d','--name','tdh-relay-license','--restart','unless-stopped','--init','--read-only','--user','1000:1000',
    '--cap-drop','ALL','--security-opt','no-new-privileges:true','--network','docker_default','--network-alias','tdh-relay-license',
    '-p','127.0.0.1:18331:8081','-v',str(ROOT/'app')+':/app:ro','-v',str(ROOT/'data')+':/data',IMAGE,'node','/app/license-server.mjs'])
for attempt in range(20):
    try:
        with urllib.request.urlopen('http://127.0.0.1:18331/healthz',timeout=2) as response:
            if json.load(response)['service']=='tdh-license':break
    except OSError:time.sleep(.5)
else:raise RuntimeError('license_service_not_ready')
old=CONFIG.read_text()
needle='    reverse_proxy tdh-relay-distribution:8080'
if old.count(needle)!=1:raise RuntimeError('domain_route_ambiguous')
replacement='''    handle /api/licenses/* {
        reverse_proxy tdh-relay-license:8081 {
            header_up X-TDH-Client-IP {remote_host}
        }
    }
    handle {
        reverse_proxy tdh-relay-distribution:8080
    }'''
new=old.replace(needle,replacement)
command(['docker','exec','-i','docker-caddy-1','caddy','adapt','--config','-','--adapter','caddyfile','--validate'],input=new)
(ROOT/'Caddyfile.before').write_text(old);(ROOT/'Caddyfile.before').chmod(0o600)
if CONFIG.read_text()!=old:raise RuntimeError('caddy_concurrent_change')
try:
    CONFIG.write_text(new)
    command(['docker','exec','docker-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
except Exception:
    CONFIG.write_text(old)
    command(['docker','exec','docker-caddy-1','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    raise
(ROOT/'public-key.json').write_text(json.dumps(public))
print(json.dumps({'result':'deployed','publicKey':public['publicKey'],'service':'tdh-relay-license','admin':'SSH only','lease_minutes':10}))
