import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');
const answer='xin chào 😀\n"giữ nguyên"',model='text-tail-synthetic',usage={input_tokens:1000,output_tokens:40,input_tokens_details:{cached_tokens:512}};
const reasoning={type:'reasoning',id:'r1',summary:[],encrypted_content:'preserve-this'};
const message=text=>({type:'message',id:'m1',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text,annotations:[]}]});
const encode=events=>Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
const event=(type,fields)=>({type,...fields});
for(const activeTools of [false,true])for(const chat of [false,true])for(const stream of [false,true])for(const natural of [false,true])test(`text trailer core ${activeTools?'active tools':'plain'} ${chat?'Chat':'Responses'} ${stream?'SSE':'JSON'} ${natural?'natural':'early'}`,async t=>{
  fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'text-tail-'));
  const store=new Store(path.join(dir,'relay.sqlite'),crypto.randomBytes(32));
  t.after(()=>{store.close();assert(path.resolve(dir).startsWith(path.resolve(root)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const api='text-test-key-123456789012345678901234';store.bootstrap('text-admin-1234567890123456789012345',api);
  assert.equal(store.settings.get('output.early_finish'),false);assert.throws(()=>store.settings.set('output.early_finish','true'));
  store.settings.set('output.early_finish',true);store.settings.set('tools.early_finish',true);
  store.settings.set('relay.stream_idle_ms',2000);
  store.importAccount({label:'offline',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic',account_id:'synthetic',expires_at:Date.now()+3600000}});
  let calls=0,cancelled=0;const wires=[];
  const relay=new Relay(store,{transport:async(url,options)=>{
    calls++;const wire=JSON.parse(options.body);wires.push(wire);assert.equal(wire.text.format.type,'json_schema');
    assert.deepEqual(Object.keys(wire.text.format.schema.properties),['answer','zz_relay_tail']);
    const meta={id:'resp1',object:'response',model,status:'in_progress',output:[],text:wire.text};
    const json=JSON.stringify({answer,zz_relay_tail:'end'}),part={type:'output_text',text:'',annotations:[]};
    const events=[event('response.created',{response:meta}),event('response.output_item.added',{output_index:0,item:{...reasoning,encrypted_content:null}}),
      event('response.output_item.done',{output_index:0,item:reasoning}),event('response.output_item.added',{output_index:1,item:{...message(''),status:'in_progress',content:[]}}),
      event('response.content_part.added',{output_index:1,item_id:'m1',content_index:0,part}),
      event('response.output_text.delta',{output_index:1,item_id:'m1',content_index:0,delta:json})];
    if(natural)events.push(event('response.output_text.done',{output_index:1,item_id:'m1',content_index:0,text:json}),
      event('response.content_part.done',{output_index:1,item_id:'m1',content_index:0,part:{...part,text:json}}),
      event('response.output_item.done',{output_index:1,item:message(json)}),event('response.completed',{response:{...meta,status:'completed',output:[reasoning,message(json)],usage}}));
    const chunks=natural?[encode(events)]:events.map(e=>encode([e]));let index=0;
    return new Response(new ReadableStream({pull(controller){if(index<chunks.length)controller.enqueue(chunks[index++]);else if(natural)controller.close();},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});
  }});
  const chunks=[];let ended=0;const raw=chat?{model,stream,messages:[{role:'user',content:'Answer once.'}]}:{model,stream,input:[{role:'user',content:'Answer once.'}],tool_choice:'none'};
  if(activeTools){const fn={name:'Probe',strict:true,parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}};
    raw.tools=[chat?{type:'function',function:fn}:{type:'function',...fn}];raw.tool_choice='auto';}
  await relay.infer({caller:store.caller(api),headers:new Headers({'session-id':'text-tail-session'}),raw:Buffer.from(JSON.stringify(raw)),route:chat?'/v1/chat/completions':'/v1/responses',signal:new AbortController().signal,
    sink:{start(status,type,headers){assert.equal(status,200);assert.equal(headers['x-relay-text-tail'],'enabled');assert.equal(headers['x-relay-tool-tail'],activeTools?'enabled':'no_function_tools');},async write(chunk){chunks.push(Buffer.from(chunk));},async end(){ended++;}}});
  assert.equal(ended,1);assert.equal(calls,1);const text=Buffer.concat(chunks).toString();assert.equal(text.includes('zz_relay_tail'),false);
  const rows=store.db.prepare('SELECT outcome,usage_source,input_tokens FROM usage').all();assert.equal(rows.length,1);
  assert.equal(rows[0].outcome,natural?'completed':'text_completed_early');assert.equal(rows[0].usage_source,natural?'upstream':'unknown');
  assert.equal(rows[0].input_tokens,natural?1000:null);if(!natural)assert.equal(cancelled,1);
  if(stream){const events=text.split('\n').filter(l=>l.startsWith('data: {')).map(l=>JSON.parse(l.slice(6)));
    if(chat)assert.equal(events.map(e=>e.choices?.[0]?.delta?.content??'').join(''),answer);
    else{const response=events.find(e=>e.type==='response.completed').response;assert.deepEqual(response.output,[reasoning,message(answer)]);assert.equal(response.text,undefined);assert.deepEqual(response.usage,natural?usage:null);}
  }else{const result=JSON.parse(text);if(chat)assert.equal(result.choices[0].message.content,answer);else assert.deepEqual(result.output,[reasoning,message(answer)]);}
});
