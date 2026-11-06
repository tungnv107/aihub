import test from 'node:test';
import assert from 'node:assert/strict';
import {trimToolHistory} from '../self_relay/context-budget.mjs';
import {sessionDetails,shapeRequest} from '../self_relay/protocol.mjs';

// Characterization tests: quantify remaining prefix changes without any network request.
const config={'context.trim_tool_history':true,'context.keep_recent_tool_outputs':6,
  'context.trim_batch_size':6,'context.old_tool_output_chars':6000,
  'context.min_tool_history_bytes':32768,'context.min_removed_bytes':16384};
const settings={get:key=>config[key]};
function history(count){
  const input=[{role:'user',content:'Read files and explain the result.'}];
  for(let i=0;i<count;i++)input.push(
    {type:'function_call',call_id:`read-${i}`,name:'ReadFile',arguments:JSON.stringify({path:`file-${i}.txt`})},
    {type:'function_call_output',call_id:`read-${i}`,output:`file-${i}\n`+'content\n'.repeat(i<2?3000:10)});
  return {model:'test-model',instructions:'Use the provided tools.',input};
}
test('a batch boundary still rewrites a previously warm history prefix despite the savings gate',()=>{
  const previous=trimToolHistory(history(11),settings);
  const next=trimToolHistory(history(12),settings);
  assert.equal(previous.stats.trimmed_items,0);
  assert.equal(next.stats.trimmed_items,2);
  assert.ok(next.stats.removed_bytes>16384);
  assert.notDeepEqual(next.body.input.slice(0,previous.body.input.length),previous.body.input);
  assert.deepEqual(next.body.input[1],previous.body.input[1]);
  assert.notEqual(next.body.input[2].output,previous.body.input[2].output);
});
test('history prefix remains exact while appends stay inside the same trim batch',()=>{
  const previous=trimToolHistory(history(12),settings);
  const next=trimToolHistory(history(13),settings);
  assert.deepEqual(next.body.input.slice(0,previous.body.input.length),previous.body.input);
});
test('explicit session affinity survives a changing dynamic tool inventory',()=>{
  const first={...history(1),tools:[{type:'function',name:'GetDynamicTools',parameters:{type:'object'}}]};
  const second={...history(2),tools:[...first.tools,{type:'function',name:'ReadFile',parameters:{type:'object'}}]};
  const headers=new Headers({'session-id':'same-session'});
  const firstSession=sessionDetails(headers,first),secondSession=sessionDetails(headers,second);
  assert.equal(firstSession.key,secondSession.key);
  const scope={caller:'caller',tenant:'local',account:'test-account',session:firstSession.key};
  assert.equal(shapeRequest(first,'codex',scope).prompt_cache_key,shapeRequest(second,'codex',scope).prompt_cache_key);
});
