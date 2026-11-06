import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {shapeRequest} from '../self_relay/protocol.mjs';
import {applyContextBudget} from '../self_relay/context-budget.mjs';
import {requestKind,responseKind} from '../self_relay/accounting.mjs';

const model='synthetic-diagnosis',scope={caller:'caller',tenant:'local',account:'account',session:'session'};
function history(count,size=18000){
  const input=[{role:'user',content:'Preserve the exact tool arguments and recent results.'}];
  for(let i=0;i<count;i++)input.push(
    {type:'function_call',call_id:'private-call-'+i,name:'ReadFile',arguments:JSON.stringify({path:'private-'+i})},
    {type:'function_call_output',call_id:'private-call-'+i,output:'PRIVATE-CONTENT-'+i+' '+('x'.repeat(size))+' END-'+i});
  return {model,input};
}
function fixture(t){
  const dir=fs.mkdtempSync(new URL('./self-relay-fixtures/diagnosis-',import.meta.url));
  const filename=dir+'/relay.sqlite',master=crypto.randomBytes(32);let store=new Store(filename,master);
  const api=crypto.randomBytes(32).toString('hex');store.bootstrap(crypto.randomBytes(32).toString('hex'),api);
  store.settings.set('context.trim_tool_history',true);
  t.after(()=>store.close());
  return {get store(){return store;},api,reopen(){store.close();store=new Store(filename,master);},
    apply(body,override={}){return applyContextBudget(shapeRequest(body,'codex',{...scope,...override}),store);}};
}
const row=store=>store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();

test('a small first request can trim after material history growth and then keeps a stable prefix',t=>{
  const f=fixture(t),first=f.apply(history(2)),large=f.apply(history(36)),next=f.apply(history(37));
  assert.equal(first.stats.trimmed_items,0);
  assert.equal(large.stats.replan_reason,'history_growth');
  assert.equal(large.stats.trimmed_items,30);assert.ok(large.stats.removed_bytes>350000);
  assert.deepEqual(next.body.input.slice(0,large.body.input.length),large.body.input);
  assert.equal(next.stats.replan_reason,'prefix_preserved');
  const source=history(36);assert.deepEqual(large.body.input.slice(-12),source.input.slice(-12));
  for(let i=1;i<source.input.length;i+=2)assert.deepEqual(large.body.input[i],source.input[i]);
});

test('an overnight resume extends previous cuts once, with the decision retained after restart',t=>{
  const f=fixture(t),first=f.apply(history(12)),warm=f.apply(history(18)),key=first.body.prompt_cache_key;
  assert.deepEqual(warm.body.input.slice(0,first.body.input.length),first.body.input);
  f.store.db.prepare('UPDATE context_checkpoints SET last_used=? WHERE cache_key=?').run(Date.now()-7*3600000,key);
  const resumed=f.apply(history(18));
  assert.equal(resumed.stats.replan_reason,'idle_resume');assert.equal(resumed.stats.trimmed_items,12);
  assert.deepEqual(resumed.body.input.slice(0,13),first.body.input.slice(0,13));
  f.reopen();const next=f.apply(history(19));
  assert.deepEqual(next.body.input.slice(0,resumed.body.input.length),resumed.body.input);
  assert.equal(next.stats.replan_reason,'prefix_preserved');
});

test('a growth checkpoint without sufficient savings does not rewrite the warm history',t=>{
  const f=fixture(t);f.store.settings.set('context.replan_growth_bytes',65536);
  const first=f.apply(history(1,5000)),key=first.body.prompt_cache_key,initial=f.store.contextCheckpoint(key);
  const source=history(25,5000),next=f.apply(source);
  assert.deepEqual(next.body.input,source.input);
  assert.equal(next.stats.replan_reason,'history_growth_below_savings_threshold');
  assert.equal(f.store.contextCheckpoint(key).history_bytes,initial.history_bytes);
  const useful=f.apply(history(36));assert.equal(useful.stats.replan_reason,'history_growth');
  assert.ok(useful.stats.removed_bytes>350000);
});

test('new opaque compaction state resets the decision without removing or altering canonical state',t=>{
  const f=fixture(t);f.apply(history(2));
  const source=history(12),marker={type:'compaction',id:'opaque-state-id',encrypted_content:'PRIVATE-OPAQUE-STATE'};
  source.input.unshift(marker);const compacted=f.apply(source),next=f.apply({...source,input:[...source.input,{role:'user',content:'continue'}]});
  assert.equal(compacted.stats.replan_reason,'compaction_boundary');assert.equal(compacted.stats.trimmed_items,6);
  assert.deepEqual(compacted.body.input[0],marker);
  assert.deepEqual(next.body.input.slice(0,compacted.body.input.length),compacted.body.input);
  const persisted=JSON.stringify(f.store.db.prepare('SELECT * FROM context_checkpoints').all())+
    JSON.stringify(f.store.db.prepare('SELECT * FROM context_trim_plans').all());
  for(const secret of ['PRIVATE-CONTENT','private-call','PRIVATE-OPAQUE-STATE','opaque-state-id'])assert.ok(!persisted.includes(secret));
});

test('disabled controls preserve a long active prefix and reject invalid checkpoint settings',t=>{
  const f=fixture(t);f.store.settings.set('context.replan_idle_ms',0);f.store.settings.set('context.replan_growth_bytes',0);
  f.apply(history(2));assert.equal(f.apply(history(40)).stats.trimmed_items,0);
  for(const [key,value] of [['context.replan_idle_ms',1],['context.replan_growth_bytes',100],['context.replan_growth_bytes',8388609]])
    assert.throws(()=>f.store.settings.set(key,value));
  const before=f.store.db.prepare('SELECT * FROM context_checkpoints').all();
  f.store.settings.set('context.trim_tool_history',false);assert.equal(f.apply(history(50)).stats.mode,'off');
  assert.deepEqual(f.store.db.prepare('SELECT * FROM context_checkpoints').all(),before);
});

test('checkpoint decisions remain isolated by account, caller, model and session',t=>{
  const f=fixture(t);f.apply(history(2));f.apply(history(36));
  for(const scopeOverride of [{caller:'other'},{account:'other'},{tenant:'other'},{session:'other'}]){
    const result=f.apply(history(12),scopeOverride);assert.equal(result.stats.replan_reason,'initial');assert.equal(result.stats.trimmed_items,6);
  }
  assert.equal(f.apply({...history(12),model:'other-model'}).stats.replan_reason,'initial');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM context_checkpoints').get().n,6);
});

test('version 3 upgrade preserves existing plans and usage and adopts the active prefix unchanged',t=>{
  const f=fixture(t),first=f.apply(history(11)),key=first.body.prompt_cache_key;
  f.store.usage({caller:'legacy-caller',status:200,outcome:'completed',duration:1});
  f.store.db.exec(`DROP TABLE context_checkpoints;
    ALTER TABLE usage DROP COLUMN request_kind;ALTER TABLE usage DROP COLUMN response_kind;
    ALTER TABLE usage DROP COLUMN context_reason;ALTER TABLE usage DROP COLUMN context_replan_reason;PRAGMA user_version=3;`);
  f.reopen();assert.equal(f.store.db.prepare('PRAGMA user_version').get().user_version,5);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM usage').get().n,1);
  assert.deepEqual(f.store.contextTrimPlan(key),{version:1,items:[]});
  const adopted=f.apply(history(12));assert.equal(adopted.stats.replan_reason,'legacy_plan_adopted');
  assert.deepEqual(adopted.body.input,history(12).input);
});

test('request and response classification distinguish commentary, tool continuation and compaction',()=>{
  const message=phase=>({type:'message',role:'assistant',phase,content:[{type:'output_text',text:'content'}]});
  const call={type:'custom_tool_call',name:'ApplyPatch',call_id:'c',input:'exact patch'};
  assert.equal(requestKind(history(1)),'tool_continuation');
  assert.equal(requestKind({...history(1),input:[...history(1).input,{role:'user',content:'new request'}]}),'inference');
  assert.equal(requestKind(history(1),true),'compaction');
  assert.equal(responseKind({output:[message('commentary'),call]}),'tool_call');
  assert.equal(responseKind({output:[message('commentary')]}),'commentary');
  assert.equal(responseKind({output:[message('final_answer')]}),'final_text');
  assert.equal(responseKind({output:[message('final_answer'),call]}),'mixed');
  assert.equal(responseKind({output:[{type:'compaction',encrypted_content:'opaque'}]}),'compaction');
  assert.equal(responseKind({}),'unknown');
});

test('full inference records final/tool/compaction/replay separately without inventing missing usage',async t=>{
  const f=fixture(t),store=f.store;
  store.importAccount({label:'offline only',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-only',expires_at:Date.now()+3600000,account_id:'synthetic-account'}});
  let output=[{type:'function_call',call_id:'next-read',name:'ReadFile',arguments:'{"path":"exact.txt"}'}],calls=0;
  const captured=[];
  const relay=new Relay(store,{transport:async(url,options)=>{
    calls++;captured.push(JSON.parse(options.body));
    const result={id:'response-synthetic',object:'response',status:'completed',model,output};
    if(url.endsWith('/compact'))return Response.json(result);
    return new Response('data: '+JSON.stringify({type:'response.completed',response:result})+'\n\n',
      {headers:{'content-type':'text/event-stream'}});
  }});
  const invoke=async(body,route='/v1/responses',extra={})=>{
    const chunks=[];await relay.infer({caller:store.caller(f.api),headers:new Headers({'session-id':'fixed',...extra}),
      raw:Buffer.from(JSON.stringify(body)),route,signal:new AbortController().signal,
      sink:{start(){},async write(chunk){chunks.push(chunk);},async end(){}}});
    return chunks;
  };
  await invoke(history(0));assert.equal(row(store).request_kind,'inference');assert.equal(row(store).response_kind,'tool_call');
  output=[{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'Done.'}]}];
  const follow=history(1);await invoke(follow,'/v1/responses',{'idempotency-key':'final-fixture'});
  assert.equal(row(store).request_kind,'tool_continuation');assert.equal(row(store).response_kind,'final_text');
  assert.equal(row(store).usage_source,'unknown');assert.equal(row(store).input_tokens,null);
  const count=calls;await invoke(follow,'/v1/responses',{'idempotency-key':'final-fixture'});
  assert.equal(calls,count);assert.equal(row(store).outcome,'replay');assert.equal(row(store).response_kind,'final_text');
  assert.equal(row(store).usage_source,'local_replay');assert.equal(row(store).upstream_attempts,0);
  output=[{type:'compaction',encrypted_content:'opaque-synthetic'}];
  const compact={...history(18),input:[...history(18).input,{type:'compaction_trigger'}]};
  await invoke(compact);assert.equal(row(store).request_kind,'compaction');assert.equal(row(store).response_kind,'compaction');
  assert.deepEqual(captured.at(-1).input,compact.input);assert.equal(row(store).context_removed_bytes,0);
  await invoke(history(18),'/v1/responses/compact');
  assert.equal(row(store).request_kind,'compaction');assert.equal(row(store).response_kind,'compaction');
  assert.deepEqual(captured.at(-1).input,history(18).input);
  output=[{type:'message',role:'assistant',content:[{type:'output_text',text:'Done.'}]}];
  await invoke(history(36));assert.equal(row(store).context_replan_reason,'history_growth');
  assert.ok(row(store).context_removed_bytes>350000);assert.equal(row(store).context_reason,'trimmed');
});

test('a cancelled upstream request keeps the response category and usage unknown',async t=>{
  const f=fixture(t),store=f.store,controller=new AbortController();
  store.importAccount({label:'offline only',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-only',expires_at:Date.now()+3600000}});
  const relay=new Relay(store,{transport:async()=>{controller.abort();throw new Error('synthetic cancellation');}});
  await assert.rejects(relay.infer({caller:store.caller(f.api),headers:new Headers(),raw:Buffer.from(JSON.stringify(history(0))),
    route:'/v1/responses',signal:controller.signal,sink:{start(){},async write(){},async end(){}}}),error=>error.status===499);
  assert.equal(row(store).outcome,'cancelled');assert.equal(row(store).response_kind,'unknown');
  assert.equal(row(store).usage_source,'unknown');assert.equal(row(store).input_tokens,null);
});
