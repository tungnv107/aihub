import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {LicenseAuthority} from '../relay_product/license-server.mjs';
import {createAdminServer} from '../relay_product/admin/server.mjs';
import {LicenseClient} from '../relay_product/license-client.mjs';
import {publicText,hash} from '../relay_product/license-protocol.mjs';
import crypto from 'node:crypto';
import http from 'node:http';
const fetch=(url,options={})=>new Promise((resolve,reject)=>{
  const req=http.request(url,{method:options.method??'GET',headers:{...options.headers,...(options.body===undefined?{}:{'content-length':Buffer.byteLength(options.body)})}},response=>{
    const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));
  });req.on('error',reject);req.end(options.body);
});
const password='Synthetic-admin-test-password-2026';
async function fixture(t,{mustChange=false}={}){
  let now=Date.now();
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdh-admin-test-')),authority=new LicenseAuthority(directory,{now:()=>now});
  const {server,auth,dashboard}=createAdminServer(authority);
  await auth.provision('owner',password);
  if(!mustChange)authority.db.prepare('UPDATE admin_users SET must_change=0').run();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));authority.close();fs.rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='',csrf='';
  async function request(route,data,{anonymous=false,headers={},method}={}){
    const response=await fetch(base+'/admin/api/'+route,{method:method??(data===undefined?'GET':'POST'),headers:{
      host:'codex.tudonghoa.me',...(data!==undefined?{origin:'https://codex.tudonghoa.me','content-type':'application/json'}:{}),
      ...(!anonymous?{cookie,'x-csrf-token':csrf}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
    const value=await response.json();return {response,value,status:response.status};
  }
  async function login(pass=password){
    const result=await request('login',{username:'owner',password:pass},{anonymous:true});
    cookie=result.response.headers.get('set-cookie')?.split(';')[0]??'';csrf=result.value.csrf;
    return result;
  }
  return {authority,auth,dashboard,base,request,login,tick:ms=>now+=ms};
}
test('admin requires authentication, secure cookie, and forced first password change',async t=>{
  const f=await fixture(t,{mustChange:true});
  assert.equal((await f.request('licenses')).status,401);
  const login=await f.login();
  assert.equal(login.status,200);assert.equal(login.value.mustChange,true);
  const cookie=login.response.headers.get('set-cookie');
  for(const flag of ['__Host-tdh-admin','Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
  assert.equal((await f.request('overview')).value.error,'password_change_required');
  assert.equal((await f.request('password',{current:password,password:'Different-test-password-2026'})).status,200);
  assert.equal((await f.request('session')).status,401);
  assert.equal((await f.login('Different-test-password-2026')).value.mustChange,false);
});
test('anonymous, foreign origin, missing CSRF and wrong Host cannot issue licenses',async t=>{
  const f=await fixture(t);await f.login();
  const input={label:'Customer',days:30,maxDevices:1};
  assert.equal((await f.request('licenses',input,{anonymous:true})).status,401);
  assert.equal((await f.request('licenses',input,{headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await f.request('licenses',input,{headers:{'x-csrf-token':''}})).status,403);
  assert.equal((await f.request('licenses',input,{headers:{host:'evil.example'}})).status,403);
  assert.equal(f.authority.list().length,0);
});
test('login resists guessing and does not reveal account existence',async t=>{
  const f=await fixture(t);
  for(let i=0;i<10;i++)assert.equal((await f.request('login',{username:i%2?'owner':'missing',password:'incorrect-password'},{anonymous:true})).value.error,'login_failed');
  assert.equal((await f.login()).status,429);f.tick(900001);assert.equal((await f.login()).status,200);
});
test('session expires after inactivity; logout removes session',async t=>{
  const f=await fixture(t);await f.login();f.tick(1800001);
  assert.equal((await f.request('overview')).status,401);await f.login();
  assert.equal((await f.request('logout',{})).status,200);assert.equal((await f.request('session')).status,401);
});
test('password change invalidates every session and rejects old password',async t=>{
  const f=await fixture(t);await f.login();const another=await f.auth.login('owner',password,'test2');
  assert.equal((await f.request('password',{current:'wrong',password:'Changed-password-for-test'})).status,403);
  assert.equal((await f.request('password',{current:password,password:'Changed-password-for-test'})).status,200);
  assert.throws(()=>f.auth.session(another.token),/login_required/);assert.equal((await f.login()).status,401);
  assert.equal((await f.login('Changed-password-for-test')).status,200);
});
test('issue reveals key once, list/detail redact hash and key, filtering and pagination work',async t=>{
  const f=await fixture(t);await f.login();
  const result=await f.request('licenses',{label:'Khách kiểm thử',days:2,maxDevices:2});
  assert.equal(result.status,201);assert.match(result.value.key,/^TDH-/);
  const listing=await f.request('licenses?q='+encodeURIComponent('Khách'));
  assert.equal(listing.value.total,1);assert.equal('key_hash' in listing.value.rows[0],false);
  const detail=await f.request('licenses/'+result.value.id);
  assert.equal('key' in detail.value.license,false);assert.equal('key_hash' in detail.value.license,false);
  assert.equal((await f.request('licenses?status=invalid')).status,400);
  assert.equal((await f.request('licenses?q=no-match')).value.total,0);
});
test('revocation and extension update the shared authority, and usage statistics are license-only',async t=>{
  const f=await fixture(t);await f.login();
  const {value:issued}=await f.request('licenses',{label:'Shared',days:1,maxDevices:1});
  await f.request('licenses/'+issued.id+'/revoke',{});
  assert.equal(f.authority.list()[0].revoked,1);
  const before=f.authority.list()[0].expires_at;
  await f.request('licenses/'+issued.id+'/extend',{days:2});
  assert.equal(f.authority.list()[0].revoked,0);assert.equal(f.authority.list()[0].expires_at,before);assert.equal(f.authority.list()[0].duration_ms,3*86400000);
  const {value}=await f.request('overview');assert.equal(value.counts.active,0);assert.equal(value.counts.pending,1);assert.equal(value.telemetry,'local_only');
});
test('device operations enforce existing slots and affect real activation checks',async t=>{
  const f=await fixture(t);await f.login();
  const issued=f.authority.issue({label:'device test',days:1,maxDevices:2});
  const makeDevice=()=>{
    const pair=crypto.generateKeyPairSync('ed25519'),state=new Map();
    return new LicenseClient({get:k=>state.get(k),set:(k,v)=>state.set(k,v)},{
      device:{deviceId:hash(crypto.randomBytes(20)),privateKey:pair.privateKey,publicKey:publicText(pair.privateKey)},
      publicKey:f.authority.publicKey,request:async(route,body)=>f.authority[route](body)});
  };
  const one=makeDevice(),two=makeDevice();await one.activate(issued.key);await two.activate(issued.key);
  assert.equal((await f.request('licenses/'+issued.id+'/update',{label:'Changed',maxDevices:1})).status,409);
  const {value}=await f.request('licenses/'+issued.id),device=value.devices[0];
  assert.equal((await f.request('devices/'+device.id+'/revoke-device',{})).status,200);
  assert.equal(f.authority.list()[0].devices,1);
  assert.equal((await f.request('devices/'+device.id+'/reset-device',{})).status,200);
  assert.equal((await f.request('devices/'+device.id+'/reset-device',{})).status,404);
});
test('diagnostic import stores only allowlisted aggregates and marks unverified origin',async t=>{
  const f=await fixture(t);await f.login();const issued=f.authority.issue({label:'report',days:1});
  const report={schema:'tdh-diagnostic-v1',mode:'desktop',version:'0.3.1',generatedAt:new Date().toISOString(),requests:8,errors:1,attempts:9,avgDurationMs:150,statuses:{200:7,401:1},licenseActive:true,prompt:'must not persist',token:'must not persist'};
  const {value,status}=await f.request('licenses/'+issued.id+'/report',{report});
  assert.equal(status,200);assert.equal(value.report.verifiedClient,false);assert.equal('prompt' in value.report,false);
  const saved=f.authority.db.prepare('SELECT report FROM admin_reports').get().report;
  assert.ok(!saved.includes('must not persist'));
  assert.equal((await f.request('licenses/'+issued.id+'/report',{report:{...report,statuses:{'<script>':1}}})).status,400);
});
test('admin assets have CSP and no-store; path traversal cannot expose server files',async t=>{
  const f=await fixture(t);
  const response=await fetch(f.base+'/admin',{headers:{host:'codex.tudonghoa.me'}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(f.base+'/admin/assets/../server.mjs',{headers:{host:'codex.tudonghoa.me'}})).status,404);
});
test('invalid methods and payloads cannot mutate data',async t=>{
  const f=await fixture(t);await f.login();
  assert.equal((await f.request('licenses',{label:'invalid',days:-1,maxDevices:1})).status,400);
  assert.equal((await f.request('licenses',{}, {method:'DELETE'})).status,405);
  assert.equal((await f.request('licenses',{label:'a'.repeat(40000),days:1})).status,413);
  assert.equal(f.authority.list().length,0);
});
test('health diagnostics and audit events are authenticated and do not expose credentials',async t=>{
  const f=await fixture(t);await f.login();await f.request('licenses',{label:'Audit',days:1,maxDevices:1});
  const diagnostics=await f.request('diagnostics');assert.equal(diagnostics.value.database,true);
  const events=await f.request('events');assert.ok(events.value.rows.some(e=>e.kind==='license_issued'));
  assert.ok(!JSON.stringify(events.value).includes(password));
});
