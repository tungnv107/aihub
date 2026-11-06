import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {trimToolHistory} from '../self_relay/context-budget.mjs';
import {Store} from '../self_relay/store.mjs';import {Relay} from '../self_relay/core.mjs';
const config={'context.trim_tool_history':true,'context.keep_recent_tool_outputs':2,'context.trim_batch_size':4,'context.old_tool_output_chars':512,'context.min_tool_history_bytes':8192,'context.min_removed_bytes':0};
const settings={get:k=>config[k]};
const resultText=i=>'HEAD-'+i+'\n'+'😀 Xin chào project data\n'.repeat(150)+'\nTAIL-'+i;
function body(count=8){
 const input=[{type:'message',role:'system',content:[{type:'input_text',text:'Do not use Shell for editing.'}]},{role:'user',content:'Read project files then edit with ApplyPatch.'}];
 for(let i=0;i<count;i++)input.push({type:'function_call',call_id:'call-'+i,name:'ReadFile',arguments:JSON.stringify({path:'file-'+i+'.txt'})},{type:'function_call_output',call_id:'call-'+i,output:resultText(i)});
 return {model:'test-model',instructions:'Preserve exact changes',input,tools:[{type:'custom',name:'ApplyPatch',format:{type:'text'}}],prompt_cache_key:'stable'};
}
test('history trim is opt-in, thresholded and leaves short or malformed histories alone',()=>{
 const b=body();assert.equal(trimToolHistory(b,{get:k=>k==='context.trim_tool_history'?false:config[k]}).body,b);
 assert.equal(trimToolHistory(body(2),settings).stats.trimmed_items,0);
 assert.equal(trimToolHistory({input:'text'},settings).stats.mode,'off');
 const small=body();for(const item of small.input)if('output' in item)item.output='short';
 assert.equal(trimToolHistory(small,settings).body,small);
});
test('fixed batches preserve recent outputs, all tool calls, instructions and stable prefixes',()=>{
 const b=body(),original=structuredClone(b),trimmed=trimToolHistory(b,settings);
 assert.equal(trimmed.stats.trimmed_items,4);assert.ok(trimmed.stats.removed_bytes>10000);
 assert.deepEqual(b,original);assert.deepEqual(trimmed.body.tools,b.tools);assert.equal(trimmed.body.instructions,b.instructions);
 for(let i=0;i<b.input.length;i++){
  const before=b.input[i],after=trimmed.body.input[i];
  if(before.type!=='function_call_output'||Number(before.call_id.slice(5))>=4)assert.deepEqual(after,before);
  else{assert.equal(after.call_id,before.call_id);assert.ok(after.output.startsWith('HEAD-'));assert.ok(after.output.endsWith('TAIL-'+before.call_id.slice(5)));assert.ok(after.output.includes('Re-run the original tool'));assert.ok(after.output.isWellFormed());}
 }
 assert.deepEqual(trimToolHistory(body(9),settings).body.input.slice(0,b.input.length),trimmed.body.input);
 assert.equal(trimToolHistory(body(10),settings).stats.trimmed_items,8);
 assert.equal(trimmed.body.prompt_cache_key,b.prompt_cache_key);
});

test('tool discovery and dynamic dispatch outputs remain intact even when they are old and large',()=>{
 const b=body(12);b.input[2].name='GetDynamicTools';b.input[4].name='cursor.CallDynamicTool';
 const result=trimToolHistory(b,settings);
 assert.equal(result.stats.protected_items,2);assert.equal(result.stats.eligible_items,10);
 assert.equal(result.stats.reason,'trimmed');assert.equal(result.stats.old_batch_items,8);
 assert.equal(result.body.input[3],b.input[3]);assert.equal(result.body.input[5],b.input[5]);
 assert.equal(trimToolHistory(body(2),settings).stats.reason,'below_batch_count');
});
test('orphan, ambiguous, mismatched results and opaque/image content are never shortened',()=>{
 const b=body();b.input[3].call_id='orphan';b.input[5].type='custom_tool_call_output';
 b.input.push({...b.input[6]},{type:'reasoning',encrypted_content:'opaque-long-value'},
  {type:'function_call_output',call_id:'orphan2',output:[{type:'input_image',image_url:'secret-image-url'}]});
 const t=trimToolHistory(b,settings).body;
 assert.deepEqual(t.input[3],b.input[3]);assert.deepEqual(t.input[5],b.input[5]);assert.deepEqual(t.input[7],b.input[7]);
 assert.deepEqual(t.input.at(-1),b.input.at(-1));assert.deepEqual(t.input.at(-2),b.input.at(-2));
});
test('custom output text blocks can shrink while images and grammar stay exact',()=>{
 const b=body();b.input[2].type='custom_tool_call';b.input[2].input='exact patch';delete b.input[2].arguments;
 b.input[3].type='custom_tool_call_output';b.input[3].output=[{type:'input_text',text:resultText(0)},{type:'input_image',image_url:'opaque-image'}];
 const t=trimToolHistory(b,settings);
 assert.ok(t.body.input[3].output[0].text.includes('bytes omitted'));assert.deepEqual(t.body.input[3].output[1],b.input[3].output[1]);
 assert.deepEqual(t.body.input[2],b.input[2]);assert.deepEqual(t.body.tools,b.tools);
});
test('request sends shortened history once, records true quota, and leaves compact/API routes alone',async t=>{
 const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'context-')),key=crypto.randomBytes(32),db=path.join(dir,'relay.sqlite');
 const store=new Store(db,key);t.after(()=>store.db&&store.close());store.bootstrap('a'.repeat(40),'b'.repeat(40));
 for(const [k,v]of Object.entries(config))store.settings.set(k,v);
 assert.equal(store.localPolicy().prompt.automatic_history_trimming,true);
 assert.equal(store.localPolicy().prompt.history_trim.keep_recent_outputs,2);
 assert.throws(()=>store.settings.set('context.old_tool_output_chars',1));assert.throws(()=>store.settings.set('context.keep_recent_tool_outputs',0));
 store.importAccount({label:'isolated',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic',expires_at:Date.now()+3600000}});
 let captured,calls=0;const completed={id:'r1',object:'response',status:'completed',model:'test-model',output:[{type:'custom_tool_call',call_id:'edit-1',name:'ApplyPatch',input:'*** Begin Patch\n*** End Patch'}],usage:{input_tokens:111,output_tokens:9,input_tokens_details:{cached_tokens:88}}};
 const relay=new Relay(store,{transport:async(url,options)=>{calls++;captured=JSON.parse(options.body);
  if(url.endsWith('/compact'))return Response.json({...completed,output:[]});
  return new Response('data: '+JSON.stringify({type:'response.completed',response:completed})+'\n\n',{headers:{'content-type':'text/event-stream','x-codex-primary-used-percent':'16','x-codex-secondary-used-percent':'20','x-codex-primary-reset-at':'2000000000'}});
 }});
 const run=async(route,b)=>{let headers;const chunks=[];await relay.infer({caller:store.caller('b'.repeat(40)),headers:new Headers(),raw:Buffer.from(JSON.stringify(b)),route,signal:new AbortController().signal,sink:{start(s,type,h){headers=h;},async write(x){chunks.push(x);},async end(){}}});return {headers,data:JSON.parse(Buffer.concat(chunks).toString())};};
 const result=await run('/v1/responses',body());assert.equal(calls,1);assert.equal(result.data.output[0].name,'ApplyPatch');assert.equal(result.headers['x-relay-context'],'trimmed');
 assert.ok(captured.input[3].output.includes('bytes omitted'));assert.deepEqual(captured.input.at(-1),body().input.at(-1));
 const usage=store.db.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get();
 assert.equal(usage.input_tokens,111);assert.equal(usage.cached_tokens,88);assert.equal(usage.context_trimmed_items,4);assert.equal(usage.quota_primary_used_percent,16);assert.equal(usage.quota_secondary_used_percent,20);
 assert.ok(usage.input_text_bytes_after<usage.input_text_bytes_before);assert.equal(usage.upstream_attempts,1);
 const before=body();await run('/v1/responses/compact',before);assert.deepEqual(captured.input[3],before.input[3]);
 store.db.prepare("UPDATE accounts SET adapter='api'").run();await run('/v1/responses',before);assert.deepEqual(captured.input[3],before.input[3]);
 assert.equal(store.noteQuota(store.list('local')[0].id,new Headers({'x-codex-primary-used-percent':'-3'})),null);
 store.close();const reopened=new Store(db,key);assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM usage').get().n,3);reopened.close();
});
