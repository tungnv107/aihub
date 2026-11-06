import fs from 'node:fs';
import path from 'node:path';
import {restrictSecretFile} from '../../scripts/secret-file.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const value=fs.readFileSync(path.join(root,'web/.env'),'utf8').match(/^AIHUB_GATEWAY_SECRET=(.+)$/m)?.[1];if(!value||value.length<32)throw Error('Gateway secret missing');
const file=path.join(root,'deploy/sub2api/.env');let env=fs.readFileSync(file,'utf8');const pattern=/^AIHUB_GATEWAY_SECRET=.*$/m;env=pattern.test(env)?env.replace(pattern,'AIHUB_GATEWAY_SECRET='+value):env+'\nAIHUB_GATEWAY_SECRET='+value+'\n';fs.writeFileSync(file,env);restrictSecretFile(file);console.log('Gateway secret synchronized between local services; no secret was printed.');
