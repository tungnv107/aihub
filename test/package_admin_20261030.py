"""Package the admin service and mutable public guidance; no client release rebuild."""
import hashlib,json,pathlib,tarfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts/admin-deploy';OUT.mkdir(parents=True,exist_ok=True)
names=['relay_product/license-server.mjs','relay_product/license-protocol.mjs','relay_product/distribution-server.mjs',
       'relay_product/install/diagnose.mjs','relay_product/install/diagnose.ps1','relay_product/install/setup.ps1.in',
       'relay_product/install/setup.sh.in','docs/relay-product/README.md']
names += [p.relative_to(ROOT).as_posix() for p in (ROOT/'relay_product/admin').rglob('*') if p.is_file() and p.suffix in {'.mjs','.html','.js','.css'}]
files={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}
manifest=OUT/'admin-bundle.json';manifest.write_text(json.dumps({'version':'1.1.0','files':files},indent=2))
archive=OUT/'admin.tar'
with tarfile.open(archive,'w') as tar:
    for name in names:tar.add(ROOT/name,arcname=name,recursive=False)
    tar.add(manifest,arcname='admin-bundle.json',recursive=False)
print(json.dumps({'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(names)}))
