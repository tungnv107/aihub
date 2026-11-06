import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {Store} from '../self_relay/store.mjs';import {Relay} from '../self_relay/core.mjs';
import {preparePolicyRequest,wrapPolicyResponse,EXECUTABLE_POLICY_REVISION,PolicyUsageObserver} from '../self_relay/policy-runtime.mjs';
import {SseDecoder,ResponseAccumulator,sse} from '../self_relay/protocol.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/policy-export-20261030/policy.local-reference.json',import.meta.url)));
const capture={identity:{mode:'enforce',revision:EXECUTABLE_POLICY_REVISION,generation:2},policy};
const template={model:'gpt-6-astra',stream:true,instructions:'Return the requested answer.',input:[{role:'user',content:'Synthetic verification'}]};
const tool={type:'function',name:'ReadFixture',strict:true,parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}};
const usage={input_tokens:120,input_tokens_details:{cached_tokens:80},output_tokens:30,output_tokens_details:{reasoning_tokens:6},total_tokens:150};
const envelope={id:'resp_policy_fixture',object:'response',model:'gpt-6-astra',status:'in_progress',output:[],usage:null};
const event=(type,fields={})=>({type,...fields});
function stream(events,size=17,{open=false}={}){
 const bytes=Buffer.concat(events.map(sse));let offset=0,cancelled=false;
 return {get cancelled(){return cancelled;},response:new Response(new ReadableStream({pull(c){if(offset>=bytes.length){if(!open)c.close();return;}c.enqueue(bytes.subarray(offset,offset+size));offset+=size;},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}})};
}
async function consume(response){const reader=response.body.getReader(),decoder=new SseDecoder(),acc=new ResponseAccumulator();const events=[];let terminal;
 try{for(;;){const {value,done}=await reader.read();for(const e of decoder.push(value,done)){events.push(e);acc.handle(e);if(['response.completed','response.incomplete'].includes(e.type))terminal=acc.complete(e.json.response);}if(done)break;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return {events,terminal};
}
function textEvents(text,{terminal=true}={}){
 const item={id:'msg_policy',type:'message',role:'assistant',status:'in_progress',phase:'final_answer',content:[]};
 const done={...item,status:'completed',content:[{type:'output_text',text,annotations:[]}]};
 return [event('response.created',{response:envelope}),event('response.output_item.added',{output_index:0,item}),
  event('response.content_part.added',{output_index:0,item_id:item.id,content_index:0,part:{type:'output_text',text:'',annotations:[]}}),
  event('response.output_text.delta',{output_index:0,item_id:item.id,content_index:0,delta:text}),
  ...(terminal?[event('response.output_text.done',{output_index:0,item_id:item.id,content_index:0,text}),event('response.output_item.done',{output_index:0,item:done}),event('response.completed',{response:{...envelope,status:'completed',output:[done],usage}})]:[])];
}
test('enforcement transforms the actual request and preserves its caller-owned input',()=>{
 const original={...structuredClone(template),tools:[structuredClone(tool)]},before=structuredClone(original);
 const prepared=preparePolicyRequest(original,capture,{adapter:'codex'});
 assert(prepared.applied);assert.equal(prepared.body.text.format.name,policy.jsonLaneName);
 assert(prepared.body.tools[0].parameters.required.includes(policy.argPadKey));assert.deepEqual(original,before);
 assert.equal(prepared.state.padRequired.ReadFixture[0],'path');
 assert.equal(preparePolicyRequest(original,capture,{adapter:'codex',compacting:true}).applied,false);
 assert.equal(preparePolicyRequest(original,capture,{adapter:'api'}).applied,false);
});
test('cache normalization preserves user UUIDs, opaque reasoning and tool results',()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const input=[{role:'user',content:'Exact record '+id},{type:'reasoning',id:'rs_keep',encrypted_content:'opaque+/=='},
  {type:'function_call_output',call_id:'call_keep',output:JSON.stringify({thread_id:id,create_time:123,enabled:false})}];
 const result=preparePolicyRequest({...template,input,metadata:{thread_id:id,create_time:123}},capture,{adapter:'codex'});
 assert.deepEqual(result.body.input,input);assert.equal(result.body.metadata.thread_id,'00000000-0000-0000-0000-000000000000');
});
test('client JSON schema stays client-owned and its original fields remain present',()=>{
 const original={...template,text:{format:{type:'json_schema',name:'Client',strict:true,schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}}};
 const result=preparePolicyRequest(original,capture,{adapter:'codex'});
 assert.equal(result.body.text.format.name,'Client');assert.equal(result.state.jsonSchema,false);assert.deepEqual(result.state.padRequired.__client_json__,['ok']);
});
for(const chunk of [1,17,65536])test('JSON answer is unwrapped and cancelled before padding; chunk '+chunk,{timeout:7000},async()=>{
 const prepared=preparePolicyRequest(template,capture,{adapter:'codex'}),answer='Xin chào 😀, số 4.';
 const source=stream(textEvents(JSON.stringify({answer,notes:'a1 b2 '.repeat(150)}),{terminal:false}),chunk,{open:true});
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),5000);let fetches=0;
 try{
  const wrapped=wrapPolicyResponse(source.response,prepared.state,{signal:abort.signal,started:Date.now(),fetchSegment:async()=>{fetches++;throw Error('unexpected_segment');}});
  const result=await consume(wrapped.response);
  assert.equal(result.terminal?.status,'completed');assert.equal(result.terminal.output.filter(x=>x.type==='message').at(-1).content[0].text,answer);
  assert.equal(result.terminal.usage,null);assert(source.cancelled);assert.equal(fetches,0);
  assert(!JSON.stringify(result.events).includes('a1 b2 a1 b2'));
 }finally{clearTimeout(timer);abort.abort();}
});
test('actual upstream usage is kept verbatim when a normal terminal is observed',{timeout:7000},async()=>{
 const prepared=preparePolicyRequest({...template,text:{format:{type:'json_object'}}},capture,{adapter:'codex'});
 const source=stream(textEvents('{"ok":true}'),65536),abort=new AbortController();const timer=setTimeout(()=>abort.abort(),5000);
 try{const result=await consume(wrapPolicyResponse(source.response,prepared.state,{signal:abort.signal,started:Date.now(),fetchSegment:async()=>{throw Error('no_recovery_expected');}}).response);
 assert.deepEqual(result.terminal.usage,usage);assert.equal(result.terminal.output.at(-1).content[0].text,'{"ok":true}');
 }finally{clearTimeout(timer);abort.abort();}
});
function callEvents(calls){
 const events=[event('response.created',{response:envelope})];
 for(let index=0;index<calls.length;index++)events.push(event('response.output_item.added',{output_index:index,item:{...calls[index],status:'in_progress',arguments:''}}));
 for(let index=0;index<calls.length;index++){
  const item=calls[index];events.push(event('response.function_call_arguments.delta',{output_index:index,item_id:item.id,delta:item.arguments}));
  events.push(event('response.function_call_arguments.done',{output_index:index,item_id:item.id,arguments:item.arguments}));
  events.push(event('response.output_item.done',{output_index:index,item:{...item,status:'completed'}}));
 }
 events.push(event('response.completed',{response:{...envelope,status:'completed',output:calls.map(c=>({...c,status:'completed'})),usage}}));return events;
}
for(const chunk of [1,17,65536])test('tool arguments restore false, zero and empty string; chunk '+chunk,{timeout:7000},async()=>{
 const optional={...structuredClone(tool),strict:false,parameters:{type:'object',properties:{path:{type:'string'},enabled:{type:'boolean'},count:{type:'integer'},note:{type:'string'}},required:['path'],additionalProperties:false}};
 const prepared=preparePolicyRequest({...template,tools:[optional]},capture,{adapter:'codex'});
 const args={path:'fixture.txt',enabled:false,count:0,note:''};
 const call={id:'fc_fixture',call_id:'call_fixture',type:'function_call',name:'ReadFixture',arguments:JSON.stringify({...args,[policy.argPadKey]:'a1 '.repeat(300)})};
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
 try{const wrapped=wrapPolicyResponse(stream(callEvents([call]),chunk).response,prepared.state,{signal:abort.signal,started:Date.now(),fetchSegment:async()=>{throw Error('no_recovery_expected');}});
  const result=await consume(wrapped.response);assert.equal(result.terminal?.status,'completed');
  const returned=result.terminal.output.find(x=>x.type==='function_call');assert(returned);assert.deepEqual(JSON.parse(returned.arguments),args);
  assert.equal(returned.call_id,call.call_id);assert.equal(returned.name,call.name);
 }finally{clearTimeout(timer);abort.abort();}
});
test('two open tool calls are retained separately without merging their arguments',{timeout:7000},async()=>{
 const prepared=preparePolicyRequest({...template,tools:[structuredClone(tool)]},capture,{adapter:'codex'});
 const calls=['a.txt','b.txt'].map((name,index)=>({id:'fc_'+index,call_id:'call_'+index,type:'function_call',name:'ReadFixture',arguments:JSON.stringify({path:name,[policy.argPadKey]:'pad '.repeat(200)})}));
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
 try{const result=await consume(wrapPolicyResponse(stream(callEvents(calls),17).response,prepared.state,{signal:abort.signal,started:Date.now(),fetchSegment:async()=>{throw Error('no_recovery_expected');}}).response);
  const returned=result.terminal?.output.filter(x=>x.type==='function_call');assert.equal(returned?.length,2);assert.deepEqual(returned.map(x=>JSON.parse(x.arguments).path),['a.txt','b.txt']);
 }finally{clearTimeout(timer);abort.abort();}
});
test('policy registry supports enforce, pins a request and rolls back its prior mode',()=>{
 const base=new URL('./self-relay-fixtures/',import.meta.url),directory=fs.mkdtempSync(new URL('execution-',base));
 const store=new Store(path.join(directory,'relay.sqlite'),crypto.randomBytes(32));
 try{
  const imported=store.policies.import({policy,expectedGeneration:0});
  store.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:1});
  const pinned=store.policies.capture();assert(pinned.identity.enforced);assert(Object.isFrozen(pinned.policy));
  store.policies.select({revision:imported.revision,mode:'observe',expectedGeneration:2});
  store.policies.rollback({expectedGeneration:3});assert.equal(store.policies.status().mode,'enforce');assert.equal(pinned.identity.generation,2);
 }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('full local inference applies selected policy and records unknown usage honestly',{timeout:7000},async()=>{
 const base=new URL('./self-relay-fixtures/',import.meta.url),directory=fs.mkdtempSync(new URL('execution-',base));
 const store=new Store(path.join(directory,'relay.sqlite'),crypto.randomBytes(32)),key='synthetic-policy-caller-012345678901234567890';
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
 try{
  store.bootstrap('synthetic-policy-admin-012345678901234567890',key);
  store.importAccount({label:'synthetic',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic-token',expires_at:Date.now()+3600000}});
  const imported=store.policies.import({policy,expectedGeneration:0});store.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:1});
  let sent,headers;const chunks=[];
  const relay=new Relay(store,{transport:async(url,options)=>{sent=JSON.parse(options.body);return stream(textEvents(JSON.stringify({answer:'4',notes:'a1 '.repeat(300)}),{terminal:false}),17,{open:true}).response;}});
  await relay.infer({caller:store.caller(key),headers:new Headers(),raw:Buffer.from(JSON.stringify({...template,stream:false})),route:'/v1/responses',signal:abort.signal,
   sink:{start(status,type,h){headers=h;},async write(b){chunks.push(b);},async end(){}}});
  assert.equal(sent.text.format.name,policy.jsonLaneName);assert.equal(headers['x-relay-policy-mode'],'enforce');
  const result=JSON.parse(Buffer.concat(chunks));assert.equal(result.output.at(-1).content[0].text,'4');
  const row=store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();assert.equal(row.policy_mode,'enforce');assert.equal(row.usage_source,'unknown');assert.equal(row.input_tokens,null);
 }finally{clearTimeout(timer);abort.abort();store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
