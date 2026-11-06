import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {LicenseAuthority} from '../relay_product/license-server.mjs';
import {LicenseClient} from '../relay_product/license-client.mjs';
import {hash,publicText,signProof,verifyEnvelope} from '../relay_product/license-protocol.mjs';
import {createAdminServer} from '../relay_product/admin/server.mjs';
const day=86400000;
function fixture(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'tdh-portal-test-'));let now=Date.now();
  const a=new LicenseAuthority(home,{now:()=>now});
  t.after(()=>{a.close();fs.rmSync(home,{recursive:true,force:true});});
  const device=()=>{
    const pair=crypto.generateKeyPairSync('ed25519'),state=new Map();
    return new LicenseClient({get:k=>state.get(k),set:(k,v)=>state.set(k,v)},{device:{deviceId:hash(crypto.randomBytes(20)),publicKey:publicText(pair.privateKey),privateKey:pair.privateKey},publicKey:a.publicKey,now:()=>now,request:async(route,body)=>a[route](body)});
  };
  return {a,home,device,tick:ms=>now+=ms,now:()=>now};
}
function signed(a,client,key){
  const d=client.device,ch=a.challenge(d);
  return {key,challengeId:ch.id,proof:signProof('activate:'+hash(key),ch.nonce,d.deviceId,d.publicKey,d.privateKey)};
}
test('unused keys retain full duration; first activation starts once across devices and reset',async t=>{
  const f=fixture(t),key=f.a.issue({label:'Stored',days:30,maxDevices:2});
  assert.equal(key.expiresAt,null);f.tick(365*day);
  assert.equal(f.a.list()[0].started_at,null);assert.equal(f.a.list()[0].expires_at,0);
  const one=f.device();await one.activate(key.key);const original=f.a.list()[0];
  assert.equal(original.started_at,f.now());assert.equal(original.expires_at,f.now()+30*day);
  f.tick(2*day);const two=f.device();await two.activate(key.key);await one.activate(key.key);
  f.a.change('reset-device',one.state.get('license.activation'));await one.activate(key.key);
  const after=f.a.list()[0];assert.equal(after.started_at,original.started_at);assert.equal(after.expires_at,original.expires_at);
  assert.equal(f.a.db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='term_started'").get().n,1);
});
test('rejected proofs, revoked licenses and occupied slots do not start the term',async t=>{
  const f=fixture(t),issued=f.a.issue({label:'Pending',days:3});
  const body=signed(f.a,f.device(),issued.key);body.proof='invalid';
  assert.throws(()=>f.a.activate(body),/proof_rejected/);assert.equal(f.a.list()[0].started_at,null);
  f.a.change('revoke',issued.id);await assert.rejects(f.device().activate(issued.key),/invalid/);
  assert.equal(f.a.list()[0].started_at,null);f.a.change('extend',issued.id,{days:1});
  f.a.db.prepare('INSERT INTO activations VALUES(?,?,?,?,0,?,?)').run(crypto.randomUUID(),issued.id,'f'.repeat(64),'occupied fixture',f.now(),f.now());
  await assert.rejects(f.device().activate(issued.key),/device_limit/);assert.equal(f.a.list()[0].started_at,null);
});
test('extending an unused license increases duration without starting it; active extension preserves start',async t=>{
  const f=fixture(t),issued=f.a.issue({label:'Extend',days:1});f.tick(5*day);
  f.a.change('extend',issued.id,{days:2});assert.equal(f.a.list()[0].started_at,null);assert.equal(f.a.list()[0].duration_ms,3*day);
  const c=f.device();await c.activate(issued.key);const start=f.now();f.tick(4*day);
  await assert.rejects(c.activate(issued.key),/expired/);f.a.change('extend',issued.id,{days:2});
  assert.equal(f.a.list()[0].started_at,start);assert.equal(f.a.list()[0].expires_at,f.now()+2*day);
});
test('parallel activation on separate database connections gets the same first expiry',async t=>{
  const f=fixture(t),issued=f.a.issue({label:'Race',days:7,maxDevices:2}),bodies=[signed(f.a,f.device(),issued.key),signed(f.a,f.device(),issued.key)];
  const results=await Promise.all(bodies.map(body=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./license_activation_worker.mjs',import.meta.url),{workerData:{home:f.home,body,now:f.now()}});
    let result;worker.on('message',value=>result=value);worker.on('error',reject);worker.on('exit',code=>code?reject(Error('worker failed')):resolve(result));
  })));
  const claims=results.map(r=>verifyEnvelope(r.lease,f.a.publicKey));
  assert.equal(claims[0].licenseExpiresAt,claims[1].licenseExpiresAt);assert.equal(claims[0].licenseExpiresAt,f.now()+7*day);
  assert.equal(f.a.list()[0].devices,2);assert.equal(f.a.db.prepare("SELECT COUNT(*) n FROM audit WHERE kind='term_started'").get().n,1);
});
test('bulk issue is bounded, unique, atomic and does not persist plaintext keys',t=>{
  const f=fixture(t),batch=f.a.issueBatch({count:100,label:'Lô',days:30,maxDevices:2});
  assert.equal(batch.licenses.length,100);assert.equal(new Set(batch.licenses.map(l=>l.key)).size,100);
  assert.equal(batch.licenses[0].label,'Lô 001');assert.equal(batch.licenses[99].label,'Lô 100');
  for(const row of f.a.list()){assert.equal(row.started_at,null);assert.equal(row.expires_at,0);}
  for(const count of [0,-1,101,1.5,'2',null])assert.throws(()=>f.a.issueBatch({count,label:'test',days:1}),/invalid_batch/);
  assert.throws(()=>f.a.issueBatch({count:2,label:'  ',days:1}),/invalid_batch/);
  assert.throws(()=>f.a.issueBatch({count:2,label:'bad',days:-1}),/invalid_license/);
  const issue=f.a.issue.bind(f.a);let issued=0;
  f.a.issue=(options)=>{if(++issued===3)throw Error('simulated_write_failure');return issue(options);};
  assert.throws(()=>f.a.issueBatch({count:4,label:'rollback',days:1}),/simulated_write/);assert.equal(f.a.list().length,100);
  assert.ok(!JSON.stringify(f.a.db.prepare('SELECT * FROM licenses').all()).includes(batch.licenses[0].key));
});
test('legacy migration preserves activated expiry including reset devices and is idempotent',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'tdh-legacy-test-')),now=Date.now(),db=new DatabaseSync(path.join(home,'licenses.sqlite'));
  db.exec('CREATE TABLE licenses(id TEXT PRIMARY KEY,key_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,expires_at INTEGER NOT NULL,max_devices INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);CREATE TABLE activations(id TEXT PRIMARY KEY,license_id TEXT NOT NULL,device_id TEXT NOT NULL,public_key TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,UNIQUE(license_id,device_id));CREATE TABLE audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,license_id TEXT,activation_id TEXT);');
  for(const id of ['pending','used','reset','revoked','expired'])db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?,?,?)').run(id,hash(id),id,now-day,1,id==='revoked'?1:0,now-31*day);
  db.prepare('INSERT INTO activations VALUES(?,?,?,?,0,?,?)').run('device','used','fingerprint','publickey',now-29*day,now-day);
  for(const id of ['reset','expired'])db.prepare('INSERT INTO audit(at,kind,license_id) VALUES(?,?,?)').run(now-30*day,'activated',id);
  db.close();let a;
  try{
    a=new LicenseAuthority(home);let rows=Object.fromEntries(a.list().map(r=>[r.id,r]));
    for(const id of ['used','reset','expired'])assert.equal(rows[id].expires_at,now-day);
    assert.equal(rows.reset.started_at,now-30*day);assert.equal(rows.pending.started_at,null);assert.equal(rows.pending.duration_ms,30*day);assert.equal(rows.pending.expires_at,0);
    assert.equal(rows.revoked.revoked,1);const before=JSON.stringify(a.list());a.close();
    a=new LicenseAuthority(home);assert.equal(JSON.stringify(a.list()),before);
  }finally{a?.close();fs.rmSync(home,{recursive:true,force:true});}
});
async function portal(t){
  const f=fixture(t),{server,auth,customer,dashboard}=createAdminServer(f.a);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  // Close before fixture removes its database.
  t.after(()=>{server.closeAllConnections();server.close();});
  const request=(route,{body,cookie='',csrf='',origin='https://codex.tudonghoa.me',host='codex.tudonghoa.me',method,base='/portal/api/'}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:base+route,method:method??(body===undefined?'GET':'POST'),headers:{host,cookie,origin,'content-type':'application/json','x-csrf-token':csrf}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,value:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text});});
    });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  const login=async key=>{const r=await request('login',{body:{key}});return {...r,cookie:r.headers['set-cookie']?.[0].split(';')[0],csrf:r.value.csrf};};
  return {...f,auth,customer,dashboard,request,login};
}
const report=()=>({schema:'tdh-diagnostic-v1',mode:'desktop',version:'0.3.1',generatedAt:new Date().toISOString(),requests:20,errors:2,attempts:22,avgDurationMs:140,statuses:{200:18,401:2},licenseActive:true});
test('customer login does not activate a pending key; key and device secrets never appear in summary',async t=>{
  const f=await portal(t),issued=f.a.issue({label:'Client',days:30});
  const s=await f.login(' '+issued.key+' ');assert.equal(s.status,200);
  const cookie=s.headers['set-cookie'][0];for(const flag of ['__Host-tdh-customer','HttpOnly','Secure','SameSite=Strict'])assert.ok(cookie.includes(flag));
  const summary=await f.request('summary',s);assert.equal(summary.value.license.status,'pending');assert.equal(summary.value.license.expires_at,null);
  assert.equal(f.a.list()[0].started_at,null);assert.equal(f.a.list()[0].devices,0);
  assert.ok(!JSON.stringify(summary.value).includes(issued.key));assert.ok(!JSON.stringify(summary.value).includes('key_hash'));
  await f.device().activate(issued.key);const active=await f.request('summary',s);
  assert.equal(active.value.license.status,'active');assert.equal(active.value.devices.length,1);assert.equal(active.value.devices[0].fingerprint.length,16);
  assert.ok(!JSON.stringify(active.value).includes('public_key'));
});
test('customer sessions are isolated by license and cannot access administration',async t=>{
  const f=await portal(t),a=f.a.issue({label:'A',days:2}),b=f.a.issue({label:'B-private',days:2});
  const sa=await f.login(a.key),sb=await f.login(b.key);await f.device().activate(b.key);
  f.dashboard.importReport(b.id,report(),'fixture');
  const result=await f.request('summary?licenseId='+b.id,sa);
  assert.equal(result.value.license.id,a.id);assert.equal(result.value.devices.length,0);assert.equal(result.value.reports.length,0);
  assert.equal((await f.request('licenses',{...sa,base:'/admin/api/'})).status,401);
  assert.equal((await f.request('licenses/batch',{...sa,base:'/admin/api/',body:{label:'hack',days:1,count:2}})).status,401);
  assert.equal((await f.request('summary',sb)).value.license.id,b.id);
  await f.auth.provision('owner','Synthetic-owner-password-long');const admin=await f.auth.login('owner','Synthetic-owner-password-long','test');
  assert.equal((await f.request('summary',{cookie:'__Host-tdh-admin='+admin.token})).status,401);
  assert.equal((await f.request('summary',{cookie:'__Host-tdh-customer='+admin.token})).status,401);
});
test('customer report upload is explicit, scoped, CSRF protected and allowlisted',async t=>{
  const f=await portal(t),a=f.a.issue({label:'A',days:2}),b=f.a.issue({label:'B',days:2}),s=await f.login(a.key);
  assert.equal((await f.request('report',{...s,body:{report:report()},csrf:''})).status,403);
  assert.equal((await f.request('report',{...s,body:{report:report()},origin:'https://other.example'})).status,403);
  const r=await f.request('report',{...s,body:{licenseId:b.id,report:{...report(),token:'secret-do-not-store',prompt:'private-do-not-store',source:'trusted',verifiedClient:true}}});
  assert.equal(r.status,201);assert.equal(r.value.report.source,'customer_imported');assert.equal(r.value.report.verifiedClient,false);
  const stored=f.a.db.prepare('SELECT * FROM admin_reports').get();assert.equal(stored.license_id,a.id);assert.ok(!stored.report.includes('do-not-store'));
  assert.equal((await f.request('summary',s)).value.reports.length,1);assert.equal(f.a.list().find(r=>r.id===a.id).started_at,null);
  assert.equal((await f.request('report',{...s,body:{report:{...report(),statuses:{'<script>':2}}}})).status,400);
  for(let i=0;i<9;i++)assert.equal((await f.request('report',{...s,body:{report:report()}})).status,201);
  assert.equal((await f.request('report',{...s,body:{report:report()}})).status,429);
});
test('customer sessions expire, logout revokes session, failed logins are throttled',async t=>{
  const f=await portal(t),a=f.a.issue({label:'Session',days:1});let s=await f.login(a.key);
  f.tick(1800001);assert.equal((await f.request('summary',s)).status,401);s=await f.login(a.key);
  assert.equal((await f.request('logout',{...s,body:{}})).status,200);assert.equal((await f.request('session',s)).status,401);
  for(let i=0;i<10;i++)assert.equal((await f.login('incorrect')).status,401);
  assert.equal((await f.login(a.key)).status,429);f.tick(900001);assert.equal((await f.login(a.key)).status,200);
});
test('expired and revoked keys can view help but cannot gain relay activation',async t=>{
  const f=await portal(t),a=f.a.issue({label:'Expired',days:1});await f.device().activate(a.key);f.tick(2*day);
  let s=await f.login(a.key);assert.equal((await f.request('summary',s)).value.license.status,'expired');
  await assert.rejects(f.device().activate(a.key),/expired/);f.a.change('revoke',a.id);
  s=await f.login(a.key);assert.equal((await f.request('summary',s)).value.license.status,'revoked');
});
test('portal host, origin, methods, static CSP and path boundaries are enforced',async t=>{
  const f=await portal(t),a=f.a.issue({label:'Origin',days:1});
  assert.equal((await f.request('login',{body:{key:a.key},origin:'https://evil.example'})).status,403);
  assert.equal((await f.request('login',{body:{key:a.key},host:'evil.example'})).status,403);
  const s=await f.login(a.key);assert.equal((await f.request('summary',{...s,method:'DELETE'})).status,405);
  assert.equal((await f.request('licenses/'+a.id,{...s,body:{}})).status,404);
  const html=await f.request('portal',{base:'/'});assert.equal(html.status,200);assert.match(html.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal((await f.request('portal/assets/customer.mjs',{base:'/'})).status,404);
});
test('admin bulk API returns keys once and supports pending filters and counts',async t=>{
  const f=await portal(t);await f.auth.provision('owner','Synthetic-owner-password-long');f.a.db.exec('UPDATE admin_users SET must_change=0');
  const s=await f.auth.login('owner','Synthetic-owner-password-long','test'),opts={base:'/admin/api/',cookie:'__Host-tdh-admin='+s.token,csrf:s.csrf};
  const batch=await f.request('licenses/batch',{...opts,body:{count:3,label:'Batch',days:14,maxDevices:2}});
  assert.equal(batch.status,201);assert.equal(batch.value.licenses.length,3);
  assert.equal((await f.request('licenses?status=pending',opts)).value.total,3);
  assert.equal((await f.request('licenses?status=expired',opts)).value.total,0);
  const counts=(await f.request('overview',opts)).value.counts;assert.equal(counts.pending,3);assert.equal(counts.active,0);
  assert.equal((await f.request('licenses/batch',{...opts,body:{count:101,label:'Invalid',days:1}})).status,400);
});
