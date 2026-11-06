import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {LicenseAuthority,createLicenseServer} from '../relay_product/license-server.mjs';
import {LicenseClient,loadDevice} from '../relay_product/license-client.mjs';
import {hash,publicText,verifyEnvelope,signProof,signEnvelope} from '../relay_product/license-protocol.mjs';
import {ProductState} from '../relay_product/state.mjs';
import {createDesktopServer} from '../relay_product/desktop.mjs';
import {once} from 'node:events';
const root=fs.mkdtempSync(path.join(import.meta.dirname,'license-fixture-'));
function setup(){
  let clock=Date.now();
  const a=new LicenseAuthority(fs.mkdtempSync(path.join(root,'issuer-')),{now:()=>clock});
  const devices=[];
  const device=()=>{
    const pair=crypto.generateKeyPairSync('ed25519'),data=new Map();
    const state={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};
    const identity={deviceId:hash(crypto.randomBytes(20)),privateKey:pair.privateKey,publicKey:publicText(pair.privateKey)};
    const c=new LicenseClient(state,{device:identity,publicKey:a.publicKey,now:()=>clock,request:async(route,body)=>a[route](body)});
    devices.push(c);return c;
  };
  return {a,device,tick:ms=>clock+=ms,clock:()=>clock};
}
test('key is hashed; activation is signed, idempotent and limited by device',async()=>{
  const {a,device}=setup();
  try{
    const issued=a.issue({label:'trial',days:1,maxDevices:1}),one=device(),two=device();
    await one.activate(issued.key);await one.activate(issued.key);
    assert.equal(a.list()[0].devices,1);assert.equal(one.status().active,true);
    assert.notEqual(a.db.prepare('SELECT key_hash FROM licenses').get().key_hash,issued.key);
    await assert.rejects(two.activate(issued.key),/device_limit_reached/);
    assert.equal(verifyEnvelope(one.state.get('license.lease'),a.publicKey).features.includes('proxy'),true);
  }finally{a.close();}
});
test('invalid key, expired key and revoked key fail activation',async()=>{
  const {a,device,tick}=setup();
  try{
    const c=device();await assert.rejects(c.activate('TDH-'+'A'.repeat(32)),/invalid/);
    const expired=a.issue({label:'expired',days:0.00001});await c.activate(expired.key);tick(1000);
    await assert.rejects(c.activate(expired.key),/expired/);
    const revoked=a.issue({label:'revoked',days:1});a.change('revoke',revoked.id);
    await assert.rejects(c.activate(revoked.key),/invalid/);
  }finally{a.close();}
});
test('proof challenge cannot be replayed or signed with another device key',()=>{
  const {a,device}=setup();
  try{
    const c=device(),issued=a.issue({label:'proof',days:1}),d=c.device,ch=a.challenge(d);
    const body={key:issued.key,challengeId:ch.id,proof:signProof('activate:'+hash(issued.key),ch.nonce,d.deviceId,d.publicKey,d.privateKey)};
    a.activate(body);assert.throws(()=>a.activate(body),/proof_rejected/);
    const bad=a.challenge(d);body.challengeId=bad.id;
    body.proof=signProof('activate:'+hash(issued.key),bad.nonce,d.deviceId,d.publicKey,device().device.privateKey);
    assert.throws(()=>a.activate(body),/proof_rejected/);
  }finally{a.close();}
});
test('forged signature and copied activation are rejected',async()=>{
  const {a,device}=setup();
  try{
    const one=device(),two=device();await one.activate(a.issue({label:'signed',days:1}).key);
    two.state.set('license.lease',one.state.get('license.lease'));
    assert.throws(()=>two.check(),/invalid/);
    const forged=structuredClone(one.state.get('license.lease'));forged.payload=Buffer.from(JSON.stringify({expiresAt:Date.now()+1e10})).toString('base64url');
    assert.throws(()=>one.check(forged),/signature/);
  }finally{a.close();}
});
test('revocation denies next renewal and clears cached lease',async()=>{
  const {a,device}=setup();
  try{
    const c=device(),issued=a.issue({label:'revoke',days:1});await c.activate(issued.key);
    a.change('revoke',issued.id);await assert.rejects(c.ensure('desktop',{online:true}),/invalid/);
    assert.equal(c.state.get('license.lease'),null);assert.equal(c.status().active,false);
    a.change('extend',issued.id,{days:1});await c.ensure('desktop',{online:true});assert.equal(c.status().active,true);
  }finally{a.close();}
});
test('device revocation, reset and expiry are enforced',async()=>{
  const {a,device,tick}=setup();
  try{
    const c=device(),issued=a.issue({label:'device',days:1});await c.activate(issued.key);
    const id=c.state.get('license.activation');a.change('revoke-device',id);
    await assert.rejects(c.ensure('proxy',{online:true}),/device_revoked/);
    await assert.rejects(c.activate(issued.key),/revoked/);
    a.change('reset-device',id);await c.activate(issued.key);tick(86400001);
    await assert.rejects(c.ensure(),/expired/);
  }finally{a.close();}
});
test('offline grace ends at signed lease expiry; clock rollback cannot prolong it',async()=>{
  const {a,device,tick}=setup();
  try{
    const c=device();await c.activate(a.issue({label:'offline',days:1}).key);
    c.request=async()=>{throw Error('license_server_unavailable');};
    tick(310000);await c.ensure();tick(300001);await assert.rejects(c.ensure(),/unavailable|expired/);
    tick(-400000);assert.throws(()=>c.check(),/clock_rollback/);
  }finally{a.close();}
});
test('lease from unknown issuer and overlong lifetime fail closed',async()=>{
  const {a,device}=setup();
  try{
    const c=device();await c.activate(a.issue({label:'issuer',days:1}).key);
    const claims=c.check();claims.expiresAt=claims.issuedAt+600001;
    assert.throws(()=>c.check(signEnvelope(claims,a.privateKey)),/invalid/);
    const stranger=crypto.generateKeyPairSync('ed25519').privateKey;
    assert.throws(()=>c.check(signEnvelope(claims,stranger)),/signature/);
  }finally{a.close();}
});
test('Windows device key is DPAPI protected and reloads on the same user',()=>{
  if(process.platform!=='win32')return;
  const state=new ProductState(path.join(root,'dpapi'));
  try{
    const one=loadDevice(state),two=loadDevice(state);
    assert.equal(one.publicKey,two.publicKey);assert.equal(state.get('license.device').format,'dpapi');
    assert.notEqual(state.get('license.device').privateKey,one.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));
  }finally{state.close();}
});
test('HTTP license endpoint refuses admin access, malformed input and browser origin',async()=>{
  const {a}=setup(),server=createLicenseServer(a);server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(url+'/admin/issue')).status,404);
    assert.equal((await fetch(url+'/api/licenses/activate',{method:'POST',headers:{origin:'https://evil.invalid'}})).status,403);
    assert.equal((await fetch(url+'/api/licenses/activate',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));a.close();}
});
test('desktop rejects unlicensed inference before invoking upstream',async()=>{
  const state=new ProductState(path.join(root,'http-gate'));
  state.initialize(JSON.parse(fs.readFileSync(new URL('../relay_product/policy.local-reference.json',import.meta.url))));
  const {a,device}=setup(),license=device();let calls=0;
  const server=createDesktopServer(state,{license,transport:async()=>{calls++;throw Error('must_not_run');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+ 'a'.repeat(30),'content-type':'application/json'},body:'{}'});
    assert.equal(r.status,403);assert.equal(calls,0);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));state.close();a.close();}
});
