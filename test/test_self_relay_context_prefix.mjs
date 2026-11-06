import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';

const model='gpt-5.6-sol';
function history(count){
  const input=[{role:'user',content:'Keep the synthetic records.'}];
  for(let i=0;i<count;i++)input.push({type:'function_call',name:'ReadFile',call_id:'private-call-'+i,arguments:'{}'},
    {type:'function_call_output',call_id:'private-call-'+i,output:'PRIVATE-RECORD-'+i+' '+('x'.repeat(18000))+' END-'+i});
  return {model,input,stream:false};
}
function fixture(t){
  const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');fs.mkdirSync(root,{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'context-prefix-')),filename=path.join(directory,'relay.sqlite'),master=crypto.randomBytes(32);
  const api=crypto.randomBytes(32).toString('hex');let store=new Store(filename,master),relay;const sent=[];
  store.bootstrap(crypto.randomBytes(32).toString('hex'),api);
  store.importAccount({label:'offline fixture',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-only',client_id:'fixture-client',expires_at:Date.now()+3600000,account_id:'fixture-account'}});
  for(const [key,value] of Object.entries({'context.trim_tool_history':true,'context.keep_recent_tool_outputs':6,
    'context.trim_batch_size':6,'context.old_tool_output_chars':6000,'context.min_tool_history_bytes':8192,'context.min_removed_bytes':16384}))store.settings.set(key,value);
  const makeRelay=()=>new Relay(store,{transport:async(url,options)=>{
    assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');sent.push(JSON.parse(options.body));
    const response={id:'offline-response',object:'response',status:'completed',model,
      output:[{type:'message',id:'msg',role:'assistant',content:[{type:'output_text',text:'OK'}]}],
      usage:{input_tokens:1000,input_tokens_details:{cached_tokens:900},output_tokens:1}};
    return new Response('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response})+'\n\n',
      {headers:{'content-type':'text/event-stream'}});
  }});
  relay=makeRelay();
  t.after(()=>store.close());
  return {sent,get store(){return store;},reopen(){store.close();store=new Store(filename,master);relay=makeRelay();},
    async send(body,caller=store.caller(api)){
      let status;await relay.infer({caller,headers:new Headers({'session-id':'fixed-offline-session'}),raw:Buffer.from(JSON.stringify(body)),
        route:'/v1/responses',signal:new AbortController().signal,sink:{start(value){status=value;},async write(){},async end(){}}});
      assert.equal(status,200);return sent.at(-1);
    }};
}

test('first untrimmed request stays byte-identical when append crosses the 11 to 12 result boundary',async t=>{
  const f=fixture(t),first=await f.send(history(11)),next=await f.send(history(12));
  assert.deepEqual(first.input,history(11).input);
  assert.deepEqual(next.input.slice(0,first.input.length),first.input);
  const plans=f.store.db.prepare('SELECT plan FROM context_trim_plans').all();
  assert.equal(plans.length,1);assert.deepEqual(JSON.parse(plans[0].plan),{version:1,items:[]});
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM usage WHERE upstream_attempts=1').get().n,2);
});

test('cold trims remain identical across new batches settings changes and restart without storing prompt text',async t=>{
  const f=fixture(t),body=history(12),first=await f.send(body);
  assert.notEqual(first.input[2].output,body.input[2].output);
  f.store.settings.set('context.old_tool_output_chars',12000);f.store.settings.set('context.min_removed_bytes',1048576);
  f.reopen();const next=await f.send(history(18));
  assert.deepEqual(next.input.slice(0,first.input.length),first.input);
  assert.deepEqual(next.input.slice(first.input.length),history(18).input.slice(first.input.length));
  const raw=f.store.db.prepare('SELECT plan FROM context_trim_plans').get().plan,plan=JSON.parse(raw);
  assert.equal(plan.items.length,6);assert.ok(plan.items.every(item=>item.limit===6000&&/^[a-f0-9]{64}$/.test(item.fingerprint)));
  assert.ok(!raw.includes('PRIVATE-RECORD')&&!raw.includes('private-call')&&!raw.includes('ReadFile'));
  const changed=history(18);changed.input[2].output='changed '+changed.input[2].output;
  const third=await f.send(changed);assert.equal(third.input[2].output,changed.input[2].output);
  assert.equal(third.input[4].output,first.input[4].output);
});

test('scoped callers receive independent first decisions and existing plans cannot be overwritten',async t=>{
  const f=fixture(t);await f.send(history(11));
  const caller=f.store.addCaller({id:'second-caller',token:crypto.randomBytes(32).toString('hex')});
  const next=await f.send(history(12),caller);assert.notEqual(next.input[2].output,history(12).input[2].output);
  const plans=f.store.db.prepare('SELECT cache_key,plan FROM context_trim_plans ORDER BY cache_key').all();assert.equal(plans.length,2);
  const empty=plans.find(row=>JSON.parse(row.plan).items.length===0);
  f.store.saveContextTrimPlan(empty.cache_key,JSON.parse(plans.find(row=>row!==empty).plan));
  assert.deepEqual(f.store.contextTrimPlan(empty.cache_key),{version:1,items:[]});
  assert.throws(()=>f.store.saveContextTrimPlan(empty.cache_key,{version:1,items:[],prompt:'must never persist'}));
});

test('discovery outputs remain intact and emergency master stop bypasses persisted cuts',async t=>{
  const f=fixture(t),body=history(18);body.input[1].name='GetDynamicTools';
  const first=await f.send(body);assert.equal(first.input[2].output,body.input[2].output);
  assert.notEqual(first.input[4].output,body.input[4].output);
  f.store.settings.set('context.trim_tool_history',false);const stopped=await f.send(body);
  assert.deepEqual(stopped.input,body.input);
  f.store.settings.set('context.trim_tool_history',true);assert.deepEqual((await f.send(body)).input,first.input);
});

test('expired policy cleanup removes only its own frozen plan through the foreign key',async t=>{
  const f=fixture(t);const first=await f.send(history(11)),key=first.prompt_cache_key;
  f.store.db.prepare('UPDATE context_policies SET last_used=? WHERE cache_key=?').run(Date.now()-8*86400000,key);
  const fresh=crypto.createHash('sha256').update('unrelated-policy').digest('hex');f.store.contextSettings(fresh);
  assert.equal(f.store.contextTrimPlan(key),undefined);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM context_policies WHERE cache_key=?').get(fresh).n,1);
});
