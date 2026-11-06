// Operator-only helper. Run on the production host; never prints credentials.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'deploy/aihub/.env');
const env=Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
if(!process.argv.includes('--connect-production'))throw Error('Explicit --connect-production is required');
let token;
async function request(route,body){
 const r=await fetch('http://127.0.0.1:18080'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Sub2API '+route+' HTTP '+r.status);
 const j=await r.json();return j.data??j;
}
const login=await request('/api/v1/auth/login',{email:env.SUB2API_ADMIN_EMAIL,password:env.SUB2API_ADMIN_PASSWORD});
token=login.access_token;if(!token)throw Error('Interactive admin authentication required');
const compliance=await request('/api/v1/admin/compliance');
if(compliance.required)throw Error('Operator must review and accept current upstream commitment interactively');
function save(){fs.writeFileSync(file,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});fs.chmodSync(file,0o600);}
if(!env.SUB2API_ADMIN_API_KEY){
 const result=await request('/api/v1/admin/settings/admin-api-keys',{name:'AIHub license provisioning (production)',enabled:true,policy:{global_permissions:['chrelay.licenses.write'],rules:[]}});
 if(!result.key)throw Error('Missing scoped key');env.SUB2API_ADMIN_API_KEY=result.key;save();
}
if(!Number(env.SUB2API_LICENSE_USER_ID)){
 const email='aihub-license-owner@aihub.tungnv.com';
 const users=await request('/api/v1/admin/users?page=1&page_size=100&search='+encodeURIComponent(email));
 const existing=(users.items??users.users??[]).find(x=>x.email===email);
 const user=existing??await request('/api/v1/admin/users',{email,password:randomBytes(40).toString('base64url'),username:'AIHub License Authority',balance:0,concurrency:1});
 if(!user.id)throw Error('Missing authority user');env.SUB2API_LICENSE_USER_ID=String(user.id);save();
}
console.log(JSON.stringify({connected:true,authorityUserId:Number(env.SUB2API_LICENSE_USER_ID),scope:'chrelay.licenses.write',secretsPrinted:false}));
