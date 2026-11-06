import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {SseDecoder,ResponseAccumulator} from '../self_relay/protocol.mjs';
import {trimToolHistory} from '../self_relay/context-budget.mjs';

const trimming={'context.trim_tool_history':true,'context.keep_recent_tool_outputs':2,
  'context.trim_batch_size':4,'context.old_tool_output_chars':512,
  'context.min_tool_history_bytes':8192,'context.min_removed_bytes':0};
const model='synthetic-compaction-model';
const apiKey='b'.repeat(40);
function fixture(t,transport){
  const dir=fs.mkdtempSync(new URL('./native-compaction-fixture-',import.meta.url));
  const store=new Store(dir+'/relay.sqlite',crypto.randomBytes(32));
  t.after(()=>store.close());
  store.bootstrap('a'.repeat(40),apiKey);
  for(const [key,value] of Object.entries(trimming))store.settings.set(key,value);
  store.importAccount({label:'synthetic-only',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-only',expires_at:Date.now()+3600000,account_id:'synthetic-account'}});
  return {store,relay:new Relay(store,{transport})};
}
function history(){
  const input=[{role:'user',content:'Retain the project facts and pending edit.'}];
  for(let i=0;i<10;i++)input.push(
    {type:'function_call',call_id:'read-'+i,name:'ReadFile',arguments:JSON.stringify({path:'file-'+i})},
    {type:'function_call_output',call_id:'read-'+i,output:'HEAD '+i+'\n'+'Preserve exact historical text.\n'.repeat(150)+'TAIL '+i});
  return input;
}
function completed(output,usage={input_tokens:1234,output_tokens:56,input_tokens_details:{cached_tokens:1024}}){
  return {id:'synthetic-response',object:'response',status:'completed',model,output,usage};
}
function events(output){
  const rows=[];
  for(const [output_index,item] of output.entries()){
    rows.push({type:'response.output_item.added',output_index,item});
    rows.push({type:'response.output_item.done',output_index,item});
  }
  // The terminal event may omit items already delivered through output_item.done.
  rows.push({type:'response.completed',response:completed([])});
  return rows.map(row=>'event: '+row.type+'\ndata: '+JSON.stringify(row)+'\n\n').join('');
}
async function invoke(relay,store,body,route='/v1/responses'){
  const chunks=[];let responseHeaders,responseType,ended=0;
  await relay.infer({caller:store.caller(apiKey),headers:new Headers({
    'session-id':'native-compaction-session','x-codex-beta-features':'remote_compaction_v2'}),
    raw:Buffer.from(JSON.stringify(body)),route,signal:new AbortController().signal,
    sink:{start(status,type,headers){assert.equal(status,200);responseType=type;responseHeaders=headers;},
      async write(chunk){chunks.push(chunk);},async end(){ended++;}}});
  assert.equal(ended,1);
  const bytes=Buffer.concat(chunks);
  if(responseType!=='text/event-stream')return {data:JSON.parse(bytes.toString()),headers:responseHeaders};
  const decoder=new SseDecoder(),accumulator=new ResponseAccumulator();let data;
  for(const event of decoder.push(bytes,true)){
    accumulator.handle(event);
    if(event.type==='response.completed')data=accumulator.complete(event.json.response);
  }
  assert.ok(data,'a natural terminal event must reach the caller');
  return {data,headers:responseHeaders};
}

test('native v2 keeps complete history, capability header, SSE compaction items and continuation intact',async t=>{
  const canonical=[
    {type:'compaction',id:'cmp-synthetic',encrypted_content:'opaque-fixture+/==\u00e9'},
    {type:'message',role:'user',content:[{type:'input_text',text:'Keep project ORCHID.'}]},
    {type:'function_call',call_id:'retained-read',name:'ReadFile',arguments:'{"path":"notes.txt"}'},
    {type:'function_call_output',call_id:'retained-read',output:'PORT=18473'},
    {type:'custom_tool_call',call_id:'retained-edit',name:'ApplyPatch',input:'*** Begin Patch\n*** End Patch'},
    {type:'custom_tool_call_output',call_id:'retained-edit',output:'Synthetic previous edit complete.'},
  ];
  const captured=[];
  const {store,relay}=fixture(t,async(url,options)=>{
    captured.push({url,headers:options.headers,body:JSON.parse(options.body)});
    return new Response(events(captured.length===1?canonical:[{type:'message',role:'assistant',
      content:[{type:'output_text',text:'ORCHID on 18473.'}]}]),{headers:{'content-type':'text/event-stream'}});
  });
  const source=history();
  const trigger={model,stream:true,instructions:'Preserve all facts.',input:[...source,{type:'compaction_trigger'}]};
  assert.ok(trimToolHistory(trigger,{get:key=>trimming[key]}).stats.removed_bytes>10000,
    'the fixture must genuinely exercise a history that ordinary inference would trim');
  const compacted=await invoke(relay,store,trigger);
  assert.equal(captured.length,1,'compaction must not duplicate inference');
  assert.equal(captured[0].url,'https://chatgpt.com/backend-api/codex/responses');
  assert.equal(captured[0].headers.get('x-codex-beta-features'),'remote_compaction_v2');
  assert.equal(captured[0].body.stream,true);
  assert.equal(captured[0].body.store,false);
  assert.deepEqual(captured[0].body.input,trigger.input,'remote compaction needs the unshortened source history');
  assert.deepEqual(compacted.data.output,canonical);
  assert.equal(compacted.headers['x-relay-context'],'off');
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM context_trim_plans').get().n,0,
    'a compaction trigger must not freeze a trimming plan for later normal requests');
  const compactUsage=store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();
  assert.equal(compactUsage.input_tokens,1234);
  assert.equal(compactUsage.cached_tokens,1024);
  assert.equal(compactUsage.output_tokens,56);
  assert.equal(compactUsage.upstream_attempts,1);
  assert.equal(compactUsage.context_removed_bytes,0);
  const next={model,stream:false,instructions:trigger.instructions,input:[...compacted.data.output,
    {role:'user',content:'Continue using the retained facts and edit history.'}]};
  const nextSnapshot=structuredClone(next);
  const continued=await invoke(relay,store,next);
  assert.equal(captured.length,2);
  assert.deepEqual(captured[1].body.input,nextSnapshot.input,
    'canonical encrypted state and both kinds of call/result pairs must survive continuation');
  assert.deepEqual(next,nextSnapshot,'the caller payload must not be mutated');
  assert.equal(continued.data.status,'completed');
  assert.equal(continued.data.output[0].content[0].text,'ORCHID on 18473.');
});

test('legacy standalone compact does not reintroduce response-only fields or trim its input',async t=>{
  let captured;
  const canonical=[{type:'compaction',encrypted_content:'legacy-opaque-fixture'}];
  const {store,relay}=fixture(t,async(url,options)=>{
    captured={url,body:JSON.parse(options.body)};
    return Response.json(completed(canonical));
  });
  const body={model,input:history(),instructions:'Preserve exact facts.',stream:true,store:false,
    prompt_cache_key:'client-group',tools:[{type:'function',name:'ReadFile',parameters:{type:'object'}}]};
  const result=await invoke(relay,store,body,'/v1/responses/compact');
  assert.equal(captured.url,'https://chatgpt.com/backend-api/codex/responses/compact');
  for(const field of ['stream','store','prompt_cache_key'])assert.equal(Object.hasOwn(captured.body,field),false,field);
  assert.deepEqual(captured.body.input,body.input);
  assert.deepEqual(captured.body.tools,body.tools);
  assert.equal(captured.body.instructions,body.instructions);
  assert.deepEqual(result.data.output,canonical);
});
