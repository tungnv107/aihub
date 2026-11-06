import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {customPatchTail} from '../self_relay/custom-patch-tail.mjs';
const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');
const format=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/cursor-apply-patch-format.json',import.meta.url),'utf8'));
const tool={type:'custom',name:'ApplyPatch',format};
const patch='*** Begin Patch\n*** Add File: test/test.md\n+xin chào 😀\n*** End Patch\n';
const wrap=customPatchTail(tool).wrap(patch);
const model='synthetic-custom-patch';
const usage={input_tokens:2000,output_tokens:50,input_tokens_details:{cached_tokens:1500}};
const reason={type:'reasoning',id:'r',summary:[],encrypted_content:'preserve-encrypted'};
const call=input=>({type:'custom_tool_call',id:'ct1',call_id:'call1',name:'ApplyPatch',status:'completed',input});
const frame=(type,fields)=>({type,...fields});
const encode=events=>Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));

for(const stream of [false,true])for(const mode of ['early','bytewise','natural-batch'])test(`real Cursor grammar integration ${stream?'SSE':'JSON'} ${mode}`,async t=>{
  fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'custom-tail-'));
  const store=new Store(path.join(dir,'relay.sqlite'),crypto.randomBytes(32));
  t.after(()=>{store.close();assert(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const key='synthetic-custom-key-1234567890123456789';store.bootstrap('synthetic-custom-admin-1234567890123456789',key);
  store.settings.set('tools.early_finish',true);store.settings.set('relay.stream_idle_ms',1000);
  store.importAccount({label:'offline',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic',account_id:'synthetic',expires_at:Date.now()+3600000}});
  let requests=0,cancelled=0;const wires=[];
  const relay=new Relay(store,{transport:async(url,options)=>{
    assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');requests++;
    const wire=JSON.parse(options.body);wires.push(wire);
    assert.equal(wire.tools[0].format.definition,customPatchTail(tool).format.definition);
    const metadata={id:'response1',model,object:'response',status:'in_progress',output:[],tools:wire.tools,input:wire.input};
    const events=[frame('response.created',{response:metadata}),
      frame('response.output_item.added',{output_index:0,item:{...reason,encrypted_content:null}}),
      frame('response.output_item.done',{output_index:0,item:reason}),
      frame('response.output_item.added',{output_index:1,item:call('')}),
      frame('response.custom_tool_call_input.delta',{output_index:1,item_id:'ct1',delta:wrap})];
    if(mode==='natural-batch')events.push(frame('response.custom_tool_call_input.done',{output_index:1,item_id:'ct1',input:wrap}),
      frame('response.output_item.done',{output_index:1,item:call(wrap)}),
      frame('response.completed',{response:{...metadata,status:'completed',output:[reason,call(wrap)],usage}}));
    let chunks=mode==='natural-batch'?[encode(events)]:events.map(e=>encode([e]));
    if(mode==='bytewise')chunks=[...Buffer.concat(chunks)].map(byte=>Buffer.from([byte]));
    let n=0;return new Response(new ReadableStream({pull(controller){if(n<chunks.length)controller.enqueue(chunks[n++]);else if(mode==='natural-batch')controller.close();},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});
  }});
  async function invoke(input){
    const pieces=[];let end=0;await relay.infer({caller:store.caller(key),headers:new Headers({'session-id':'custom-fixture'}),
      raw:Buffer.from(JSON.stringify({model,stream,input,tools:[tool]})),route:'/v1/responses',signal:new AbortController().signal,
      sink:{start(status){assert.equal(status,200);},async write(bytes){pieces.push(Buffer.from(bytes));},async end(){end++;}}});
    assert.equal(end,1);const text=Buffer.concat(pieces).toString();
    const events=stream?text.split('\n').filter(l=>l.startsWith('data: {')).map(l=>JSON.parse(l.slice(6))):[];
    const result=stream?events.find(e=>e.type==='response.completed').response:JSON.parse(text);
    assert.deepEqual(result.output,[reason,call(patch)]);assert.deepEqual(result.tools,[tool]);
    assert.equal(text.includes('relay_patch_tail'),false);assert.equal(result.usage,mode==='natural-batch'?result.usage:null);
    if(mode==='natural-batch')assert.deepEqual(result.usage,usage);
    if(stream)assert.equal(events.filter(e=>e.type==='response.custom_tool_call_input.done').length,1);
    return result;
  }
  const first=await invoke([{role:'user',content:'Create fixture.'}]);
  await invoke([...first.output,{type:'custom_tool_call_output',call_id:'call1',output:'Created fixture.'},{role:'user',content:'Repeat for verification.'}]);
  assert.equal(wires[1].input.find(x=>x.type==='custom_tool_call').input,wrap);
  assert.equal(requests,2);if(mode!=='natural-batch')assert.equal(cancelled,2);
  const rows=store.db.prepare('SELECT outcome,usage_source,input_tokens FROM usage').all();
  assert.equal(rows.length,2);for(const row of rows){assert.equal(row.outcome,mode==='natural-batch'?'completed':'tool_completed_early');
    assert.equal(row.usage_source,mode==='natural-batch'?'upstream':'unknown');assert.equal(row.input_tokens,mode==='natural-batch'?2000:null);}
});
