import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {restrictSecretFile} from './secret-file.mjs';
const file=path.resolve(import.meta.dirname,'../deploy/sub2api/.env');
if(fs.existsSync(file))throw Error('Environment already exists; refusing to rotate running credentials');
const secret=()=>crypto.randomBytes(32).toString('hex');
fs.writeFileSync(file,[
  '# Generated locally. Do not commit or send this file.',
  'SUB2API_PORT=18080','ADMIN_EMAIL=admin@example.local',
  'ADMIN_PASSWORD='+secret(),'POSTGRES_PASSWORD='+secret(),'REDIS_PASSWORD='+secret(),
  'JWT_SECRET='+secret(),'TOTP_ENCRYPTION_KEY='+secret(),'',
].join('\n'),{flag:'wx',mode:0o600});
restrictSecretFile(file);
console.log(JSON.stringify({created:file,secretsPrinted:false}));
