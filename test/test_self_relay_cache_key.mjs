import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeRequest,sessionDetails,toResponses} from '../self_relay/protocol.mjs';
import {hash} from '../self_relay/security.mjs';

const scope={caller:'test-caller',tenant:'test-tenant',account:'test-account',session:'session-a'};
const body={model:'test-model',input:'same reusable prompt',prompt_cache_key:'customer-project-cache'};

test('explicit client cache group survives a session change',()=>{
  const first=shapeRequest(body,'api',scope);
  const next=shapeRequest(body,'api',{...scope,session:'session-b'});
  assert.equal(first.prompt_cache_key,next.prompt_cache_key);
});
test('client-key-only requests preserve already warm v2 keys',()=>{
  const current=shapeRequest(body,'api',{...scope,session:body.prompt_cache_key});
  assert.equal(current.prompt_cache_key,hash(JSON.stringify(['v2',scope.caller,scope.tenant,scope.account,body.model,body.prompt_cache_key,body.prompt_cache_key])));
});
test('explicit cache groups remain isolated by caller tenant account model and client key',()=>{
  const first=shapeRequest(body,'api',scope).prompt_cache_key;
  for(const name of ['caller','tenant','account'])
    assert.notEqual(first,shapeRequest(body,'api',{...scope,[name]:'other'}).prompt_cache_key);
  assert.notEqual(first,shapeRequest({...body,model:'other-model'},'api',scope).prompt_cache_key);
  assert.notEqual(first,shapeRequest({...body,prompt_cache_key:'other-group'},'api',scope).prompt_cache_key);
});
test('requests without a client group retain their exact existing session cache key',()=>{
  for(const key of [undefined,'']){
    const payload={...body,prompt_cache_key:key};
    const first=shapeRequest(payload,'api',scope).prompt_cache_key;
    assert.equal(first,hash(JSON.stringify(['v2',scope.caller,scope.tenant,scope.account,body.model,scope.session,''])));
    assert.notEqual(first,shapeRequest(payload,'api',{...scope,session:'other'}).prompt_cache_key);
  }
});
test('cache grouping does not change account affinity session selection',()=>{
  const headers=new Headers({'session-id':'session-header','thread-id':'thread-header'});
  assert.deepEqual(sessionDetails(headers,body),{key:'session-header',source:'session-id'});
  assert.deepEqual(sessionDetails(new Headers(),body),{key:body.prompt_cache_key,source:'prompt_cache_key'});
});
test('cache shaping preserves meaningful UUID time tool IDs and encrypted reasoning',()=>{
  const input=[
    {role:'user',content:'Report UUID 85ec61fe-8ce7-4b91-9bda-908eab1fb6ad and create_time=1793100000 exactly.'},
    {type:'function_call',id:'fc_original',call_id:'call_original',name:'lookup',arguments:'{"create_time":1793100000}'},
    {type:'function_call_output',call_id:'call_original',output:'{"thread_id":"85ec61fe-8ce7-4b91-9bda-908eab1fb6ad"}'},
    {type:'reasoning',id:'rs_original',encrypted_content:'synthetic-opaque-value'},
  ];
  const payload={...body,input};const original=structuredClone(payload);
  assert.deepEqual(shapeRequest(payload,'plan',scope).input,input);
  assert.deepEqual(payload,original);
});
test('chat and responses use the same explicitly requested group',()=>{
  const chat=toResponses({model:body.model,messages:[{role:'user',content:body.input}],prompt_cache_key:body.prompt_cache_key},true);
  assert.equal(shapeRequest(chat,'api',scope).prompt_cache_key,shapeRequest(body,'api',scope).prompt_cache_key);
});
