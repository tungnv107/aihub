"""The newly created installer domain uses direct HTTPS to avoid retired immutable edge artifacts."""
import json,urllib.request,subprocess,pathlib
ROOT=pathlib.Path('/opt/tdh-relay-distribution')
c=json.loads(subprocess.check_output(['docker','inspect','docker-caddy-1'],text=True))[0]
env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
def api(route,body=None,method=None):
    req=urllib.request.Request('https://api.cloudflare.com/client/v4'+route,method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization':'Bearer '+env['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=25) as response:result=json.load(response)
    if not result.get('success'):raise RuntimeError('dns_operation_failed')
    return result['result']
zones=api('/zones?name=tudonghoa.me')
if len(zones)!=1:raise RuntimeError('zone_ambiguous')
prefix='/zones/'+zones[0]['id']+'/dns_records'
records=api(prefix+'?name=codex.tudonghoa.me')
if len(records)!=1 or records[0]['content']!='134.185.93.244' or records[0]['type']!='A':raise RuntimeError('record_changed')
record=records[0]
(ROOT/'dns-before-direct.json').write_text(json.dumps(record));(ROOT/'dns-before-direct.json').chmod(0o600)
result=api(prefix+'/'+record['id'],{'type':'A','name':'codex.tudonghoa.me','content':'134.185.93.244','proxied':False,'ttl':300,
    'comment':'TDH Relay direct HTTPS distribution; retired release URLs must not be served from edge cache'},'PATCH')
report={'domain':result['name'],'proxied':result['proxied'],'content':result['content'],'tls':'Caddy DNS certificate retained',
    'reason':'existing DNS token cannot purge cached retired artifacts; direct origin already validated with TLS'}
(ROOT/'dns-direct-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
