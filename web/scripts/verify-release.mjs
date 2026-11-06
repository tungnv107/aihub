import fs from 'node:fs';
import path from 'node:path';
const [name,version]=process.argv.slice(2);
if(!name||!version||!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))throw Error('Usage: node scripts/verify-release.mjs @your-scope/aihub 0.5.0');
const response=await fetch('https://registry.npmjs.org/'+encodeURIComponent(name)+'/'+version,{redirect:'error',signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Registry release unavailable: '+response.status);
const data=await response.json();if(data.name!==name||data.version!==version||data.bin?.aihub!=='bin/ch-relay.mjs'||!data.dist?.integrity)throw Error('Release metadata does not match AIHub');
const file=path.resolve(import.meta.dirname,'../.env');let env=fs.readFileSync(file,'utf8');
for(const [key,value] of Object.entries({AIHUB_NPM_PACKAGE_NAME:name,AIHUB_NPM_PACKAGE_VERSION:version,AIHUB_NPM_RELEASE_VERIFIED:'true'})){const line=new RegExp('^'+key+'=.*$','m');env=line.test(env)?env.replace(line,key+'='+value):env+'\n'+key+'='+value;}
fs.writeFileSync(file,env);console.log('Verified npm metadata. Restart the web service to show the installation command. No package was published.');
