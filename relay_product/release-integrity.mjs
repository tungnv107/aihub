import fs from 'node:fs';
import path from 'node:path';
import {LICENSE_PUBLIC_KEY} from './license-config.mjs';
import {hash,verifyEnvelope} from './license-protocol.mjs';
import {VERSION} from './state.mjs';
export function verifyInstalledRelease(directory){
  // Source checkout has no runnable public release: the customer bundle requires a signed manifest.
  const root=path.resolve(directory,'..');
  const envelope=JSON.parse(fs.readFileSync(path.join(root,'release.signed.json'),'utf8'));
  const manifest=verifyEnvelope(envelope,LICENSE_PUBLIC_KEY);
  if(manifest.kind!=='tdh-relay-release-v1'||manifest.version!==VERSION||!manifest.files||Object.keys(manifest.files).length>50)throw Error('release_manifest_invalid');
  for(const [name,expected]of Object.entries(manifest.files)){
    if(!/^[a-zA-Z0-9._/-]+$/.test(name)||name.split('/').includes('..')||name.startsWith('/'))throw Error('release_path_invalid');
    const target=path.join(root,name);
    if(fs.lstatSync(target).isSymbolicLink()||hash(fs.readFileSync(target))!==expected)throw Error('release_integrity_failed');
  }
  for(const required of ['relay_product/cli.mjs','relay_product/proxy-server.mjs','relay_product/device.ps1']){
    if(!manifest.files[required])throw Error('release_manifest_incomplete');
  }
  return manifest;
}
