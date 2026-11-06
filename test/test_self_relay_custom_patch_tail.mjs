import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareToolTail} from '../self_relay/tool-tail.mjs';
import {customPatchTail} from '../self_relay/custom-patch-tail.mjs';
const format=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/cursor-apply-patch-format.json',import.meta.url),'utf8'));
const tool={type:'custom',name:'ApplyPatch',format};
const patch='*** Begin Patch\n*** Add File: test/test.md\n+xin chào 😀\n*** End Patch';
const trailer='\n<relay_patch_tail:end>';
const event=(type,json)=>({type,json:{type,...json}});
const item=input=>({type:'custom_tool_call',name:'ApplyPatch',id:'ct1',call_id:'call1',input});
const added=index=>event('response.output_item.added',{output_index:index,item:item('')});
const delta=(text,index=0)=>event('response.custom_tool_call_input.delta',{output_index:index,item_id:'ct1',delta:text});
const prepare=()=>prepareToolTail({tools:[tool]},{enabled:true});

test('exact Cursor grammar enables a short custom trailer and leaves caller untouched',()=>{
  const body={tools:[tool]},result=prepareToolTail(body,{enabled:true});
  assert.ok(result.state);assert.notDeepEqual(result.body.tools[0].format,format);
  assert.deepEqual(body,{tools:[tool]});assert.equal(result.body.tools[0].name,'ApplyPatch');
});
test('validated ApplyPatch bytes and identity survive every split including optional LF',()=>{
  for(const suffix of ['', '\n'])for(let n=0;n<(patch+suffix+trailer).length;n++){
    const text=patch+suffix+trailer,{state}=prepare();assert.ok(state);state.process(added(0));
    const first=state.process(delta(text.slice(0,n)));assert.equal(first.complete,false);
    const result=state.process(delta(text.slice(n)));assert.equal(result.complete,true);
    assert.deepEqual(result.output,[{...item(patch+suffix),status:'completed'}]);
    assert.equal(result.events.find(e=>e.type==='response.custom_tool_call_input.done').json.input,patch+suffix);
  }
});
test('marker text inside source lines cannot finish a patch',()=>{
  const content='*** Begin Patch\n*** Add File: a\n+*** End Patch\n+<relay_patch_tail:end>\n';
  const {state}=prepare();assert.ok(state);state.process(added(0));
  assert.equal(state.process(delta(content)).complete,false);
  assert.equal(state.process(delta('*** End Patch'+trailer)).complete,true);
});
test('natural custom completion preserves usage and restores reflected request',()=>{
  const {state,body}=prepare();assert.ok(state);state.process(added(0));
  const done=state.process(delta(patch+trailer),{allowEarly:false});assert.equal(done.complete,false);
  const result=state.process(event('response.completed',{response:{status:'completed',tools:body.tools,usage:{input_tokens:10},output:[item(patch+trailer)]}}));
  assert.deepEqual(result.events[0].json.response.output,[item(patch)]);
  assert.deepEqual(result.events[0].json.response.tools,[tool]);assert.deepEqual(result.events[0].json.response.usage,{input_tokens:10});
});
test('custom history is wrapped only for upstream and invalid historical patches skip',()=>{
  const history=[item(patch),{type:'custom_tool_call_output',call_id:'call1',output:'ok'}];
  const result=prepareToolTail({tools:[tool],input:history},{enabled:true});assert.ok(result.state);
  assert.equal(result.body.input[0].input,patch+trailer);assert.equal(history[0].input,patch);
  assert.equal(prepareToolTail({tools:[tool],input:[item('not a patch')]},{enabled:true}).state,null);
});
test('unknown custom grammars pass through unchanged',()=>{
  const body={tools:[{...tool,format:{...format,definition:format.definition+'\n// not the known grammar'}}]};
  assert.equal(prepareToolTail(body,{enabled:true}).body,body);
});
test('invalid or truncated custom patches fail at natural completion',()=>{
  for(const text of [patch,patch.slice(0,-1)+trailer,'*** Begin Patch\n*** Add File: a\n*** End Patch'+trailer,patch+trailer+'extra']){
    const {state}=prepare();assert.ok(state);state.process(added(0));
    assert.throws(()=>state.process(event('response.custom_tool_call_input.done',{output_index:0,item_id:'ct1',input:text})),/custom_patch_tail/);
  }
});
test('open reasoning delays early custom completion and preserves encrypted content',()=>{
  const {state}=prepare();assert.ok(state);
  const reasoning={type:'reasoning',id:'r',summary:[],encrypted_content:'opaque'};
  state.process(event('response.output_item.added',{output_index:1,item:{...reasoning,encrypted_content:null}}));state.process(added(0));
  assert.equal(state.process(delta(patch+trailer)).complete,false);
  const result=state.process(event('response.output_item.done',{output_index:1,item:reasoning}));
  assert.equal(result.complete,true);assert.deepEqual(result.output.find(i=>i.type==='reasoning'),reasoning);
});
test('multiple advertised custom calls prevent early completion',()=>{
  const {state}=prepare();assert.ok(state);state.process(added(0));
  state.process(event('response.output_item.added',{output_index:1,item:{...item(''),id:'ct2',call_id:'call2'}}));
  assert.equal(state.process(delta(patch+trailer)).complete,false);
});
test('single-hunk grammar validation preserves add/update syntax including empty lines',()=>{
  const adapter=customPatchTail(tool);
  const valid=[patch,'*** Begin Patch\n*** Add File: a\n+\n*** End Patch\n',
    '*** Begin Patch\n*** Update File: a\n*** End Patch',
    '*** Begin Patch\n*** Update File: a\n@@\n-old\n+new\n context\n*** End of File\n*** End Patch',
    '*** Begin Patch\n*** Update File: a\n@@ context\n+\n*** End Patch'];
  for(const value of valid)assert.equal(adapter.unwrap(adapter.wrap(value),false),value);
  const invalid=['','*** Begin Patch\n*** Add File: \n+x\n*** End Patch',
    '*** Begin Patch\n*** Update File: \n*** End Patch',
    '*** Begin Patch\n*** Update File: a\n*** End of File\n*** End Patch',
    '*** Begin Patch\n*** Update File: a\n@@ \n*** End Patch',
    '*** Begin Patch\n*** Delete File: a\n*** End Patch',
    '*** Begin Patch\n*** Add File: a\n+x\n*** Add File: b\n+y\n*** End Patch',
    patch.replaceAll('\n','\r\n'),patch+'\n\n',patch+'junk'];
  for(const value of invalid)assert.equal(adapter.wrap(value),null,value);
  assert.equal(adapter.format.definition,format.definition.replace('start: begin_patch hunk end_patch','start: begin_patch hunk end_patch relay_transport_tail')+
    '\nrelay_transport_tail: '+JSON.stringify(trailer)+'\n');
});
test('mixed function and recognized custom call cannot discard a second advertised call',()=>{
  const fn={type:'function',name:'Read',parameters:{type:'object',properties:{},additionalProperties:false}};
  const {state}=prepareToolTail({tools:[fn,tool]},{enabled:true});state.process(added(0));
  state.process(event('response.output_item.added',{output_index:1,item:{type:'function_call',id:'fc1',call_id:'f1',name:'Read',arguments:''}}));
  assert.equal(state.process(delta(patch+trailer)).complete,false);
  assert.equal(state.process(event('response.function_call_arguments.delta',{output_index:1,item_id:'fc1',delta:'{"payload":{},"__relay_tail":"end"}'})).complete,false);
});
test('custom terminal cannot contradict the already streamed prefix or call identity',()=>{
  const {state}=prepare();state.process(added(0));state.process(delta(patch+trailer),{allowEarly:false});
  assert.throws(()=>state.process(event('response.output_item.done',{output_index:0,item:{...item(patch.replace('test/test.md','other')+trailer)}})),/arguments_changed/);
});
