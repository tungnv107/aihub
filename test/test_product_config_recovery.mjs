import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ProductState} from '../relay_product/state.mjs';
import {managedConfig,restoreConfig,syncCodex,unsyncCodex} from '../relay_product/config.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../relay_product/policy.local-reference.json',import.meta.url)));
const url='http://127.0.0.1:18455/v1';

function fixture(t,original='model = "gpt-6-astra"\n'){
  const home=fs.mkdtempSync(path.join(import.meta.dirname,'product-fixture-config-'));
  const codex=path.join(home,'codex');fs.mkdirSync(codex);
  const file=path.join(codex,'config.toml'),auth=path.join(codex,'auth.json');
  fs.writeFileSync(file,original);fs.writeFileSync(auth,'synthetic-auth-must-stay');
  const state=new ProductState(home);state.initialize(policy,{codexHome:codex});syncCodex(state);
  state.set('license.activation','fixture-activation');state.set('license.expiresAt',12345678);
  t.after(()=>{state.close();fs.rmSync(home,{recursive:true,force:true});});
  return {home,codex,file,auth,state};
}

test('reinstall after returning to direct Codex saves the current configuration as the new baseline',t=>{
  const f=fixture(t,'model_provider="custom-before-first-install"\n');
  const oldBackup=f.state.get('codex_sync').backup;
  const direct='\uFEFF# Settings kept after removing relay\r\nmodel = "gpt-6-astra"\r\nmodel_provider = "openai"\r\n[features]\r\nfoo = true\r\n';
  fs.writeFileSync(f.file,direct);
  const result=syncCodex(f.state);assert.equal(result.recovery,'direct_configuration');
  assert.notEqual(f.state.get('codex_sync').backup,oldBackup);
  assert.equal(fs.readFileSync(f.state.get('codex_sync').backup,'utf8'),direct);
  assert.equal(fs.readFileSync(oldBackup,'utf8'),'model_provider="custom-before-first-install"\n');
  assert.equal(syncCodex(f.state).changed,false);
  unsyncCodex(f.state);assert.equal(fs.readFileSync(f.file,'utf8'),direct);
  assert.equal(fs.readFileSync(f.auth,'utf8'),'synthetic-auth-must-stay');
  assert.equal(f.state.get('license.activation'),'fixture-activation');
  assert.equal(f.state.get('license.expiresAt'),12345678);
});

test('uninstall after manual removal clears stale metadata without rewriting the direct configuration',t=>{
  const f=fixture(t),direct='model = "gpt-6-astra"\n[features]\nx = true\n';
  fs.writeFileSync(f.file,direct);unsyncCodex(f.state);
  assert.equal(fs.readFileSync(f.file,'utf8'),direct);assert.equal(f.state.get('codex_sync'),null);
});

test('reset that leaves managed comments does not resurrect a former custom provider',t=>{
  const f=fixture(t,'model_provider="former-proxy"\nmodel="gpt-6-astra"\n');
  const reset=fs.readFileSync(f.file,'utf8').split('\n').filter(line=>!line.startsWith('openai_base_url')).join('\n');
  fs.writeFileSync(f.file,reset);assert.equal(syncCodex(f.state).recovery,'direct_configuration');
  const repair=f.state.get('codex_sync').repair_backup;assert.equal(fs.readFileSync(repair,'utf8'),reset);
  unsyncCodex(f.state);const result=fs.readFileSync(f.file,'utf8');
  assert(!result.includes('former-proxy'));assert(!result.includes('TDH Relay'));
  assert(result.includes('model_provider = "openai"'));assert(result.includes('model="gpt-6-astra"'));
});

test('equivalent formatting and root lines before the managed block survive sync and uninstall',t=>{
  const f=fixture(t);
  const changed=('model_reasoning_effort = "high"\n'+fs.readFileSync(f.file,'utf8'))
    .replace('openai_base_url = "'+url+'"',"'openai_base_url' = '"+url+"' # kept comment")
    .replace('model_provider = "openai"',"model_provider='openai'");
  fs.writeFileSync(f.file,changed);assert.equal(syncCodex(f.state).changed,true);
  unsyncCodex(f.state);
  assert.equal(fs.readFileSync(f.file,'utf8'),'model_reasoning_effort = "high"\nmodel = "gpt-6-astra"\n');
});

test('comment-stripping serializer can be recovered using the verified original backup',t=>{
  const original='model_provider="previous"\nmodel_catalog_json="catalog.json"\nmodel="gpt-6-astra"\n';
  const f=fixture(t,original);
  fs.writeFileSync(f.file,fs.readFileSync(f.file,'utf8').split('\n').filter(l=>!l.startsWith('#')).reverse().join('\n'));
  assert.equal(syncCodex(f.state).recovery,'equivalent_configuration');
  unsyncCodex(f.state);const restored=fs.readFileSync(f.file,'utf8');
  assert(restored.includes('model_provider="previous"'));assert(restored.includes('model_catalog_json="catalog.json"'));
  assert(restored.includes('model="gpt-6-astra"'));assert(!restored.includes(url));
});

for(const conflicting of [
  'openai_base_url="https://custom.invalid/v1"\nmodel_provider="openai"\n',
  'model_provider="another-proxy"\n',
  'profile="work"\n',
  'model_catalog_json="custom.json"\n',
  'model_provider="openai"\nmodel_provider="custom"\n',
])test('a real routing conflict is left untouched: '+conflicting.split('=')[0],t=>{
  const f=fixture(t);fs.writeFileSync(f.file,conflicting);
  const metadata=f.state.get('codex_sync');
  assert.throws(()=>syncCodex(f.state),/review_required|manual_setup/);
  assert.equal(fs.readFileSync(f.file,'utf8'),conflicting);assert.deepEqual(f.state.get('codex_sync'),metadata);
});

test('commentless recovery rejects a missing or changed original backup',t=>{
  const f=fixture(t);const commentless=fs.readFileSync(f.file,'utf8').split('\n').filter(l=>!l.startsWith('#')).join('\n');
  fs.writeFileSync(f.file,commentless);fs.writeFileSync(f.state.get('codex_sync').backup,'modified backup');
  assert.throws(()=>syncCodex(f.state),/backup.*review_required/);
  assert.equal(fs.readFileSync(f.file,'utf8'),commentless);
});

test('markers moved into a TOML table are never accepted as root settings',()=>{
  assert.throws(()=>restoreConfig('[features]\n'+managedConfig('',url),url),/review_required/);
});

test('changing CODEX_HOME does not reuse another configuration backup',t=>{
  const f=fixture(t),other=path.join(f.home,'other');fs.mkdirSync(other);
  fs.writeFileSync(path.join(other,'config.toml'),'model="different"\n');f.state.set('codex_home',other);
  assert.throws(()=>syncCodex(f.state),/target_changed_review_required/);
  assert.equal(fs.readFileSync(path.join(other,'config.toml'),'utf8'),'model="different"\n');
});
