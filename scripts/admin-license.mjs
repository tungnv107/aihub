import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {adminClient} from './sub2api-admin-client.mjs';
import {restrictSecretFile} from './secret-file.mjs';

const [command,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1]||args[i+1].startsWith('--'))throw Error('invalid_arguments');options[args[i].slice(2)]=args[i+1];}
async function main(){
  if(!['issue','renew','revoke','list'].includes(command)){
    console.log('node scripts/admin-license.mjs issue --user-id 1 --name order-123 --days 30\nnode scripts/admin-license.mjs renew --id 123 --expires-at 2026-12-31T16:59:59Z\nnode scripts/admin-license.mjs revoke --id 123\nnode scripts/admin-license.mjs list --user-id 1');return;
  }
  const {request}=await adminClient();let key;
  const number=name=>{const value=Number(options[name]);if(!Number.isSafeInteger(value)||value<1)throw Error('invalid_'+name);return value;};
  if(command==='issue')key=await request('/api/v1/admin/ch-relay/licenses',{method:'POST',body:{user_id:number('user-id'),name:options.name??'license',expires_in_days:number('days')}});
  if(command==='renew'){
    if(!Number.isFinite(Date.parse(options['expires-at'])))throw Error('invalid_expiration');
    key=await request('/api/v1/admin/ch-relay/licenses/'+number('id'),{method:'PUT',body:{expires_at:new Date(options['expires-at']).toISOString(),status:'active'}});
  }
  if(command==='revoke')key=await request('/api/v1/admin/ch-relay/licenses/'+number('id'),{method:'PUT',body:{status:'inactive'}});
  if(command==='list'){
    const data=await request('/api/v1/admin/users/'+number('user-id')+'/api-keys');
    const rows=Array.isArray(data)?data:data.items??data.data??data.api_keys??[];
    console.log(JSON.stringify(rows.map(x=>({id:x.id,name:x.name,status:x.status,expiresAt:x.expires_at})),null,2));return;
  }
  let output;
  if(command==='issue'){
    output=path.resolve(options.out??path.join(import.meta.dirname,'../.runtime/issued','key-'+key.id+'-'+crypto.randomBytes(4).toString('hex')+'.json'));
    fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
    fs.writeFileSync(output,JSON.stringify({id:key.id,key:key.key,expiresAt:key.expires_at},null,2)+'\n',{flag:'wx',mode:0o600});
    restrictSecretFile(output);
  }
  console.log(JSON.stringify({id:key.id,status:key.status,expiresAt:key.expires_at,...(output?{keyFile:output}:{})}));
}
main().catch(error=>{console.error(JSON.stringify({error:/^[a-zA-Z0-9_-]+$/.test(error.message)?error.message:'admin_operation_failed',code:error.code}));process.exitCode=1;});
