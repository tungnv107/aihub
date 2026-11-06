import test from 'node:test';
import assert from 'node:assert/strict';
import {toolInventory,requestShape,rejectionShape,contextProfile} from '../self_relay/diagnostics.mjs';
import {toResponses,shapeRequest} from '../self_relay/protocol.mjs';
test('context profile separates byte sources and fingerprints without exposing text or arguments',()=>{
  const secret='private-token-value',body={instructions:secret,tools:[{description:secret}],input:[
    {role:'developer',content:[{type:'input_text',text:'é'}]},
    {type:'function_call',name:'ReadFile',arguments:secret},
    {type:'function_call_output',output:'x'.repeat(7000)},
    {type:'custom_tool_call_output',output:[{type:'input_text',text:secret},{type:'input_image',image_url:secret}]}]};
  const a=contextProfile(body),b=contextProfile(structuredClone(body));
  assert.deepEqual(a,b);assert.equal(a.message_bytes.developer,2);
  assert.equal(a.instructions_bytes,Buffer.byteLength(secret));assert.equal(a.tool_argument_bytes,Buffer.byteLength(secret));
  assert.equal(a.tool_output_bytes,7000+Buffer.byteLength(secret));assert.equal(a.tool_output_sizes.over_6200,1);
  assert.ok(!JSON.stringify(a).includes(secret));assert.equal(a.prefix.items.length,4);
  const changed=contextProfile({...body,instructions:secret+'changed'});
  assert.notEqual(a.prefix.instructions,changed.prefix.instructions);assert.deepEqual(a.prefix.items,changed.prefix.items);
});

test('request and rejection metadata keep only closed protocol vocabulary',()=>{
  const secret='sk-SECRET-credential';
  const body={model:secret,input:[{role:'user',content:secret}],instructions:secret,[secret]:secret,reasoning:{effort:secret}};
  const metadata=requestShape(body);
  assert.equal(metadata.unknown_fields,1);assert.equal(metadata.reasoning_effort,'other');
  const rejection=rejectionShape({error:{message:`Unsupported parameter: prompt_cache_options ${secret}`}});
  assert.ok(rejection.terms.includes('prompt_cache_options'));
  assert.ok(!JSON.stringify([metadata,rejection]).includes(secret));
  assert.deepEqual(rejectionShape({detail:'instructions is required'}).terms,['instructions','required']);
});

test('tool metadata finds chat functions and Responses custom/namespaced/additional tools',()=>{
  const body={tools:[{type:'function',function:{name:'Read'}},{type:'namespace',name:'cursor',tools:[
    {type:'custom',name:'ApplyPatch',format:{type:'grammar',definition:'SECRET'}}]}],
    input:[{type:'additional_tools',tools:[{type:'function',name:'TodoWrite'}]}]};
  assert.deepEqual(toolInventory(body).entries.map(x=>[x.name,x.namespace,x.location]),[
    ['Read',null,'tools'],['cursor',null,'tools'],['ApplyPatch','cursor','tools'],['TodoWrite',null,'additional_tools']]);
});
test('diagnostics exclude prompt descriptions schemas arguments credentials and invalid labels',()=>{
  const secret='sk-SECRET-credential';
  const body={input:[{role:'user',content:secret},{type:'function_call',name:'hidden',arguments:secret}],
    instructions:secret,headers:{Authorization:secret},api_key:secret,
    tools:[{type:'function',function:{name:'Read',description:secret,parameters:{secret}}},
      {type:'custom',name:'malformed\n'+secret,format:{type:'grammar',definition:secret}}]};
  const result=JSON.stringify(toolInventory(body));
  for(const forbidden of [secret,'Authorization','parameters','description','hidden'])assert.ok(!result.includes(forbidden));
});
test('diagnostics are bounded and tolerate malformed nested tool objects',()=>{
  const item={type:'namespace',name:'loop',tools:[]};item.tools.push(item);
  assert.ok(toolInventory({tools:[null,item,...Array(300).fill({type:'function',name:'read'})]}).omitted>0);
  assert.equal(toolInventory({tools:Array(300).fill(null)}).entries.length,256);
});
test('chat tool inventory survives conversion and plan additional_tools shaping without mutation',()=>{
  const input={model:'test-model',messages:[{role:'user',content:'private prompt'}],tools:[
    {type:'function',function:{name:'ApplyPatch',parameters:{type:'object'}}},
    {type:'function',function:{name:'ReadFile',parameters:{type:'object'}}}]};
  const original=structuredClone(input),body=toResponses(input,true);
  const shaped=shapeRequest(body,'plan',{caller:'test',tenant:'test',account:'test',session:'test'});
  assert.deepEqual(toolInventory(input).entries.map(x=>x.name),toolInventory(shaped).entries.map(x=>x.name));
  assert.equal(toolInventory(shaped).entries[0].location,'additional_tools');
  assert.deepEqual(input,original);
});
