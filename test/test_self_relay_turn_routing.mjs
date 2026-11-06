import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {TurnRouting,validTurnState} from '../self_relay/turn-routing.mjs';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';

const values={'routing.turn_state_ttl_ms':900000,'routing.max_turn_states':2};
const settings={get:key=>values[key]};
const caller={tenant:'tenant1',id:'caller1'},account={id:'account1',adapter:'codex'};
const first={model:'test-model',instructions:'Keep the task.',input:[{role:'user',content:'Use a tool.'}]};
const tool={type:'function_call',call_id:'call_1',name:'lookup',arguments:'{}'};
const next={...first,input:[...first.input,tool,{type:'function_call_output',call_id:'call_1',output:'OK'}]};
const ctx=(r,body=first,changes={})=>r.context(changes.caller??caller,changes.account??account,body,changes.session??'session1',changes.headers??new Headers());
test('tool continuation reuses opaque routing without modifying prompt data',()=>{
 const r=new TurnRouting(settings),original=structuredClone(next);
 r.remember(ctx(r),'upstream-state',{output:[tool]});
 assert.equal(r.resolve(ctx(r,next)),'upstream-state');assert.deepEqual(next,original);
 assert.equal(r.resolve(ctx(r)),null);
});
test('new user turn, unknown tool output and changed prefix cannot inherit routing',()=>{
 const r=new TurnRouting(settings);r.remember(ctx(r),'state',{output:[tool]});
 for(const input of [[...next.input,{role:'user',content:'Next turn'}],
   [...first.input,{type:'function_call_output',call_id:'foreign',output:'OK'}],
   [{role:'user',content:'Different task'},tool,next.input.at(-1)]])assert.equal(r.resolve(ctx(r,{...next,input})),null);
});
test('routing is isolated by caller tenant account model and session',()=>{
 const r=new TurnRouting(settings);r.remember(ctx(r),'state',{output:[tool]});
 for(const changes of [{caller:{...caller,id:'other'}},{caller:{...caller,tenant:'other'}},{account:{...account,id:'other'}},{session:'other'}])assert.equal(r.resolve(ctx(r,next,changes)),null);
 assert.equal(r.resolve(ctx(r,{...next,model:'different'})),null);
 assert.equal(ctx(r,next,{account:{...account,adapter:'plan'}}),null);
});
test('state expires, final text clears it and cache capacity is bounded',()=>{
 const r=new TurnRouting(settings);r.remember(ctx(r),'state',{output:[tool]});
 r.entries.get(ctx(r).key).expires=Date.now()-1;assert.equal(r.resolve(ctx(r,next)),null);
 r.remember(ctx(r),'state',{output:[tool]});r.remember(ctx(r,next),'state',{output:[]});assert.equal(r.entries.size,0);
 for(let i=0;i<4;i++)r.remember(ctx(r,first,{session:'s'+i}),'state',{output:[tool]});assert.equal(r.entries.size,2);
});
test('explicit Codex turn id is stable only within the declared turn',()=>{
 const r=new TurnRouting(settings),h=id=>new Headers({'x-codex-turn-metadata':JSON.stringify({turn_id:id})});
 r.remember(ctx(r,first,{headers:h('turn-1')}),'state',{output:[tool]});
 assert.equal(r.resolve(ctx(r,first,{headers:h('turn-1')})),'state');
 assert.equal(r.resolve(ctx(r,first,{headers:h('turn-2')})),null);
 assert.equal(validTurnState('bad\r\nheader'),null);assert.equal(validTurnState('x'.repeat(16385)),null);
});
test('live relay transport echoes only its own scoped state; a new turn clears it',async t=>{
 const dir=fs.mkdtempSync(new URL('./turn-routing-fixture-',import.meta.url));
 const store=new Store(dir+'/relay.sqlite',crypto.randomBytes(32));t.after(()=>store.close());
 store.bootstrap('a'.repeat(32),'b'.repeat(32));
 store.importAccount({label:'synthetic',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic',expires_at:Date.now()+3600000,account_id:'test-account'}});
 const sent=[];
 const relay=new Relay(store,{transport:async(url,options)=>{
  sent.push(options.headers.get('x-codex-turn-state'));
  const response={id:'response_'+sent.length,object:'response',model:'test-model',status:'completed',output:sent.length===1?[tool]:[],usage:{input_tokens:10,output_tokens:1}};
  return new Response('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response})+'\n\n',{headers:{'content-type':'text/event-stream','x-codex-turn-state':'server-state-'+sent.length}});
 }});
 const results=[];
 for(const body of [first,next,{...next,input:[...next.input,{role:'user',content:'New user turn'}]}]){
  const sink={start(status,type,headers){this.headers=headers;},async write(){},async end(){}};
  await relay.infer({caller:store.caller('b'.repeat(32)),headers:new Headers({'session-id':'stable','x-codex-turn-state':'untrusted-client-token'}),raw:Buffer.from(JSON.stringify(body)),route:'/v1/responses',signal:new AbortController().signal,sink});results.push(sink.headers);
 }
 assert.deepEqual(sent,[null,'server-state-1',null]);
 assert.equal(results[1]['x-relay-turn-state'],'reused');assert.equal(results[1]['x-codex-turn-state'],'server-state-1');
 assert.equal(results[2]['x-relay-turn-state'],'new');
});
