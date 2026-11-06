import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeRequest,toResponses} from '../self_relay/protocol.mjs';
const scope={caller:'c',tenant:'t',account:'a',session:'s'};
test('Codex maps Cursor explicit system messages without changing content, tools, history or cache key',()=>{
  const body={model:'test-model',instructions:'Existing instruction',input:[
    {type:'message',role:'system',content:[{type:'input_text',text:'Preserve these application rules.'}]},
    {type:'message',role:'user',content:[{type:'input_text',text:'Create the file.'}]},
    {type:'custom_tool_call',call_id:'call-1',name:'ApplyPatch',input:'*** Begin Patch\n*** End Patch'},
    {type:'custom_tool_call_output',call_id:'call-1',output:'done'},
    {type:'message',role:'assistant',content:[{type:'output_text',text:'Done'}]},
    {role:'system',content:'Additional rule'},
    {role:'developer',content:'Preserve existing developer rule'},
    {role:'user',content:'Next turn'}],
    tools:[{type:'custom',name:'ApplyPatch',format:{type:'grammar',syntax:'lark',definition:'start: "patch"'}}],
    include:['reasoning.encrypted_content'],prompt_cache_key:'stable-client-group'};
  const original=structuredClone(body),result=shapeRequest(body,'codex',scope);
  const expected=structuredClone(body.input);expected[0].role='developer';expected[5].role='developer';
  assert.deepEqual(result.input,expected);assert.deepEqual(result.tools,body.tools);
  assert.equal(result.instructions,body.instructions);assert.deepEqual(result.include,body.include);
  assert.deepEqual(body,original);
  assert.equal(result.prompt_cache_key,shapeRequest({...body,input:expected},'codex',scope).prompt_cache_key);
  assert.deepEqual(shapeRequest(body,'api',scope).input,body.input);
});
test('Codex normalizes system role after Chat Completions conversion',()=>{
  const body=toResponses({model:'test-model',messages:[{role:'system',content:'Rules'},{role:'user',content:'Hi'}]},true);
  const result=shapeRequest(body,'codex',scope);
  assert.equal(result.input[0].role,'developer');assert.equal(result.input[1].role,'user');
});
