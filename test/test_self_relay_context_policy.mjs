import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {trimToolHistory} from '../self_relay/context-budget.mjs';
import {Store} from '../self_relay/store.mjs';
const config={'context.trim_tool_history':true,'context.keep_recent_tool_outputs':2,'context.trim_batch_size':4,
  'context.old_tool_output_chars':6000,'context.min_tool_history_bytes':8192,'context.min_removed_bytes':16384};
const settings={get:key=>config[key]},cacheKey=value=>crypto.createHash('sha256').update(value).digest('hex');
function history(size,count=8){
  const input=[];
  for(let i=0;i<count;i++)input.push({type:'function_call',name:'ReadFile',call_id:'c'+i,arguments:'{}'},
    {type:'function_call_output',call_id:'c'+i,output:'HEAD '+i+' '+('x'.repeat(size))+' TAIL '+i});
  return {model:'test-model',input};
}
function fixture(t){
  const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');
  fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'policy-')),file=path.join(dir,'relay.sqlite'),master=crypto.randomBytes(32);
  let store=new Store(file,master);t.after(()=>store.db&&store.close());
  for(const [key,value] of Object.entries(config))store.settings.set(key,value);
  return {get store(){return store;},reopen(){store.close();store=new Store(file,master);return store;}};
}
test('large protected results cannot activate trimming when actual eligible savings are small',()=>{
  const body=history(7000);body.input.unshift({type:'function_call',name:'GetDynamicTools',call_id:'discovery',arguments:'{}'},
    {type:'function_call_output',call_id:'discovery',output:'schema'.repeat(20000)});
  const result=trimToolHistory(body,settings);
  assert.equal(result.body,body);assert.equal(result.stats.reason,'below_savings_threshold');
  assert.equal(result.stats.removed_bytes,0);assert.equal(result.stats.trimmed_items,0);
  assert.ok(result.stats.candidate_removed_bytes>0&&result.stats.candidate_removed_bytes<16384);
  assert.equal(result.stats.tool_bytes_after,result.stats.tool_bytes_before);
});
test('material savings trim while appended outputs leave the existing shortened prefix stable',()=>{
  const body=history(18000),result=trimToolHistory(body,settings);
  assert.equal(result.stats.mode,'trimmed');assert.ok(result.stats.removed_bytes>=16384);
  assert.equal(result.stats.candidate_removed_bytes,result.stats.removed_bytes);
  const appended=trimToolHistory(history(18000,9),settings);
  assert.deepEqual(appended.body.input.slice(0,body.input.length),result.body.input);
});
test('scoped policy snapshots persist through settings changes and database reopen, with live master stop',t=>{
  const f=fixture(t),first=cacheKey('caller/account/model/session-1'),second=cacheKey('caller/account/model/session-2');
  const before=f.store.contextSettings(first);
  assert.equal(before.get('context.min_removed_bytes'),16384);
  f.store.settings.set('context.min_removed_bytes',40000);f.store.settings.set('context.old_tool_output_chars',10000);
  assert.equal(f.store.contextSettings(first).get('context.old_tool_output_chars'),6000);
  assert.equal(f.store.contextSettings(second).get('context.min_removed_bytes'),40000);
  f.reopen();
  assert.equal(f.store.contextSettings(first).get('context.min_removed_bytes'),16384);
  assert.equal(f.store.contextSettings(first).get('context.old_tool_output_chars'),6000);
  f.store.settings.set('context.trim_tool_history',false);
  assert.equal(f.store.contextSettings(first).get('context.trim_tool_history'),false);
  f.store.settings.set('context.trim_tool_history',true);
  assert.equal(f.store.contextSettings(first).get('context.min_removed_bytes'),16384);
  assert.throws(()=>f.store.settings.set('context.min_removed_bytes',-1));
  assert.throws(()=>f.store.settings.set('context.min_removed_bytes',1048577));
  f.store.settings.set('context.min_removed_bytes',0);
  assert.equal(f.store.settings.get('context.min_removed_bytes'),0);
});
test('one-time upgrade seeds only recent previously trimmed keys with the legacy zero savings gate',t=>{
  const f=fixture(t),recent=cacheKey('recent'),old=cacheKey('old'),untouched=cacheKey('untouched'),unknown=cacheKey('unknown');
  f.store.db.prepare("DELETE FROM meta WHERE key='context_policy_seeded_v1'").run();
  const insert=f.store.db.prepare('INSERT INTO usage(ts,caller_id,prompt_cache_key,context_trimmed_items,duration_ms) VALUES(?,?,?,?,0)');
  insert.run(Date.now(),'caller',recent,2);insert.run(Date.now()-25*3600000,'caller',old,2);
  insert.run(Date.now(),'caller',untouched,0);
  f.reopen();
  assert.equal(f.store.contextSettings(recent).get('context.min_removed_bytes'),0);
  for(const key of [old,untouched,unknown])assert.equal(f.store.contextSettings(key).get('context.min_removed_bytes'),16384);
  const body=history(7000),legacy=trimToolHistory(body,f.store.contextSettings(recent));
  assert.equal(legacy.stats.mode,'trimmed');
  assert.equal(trimToolHistory(body,f.store.contextSettings(unknown)).stats.reason,'below_savings_threshold');
  f.store.settings.set('context.old_tool_output_chars',12000);f.reopen();
  assert.deepEqual(trimToolHistory(body,f.store.contextSettings(recent)).body,legacy.body);
});
test('policy capacity preserves admitted conversations and expired inactive rows can be reclaimed',t=>{
  const f=fixture(t),policy=JSON.stringify(f.store.currentContextPolicy()),now=Date.now();
  f.store.db.prepare(`WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n<4096)
    INSERT INTO context_policies SELECT printf('%064x',n),?,? FROM numbers`).run(policy,now);
  const admitted='1'.padStart(64,'0'),next=cacheKey('over-capacity');
  f.store.settings.set('context.old_tool_output_chars',12000);
  assert.equal(f.store.contextSettings(next).get('context.trim_tool_history'),false);
  assert.equal(f.store.contextSettings(admitted).get('context.old_tool_output_chars'),6000);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM context_policies').get().n,4096);
  f.store.db.prepare('UPDATE context_policies SET last_used=? WHERE cache_key=?').run(now-8*86400000,'2'.padStart(64,'0'));
  assert.equal(f.store.contextSettings(next).get('context.old_tool_output_chars'),12000);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM context_policies').get().n,4096);
});
