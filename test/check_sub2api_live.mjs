// Explicit local-stack smoke test. Creates a synthetic customer, then revokes its key and disables the customer.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {adminClient} from '../scripts/sub2api-admin-client.mjs';
import {Sub2ApiLicense} from '../ch_relay/sub2api-license.mjs';

const {server,request}=await adminClient();
if(!/^http:\/\/127\.0\.0\.1:/.test(server))throw Error('This smoke test only mutates the local test server');
const email='ch-relay-smoke-'+Date.now()+'@example.test',password=crypto.randomBytes(24).toString('base64url');
let user,key;const checks=[];
const fixture=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-'));
const cli=path.resolve(import.meta.dirname,'../dist/npm/bin/ch-relay.mjs');
const invoke=(command,args=[],input='')=>execFileSync(process.execPath,[cli,command,'--home',fixture,...args],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000});
const verify=(label,assertion)=>{assertion();checks.push(label);console.log('PASS '+label);};
try{
  user=await request('/api/v1/admin/users',{method:'POST',body:{email,password,role:'user',balance:0,concurrency:1,notes:'Ch-relay local integration smoke test'}});
  verify('create customer with zero AI balance',()=>assert.ok(user.id>0));
  key=await request('/api/v1/admin/ch-relay/licenses',{method:'POST',body:{user_id:user.id,name:'smoke-'+Date.now(),expires_in_days:1}});
  verify('admin issues finite key',()=>{assert.ok(key.key.length>=16);assert.ok(Date.parse(key.expires_at)>Date.now());});
  const credentials={load:()=>({server,key:key.key})},license=new Sub2ApiLicense({credentials});
  await license.ensure();verify('real Sub2API key opens Ch-relay with no AI balance',()=>assert.equal(license.status().active,true));
  const installed=JSON.parse(invoke('login',['--server',server,'--codex-home',path.join(fixture,'codex'),'--key-stdin'],key.key));
  verify('packed CLI logs in against real Sub2API',()=>assert.equal(installed.license.active,true));
  const login=await request('/api/v1/auth/login',{method:'POST',body:{email,password},access:null});
  await assert.rejects(request('/api/v1/keys',{method:'POST',body:{name:'ch-relay:cheat',expires_in_days:3650},access:login.access_token}),e=>e.status===403);
  checks.push('customer cannot mint a license');console.log('PASS customer cannot mint a license');
  await assert.rejects(request('/api/v1/keys/'+key.id,{method:'PUT',body:{expires_at:'2099-01-01T00:00:00Z'},access:login.access_token}),e=>e.status===403);
  checks.push('customer cannot extend own expiry');console.log('PASS customer cannot extend own expiry');
  await assert.rejects(request('/api/v1/admin/ch-relay/licenses',{method:'POST',body:{user_id:user.id,name:'cheat',expires_in_days:30},access:login.access_token}),e=>e.status===403);
  checks.push('customer cannot call admin issuance');console.log('PASS customer cannot call admin issuance');
  const missing=await fetch(server+'/v1/ch-relay/license');verify('missing key denied',()=>assert.equal(missing.status,401));await missing.arrayBuffer();
  await request('/api/v1/admin/ch-relay/licenses/'+key.id,{method:'PUT',body:{expires_at:new Date(Date.now()-60000).toISOString()}});
  await assert.rejects(license.ensure(),/api_key_expired/);checks.push('expired key denied from real database');console.log('PASS expired key denied from real database');
  assert.throws(()=>invoke('license'),error=>String(error.stderr).includes('api_key_expired'));
  checks.push('packed CLI denies expired key');console.log('PASS packed CLI denies expired key');
  await request('/api/v1/admin/ch-relay/licenses/'+key.id,{method:'PUT',body:{expires_at:new Date(Date.now()+86400000).toISOString(),status:'active'}});
  await license.ensure();verify('same key renewed without reinstall',()=>assert.equal(license.status().active,true));
  verify('packed CLI observes renewal',()=>assert.equal(JSON.parse(invoke('license')).active,true));
  await request('/api/v1/admin/ch-relay/licenses/'+key.id,{method:'PUT',body:{status:'inactive'}});
  await assert.rejects(license.ensure(),/api_key_disabled/);checks.push('revocation takes effect without auth cache delay');console.log('PASS revocation takes effect without auth cache delay');
  const report=path.resolve(import.meta.dirname,'../.runtime/sub2api-live-report.json');fs.mkdirSync(path.dirname(report),{recursive:true});
  fs.writeFileSync(report,JSON.stringify({testedAt:new Date().toISOString(),server,testUserId:user.id,testKeyId:key.id,checks,passed:checks.length,credentialsLogged:false},null,2));
  console.log(JSON.stringify({passed:checks.length,report}));
}finally{
  if(key)await request('/api/v1/admin/ch-relay/licenses/'+key.id,{method:'PUT',body:{status:'inactive'}});
  if(user)await request('/api/v1/admin/users/'+user.id,{method:'PUT',body:{status:'disabled'}});
  fs.rmSync(fixture,{recursive:true,force:true});
}
