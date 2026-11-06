import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareToolTail} from '../self_relay/tool-tail.mjs';
const tool={type:'function',name:'ReadFixture',strict:true,parameters:{type:'object',properties:{path:{type:'string',enum:['test/quota_fixture.txt']}},required:['path'],additionalProperties:false}};
const payload={path:'test/quota_fixture.txt'},text=JSON.stringify({...payload,zz_relay_tail:'end'});
const call=args=>({type:'function_call',name:tool.name,id:'f1',call_id:'c1',arguments:args});
const event=(type,json)=>({type,json:{type,...json}});
test('strict complete-field function uses the flat trailer and preserves history',()=>{
  const original={tools:[tool],input:[call(JSON.stringify(payload))]},copy=structuredClone(original);
  const result=prepareToolTail(original,{enabled:true});assert.ok(result.state);
  assert.deepEqual(Object.keys(result.body.tools[0].parameters.properties),['path','zz_relay_tail']);
  assert.equal(result.body.input[0].arguments,text);assert.deepEqual(original,copy);
});
test('flat function completes early only after complete schema-validated original arguments',()=>{
  const {state}=prepareToolTail({tools:[tool]},{enabled:true});
  state.process(event('response.output_item.added',{output_index:0,item:call('')}));
  const result=state.process(event('response.function_call_arguments.delta',{output_index:0,item_id:'f1',delta:text}));
  assert.equal(result.complete,true);assert.deepEqual(JSON.parse(result.output[0].arguments),payload);
  assert.equal(JSON.stringify(result.output).includes('zz_relay_tail'),false);
});
test('flat natural completion keeps usage and restores reflected schema',()=>{
  const {state}=prepareToolTail({tools:[tool]},{enabled:true}),usage={input_tokens:10,output_tokens:5};
  const result=state.process(event('response.completed',{response:{status:'completed',tools:[],output:[call(JSON.stringify({zz_relay_tail:'end',...payload}))],usage}}));
  assert.equal(result.complete,false);assert.deepEqual(result.events[0].json.response.usage,usage);
  assert.deepEqual(JSON.parse(result.events[0].json.response.output[0].arguments),payload);
  assert.deepEqual(result.events[0].json.response.tools,[tool]);
});
