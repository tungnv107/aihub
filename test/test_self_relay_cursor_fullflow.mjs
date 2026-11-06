import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {createServer} from '../self_relay/server.mjs';

// Only the inbound HTTP listener is real. Every upstream byte is synthetic.
const fixtureRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');
const model='gpt-5.6-sol';
const patch='*** Begin Patch\n*** Add File: test/test.md\n+xin chào\n*** End Patch';
const usage={input_tokens:4096,input_tokens_details:{cached_tokens:3072},output_tokens:32,
  output_tokens_details:{reasoning_tokens:8},total_tokens:4128};
const functionTool=(name,parameters)=>({type:'function',name,description:'Synthetic Cursor tool',parameters,strict:false});
const objectSchema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const applyFunction=functionTool('ApplyPatch',objectSchema({patch:{type:'string'}}));
const applyCustom={type:'custom',name:'ApplyPatch',description:'Apply a text patch',
  format:{type:'grammar',syntax:'lark',definition:'start: "*** Begin Patch" /[\\s\\S]*/ "*** End Patch"'}};
const discover=functionTool('GetDynamicTools',objectSchema({query:{type:'string'}}));
const invoke=functionTool('CallDynamicTool',objectSchema({name:{type:'string'},arguments:{type:'object'}}));
const taskTool=functionTool('Task',objectSchema({description:{type:'string'},prompt:{type:'string'}}));
const readTool=functionTool('ReadFile',objectSchema({path:{type:'string'}}));
const message=text=>({type:'message',id:'msg_done',role:'assistant',content:[{type:'output_text',text}]});
const functionCall=(id,name,args)=>({type:'function_call',id:'fc_'+id,call_id:id,name,arguments:JSON.stringify(args)});

function upstream(output,index){
  const response={id:'resp_'+index,object:'response',created_at:1,status:'completed',model,output,usage};
  const frames=[{type:'response.created',response:{...response,status:'in_progress',output:[],usage:null}}];
  output.forEach((item,output_index)=>{
    const field=item.type==='custom_tool_call'?'input':item.type==='function_call'?'arguments':null;
    frames.push({type:'response.output_item.added',output_index,item:field?{...item,[field]:''}:item});
    if(field){
      const type=field==='input'?'response.custom_tool_call_input.delta':'response.function_call_arguments.delta';
      const split=Math.floor(item[field].length/2);
      frames.push({type,output_index,item_id:item.id,delta:item[field].slice(0,split)},
        {type,output_index,item_id:item.id,delta:item[field].slice(split)});
    }
    frames.push({type:'response.output_item.done',output_index,item});
  });
  frames.push({type:'response.completed',response});
  const bytes=Buffer.from(frames.map(frame=>'event: '+frame.type+'\r\ndata: '+JSON.stringify(frame)+'\r\n\r\n').join(''));
  let offset=0;
  return new Response(new ReadableStream({pull(controller){
    if(offset===bytes.length)return controller.close();
    const end=Math.min(bytes.length,offset+11);controller.enqueue(bytes.subarray(offset,end));offset=end;
  }}),{headers:{'content-type':'text/event-stream'}});
}

async function fixture(t,outputs,adapter='codex'){
  fs.mkdirSync(fixtureRoot,{recursive:true});
  const directory=fs.mkdtempSync(path.join(fixtureRoot,'cursor-fullflow-'));
  const store=new Store(path.join(directory,'relay.sqlite'),crypto.randomBytes(32));
  const api=crypto.randomBytes(32).toString('hex');store.bootstrap(crypto.randomBytes(32).toString('hex'),api);
  store.importAccount({label:'offline synthetic only',adapter,exclusive_refresh_owner:true,
    tokens:{access_token:'synthetic-offline-access',client_id:'synthetic-client',expires_at:Date.now()+3600000,
      account_id:'synthetic-account',scopes:['chatgpt.tokens.use.direct']}});
  const sent=[];
  const relay=new Relay(store,{transport:async(url,options)=>{
    assert.equal(url,adapter==='api'?'https://api.openai.com/v1/responses':'https://chatgpt.com/backend-api/codex/responses');
    assert.equal(options.headers.get('authorization'),'Bearer synthetic-offline-access');
    assert(sent.length<outputs.length,'Unexpected extra upstream call (retry, refresh, or duplicate inference)');
    sent.push({url,body:JSON.parse(options.body),headers:options.headers});
    return upstream(outputs[sent.length-1],sent.length);
  }});
  const server=createServer(relay);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    store.close();
    assert(path.resolve(directory).startsWith(path.resolve(fixtureRoot)+path.sep));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const post=async(route,body)=>{
    const result=await fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',
      headers:{authorization:'Bearer '+api,'content-type':'application/json','session-id':'synthetic-cursor-chat'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    const text=await result.text();assert.equal(result.status,200,text);
    // Usage persistence runs after the downstream response is flushed.
    for(let i=0;i<100&&relay.active;i++)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(relay.active,0);
    return body.stream?text:JSON.parse(text);
  };
  return {store,sent,post};
}

const sseFrames=text=>text.split(/\r?\n/).filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
function callsFrom(result,chat,stream){
  if(!stream)return chat?result.choices[0].message.tool_calls??[]:result.output.filter(item=>item.type.endsWith('_call'));
  const frames=sseFrames(result);
  if(!chat)return frames.filter(frame=>frame.type==='response.output_item.done'&&frame.item.type.endsWith('_call')).map(frame=>frame.item);
  const calls=new Map();
  for(const frame of frames)for(const delta of frame.choices?.[0]?.delta?.tool_calls??[]){
    const call=calls.get(delta.index)??{id:null,type:null,function:{name:null,arguments:''}};
    if(delta.id)call.id=delta.id;if(delta.type)call.type=delta.type;
    if(delta.function?.name)call.function.name=delta.function.name;
    call.function.arguments+=delta.function?.arguments??'';calls.set(delta.index,call);
  }
  return [...calls.values()];
}
function wireBody(chat,stream,tools,history,extra={}){
  return chat?{model,messages:history,tools:tools.map(({type,...tool})=>({type:'function',function:tool})),
    stream,stream_options:{include_usage:true},reasoning_effort:'low',...extra}:
    {model,input:history,tools,stream,reasoning:{effort:'low'},...extra};
}
function assertAccounting(store,turns){
  const rows=store.db.prepare('SELECT * FROM usage ORDER BY id').all();assert.equal(rows.length,turns);
  for(const row of rows){
    assert.equal(row.status,200);assert.equal(row.upstream_attempts,1);assert.equal(row.input_tokens,4096);
    assert.equal(row.cached_tokens,3072);assert.equal(row.uncached_input_tokens,1024);
    assert.equal(row.output_tokens,32);assert.equal(row.reasoning_tokens,8);assert.equal(row.usage_source,'upstream');
  }
}
function assertClientUsage(result,chat,stream){
  const value=stream?(chat?sseFrames(result).find(frame=>frame.usage)?.usage:
    sseFrames(result).find(frame=>frame.type==='response.completed')?.response.usage):result.usage;
  if(chat){assert.equal(value.prompt_tokens,4096);assert.equal(value.prompt_tokens_details.cached_tokens,3072);
    assert.equal(value.completion_tokens,32);assert.equal(value.completion_tokens_details.reasoning_tokens,8);
  }else assert.deepEqual(value,usage);
}

for(const chat of [false,true])for(const stream of [false,true]){
  const route=chat?'/v1/chat/completions':'/v1/responses';
  const mode=(chat?'Chat function wrapper':'Responses custom grammar')+' '+(stream?'SSE':'JSON');
  test('Cursor ApplyPatch complete tool roundtrip: '+mode,async t=>{
    const call=chat?functionCall('patch_1','ApplyPatch',{patch}):
      {type:'custom_tool_call',id:'ct_patch',call_id:'patch_1',name:'ApplyPatch',input:patch};
    const f=await fixture(t,[[call],[message('Đã tạo test/test.md')]]);
    const tools=[chat?applyFunction:applyCustom,readTool];
    const history=[{role:'system',content:'Use an edit tool, never a shell.'},{role:'user',content:'Tạo test/test.md: xin chào'}];
    const first=await f.post(route,wireBody(chat,stream,tools,history));
    assertClientUsage(first,chat,stream);
    const returned=callsFrom(first,chat,stream);assert.equal(returned.length,1);
    if(chat){assert.equal(returned[0].function.name,'ApplyPatch');assert.equal(JSON.parse(returned[0].function.arguments).patch,patch);
      history.push({role:'assistant',content:null,tool_calls:returned},{role:'tool',tool_call_id:'patch_1',content:'File created: test/test.md'});
    }else{assert.deepEqual(returned[0],call);history.push(call,{type:'custom_tool_call_output',call_id:'patch_1',output:'File created: test/test.md'});}
    await f.post(route,wireBody(chat,stream,tools,history));
    assert.equal(f.sent.length,2);assert.deepEqual(f.sent[0].body.tools,tools);assert.deepEqual(f.sent[1].body.tools,tools);
    assert.equal(f.sent[0].body.input[0].role,'developer');assert.equal(f.sent[0].body.input[0].content,history[0].content);
    const sentCall=f.sent[1].body.input.find(item=>item.call_id==='patch_1'&&item.name==='ApplyPatch');
    assert.equal(chat?JSON.parse(sentCall.arguments).patch:sentCall.input,patch);
    assert.equal(f.sent[1].body.input.find(item=>item.type?.endsWith('_output')).output,'File created: test/test.md');
    assert.equal(f.sent[0].body.prompt_cache_key,f.sent[1].body.prompt_cache_key);
    assert.deepEqual(f.sent[1].body.reasoning,{effort:'low'});assertAccounting(f.store,2);
  });

  test('Cursor dynamic Task discovery, invocation and result: '+mode,async t=>{
    const get=functionCall('discover_1','GetDynamicTools',{query:'Task subagent'});
    const taskArgs={description:'Inspect a file',prompt:'Read AGENTS.md and return one sentence.'};
    const start=functionCall('invoke_1','CallDynamicTool',{name:'Task',arguments:taskArgs});
    const f=await fixture(t,[[get],[start],[message('Subagent đã hoàn thành')]]);
    const tools=[discover,invoke,readTool],history=[{role:'user',content:'Start a subagent to inspect AGENTS.md.'}];
    const discoveryResult=JSON.stringify({matches:[taskTool],cursor:'synthetic-discovery-1'});
    const taskResult=JSON.stringify({agent_id:'agent_synthetic',status:'completed',result:'Read complete.'});
    for(const [index,result] of [discoveryResult,taskResult].entries()){
      const response=await f.post(route,wireBody(chat,stream,tools,history));
      assertClientUsage(response,chat,stream);
      const calls=callsFrom(response,chat,stream);assert.equal(calls.length,1);
      const expected=index===0?get:start;
      assert.equal(chat?calls[0].function.name:calls[0].name,expected.name);
      assert.deepEqual(JSON.parse(chat?calls[0].function.arguments:calls[0].arguments),JSON.parse(expected.arguments));
      if(chat)history.push({role:'assistant',content:null,tool_calls:calls},{role:'tool',tool_call_id:expected.call_id,content:result});
      else history.push(expected,{type:'function_call_output',call_id:expected.call_id,output:result});
    }
    await f.post(route,wireBody(chat,stream,tools,history));assert.equal(f.sent.length,3);
    for(const sent of f.sent){assert.deepEqual(sent.body.tools,tools);assert.deepEqual(sent.body.reasoning,{effort:'low'});}
    const outputs=f.sent[2].body.input.filter(item=>item.type==='function_call_output');
    assert.deepEqual(outputs.map(item=>item.output),[discoveryResult,taskResult]);
    assert.equal(new Set(f.sent.map(item=>item.body.prompt_cache_key)).size,1);assertAccounting(f.store,3);
  });
}

for(const chat of [false,true])test('API adapter retains explicit reasoning and output budget: '+(chat?'Chat':'Responses'),async t=>{
  const f=await fixture(t,[[message('OK')]],'api');
  await f.post(chat?'/v1/chat/completions':'/v1/responses',wireBody(chat,false,[readTool],[{role:'user',content:'Say OK'}],
    chat?{max_completion_tokens:64}:{max_output_tokens:64}));
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].body.max_output_tokens,64);
  assert.deepEqual(f.sent[0].body.reasoning,{effort:'low'});assertAccounting(f.store,1);
});
