import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {Sub2ApiLicense,normalizeServer} from '../ch_relay/sub2api-license.mjs';
import {CredentialStore} from '../ch_relay/credentials.mjs';
import {ProductState} from '../relay_product/state.mjs';
import {createDesktopServer} from '../relay_product/desktop.mjs';
import policy from '../relay_product/policy.local-reference.json' with {type:'json'};

const key='sk-'+'ch-relay-synthetic-test-key',chatToken='fixture.chatgpt.token000000000000';
const claims=(changes={})=>({schema:'ch-relay-license-v1',active:true,feature:'ch-relay',key_id:9,
  server_time:'2030-01-01T00:00:00Z',expires_at:'2030-01-01T01:00:00Z',...changes});
function client(fetchImpl,extra={}){return new Sub2ApiLicense({credentials:{load:()=>({server:'https://license.example',key})},fetchImpl,...extra});}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

test('rejects unsafe server URLs and normalizes pasted /v1 paths',()=>{
  assert.equal(normalizeServer('https://example.com/v1/'),'https://example.com');
  assert.equal(normalizeServer('http://127.0.0.1:18080/'),'http://127.0.0.1:18080');
  for(const value of ['http://example.com','https://u:p@example.com','https://example.com?key=x','https://example.com/#x','file:///tmp/key'])
    assert.throws(()=>normalizeServer(value));
});
test('uses dedicated online contract, never usage.isValid; does not follow redirects',async()=>{
  let calls=0;
  const license=client(async(url,options)=>{
    calls++;assert.equal(url,'https://license.example/v1/ch-relay/license');
    assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer '+key);
    return Response.json(claims());
  });
  await license.ensure();await license.ensure();assert.equal(calls,2);assert.equal(license.status().keyId,9);
  const invalid=client(async()=>Response.json({isValid:true,status:'expired',expires_at:'2099-01-01T00:00:00Z'}));
  await assert.rejects(invalid.ensure(),/sub2api_license_invalid/);
});
test('rejects expired, disabled, missing expiry, and malformed successful responses',async()=>{
  for(const body of [claims({active:false}),claims({expires_at:null}),claims({expires_at:'garbage'}),claims({expires_at:'2029-01-01T00:00:00Z'}),claims({feature:'other'}),claims({key_id:0})])
    await assert.rejects(client(async()=>Response.json(body)).ensure());
  await assert.rejects(client(async()=>Response.json({error:{code:'API_KEY_DISABLED'}},{status:401})).ensure(),/api_key_disabled/);
  await assert.rejects(client(async()=>Response.json({error:'missing'},{status:404})).ensure(),/endpoint_missing/);
});
test('server time and monotonic elapsed time decide expiry, even if local calendar is wrong',async()=>{
  let elapsed=100;
  const license=client(async()=>Response.json(claims({expires_at:'2030-01-01T00:00:01Z'})),{monotonic:()=>elapsed});
  await license.ensure();assert.equal(license.status().active,true);
  elapsed=1100;assert.equal(license.status().active,false);
  await assert.rejects(client(async()=>{elapsed+=2000;return Response.json(claims({expires_at:'2030-01-01T00:00:01Z'}));},{monotonic:()=>elapsed}).ensure(),/expired/);
});
test('fails closed on network loss after a valid login; never displays upstream messages containing secrets',async()=>{
  let online=true;
  const license=client(async()=>{if(!online)throw Error(key);return Response.json(claims());});
  await license.ensure();online=false;
  await assert.rejects(license.ensure(),error=>error.code==='sub2api_unavailable'&&!error.message.includes(key));
  assert.deepEqual(license.status(),{active:false});
});
test('server pin rejects arbitrary license authorities without sending credentials',async()=>{
  let called=false;
  await assert.rejects(client(async()=>{called=true;},{pinnedServer:'https://operator.example'}).ensure(),/server_not_allowed/);
  assert.equal(called,false);
});
test('deduplicates concurrent checks without caching later authorization decisions',async()=>{
  let calls=0;const license=client(async()=>{calls++;await new Promise(r=>setTimeout(r,20));return Response.json(claims());});
  await Promise.all([license.ensure(),license.ensure(),license.ensure()]);assert.equal(calls,1);
  await license.ensure();assert.equal(calls,2);
});
test('watch aborts an idle stream at expiry and releases all listeners',async()=>{
  const now=Date.now();const license=client(async()=>Response.json(claims({server_time:new Date(now).toISOString(),expires_at:new Date(now+80).toISOString()})));
  await license.ensure();const controller=new AbortController();license.watch(controller);
  await Promise.race([once(controller.signal,'abort'),new Promise((_,reject)=>setTimeout(()=>reject(Error('expiry_not_enforced')),500))]);
  assert.equal(controller.signal.reason.code,'api_key_expired');assert.equal(license.listeners.size,0);
});
test('watch detects revocation and outage; cleanup stops further heartbeats',async()=>{
  for(const revoke of [true,false]){
    let calls=0;const license=client(async()=>{
      if(++calls===1)return Response.json(claims());
      if(revoke)return Response.json({error:{code:'API_KEY_DISABLED'}},{status:403});
      throw Error('offline');
    },{recheckMs:20});
    await license.ensure();const controller=new AbortController();const cleanup=license.watch(controller);
    await once(controller.signal,'abort');assert.equal(controller.signal.reason.code,revoke?'api_key_disabled':'sub2api_unavailable');
    cleanup();const count=calls;await new Promise(r=>setTimeout(r,50));assert.equal(calls,count);
  }
});
test('credential persistence round trip uses DPAPI on Windows and logout removes the key',()=>{
  const dir=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-'));const store=new CredentialStore(dir);
  try{
    store.save({server:'https://license.example',key});assert.deepEqual(store.load(),{server:'https://license.example',key});
    const text=fs.readFileSync(store.file,'utf8');
    if(process.platform==='win32')assert.equal(text.includes(key),false);
    else assert.equal(fs.statSync(store.file).mode&0o777,0o600);
    store.clear();assert.throws(()=>store.load(),/login_required/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real HTTP relay rejects invalid keys, honors renewal, and never sends Sub2API keys to ChatGPT',async()=>{
  const dir=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-'));let valid=true,upstreamCalls=0,seenChatToken;
  const authority=http.createServer((req,res)=>{
    assert.equal(req.url,'/v1/ch-relay/license');assert.equal(req.headers.authorization,'Bearer '+key);
    assert.equal(req.headers['chatgpt-account-id'],undefined);
    res.writeHead(valid?200:403,{'content-type':'application/json'});
    res.end(JSON.stringify(valid?claims():{error:{code:'API_KEY_EXPIRED'}}));
  });
  const base=await listen(authority),state=new ProductState(dir);state.initialize(policy);
  const license=new Sub2ApiLicense({credentials:{load:()=>({server:base,key})}});
  const relay=createDesktopServer(state,{license,transport:async(url,options)=>{
    upstreamCalls++;assert.ok(url.startsWith('https://chatgpt.com/backend-api/codex/'));
    seenChatToken=options.headers.get('authorization');assert.equal(seenChatToken,'Bearer '+chatToken);
    assert.equal(JSON.stringify([...options.headers]).includes(key),false);
    return Response.json({models:[{slug:'fixture-model'}]});
  }}),relayBase=await listen(relay);
  try{
    const request=()=>fetch(relayBase+'/v1/models',{headers:{authorization:'Bearer '+chatToken}});
    assert.equal((await request()).status,200);assert.equal(upstreamCalls,1);
    valid=false;const denied=await request();assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'api_key_expired');assert.equal(upstreamCalls,1);
    valid=true;assert.equal((await request()).status,200);assert.equal(upstreamCalls,2);
    const browser=await fetch(relayBase+'/v1/models',{headers:{authorization:'Bearer '+chatToken,origin:'https://evil.example'}});assert.equal(browser.status,403);
    assert.equal((await fetch(relayBase+'/v1/models')).status,401);
  }finally{await close(relay);await close(authority);state.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('timeout and redirects cannot grant permission or leak credentials to another origin',async()=>{
  let leaked=false;const other=http.createServer((req,res)=>{leaked=true;res.end('{}');});const otherBase=await listen(other);
  const server=http.createServer((req,res)=>{res.writeHead(302,{location:otherBase});res.end();});const base=await listen(server);
  try{await assert.rejects(new Sub2ApiLicense({credentials:{load:()=>({server:base,key})}}).ensure(),/unavailable/);assert.equal(leaked,false);}
  finally{await close(server);await close(other);}
});
test('an in-flight SSE response is actually cut off when the API key expires',async()=>{
  const dir=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-')),state=new ProductState(dir);state.initialize(policy);
  // Bypass shaping here: this test isolates authorization cancellation of a live HTTP body.
  state.policies.capture=()=>({identity:{mode:'observe'},policy:null});
  const expiry=Date.now()+600;let aborted=false;
  const license=client(async()=>Response.json(claims({server_time:new Date().toISOString(),expires_at:new Date(expiry).toISOString()})));
  const relay=createDesktopServer(state,{license,transport:async(url,{signal})=>new Response(new ReadableStream({start(controller){
    controller.enqueue(new TextEncoder().encode('event: response.created\ndata: {"type":"response.created","response":{"id":"r","status":"in_progress"}}\n\n'));
    signal.addEventListener('abort',()=>{aborted=true;controller.error(signal.reason);},{once:true});
  }}),{headers:{'content-type':'text/event-stream'}})}),base=await listen(relay);
  try{
    const response=await fetch(base+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+chatToken,'content-type':'application/json'},
      body:JSON.stringify({model:'fixture',input:'hello',stream:true}),signal:AbortSignal.timeout(4000)});
    assert.equal(response.status,200);const reader=response.body.getReader();assert.equal((await reader.read()).done,false);
    await assert.rejects(reader.read());assert.equal(aborted,true);
    const after=await fetch(base+'/v1/models',{headers:{authorization:'Bearer '+chatToken}});assert.equal(after.status,403);
  }finally{await close(relay);state.close();fs.rmSync(dir,{recursive:true,force:true});}
});
