// Creates an explicitly marked, zero-charge test grant; always revokes it.
// Run on the production host only after configuring the scoped Sub2API key.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
if(!process.argv.includes('--allow-test-grant'))throw Error('Explicit --allow-test-grant is required');
const root=path.resolve(import.meta.dirname,'..');
const env=Object.fromEntries(fs.readFileSync(path.join(root,'deploy/aihub/.env'),'utf8').split(/\r?\n/).filter(x=>/^[A-Z0-9_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
assert(Number(env.SUB2API_LICENSE_USER_ID)>0,'Connect Sub2API first');
const base='http://127.0.0.1:13000',origin='https://'+env.DOMAIN;
let cookie='',license,plan,key;
async function request(route,{method='GET',body,headers={},expected=200}={}){
 const r=await fetch(base+route,{method,headers:{host:env.DOMAIN,origin,'content-type':'application/json',cookie,...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,expected,route+' status');return {data:await r.json(),headers:r.headers};
}
await request('/api/v1/health');
await request('/api/v1/admin/overview',{expected:401});
const login=await request('/api/auth/sign-in/email',{method:'POST',body:{email:env.BOOTSTRAP_ADMIN_EMAIL,password:env.BOOTSTRAP_ADMIN_PASSWORD}});
const cookies=login.headers.getSetCookie();assert(cookies.some(x=>/; Secure/i.test(x)&&/; HttpOnly/i.test(x)));
cookie=cookies.map(x=>x.split(';')[0]).join('; ');
try{
 const me=(await request('/api/v1/me')).data;
 const config=(await request('/api/v1/admin/settings')).data;assert.equal(config.sub2apiConfigured,true);
 const input={slug:'deployment-verification-'+Date.now(),name:'Deployment verification (not for sale)',description:'Internal zero-charge verification; automatically revoked.',price:1000,durationDays:1,maxDevices:1,active:false,recommended:false,sortOrder:999,features:['Internal verification only']};
 plan=(await request('/api/v1/admin/plans',{method:'POST',body:input})).data;
 const order=(await request('/api/v1/admin/licenses',{method:'POST',body:{userId:me.user.id,planId:plan.id,reason:'Production deployment verification; zero charge; revoke immediately'},expected:201})).data;
 for(let n=0;n<30;n++){
  const current=(await request('/api/v1/me')).data;
  license=current.licenses.find(x=>x.orderId===order.id);
  if(license?.status==='ACTIVE')break;
  await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(license?.status,'ACTIVE','worker provisioned test grant');
 key=(await request('/api/v1/licenses/'+license.id+'/reveal',{method:'POST',body:{}})).data.key;
 const pair=generateKeyPairSync('ed25519'),fingerprint=randomUUID(),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
 const bearer={authorization:'Bearer '+key};
 const challenge=(await request('/api/v1/license/challenge',{method:'POST',headers:bearer,body:{}})).data;
 const proof={fingerprint,publicKey,name:'Deployment smoke test',os:'linux',nonce:challenge.nonce,signature:sign(null,Buffer.from(`aihub-device-v1\nactivate\n${challenge.nonce}\n${fingerprint}`),pair.privateKey).toString('base64url')};
 const activated=(await request('/api/v1/license/activate',{method:'POST',headers:bearer,body:proof})).data;
 assert.equal(activated.active,true);
 await request('/api/v1/license/activate',{method:'POST',headers:bearer,body:proof,expected:401});
 const bypass=await fetch('http://127.0.0.1:18080/v1/ch-relay/license',{headers:bearer,redirect:'error'});assert.equal(bypass.status,403,'gateway secret required');
 await request('/api/v1/admin/licenses/'+license.id+'/revoke',{method:'POST',body:{reason:'Deployment verification complete; revoke test license'}});
 await request('/api/v1/license/challenge',{method:'POST',headers:bearer,body:{},expected:403});
 let upstreamRevoked=false;
 for(let n=0;n<20;n++){
  const r=await fetch('http://127.0.0.1:18080/v1/ch-relay/license',{headers:{...bearer,'x-aihub-gateway':env.AIHUB_GATEWAY_SECRET},redirect:'error'});
  if(r.status===401||r.status===403){upstreamRevoked=true;break;}
  await new Promise(r=>setTimeout(r,2000));
 }
 assert(upstreamRevoked,'worker revoked upstream key');
 console.log(JSON.stringify({passed:true,adminLogin:true,workerProvision:true,deviceActivation:true,replayRejected:true,gatewayBypassRejected:true,localRevocation:true,upstreamRevocation:true,testLicenseId:license.id,charge:0}));
}finally{
 if(license?.id)await request('/api/v1/admin/licenses/'+license.id+'/revoke',{method:'POST',body:{reason:'Cleanup production deployment verification grant'}});
 if(plan?.id)await request('/api/v1/admin/plans/'+plan.id,{method:'DELETE'});
 await request('/api/auth/sign-out',{method:'POST',body:{}});
}
