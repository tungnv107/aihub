import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareResponseTail} from '../self_relay/response-tail.mjs';
const ev=(type,json={})=>({type,json:{type,...json}}),json=JSON.stringify;
const tool={type:'function',name:'ReadFile',strict:true,parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}};
const body={model:'synthetic',tools:[tool],tool_choice:'auto',input:[{role:'user',content:'keep'}],parallel_tool_calls:true};
const make=(other={})=>prepareResponseTail({...body,...other},{toolsEnabled:true,textEnabled:true});
const msg=(id='m',phase='final_answer',text)=>({type:'message',id,role:'assistant',...(phase===undefined?{}:{phase}),status:text===undefined?'in_progress':'completed',content:text===undefined?[]:[{type:'output_text',text,annotations:[]}]});
const envelope=answer=>json({answer,zz_relay_tail:'end'});
const add=(state,item,index=0)=>state.process(ev('response.output_item.added',{output_index:index,item}));
const textDelta=(state,answer,index=0,id='m',options)=>state.process(ev('response.output_text.delta',{output_index:index,item_id:id,content_index:0,delta:envelope(answer)}),options);
const call={type:'function_call',id:'f',call_id:'c',name:'ReadFile',arguments:'',status:'in_progress'};
const args=json({path:'test.txt',zz_relay_tail:'end'});

test('joint transform keeps tool schema and text schema stable through forced-tool and final turns',()=>{
  const original=structuredClone(body),first=make({tool_choice:{type:'function',name:'ReadFile'}}),last=make({tool_choice:'none',input:[{type:'function_call',name:'ReadFile',call_id:'c',arguments:json({path:'test.txt'})},{type:'function_call_output',call_id:'c',output:'text'}]});
  assert.ok(first.state);assert.equal(first.textReason,'enabled');assert.equal(first.toolReason,'enabled');
  assert.deepEqual(first.body.tools,last.body.tools);assert.deepEqual(first.body.text,last.body.text);assert.deepEqual(body,original);
  assert.deepEqual(JSON.parse(last.body.input[0].arguments),{path:'test.txt',zz_relay_tail:'end'});
});
test('auto tool inventory permits final_answer text and restores original metadata',()=>{
  const {state,body:wire}=make();const created=state.process(ev('response.created',{response:{id:'r',tools:wire.tools,input:wire.input,text:wire.text,parallel_tool_calls:false}}));
  const reflected=created.events[0].json.response;assert.deepEqual(reflected.tools,body.tools);assert.deepEqual(reflected.input,body.input);assert.equal(reflected.text,undefined);assert.equal(reflected.parallel_tool_calls,true);
  add(state,msg());const result=textDelta(state,'xin chào 😀');assert.equal(result.complete,true);assert.equal(result.kind,'text');assert.equal(result.output[0].content[0].text,'xin chào 😀');
});
test('commentary is decoded and closed before an exact function call can finish',()=>{
  const {state}=make();add(state,msg('m','commentary'));assert.equal(textDelta(state,'I will read').complete,false);
  const done=state.process(ev('response.output_item.done',{output_index:0,item:msg('m','commentary',envelope('I will read'))}));assert.equal(done.complete,false);
  add(state,call,1);const result=state.process(ev('response.function_call_arguments.delta',{output_index:1,item_id:'f',delta:args}));
  assert.equal(result.complete,true);assert.equal(result.kind,'tool');assert.equal(result.output[0].content[0].text,'I will read');assert.equal(result.output[1].arguments,json({path:'test.txt'}));
});
test('commentary followed by exact Cursor ApplyPatch retains both decoded text and original patch',()=>{
  const format=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/cursor-apply-patch-format.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  const {state}=make({tools:[{type:'custom',name:'ApplyPatch',format}]});
  add(state,msg('m','commentary'));textDelta(state,'I will patch');state.process(ev('response.output_item.done',{output_index:0,item:msg('m','commentary',envelope('I will patch'))}));
  add(state,{type:'custom_tool_call',name:'ApplyPatch',id:'p',call_id:'pc',input:''},1);
  const patch='*** Begin Patch\n*** Add File: test/test.md\n+xin chào\n*** End Patch';
  const result=state.process(ev('response.custom_tool_call_input.delta',{output_index:1,item_id:'p',delta:patch+'\n<relay_patch_tail:end>'}));
  assert.equal(result.complete,true);assert.equal(result.output[0].content[0].text,'I will patch');assert.equal(result.output[1].input,patch);
});
test('active tools without phase or with forced tool choice do not terminate text early',()=>{
  for(const choice of ['auto',{type:'function',name:'ReadFile'},'required']){
    const {state}=make({tool_choice:choice}),item=msg();if(choice==='auto')delete item.phase;add(state,item);
    assert.equal(textDelta(state,'wait').complete,false);
    const finalItem=msg('m','final_answer',envelope('wait'));if(choice==='auto')delete finalItem.phase;
    const end=state.process(ev('response.completed',{response:{status:'completed',output:[finalItem],usage:{input_tokens:42}}}));
    assert.equal(end.complete,false);assert.equal(end.events[0].json.response.output[0].content[0].text,'wait');assert.equal(end.events[0].json.response.usage.input_tokens,42);
  }
});
test('native terminal precedence preserves text and function contents with measured usage',()=>{
  const {state}=make();add(state,call);assert.equal(state.process(ev('response.function_call_arguments.delta',{output_index:0,item_id:'f',delta:args}),{allowEarly:false}).complete,false);
  const result=state.process(ev('response.completed',{response:{status:'completed',output:[{...call,status:'completed',arguments:args}],usage:{input_tokens:99}}}),{allowEarly:false});
  assert.equal(result.complete,false);assert.equal(result.events[0].json.response.output[0].arguments,json({path:'test.txt'}));assert.equal(result.events[0].json.response.usage.input_tokens,99);
});
test('reasoning identity is checked before final text early completion and encrypted content is preserved',()=>{
  const {state}=make();add(state,{type:'reasoning',id:'r',summary:[]});add(state,msg(),1);assert.equal(textDelta(state,'done',1).complete,false);
  assert.throws(()=>state.process(ev('response.output_item.done',{output_index:0,item:{type:'reasoning',id:'wrong',summary:[]}})),{code:'text_tail_item_changed'});
  const result=state.process(ev('response.output_item.done',{output_index:0,item:{type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'}}));
  assert.equal(result.complete,true);assert.equal(result.output[0].encrypted_content,'opaque');assert.equal(result.output[1].content[0].text,'done');
});
test('multiple advertised calls suppress text early completion',()=>{
  const {state}=make();for(const [index,id] of ['f','f2'].entries()){
    add(state,{...call,id,call_id:id},index);state.process(ev('response.function_call_arguments.delta',{output_index:index,item_id:id,delta:args}),{allowEarly:false});
    state.process(ev('response.output_item.done',{output_index:index,item:{...call,id,call_id:id,arguments:args,status:'completed'}}),{allowEarly:false});
  }
  add(state,msg(),2);assert.equal(textDelta(state,'done',2).complete,false);
});
test('hosted and unknown custom tool inventories conservatively skip text transport',()=>{
  for(const tools of [[{type:'web_search'}],[tool,{type:'custom',name:'Unknown',format:{type:'text'}}]]){
    const result=make({tools});assert.equal(result.textReason,'active_tools');assert.equal(result.body.text,undefined);
  }
});
test('natural combined response restores both lanes and retains refusal or annotation safeguards',()=>{
  const {state,body:wire}=make();add(state,call);state.process(ev('response.function_call_arguments.delta',{output_index:0,item_id:'f',delta:args}),{allowEarly:false});
  add(state,msg(),1);textDelta(state,'done',1,'m',{allowEarly:false});
  const result=state.process(ev('response.completed',{response:{status:'completed',tools:wire.tools,text:wire.text,output:[{...call,status:'completed',arguments:args},msg('m','final_answer',envelope('done'))],usage:{input_tokens:100}}}),{allowEarly:false});
  const restored=result.events[0].json.response;assert.deepEqual(restored.tools,body.tools);assert.equal(restored.text,undefined);assert.equal(restored.output[0].arguments,json({path:'test.txt'}));assert.equal(restored.output[1].content[0].text,'done');assert.equal(restored.usage.input_tokens,100);
  const refusal=make().state;add(refusal,msg());const part={type:'refusal',refusal:'cannot do that'};
  assert.equal(refusal.process(ev('response.content_part.added',{output_index:0,item_id:'m',content_index:0,part})).complete,false);
  const final=refusal.process(ev('response.completed',{response:{status:'completed',output:[{...msg(),content:[part]}]}}));assert.deepEqual(final.events[0].json.response.output[0].content,[part]);
  const annotated=make().state;assert.throws(()=>annotated.process(ev('response.output_text.annotation.added',{annotation:{type:'url_citation'}})),{code:'text_tail_unsupported_metadata'});
});
test('disabled policies preserve request identity and text-only requests still finish without a phase',()=>{
  const disabled=prepareResponseTail(body);assert.equal(disabled.body,body);assert.equal(disabled.state,null);
  const {state}=prepareResponseTail({input:'hello'},{textEnabled:true});const item=msg();delete item.phase;add(state,item);
  assert.equal(textDelta(state,'plain').kind,'text');
});
