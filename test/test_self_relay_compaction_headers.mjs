import test from 'node:test';
import assert from 'node:assert/strict';
import {Relay} from '../self_relay/core.mjs';
import {shapeRequest} from '../self_relay/protocol.mjs';

const call=(adapter,value)=>Relay.prototype.headers(new Headers(value===undefined?{}:{'x-codex-beta-features':value}),
  {adapter},{accessToken:'synthetic-only',accountId:'synthetic-account'},'session');
test('Codex capabilities reach upstream unchanged, including remote compaction v2',()=>{
  for(const value of ['remote_compaction_v2','remote_compaction_v2,other_feature','other_feature'])
    assert.equal(call('codex',value).get('x-codex-beta-features'),value);
  assert.equal(call('codex').get('x-codex-beta-features'),null);
});
test('capability forwarding rejects oversized or malformed values and stays Codex-only',()=>{
  for(const value of ['https://outside.example/path','a'.repeat(1025),'x '.repeat(20),'a,,b',Array(17).fill('a').join(',')])
    assert.equal(call('codex',value).get('x-codex-beta-features'),null);
  for(const adapter of ['api','plan'])assert.equal(call(adapter,'remote_compaction_v2').get('x-codex-beta-features'),null);
});
test('native compaction trigger and encrypted canonical context are not rewritten',()=>{
  const body={model:'gpt-6-astra',input:[{type:'compaction',id:'synthetic-cmp',encrypted_content:'synthetic-opaque'},
    {role:'user',content:'Continue the task.'},{type:'compaction_trigger'}]};
  const shaped=shapeRequest(body,'codex',{caller:'c',tenant:'t',account:'a',session:'s'});
  assert.deepEqual(shaped.input,body.input);
  assert.equal(shaped.model,body.model);
});
