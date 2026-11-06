import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {preparePolicyRequest,wrapPolicyResponse,EXECUTABLE_POLICY_REVISION} from '../self_relay/policy-runtime.mjs';
import {SseDecoder,sse} from '../self_relay/protocol.mjs';

const policy=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/policy-export-20261030/policy.local-reference.json',import.meta.url)));
const capture={identity:{mode:'enforce',revision:EXECUTABLE_POLICY_REVISION,generation:2},policy};
const body={model:'gpt-6-astra',stream:true,input:[{role:'user',content:'Synthetic stream verification'}],text:{format:{type:'json_object'}}};
const usage={input_tokens:10,output_tokens:4,total_tokens:14};
const response={id:'resp_stream_fixture',model:body.model,object:'response',status:'completed',output:[],usage};
const frames=[sse({type:'response.created',response:{...response,status:'in_progress',usage:null}}),
  sse({type:'response.output_item.added',output_index:0,item:{id:'msg_fixture',type:'message',role:'assistant',content:[]}}),
  sse({type:'response.output_text.delta',item_id:'msg_fixture',output_index:0,content_index:0,delta:'{"ok":true}'}),
  sse({type:'response.completed',response})];

async function readAll(stream,signal){
  const reader=stream.getReader(),decoder=new SseDecoder(),events=[];
  const abort=()=>reader.cancel(signal.reason).catch(()=>{});
  signal.addEventListener('abort',abort,{once:true});
  try{for(;;){const {value,done}=await reader.read();signal.throwIfAborted();events.push(...decoder.push(value,done));if(done)break;}}
  finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
  return events;
}

for(const prefix of ['\n','event: ping\n\n','retry: 1000\n\n',': keep-alive\n\n']){
  test('real policy stream progresses after SSE control frame '+JSON.stringify(prefix),{timeout:3000},async()=>{
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('policy_stream_stalled')),700);
    let index=0;
    const chunks=[Buffer.from(prefix),...frames];
    const source=new Response(new ReadableStream({pull(c){if(index===chunks.length)c.close();else c.enqueue(chunks[index++]);}},{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}});
    try{
      const prepared=preparePolicyRequest(body,capture,{adapter:'codex'});
      const wrapped=wrapPolicyResponse(source,prepared.state,{signal:abort.signal,started:Date.now(),fetchSegment:async()=>{throw Error('unexpected_recovery');}});
      const events=await readAll(wrapped.response.body,abort.signal);
      assert.equal(events.filter(e=>e.type==='response.completed').length,1);
      assert.deepEqual(events.at(-1).json.response.usage,usage);
    }finally{clearTimeout(timer);abort.abort();}
  });
}

function wrappedChunks(chunks){
  let index=0,cancelled=0;
  const prepared=preparePolicyRequest(body,capture,{adapter:'codex'});
  const engineBody=new ReadableStream({pull(c){if(index===chunks.length)c.close();else c.enqueue(chunks[index++]);},cancel(){cancelled++;}},{highWaterMark:0});
  prepared.state.engine={stream:()=>engineBody};
  const abort=new AbortController(),wrapped=wrapPolicyResponse(new Response(null),prepared.state,{signal:abort.signal,started:Date.now()});
  return {...wrapped,abort,engineBody,get cancelled(){return cancelled;}};
}

test('fragmented UTF-8, empty chunks and split comments do not strand a pending read',{timeout:3000},async()=>{
  const original={type:'response.output_text.delta',delta:'Xin chào 😀'},bytes=sse(original);
  const fixture=wrappedChunks([Buffer.alloc(0),Buffer.from(': kee'),Buffer.from('p-alive\n\n'),...Array.from(bytes,x=>Buffer.from([x]))]);
  const timer=setTimeout(()=>fixture.abort.abort(Error('fragment_stalled')),700);
  try{const events=await readAll(fixture.response.body,fixture.abort.signal);assert.deepEqual(events.map(e=>e.json),[original]);
    assert(fixture.observer.streamStats.buffered_reads>0);assert.equal(fixture.observer.streamStats.empty_reads,1);
  }finally{clearTimeout(timer);fixture.abort.abort();}
});

test('a comment and JSON in one chunk emit the JSON event exactly once',async()=>{
  const original={type:'response.created',response:{...response,usage:{input_tokens:999,output_tokens:999,total_tokens:1998}}};
  const fixture=wrappedChunks([Buffer.concat([Buffer.from(': keep-alive\n\n'),sse(original)])]);
  const events=await readAll(fixture.response.body,fixture.abort.signal);
  assert.equal(events.length,1);assert.equal(events[0].json.response.usage,null);
});

test('truncated and malformed policy frames remain errors instead of fabricated completion',async()=>{
  for(const [frame,code] of [['data: {','truncated_upstream_event'],['data: nope\n\n','invalid_upstream_event']]){
    const fixture=wrappedChunks([Buffer.from(frame)]);
    await assert.rejects(readAll(fixture.response.body,fixture.abort.signal),{code});
    assert.equal(fixture.engineBody.locked,false);
  }
});

for(const scenario of ['control_then_answer','genuine_idle','client_abort'])test('relay policy stream lifecycle: '+scenario,{timeout:5000},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdh-stream-'));
  const store=new Store(path.join(directory,'relay.sqlite'),crypto.randomBytes(32));
  const callerKey='synthetic-stream-caller-012345678901234567890';
  const abort=new AbortController();let abortTimer,cancelled=false,first=true,frameIndex=0;
  try{
    store.bootstrap('synthetic-stream-admin-012345678901234567890',callerKey);
    store.importAccount({label:'synthetic',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic-token',expires_at:Date.now()+3600000}});
    const imported=store.policies.import({policy,expectedGeneration:0});store.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:1});
    store.settings.set('relay.stream_idle_ms',250);
    const source=new Response(new ReadableStream({pull(c){
      if(first){first=false;c.enqueue(Buffer.from('event: ping\n\n'));return;}
      if(scenario==='control_then_answer'){if(frameIndex===frames.length)c.close();else c.enqueue(frames[frameIndex++]);}
    },cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}});
    const relay=new Relay(store,{transport:async()=>source}),chunks=[];
    const inference=relay.infer({caller:store.caller(callerKey),headers:new Headers({'idempotency-key':'synthetic-stream-check'}),raw:Buffer.from(JSON.stringify(body)),route:'/v1/responses',signal:abort.signal,
      sink:{start(){},async write(bytes){chunks.push(bytes);if(scenario==='client_abort')abortTimer=setTimeout(()=>abort.abort(),10);},async end(){}}});
    if(scenario==='control_then_answer'){
      await inference;const events=new SseDecoder().push(Buffer.concat(chunks),true);
      assert.equal(events.filter(e=>e.type==='response.completed').length,1);assert.deepEqual(events.at(-1).json.response.usage,usage);
    }else{
      await assert.rejects(inference,{code:scenario==='genuine_idle'?'upstream_stream_timeout':'cancelled'});
      assert(cancelled);assert.equal(relay.replays.size,0);
      assert(!new SseDecoder().push(Buffer.concat(chunks),true).some(e=>e.type==='response.completed'));
    }
    assert.equal(relay.active,0);assert([...relay.busy.values()].every(count=>count===0));
    const row=store.db.prepare('SELECT status,outcome FROM usage ORDER BY id DESC LIMIT 1').get();
    assert.equal(row.status,scenario==='control_then_answer'?200:scenario==='genuine_idle'?504:499);
  }finally{clearTimeout(abortTimer);abort.abort();store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
