import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {RelayError, requiredString, hash, encrypt, decrypt, opaque} from './security.mjs';
import {measuredUsage} from './accounting.mjs';
import {LocalPolicyStore,validatePolicyState} from './policy.mjs';

const defaults = {
  'relay.port': 8320, 'relay.max_body_bytes': 2097152, 'relay.max_concurrency': 16,
  'relay.bind_host': '127.0.0.1', 'relay.extra_allowed_hosts': [],
  'relay.stream_idle_ms': 120000, 'relay.max_attempts': 3, 'cache.ttl_ms': 300000,
  'cache.max_entries': 100, 'cache.max_bytes': 524288, 'affinity.ttl_ms': 86400000,
  'cache.affinity_fallback': true,
  'routing.turn_state_ttl_ms': 900000, 'routing.max_turn_states': 256,
  'context.trim_tool_history': false, 'context.keep_recent_tool_outputs': 6,
  'context.trim_batch_size': 6, 'context.old_tool_output_chars': 6000, 'context.min_tool_history_bytes': 65536,
  'context.min_removed_bytes': 16384,
  'context.replan_idle_ms': 3600000, 'context.replan_growth_bytes': 262144,
  'tools.early_finish': false,
  'output.early_finish': false,
  'diagnostics.tool_shapes': false,
  'policy.state': null,
  'oauth.agent_name': 'Private Independent Relay', 'relay.models': [],
};

export class SettingsRepository {
  constructor(db) {this.db = db;}
  get(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : defaults[key];
  }
  set(key, value) {
    if (!Object.hasOwn(defaults,key)) throw new RelayError(400, 'unknown_setting');
    if(key==='policy.state')validatePolicyState(value);
    if(typeof defaults[key]==='boolean'&&typeof value!=='boolean')throw new RelayError(400,'invalid_setting');
    if (typeof defaults[key] === 'number' && (!Number.isSafeInteger(value) || value < 0 || value > 86400000))
      throw new RelayError(400, 'invalid_setting');
    if (key === 'relay.port' && (value < 1024 || value > 65535)) throw new RelayError(400, 'invalid_port');
    if (key === 'relay.bind_host' && !['127.0.0.1','0.0.0.0'].includes(value)) throw new RelayError(400, 'invalid_bind_host');
    if (key === 'relay.extra_allowed_hosts' && (!Array.isArray(value) || value.length > 10 || value.some(x => {
      if (typeof x !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?:[0-9]{1,5}$/.test(x)) return true;
      const port=Number(x.slice(x.lastIndexOf(':')+1)); return port<1||port>65535;
    }))) throw new RelayError(400, 'invalid_allowed_hosts');
    if (key === 'relay.max_attempts' && (value < 1 || value > 10)) throw new RelayError(400, 'invalid_attempts');
    if (key === 'relay.max_concurrency' && (value < 1 || value > 1000)) throw new RelayError(400, 'invalid_concurrency');
    if (key === 'relay.stream_idle_ms' && value < 100) throw new RelayError(400, 'invalid_timeout');
    if (key === 'routing.max_turn_states' && (value < 1 || value > 4096)) throw new RelayError(400, 'invalid_turn_state_limit');
    if (['context.keep_recent_tool_outputs','context.trim_batch_size'].includes(key) && (value < 1 || value > 100)) throw new RelayError(400, 'invalid_context_window');
    if (key === 'context.old_tool_output_chars' && (value < 512 || value > 65536)) throw new RelayError(400, 'invalid_context_output_limit');
    if (key === 'context.min_tool_history_bytes' && (value < 8192 || value > 1048576)) throw new RelayError(400, 'invalid_context_threshold');
    if (key === 'context.min_removed_bytes' && value > 1048576) throw new RelayError(400, 'invalid_context_savings_threshold');
    if (key === 'context.replan_idle_ms' && value !== 0 && value < 60000) throw new RelayError(400, 'invalid_context_replan_idle');
    if (key === 'context.replan_growth_bytes' && value !== 0 && (value < 65536 || value > 8388608)) throw new RelayError(400, 'invalid_context_replan_growth');
    if (key === 'oauth.agent_name') requiredString(value, 'agent_name', 80);
    if (key === 'relay.models' && (!Array.isArray(value) || value.length > 200 || value.some(x => typeof x !== 'string' || !/^[\w.:-]{1,100}$/.test(x))))
      throw new RelayError(400, 'invalid_models');
    this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  all() {return Object.fromEntries(Object.keys(defaults).map(k => [k, this.get(k)]));}
}

export class Store {
  constructor(filename, masterKey) {
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new RelayError(500, 'master_key_must_be_32_bytes');
    this.key = masterKey; this.filename = path.resolve(filename); this.lockPath = this.filename + '.lock';
    fs.mkdirSync(path.dirname(this.filename), {recursive:true, mode:0o700});
    try {this.lock = fs.openSync(this.lockPath, 'wx', 0o600); fs.writeSync(this.lock, String(process.pid));}
    catch {throw new RelayError(409, 'database_already_owned_or_stale_lock');}
    try {
      this.db = new DatabaseSync(this.filename);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS callers(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, tenant TEXT NOT NULL, role TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, label TEXT NOT NULL,
          adapter TEXT NOT NULL, secret TEXT NOT NULL, refresh_fingerprint TEXT UNIQUE, enabled INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL DEFAULT 'ready', cooldown_until INTEGER NOT NULL DEFAULT 0, last_used INTEGER NOT NULL DEFAULT 0,
          expires_at INTEGER NOT NULL, quota TEXT, refresh_pending INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS affinity(key TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, caller_id TEXT NOT NULL,
          account_id TEXT, model TEXT, status INTEGER, outcome TEXT, input_tokens INTEGER, cached_tokens INTEGER,
          output_tokens INTEGER, replay INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS oauth(state_hash TEXT PRIMARY KEY, secret TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS context_policies(cache_key TEXT PRIMARY KEY, policy TEXT NOT NULL, last_used INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS context_trim_plans(cache_key TEXT PRIMARY KEY REFERENCES context_policies(cache_key) ON DELETE CASCADE,
          plan TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS context_checkpoints(cache_key TEXT PRIMARY KEY REFERENCES context_policies(cache_key) ON DELETE CASCADE,
          history_bytes INTEGER NOT NULL, last_used INTEGER NOT NULL, compaction_key TEXT);`);
      const check = this.db.prepare("SELECT value FROM meta WHERE key='key_check'").get();
      if (check) {if (decrypt(this.key, check.value, 'key_check') !== 'private-relay') throw Error('wrong key');}
      else this.db.prepare('INSERT INTO meta VALUES(?,?)').run('key_check', encrypt(this.key, 'private-relay', 'key_check'));
      this.migrateUsage();
      this.db.prepare("UPDATE accounts SET state='refresh_uncertain' WHERE refresh_pending=1").run();
      this.settings = new SettingsRepository(this.db);
      this.policies = new LocalPolicyStore(this.settings,this.db);
      this.seedLegacyContextPolicies();
      if (!this.db.prepare("SELECT value FROM meta WHERE key='host_id'").get())
        this.db.prepare('INSERT INTO meta VALUES(?,?)').run('host_id', 'urn:uuid:' + crypto.randomUUID());
    } catch (error) {this.close(); throw new RelayError(500, 'database_open_failed');}
  }
  close() {
    this.db?.close(); this.db = null;
    if (this.lock !== undefined) {fs.closeSync(this.lock); fs.unlinkSync(this.lockPath); this.lock = undefined;}
  }
  currentContextPolicy() {
    return Object.fromEntries(['context.keep_recent_tool_outputs','context.trim_batch_size','context.old_tool_output_chars',
      'context.min_tool_history_bytes','context.min_removed_bytes'].map(key=>[key,this.settings.get(key)]));
  }
  seedLegacyContextPolicies() {
    if(this.db.prepare("SELECT value FROM meta WHERE key='context_policy_seeded_v1'").get())return;
    const policy=JSON.stringify({...this.currentContextPolicy(),'context.min_removed_bytes':0}),now=Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const rows=this.db.prepare(`SELECT prompt_cache_key,MAX(ts) last_used FROM usage
        WHERE context_trimmed_items>0 AND ts>=? AND prompt_cache_key IS NOT NULL
        GROUP BY prompt_cache_key ORDER BY last_used DESC LIMIT 4096`).all(now-86400000);
      const insert=this.db.prepare('INSERT OR IGNORE INTO context_policies VALUES(?,?,?)');
      for(const row of rows)if(/^[a-f0-9]{64}$/.test(row.prompt_cache_key))insert.run(row.prompt_cache_key,policy,row.last_used);
      this.db.prepare('INSERT INTO meta VALUES(?,?)').run('context_policy_seeded_v1','1');this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  contextSettings(cacheKey) {
    // This key is produced by shapeRequest with tenant/caller/account/model isolation.
    // Keep active policies across restarts and configuration changes; never store request data.
    if(!this.settings.get('context.trim_tool_history'))return this.settings;
    if(typeof cacheKey!=='string'||!/^[a-f0-9]{64}$/.test(cacheKey))throw new RelayError(500,'invalid_context_policy_key');
    const now=Date.now();
    this.db.prepare('DELETE FROM context_policies WHERE last_used<?').run(now-7*86400000);
    let row=this.db.prepare('SELECT policy FROM context_policies WHERE cache_key=?').get(cacheKey),policy;
    if(row)policy=JSON.parse(row.policy);
    else{
      // Do not evict an active conversation merely to admit a new one.
      if(this.db.prepare('SELECT COUNT(*) n FROM context_policies').get().n>=4096)
        return {get:key=>key==='context.trim_tool_history'?false:this.settings.get(key)};
      policy=this.currentContextPolicy();
      this.db.prepare('INSERT INTO context_policies VALUES(?,?,?)').run(cacheKey,JSON.stringify(policy),now);
    }
    this.db.prepare('UPDATE context_policies SET last_used=? WHERE cache_key=?').run(now,cacheKey);
    return {get:key=>Object.hasOwn(policy,key)?policy[key]:this.settings.get(key)};
  }
  contextTrimPlan(cacheKey) {
    const row=this.db.prepare('SELECT plan FROM context_trim_plans WHERE cache_key=?').get(cacheKey);
    return row?JSON.parse(row.plan):undefined;
  }
  contextCheckpoint(cacheKey) {
    return this.db.prepare('SELECT history_bytes,last_used,compaction_key FROM context_checkpoints WHERE cache_key=?').get(cacheKey);
  }
  saveContextTrimPlan(cacheKey,plan,{replace=false,checkpoint}={}) {
    if(!this.settings.get('context.trim_tool_history')||!this.db.prepare('SELECT 1 FROM context_policies WHERE cache_key=?').get(cacheKey))return;
    if(plan?.version!==1||Object.keys(plan).length!==2||!Array.isArray(plan.items)||plan.items.length>4096||plan.items.some(item=>
      !item||Object.keys(item).length!==2||typeof item.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(item.fingerprint)||
      !Number.isSafeInteger(item.limit)||item.limit<512||item.limit>65536))throw new RelayError(500,'invalid_context_trim_plan');
    if(typeof replace!=='boolean'||checkpoint&&(Object.keys(checkpoint).length!==3||
      !Number.isSafeInteger(checkpoint.history_bytes)||checkpoint.history_bytes<0||
      !Number.isSafeInteger(checkpoint.last_used)||checkpoint.last_used<0||
      checkpoint.compaction_key!==null&&(typeof checkpoint.compaction_key!=='string'||!/^[a-f0-9]{64}$/.test(checkpoint.compaction_key))))
      throw new RelayError(500,'invalid_context_checkpoint');
    // Chỉ lưu hash, kích thước và thời điểm; kế hoạch + mốc thay đổi phải được ghi cùng nhau.
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare(replace?'INSERT INTO context_trim_plans VALUES(?,?) ON CONFLICT(cache_key) DO UPDATE SET plan=excluded.plan':
        'INSERT OR IGNORE INTO context_trim_plans VALUES(?,?)').run(cacheKey,JSON.stringify(plan));
      if(checkpoint)this.db.prepare(`INSERT INTO context_checkpoints VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET
        history_bytes=excluded.history_bytes,last_used=excluded.last_used,compaction_key=excluded.compaction_key`)
        .run(cacheKey,checkpoint.history_bytes,checkpoint.last_used,checkpoint.compaction_key);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  migrateUsage() {
    if(this.db.prepare('PRAGMA user_version').get().user_version>5)throw new Error('Unsupported newer database');
    const columns={served_model:'TEXT',reasoning_tokens:'INTEGER',cache_write_tokens:'INTEGER',uncached_input_tokens:'INTEGER',
      usage_source:'TEXT',usage_anomaly:'TEXT',upstream_attempts:'INTEGER',raw_request_bytes:'INTEGER',upstream_request_bytes:'INTEGER',upstream_sent_bytes:'INTEGER',
      prompt_cache_key:'TEXT',session_source:'TEXT',input_text_bytes_before:'INTEGER',input_text_bytes_after:'INTEGER',
      tool_schema_bytes_before:'INTEGER',tool_schema_bytes_after:'INTEGER',replay_saved_input_tokens:'INTEGER',
      context_trimmed_items:'INTEGER',context_removed_bytes:'INTEGER',quota_observed_at:'INTEGER',
      quota_primary_used_percent:'REAL',quota_secondary_used_percent:'REAL',quota_primary_reset_at:'TEXT',quota_secondary_reset_at:'TEXT',
      request_kind:'TEXT',response_kind:'TEXT',context_reason:'TEXT',context_replan_reason:'TEXT',
      policy_revision:'TEXT',policy_mode:'TEXT',policy_generation:'INTEGER'};
    const existing=new Set(this.db.prepare('PRAGMA table_info(usage)').all().map(row=>row.name));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const [name,type]of Object.entries(columns))if(!existing.has(name))this.db.exec(`ALTER TABLE usage ADD COLUMN ${name} ${type}`);
      this.db.exec(`UPDATE usage SET usage_source=CASE WHEN replay=1 THEN 'local_replay'
        WHEN input_tokens IS NOT NULL OR output_tokens IS NOT NULL THEN 'upstream' ELSE 'unknown' END WHERE usage_source IS NULL;
        UPDATE usage SET uncached_input_tokens=input_tokens-cached_tokens WHERE replay=0 AND uncached_input_tokens IS NULL
          AND input_tokens IS NOT NULL AND cached_tokens BETWEEN 0 AND input_tokens;
        PRAGMA user_version=5; COMMIT;`);
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  caller(token, admin = false) {
    const row = this.db.prepare('SELECT id,tenant,role FROM callers WHERE token_hash=?').get(hash(token ?? ''));
    if (!row || (admin && row.role !== 'admin')) throw new RelayError(401, 'invalid_api_key');
    return row;
  }
  addCaller({id = crypto.randomUUID(), token, tenant = 'local', role = 'caller'}) {
    requiredString(id, 'caller_id', 100); requiredString(tenant, 'tenant', 100);
    if (!['caller','admin'].includes(role) || requiredString(token, 'api_key').length < 32) throw new RelayError(400, 'weak_api_key');
    this.db.prepare('INSERT INTO callers VALUES(?,?,?,?)').run(id, hash(token), tenant, role);
    return {id, tenant, role};
  }
  bootstrap(adminToken, apiToken) {
    if (this.db.prepare('SELECT COUNT(*) n FROM callers').get().n) return;
    if (adminToken === apiToken) throw new RelayError(400, 'distinct_api_keys_required');
    this.db.exec('BEGIN IMMEDIATE');
    try {this.addCaller({id:'admin',token:adminToken,role:'admin'});this.addCaller({id:'local',token:apiToken});this.db.exec('COMMIT');}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  importAccount(input, tenant = 'local') {
    const {label, adapter = 'plan', exclusive_refresh_owner, tokens = input.tokens ?? input} = input;
    if (exclusive_refresh_owner !== true) throw new RelayError(409, 'exclusive_refresh_ownership_required');
    requiredString(label, 'label', 100);
    if (!['plan','codex','api'].includes(adapter)) throw new RelayError(400, 'invalid_adapter');
    const accessToken = requiredString(tokens.access_token ?? tokens.accessToken, 'access_token', 32768);
    const refreshToken = tokens.refresh_token ?? tokens.refreshToken ?? '';
    const clientId = tokens.client_id ?? input.client_id;
    if (refreshToken) {requiredString(refreshToken, 'refresh_token', 32768);requiredString(clientId,'client_id',200);}
    if (clientId === 'dynamic_agent_client') throw new RelayError(400, 'issued_client_id_required');
    const expiresAt = Number(tokens.expires_at ?? tokens.expiresAt ?? (tokens.expires_in ? Date.now()+Number(tokens.expires_in)*1000 : 0));
    if (!Number.isFinite(expiresAt) || (adapter !== 'api' && expiresAt <= 0)) throw new RelayError(400, 'expiry_required_in_epoch_milliseconds');
    const scopes = Array.isArray(tokens.scopes) ? tokens.scopes : (tokens.scope ?? '').split(' ');
    if (adapter === 'plan' && !scopes.includes('chatgpt.tokens.use.direct')) throw new RelayError(400, 'chatgpt_plan_scope_required');
    const secret = {accessToken,refreshToken,clientId,expiresAt,scopes,
      accountId:tokens.account_id ?? input.account_id ?? null,subject:input.subject ?? null,
      idToken:tokens.id_token ?? null,earliestRefreshAt:Number(tokens.earliest_refresh_at ?? 0)*1000};
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO accounts(id,tenant,label,adapter,secret,refresh_fingerprint,expires_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,tenant,label,adapter,encrypt(this.key,secret,id),this.fingerprint(refreshToken),expiresAt);
    return this.publicAccount(this.account(id));
  }
  fingerprint(token) {return token ? crypto.createHmac('sha256',this.key).update(token).digest('hex') : null;}
  account(id) {return this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id);}
  credentials(account) {return decrypt(this.key,account.secret,account.id);}
  publicAccount(row) {
    return {id:row.id,tenant:row.tenant,label:row.label,adapter:row.adapter,enabled:!!row.enabled,state:row.state,
      cooldown_until:row.cooldown_until,expires_at:row.expires_at,quota:row.quota?JSON.parse(row.quota):null};
  }
  list(tenant) {return this.db.prepare('SELECT * FROM accounts WHERE tenant=? ORDER BY last_used,id').all(tenant);}
  saveCredentials(id, secret) {
    this.db.prepare("UPDATE accounts SET secret=?,refresh_fingerprint=?,expires_at=?,state='ready',refresh_pending=0 WHERE id=?")
      .run(encrypt(this.key,secret,id),this.fingerprint(secret.refreshToken),secret.expiresAt,id);
  }
  changeState(id,state,until=0) {
    this.db.prepare('UPDATE accounts SET state=?,cooldown_until=? WHERE id=?').run(state,until,id);
    this.db.prepare('DELETE FROM affinity WHERE account_id=?').run(id);
  }
  noteQuota(id,headers) {
    const quota={source:'upstream_headers',observed_at:Date.now(),account_id:id,windows:{}};
    for(const window of ['primary','secondary']) {
      const percent=headers.get('x-codex-'+window+'-used-percent');
      if(percent!==null&&percent.trim()!==''&&Number.isFinite(Number(percent))&&Number(percent)>=0&&Number(percent)<=100) quota.windows[window]={used_percent:Number(percent),
        reset_at:headers.get('x-codex-'+window+'-reset-at'),window_minutes:headers.get('x-codex-'+window+'-window-minutes')};
    }
    if(Object.keys(quota.windows).length)this.db.prepare('UPDATE accounts SET quota=? WHERE id=?').run(JSON.stringify(quota),id);
    return Object.keys(quota.windows).length?quota:null;
  }
  usage(row) {
    const u=measuredUsage(row.usage,!!row.replay),a=row.audit??{};
    const values={ts:Date.now(),caller_id:row.caller,account_id:row.account??null,model:row.model??null,status:row.status,outcome:row.outcome,
      input_tokens:u.input,cached_tokens:u.cached,output_tokens:u.output,replay:row.replay?1:0,duration_ms:row.duration,served_model:row.servedModel??null,
      reasoning_tokens:u.reasoning,cache_write_tokens:u.cacheWrite,uncached_input_tokens:u.uncached,usage_source:u.source,usage_anomaly:u.anomaly,
      upstream_attempts:row.attempts??null,raw_request_bytes:a.raw_bytes??null,upstream_request_bytes:a.wire_bytes??null,upstream_sent_bytes:a.sent_bytes??null,
      prompt_cache_key:a.cache_key??null,session_source:a.session_source??null,input_text_bytes_before:a.before?.text_bytes??null,
      input_text_bytes_after:a.after?.text_bytes??null,tool_schema_bytes_before:a.before?.tool_schema_bytes??null,
      tool_schema_bytes_after:a.after?.tool_schema_bytes??null,replay_saved_input_tokens:row.replaySavedInput??null,
      context_trimmed_items:a.context?.trimmed_items??0,context_removed_bytes:a.context?.removed_bytes??0,
      request_kind:a.request_kind??'unknown',response_kind:a.response_kind??'unknown',
      context_reason:a.context?.reason??null,context_replan_reason:a.context?.replan_reason??null,
      policy_revision:a.policy?.revision??null,policy_mode:a.policy?.mode??null,policy_generation:a.policy?.generation??null,
      quota_observed_at:a.quota?.observed_at??null,quota_primary_used_percent:a.quota?.windows?.primary?.used_percent??null,
      quota_secondary_used_percent:a.quota?.windows?.secondary?.used_percent??null,
      quota_primary_reset_at:a.quota?.windows?.primary?.reset_at??null,quota_secondary_reset_at:a.quota?.windows?.secondary?.reset_at??null};
    this.db.prepare(`INSERT INTO usage(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(()=>'?').join(',')})`).run(...Object.values(values));
  }
  recentUsage(tenant) {
    return this.db.prepare('SELECT u.* FROM usage u JOIN callers c ON c.id=u.caller_id WHERE c.tenant=? ORDER BY u.id DESC LIMIT 200').all(tenant);
  }
  usageSummary(tenant) {
    const result=this.db.prepare(`SELECT COUNT(*) requests, SUM(replay) replay_hits,
      SUM(upstream_attempts) upstream_attempts_known, SUM(CASE WHEN upstream_attempts IS NULL THEN 1 ELSE 0 END) rows_with_unknown_attempts,
      SUM(CASE WHEN replay=0 AND COALESCE(upstream_attempts,1)>0 AND (input_tokens IS NULL OR output_tokens IS NULL) THEN 1 ELSE 0 END) rows_with_unknown_usage,
      SUM(CASE WHEN replay=0 AND input_tokens IS NOT NULL AND cached_tokens IS NULL THEN 1 ELSE 0 END) rows_with_unknown_cache,
      SUM(CASE WHEN replay=0 THEN input_tokens END) observed_input_tokens,
      SUM(CASE WHEN replay=0 AND uncached_input_tokens IS NOT NULL THEN cached_tokens END) observed_cached_tokens,
      SUM(CASE WHEN replay=0 THEN uncached_input_tokens END) observed_uncached_input_tokens,
      SUM(CASE WHEN replay=0 AND uncached_input_tokens IS NOT NULL THEN input_tokens END) cache_measured_input_tokens,
      SUM(CASE WHEN replay=0 THEN output_tokens END) observed_output_tokens,
      SUM(CASE WHEN replay=0 THEN reasoning_tokens END) observed_reasoning_tokens,
      SUM(CASE WHEN replay=0 THEN cache_write_tokens END) observed_cache_write_tokens,
      SUM(CASE WHEN replay=0 THEN input_tokens+output_tokens END) observed_total_tokens,
      SUM(replay_saved_input_tokens) replay_avoided_input_tokens,
      SUM(CASE WHEN usage_anomaly IS NOT NULL THEN 1 ELSE 0 END) anomalous_usage_rows
      FROM usage u JOIN callers c ON c.id=u.caller_id WHERE c.tenant=?`).get(tenant);
    return {...result,observed_cache_ratio:result.cache_measured_input_tokens>0?result.observed_cached_tokens/result.cache_measured_input_tokens:null,
      reasoning_included_in_output:true,quota_savings_estimate:null,scope:'all_history_for_tenant'};
  }
  localPolicy() {
    const policy=this.policies.status(),enforced=policy.enforced;
    return {source:'local_sqlite',configuration_loaded:true,vendor_policy_loaded:false,vendor_policy_required:false,
      reference_policy:policy,local_policy_loaded:policy.activeRevision!==null,
      prompt:{injected_padding:enforced,tool_trailer:enforced?'policy':this.settings.get('tools.early_finish')?'short_marker':'off',
        early_finish_scope:'supported_function_tools_and_exact_cursor_patch_single_call',early_finish_quota_savings_verified:false,
        text_trailer:enforced?'policy':this.settings.get('output.early_finish')?'short_marker':'off',
        text_early_finish_scope:'plain_text_and_final_answer_with_compatible_client_tools',
        automatic_history_trimming:this.settings.get('context.trim_tool_history'),arbitrary_uuid_rewriting:false,model_remapping:false,
        history_trim:{scope:'codex_matched_old_tool_outputs',keep_recent_outputs:this.settings.get('context.keep_recent_tool_outputs'),
          batch_size:this.settings.get('context.trim_batch_size'),old_output_chars:this.settings.get('context.old_tool_output_chars'),
          min_history_bytes:this.settings.get('context.min_tool_history_bytes'),min_removed_bytes:this.settings.get('context.min_removed_bytes'),
          session_policy_pinned:true,session_transforms_frozen:false,checkpoint_transforms_frozen:true,
          replan_idle_ms:this.settings.get('context.replan_idle_ms'),replan_growth_bytes:this.settings.get('context.replan_growth_bytes'),
          replan_on_compaction_boundary:true,policy_idle_days:7,max_pinned_policies:4096,omissions_marked:true}},
      cache:{affinity_fallback:this.settings.get('cache.affinity_fallback'),client_key_preserved_in_namespace:true,
        isolation:['caller','tenant','account','model','client_key'],key_priority:'explicit_client_key_then_session',
        session_scoped_when_client_key_absent:true,replay_requires_idempotency_key:true,ttl_ms:this.settings.get('cache.ttl_ms')},
      accounting:{usage_source:'upstream_only',missing_usage:'unknown',replay_new_upstream_tokens:0,quota_savings_estimate:null}};
  }
  beginOAuth(secret) {
    const state=opaque();this.db.prepare('DELETE FROM oauth WHERE expires_at<?').run(Date.now());
    this.db.prepare('INSERT INTO oauth VALUES(?,?,?)').run(hash(state),encrypt(this.key,secret,hash(state)),Date.now()+600000);
    return state;
  }
  takeOAuth(state) {
    const key=hash(state??''), row=this.db.prepare('DELETE FROM oauth WHERE state_hash=? RETURNING *').get(key);
    if(!row||row.expires_at<Date.now())throw new RelayError(400,'oauth_state_invalid_or_expired');
    return decrypt(this.key,row.secret,key);
  }
}
