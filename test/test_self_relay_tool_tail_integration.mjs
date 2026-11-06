import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';

// No real upstream or credential is used. Exercise the complete core and accounting path.
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');
const model='synthetic-tool-tail-model';
const patch='*** Begin Patch\n*** Add File: test/test.md\n+xin chào 😀\n*** End Patch';
const payload={patch,note:'optional field must survive'};
const tool={type:'function',name:'ApplyPatch',description:'Synthetic patch tool',strict:false,
  parameters:{type:'object',properties:{patch:{type:'string'},note:{type:'string'}},required:['patch'],additionalProperties:false}};
const custom={type:'custom',name:'ApplyPatch',format:{type:'grammar',syntax:'lark',definition:'start: "*** Begin Patch" /[\\s\\S]*/ "*** End Patch"'}};
const usage={input_tokens:2048,output_tokens:40,input_tokens_details:{cached_tokens:1024},output_tokens_details:{reasoning_tokens:4}};
const reasoning={type:'reasoning',id:'reasoning_1',status:'completed',summary:[],encrypted_content:'opaque-preserve+/=='};
const text={type:'message',id:'message_1',status:'completed',role:'assistant',content:[{type:'output_text',text:'Sẽ tạo tệp.'}]};
const encode=events=>Buffer.from(events.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''));
const event=(type,data)=>({type,...data});
const call=(argumentsValue,type='function_call')=>({type,id:'item_patch_1',call_id:'call_patch_1',name:'ApplyPatch',status:'completed',
  ...(type==='function_call'?{arguments:argumentsValue}:{input:argumentsValue})});

function upstream(wire,mode,track){
  const wrapped=!!wire.tools?.[0]?.parameters?.properties?.payload;
  const value=mode==='malformed'?{patch:123}:payload;
  const args=wrapped?JSON.stringify({payload:value,__relay_tail:'end'}):JSON.stringify(value);
  const isCustom=wire.tools?.[0]?.type==='custom';
  const item=call(isCustom?patch:args,isCustom?'custom_tool_call':'function_call');
  const base={id:'response_fixed_1',object:'response',created_at:123,model,status:'in_progress',output:[],usage:null,
    tools:wire.tools,parallel_tool_calls:wire.parallel_tool_calls};
  const events=[event('response.created',{response:base}),
    event('response.output_item.added',{output_index:0,item:{...reasoning,status:'in_progress',encrypted_content:null}}),
    event('response.output_item.done',{output_index:0,item:reasoning}),
    event('response.output_item.added',{output_index:1,item:{...text,status:'in_progress',content:[]}}),
    event('response.output_text.delta',{output_index:1,item_id:text.id,content_index:0,delta:text.content[0].text}),
    event('response.output_item.done',{output_index:1,item:text}),
    event('response.output_item.added',{output_index:2,item:{...item,status:'in_progress',...(isCustom?{input:''}:{arguments:''})}}),
    event(isCustom?'response.custom_tool_call_input.delta':'response.function_call_arguments.delta',
      {output_index:2,item_id:item.id,delta:isCustom?patch:args})];
  const natural=mode!=='early'&&mode!=='bytewise'&&mode!=='malformed';
  if(natural)events.push(event('response.output_item.done',{output_index:2,item}),
    event('response.completed',{response:{...base,status:'completed',output:[reasoning,text,item],usage}}));
  let chunks=mode==='natural-batch'?[encode(events)]:events.map(e=>encode([e]));
  if(mode==='bytewise')chunks=[...Buffer.concat(chunks)].map(byte=>Buffer.from([byte]));
  let offset=0;
  const body=new ReadableStream({pull(controller){
    if(offset<chunks.length){controller.enqueue(chunks[offset++]);return;}
    if(natural)controller.close();
    // Early paths deliberately never provide EOF or a terminal. Cancellation is required.
  },cancel(){track.cancelled++;}});
  return new Response(body,{headers:{'content-type':'text/event-stream'}});
}

function fixture(t,modes,enabled=true){
  fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'tail-integration-'));
  const store=new Store(path.join(dir,'relay.sqlite'),crypto.randomBytes(32));
  const key='synthetic-caller-key-01234567890123456789';
  store.bootstrap('synthetic-admin-key-01234567890123456789',key);
  store.settings.set('tools.early_finish',enabled);store.settings.set('relay.stream_idle_ms',2000);
  store.importAccount({label:'offline-only',adapter:'codex',exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-access',account_id:'synthetic-account',expires_at:Date.now()+3600000}});
  const sent=[],tracks=[];
  const relay=new Relay(store,{transport:async(url,options)=>{
    assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');
    assert.equal(options.headers.get('authorization'),'Bearer synthetic-access');
    assert(sent.length<modes.length,'Unexpected retry or inference');
    const wire=JSON.parse(options.body),track={cancelled:0};sent.push(wire);tracks.push(track);
    return upstream(wire,modes[sent.length-1],track);
  }});
  t.after(()=>{
    store.close();const resolved=path.resolve(dir),allowed=path.resolve(root)+path.sep;
    assert(resolved.startsWith(allowed));fs.rmSync(resolved,{recursive:true,force:true});
  });
  const invoke=async(body,chat=false,extra={})=>{
    const chunks=[];let ended=0,headers;
    await relay.infer({caller:store.caller(key),headers:new Headers({'session-id':'tail-test-session',...extra}),
      raw:Buffer.from(JSON.stringify(body)),route:chat?'/v1/chat/completions':'/v1/responses',signal:new AbortController().signal,
      sink:{start(status,type,h){assert.equal(status,200);headers=h;},async write(bytes){chunks.push(Buffer.from(bytes));},async end(){ended++;}}});
    assert.equal(ended,1);const raw=Buffer.concat(chunks).toString();
    return {raw,data:body.stream?null:JSON.parse(raw),frames:body.stream?raw.split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6))):[],headers};
  };
  return {store,relay,sent,tracks,invoke};
}

function request(chat,stream,history=[{role:'user',content:'Create the patch using ApplyPatch.'}],tools=[tool]){
  return chat?{model,stream,stream_options:{include_usage:true},messages:history,tools:tools.map(({type,...f})=>({type:'function',function:f})),parallel_tool_calls:true}:
    {model,stream,input:history,tools,parallel_tool_calls:true};
}
function returned(result,chat,stream){
  if(!stream)return chat?result.data.choices[0].message.tool_calls[0]:result.data.output.find(x=>x.type.endsWith('_call'));
  if(!chat)return result.frames.find(e=>e.type==='response.output_item.done'&&e.item.type==='function_call').item;
  const toolCall={function:{arguments:''}};
  for(const frame of result.frames)for(const c of frame.choices?.[0]?.delta?.tool_calls??[]){
    if(c.id)toolCall.id=c.id;if(c.type)toolCall.type=c.type;
    if(c.function?.name)toolCall.function.name=c.function.name;
    toolCall.function.arguments+=c.function?.arguments??'';
  }
  return toolCall;
}
function lastUsage(store){return store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();}

for(const chat of [false,true])for(const stream of [false,true])test('early completion integration '+(chat?'Chat':'Responses')+' '+(stream?'SSE':'JSON'),async t=>{
  const f=fixture(t,['early']);
  const result=await f.invoke(request(chat,stream),chat);
  const c=returned(result,chat,stream);
  assert.equal(chat?c.function.name:c.name,'ApplyPatch');
  assert.equal(chat?c.id:c.call_id,'call_patch_1');
  assert.deepEqual(JSON.parse(chat?c.function.arguments:c.arguments),payload);
  assert.equal(result.raw.includes('__relay_tail'),false,'No wrapper in tools, arguments, metadata, or replay bytes');
  assert.equal(f.tracks[0].cancelled,1,'Open upstream must be cancelled');
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].parallel_tool_calls,false);
  if(!chat){
    const terminal=stream?result.frames.find(e=>e.type==='response.completed').response:result.data;
    assert.equal(terminal.id,'response_fixed_1');assert.equal(terminal.created_at,123);
    assert.equal(terminal.model,model);assert.equal(terminal.status,'completed');assert.equal(terminal.usage,null);
    assert.deepEqual(terminal.output[0],reasoning);assert.deepEqual(terminal.output[1],text);
    assert.deepEqual(terminal.tools,[tool]);assert.equal(terminal.parallel_tool_calls,true);
    if(stream){assert.equal(result.frames.filter(e=>e.type==='response.completed').length,1);
      assert.deepEqual(result.frames.map(e=>e.sequence_number),result.frames.map((_,i)=>i));}
  }else if(stream){assert.equal(result.raw.match(/data: \[DONE\]/g)?.length,1);assert.equal(result.frames.some(e=>e.usage),false);}
  else assert.equal(Object.hasOwn(result.data,'usage'),false);
  const row=lastUsage(f.store);assert.equal(row.outcome,'tool_completed_early');assert.equal(row.status,200);
  assert.equal(row.upstream_attempts,1);assert.equal(row.usage_source,'unknown');
  for(const name of ['input_tokens','cached_tokens','output_tokens','reasoning_tokens'])assert.equal(row[name],null);
});

test('bytewise UTF8 SSE and idempotency replay retain exact tool once',async t=>{
  const f=fixture(t,['bytewise']);const body=request(false,true),headers={'idempotency-key':'tail-replay'};
  const first=await f.invoke(body,false,headers),second=await f.invoke(body,false,headers);
  assert.equal(second.raw,first.raw);assert.equal(second.headers['x-relay-cache'],'hit');assert.equal(f.sent.length,1);
  assert.deepEqual(JSON.parse(returned(second,false,true).arguments),payload);
  const row=lastUsage(f.store);assert.equal(row.outcome,'replay');assert.equal(row.upstream_attempts,0);
  assert.equal(row.usage_source,'local_replay');assert.equal(row.replay_saved_input_tokens,null);
});

for(const chat of [false,true])test('next tool-result turn has consistent upstream history '+(chat?'Chat':'Responses'),async t=>{
  const f=fixture(t,['early','natural-batch']);const history=[{role:'user',content:'Apply the patch.'}];
  const first=await f.invoke(request(chat,false,history),chat);const c=returned(first,chat,false);
  if(chat)history.push({role:'assistant',content:null,tool_calls:[c]},{role:'tool',tool_call_id:'call_patch_1',content:'Applied successfully.'});
  else history.push(c,{type:'function_call_output',call_id:'call_patch_1',output:'Applied successfully.'});
  const snapshot=structuredClone(history);
  await f.invoke(request(chat,false,history),chat);
  assert.deepEqual(history,snapshot);
  const sent=f.sent[1].input.find(x=>x.type==='function_call');
  assert.deepEqual(JSON.parse(sent.arguments),{payload,__relay_tail:'end'});assert.equal(sent.call_id,'call_patch_1');
  assert.equal(f.sent[1].input.find(x=>x.type==='function_call_output').output,'Applied successfully.');
  assert.equal(f.sent[0].prompt_cache_key,f.sent[1].prompt_cache_key);
  assert.equal(lastUsage(f.store).usage_source,'upstream');
});

test('natural terminal in the same read wins over marker and preserves measured usage',async t=>{
  const f=fixture(t,['natural-batch']);const result=await f.invoke(request(false,true));
  const terminal=result.frames.find(e=>e.type==='response.completed').response;
  assert.deepEqual(terminal.usage,usage);assert.equal(result.raw.includes('__relay_tail'),false);
  assert.deepEqual(JSON.parse(returned(result,false,true).arguments),payload);
  const row=lastUsage(f.store);assert.equal(row.outcome,'completed');assert.equal(row.usage_source,'upstream');
  assert.equal(row.input_tokens,2048);assert.equal(row.cached_tokens,1024);assert.equal(row.output_tokens,40);
});

test('custom grammar request passes unchanged and remains measured',async t=>{
  const f=fixture(t,['natural-batch']);const result=await f.invoke(request(false,false,undefined,[custom]));
  assert.deepEqual(f.sent[0].tools,[custom]);assert.equal(f.sent[0].parallel_tool_calls,true);
  assert.equal(result.data.output[2].type,'custom_tool_call');assert.equal(result.data.output[2].input,patch);
  assert.equal(result.headers['x-relay-tool-tail'],'no_function_tools');
  assert.equal(lastUsage(f.store).usage_source,'upstream');
});

test('setting disabled retains original function protocol',async t=>{
  const f=fixture(t,['natural-batch'],false);const result=await f.invoke(request(false,false));
  assert.deepEqual(f.sent[0].tools,[tool]);assert.equal(result.headers['x-relay-tool-tail'],'disabled');
  assert.deepEqual(JSON.parse(result.data.output[2].arguments),payload);assert.deepEqual(result.data.usage,usage);
});

test('invalid payload is rejected without fabricated usage or extra inference',async t=>{
  const f=fixture(t,['malformed']);
  await assert.rejects(f.invoke(request(false,false)),{code:'tool_tail_invalid_payload'});
  assert.equal(f.sent.length,1);assert.equal(f.tracks[0].cancelled,1);
  const row=lastUsage(f.store);assert.equal(row.status,502);assert.equal(row.usage_source,'unknown');
  assert.equal(row.input_tokens,null);assert.equal(row.output_tokens,null);assert.equal(row.outcome,'tool_tail_invalid_payload');
});
