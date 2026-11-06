"""Verify the advertised release and both archive checksums over public HTTPS."""
import hashlib,json,pathlib,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
directory=root/'artifacts/product-0.3.3'
build=json.loads((directory/'build.json').read_text())
base='https://codex.tudonghoa.me'
def fetch(route):
    with urllib.request.urlopen(base+route,timeout=60) as response:return response.read()
manifest=json.loads(fetch('/manifest.json'))
assert manifest['version']=='0.3.3'
assert manifest['verification']['direct_reset_recovered'] is True
assert manifest['verification']['conflict_rollback_verified'] is True
results={}
for name in ('setup.ps1','setup.sh'):
    data=fetch('/'+name)
    assert b'0.3.3' in data and b'@@VERSION@@' not in data
    assert data==(pathlib.Path(build['build'])/'public'/name).read_bytes()
    results[name]=hashlib.sha256(data).hexdigest()
for name in ('tdh-relay.zip','tdh-relay.tar.gz'):
    artifact=manifest['artifacts'][name]
    route='/releases/0.3.3/'+name
    assert artifact['url']==base+route
    data=fetch(route)
    assert len(data)==artifact['bytes']
    assert hashlib.sha256(data).hexdigest()==artifact['sha256']
    results[name]=artifact['sha256']
report={'version':'0.3.3','result':'passed','public_https_verified':True,'sha256':results}
(directory/'public-release.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
