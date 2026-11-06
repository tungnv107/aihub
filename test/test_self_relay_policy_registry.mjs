import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {createServer} from '../self_relay/server.mjs';
import {validatePolicy,policyRevision} from '../self_relay/policy.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const policy=JSON.parse(fs.readFileSync(path.join(root,'ch-relay-evidence/policy-export-20261030/policy.local-reference.json'),'utf8'));
const storage=path.join(root,'self-relay-fixtures');fs.mkdirSync(storage,{recursive:true});
const admin='synthetic-admin-policy-012345678901234567890',api='synthetic-caller-policy-012345678901234567890';
function fixture(t){
  const dir=fs.mkdtempSync(path.join(storage,'policy-')),file=path.join(dir,'relay.sqlite'),key=crypto.randomBytes(32);
  const f={store:new Store(file,key),key,file};f.store.bootstrap(admin,api);
  t.after(()=>{f.store?.close();assert(path.resolve(dir).startsWith(path.resolve(storage)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  f.reopen=()=>{f.store.close();f.store=new Store(file,key);};return f;
}
const importPolicy=(store,value=policy)=>store.policies.import({policy:value,expectedGeneration:store.policies.status().generation});
const select=(store,revision)=>store.policies.select({revision,mode:revision===null?'off':'observe',expectedGeneration:store.policies.status().generation});

test('all reference fields validate; internal secrets, unknown fields and invalid sentinels fail closed',()=>{
  const value=validatePolicy(policy);assert(Object.isFrozen(value));assert(Object.isFrozen(value.limits));assert.equal(value.limits.argSizeMax,-1);
  for(const patch of [{_ek:'secret'},{license:'secret'},{unknown:true}])assert.throws(()=>validatePolicy({...policy,...patch}));
  for(const [key,value] of [['argSizeMax',-2],['mainEffort','invented'],['cacheNorm',1],['callOpenMaxMs',-1],['cutChars',Infinity]])
    assert.throws(()=>validatePolicy({...policy,limits:{...policy.limits,[key]:value}}));
  assert.throws(()=>validatePolicy({...policy,limits:{...policy.limits,newRule:true}}));
  const missing=structuredClone(policy);delete missing.tplMarker;assert.throws(()=>validatePolicy(missing));
  assert.equal(policyRevision(policy),policyRevision(Object.fromEntries(Object.entries(policy).reverse())));
});

test('import stays inactive, is immutable and survives restart with a stable digest',t=>{
  const f=fixture(t),first=importPolicy(f.store);assert.equal(f.store.policies.status().mode,'off');
  const duplicate=importPolicy(f.store);assert.equal(duplicate.revision,first.revision);assert.equal(duplicate.imported,false);
  select(f.store,first.revision);f.reopen();
  const status=f.store.localPolicy();assert.equal(status.reference_policy.activeRevision,first.revision);
  assert.equal(status.reference_policy.enforced,false);assert.equal(status.vendor_policy_loaded,false);
  assert.equal(status.reference_policy.coverage.limits.length,25);assert.equal(status.reference_policy.coverage.templates.length,33);
  assert.equal(status.reference_policy.revisions.length,1);
});

test('stale writers cannot overwrite a selection and rollback returns to the prior revision',t=>{
  const {store}=fixture(t),a=importPolicy(store).revision;
  const changed=structuredClone(policy);changed.limits.cutChars++;
  const b=importPolicy(store,changed).revision;select(store,a);select(store,b);
  const before=store.policies.status();
  for(const value of [null,[],false,'value']){
    assert.throws(()=>store.policies.import(value),{code:'invalid_policy_import'});
    assert.throws(()=>store.policies.select(value),{code:'invalid_policy_selection'});
    assert.throws(()=>store.policies.rollback(value),{code:'invalid_policy_selection'});
  }
  assert.throws(()=>store.policies.select({revision:a,mode:'observe',expectedGeneration:0}),{code:'policy_generation_conflict'});
  assert.throws(()=>store.policies.select({revision:b,mode:'enforce',expectedGeneration:before.generation}),{code:'policy_revision_not_executable'});
  assert.equal(store.policies.status().generation,before.generation);
  store.policies.rollback({expectedGeneration:before.generation});assert.equal(store.policies.status().activeRevision,a);
  assert.throws(()=>store.policies.select({revision:'0'.repeat(64),mode:'observe',expectedGeneration:store.policies.status().generation}),{code:'policy_revision_not_found'});
});

test('policy payload corruption is detected before observation or restart can use it',t=>{
  const f=fixture(t);importPolicy(f.store);
  const state=f.store.settings.get('policy.state');state.revisions[0].policy.limits.cutChars++;
  assert.throws(()=>f.store.settings.set('policy.state',state),{code:'policy_revision_integrity_failed'});
  f.store.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(state),'policy.state');
  assert.throws(()=>f.store.policies.snapshot(),{code:'policy_revision_integrity_failed'});
  f.store.close();f.store=null;assert.throws(()=>new Store(f.file,f.key),{code:'database_open_failed'});
});

test('schema 4 migration preserves old usage and does not retroactively assign a policy',t=>{
  const f=fixture(t);f.store.usage({caller:'local',model:'fixture',status:200,outcome:'completed',duration:1});
  f.store.db.exec('ALTER TABLE usage DROP COLUMN policy_revision;ALTER TABLE usage DROP COLUMN policy_mode;ALTER TABLE usage DROP COLUMN policy_generation;PRAGMA user_version=4;');
  f.reopen();const row=f.store.db.prepare('SELECT * FROM usage').get();
  assert.equal(f.store.db.prepare('PRAGMA user_version').get().user_version,5);assert.equal(row.model,'fixture');
  assert.equal(row.policy_revision,null);assert.equal(row.policy_mode,null);assert.equal(row.policy_generation,null);
});

test('admin policy routes require authorization, reject direct settings writes and preserve compare-and-swap',async t=>{
  const {store}=fixture(t),server=createServer(new Relay(store));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  const call=(route,body,token=admin)=>fetch(base+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/admin/policies',null,api)).status,401);
  const imported=await call('/admin/policies/import',{policy,expectedGeneration:0});assert.equal(imported.status,201);
  const record=await imported.json();
  assert.equal((await call('/admin/policies/select',{revision:record.revision,mode:'observe',expectedGeneration:record.generation})).status,200);
  assert.equal((await call('/admin/policies/select',{revision:record.revision,mode:'observe',expectedGeneration:record.generation})).status,409);
  assert.equal((await call('/admin/settings',{key:'policy.state',value:store.settings.get('policy.state')})).status,400);
  assert.equal((await (await call('/admin/policies')).json()).enforced,false);
});

test('observe mode preserves outbound bytes and pins the reference across an in-flight selection',async t=>{
  const {store}=fixture(t);store.importAccount({label:'offline',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-access',expires_at:Date.now()+3600000}});
  const revision=importPolicy(store).revision,body={model:'fixture-model',input:'giữ nguyên 😀',reasoning:{effort:'high'}};
  const sent=[];let switchDuringRequest=false;
  const relay=new Relay(store,{transport:async(url,options)=>{
    sent.push(options.body);if(switchDuringRequest)select(store,null);
    const response={id:'synthetic-response',status:'completed',model:body.model,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}]};
    return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\n',{headers:{'content-type':'text/event-stream'}});
  }});
  const invoke=async()=>{let observed;await relay.infer({caller:store.caller(api),headers:new Headers({'session-id':'policy-fixture'}),
    raw:Buffer.from(JSON.stringify(body)),route:'/v1/responses',signal:new AbortController().signal,
    sink:{start(status,type,headers){observed=headers;},async write(){},async end(){}}});return observed;};
  await invoke();select(store,revision);const pinned=store.policies.snapshot();switchDuringRequest=true;const headers=await invoke();
  assert.equal(sent[0],sent[1]);assert.equal(headers['x-relay-policy-revision'],revision);assert.equal(headers['x-relay-policy-mode'],'observe');
  const row=store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.policy_revision,revision);assert.equal(row.policy_generation,pinned.generation);assert.equal(row.policy_mode,'observe');
  assert.equal(row.input_tokens,null);assert.equal(row.usage_source,'unknown');assert.equal(store.policies.snapshot().mode,'off');
});
