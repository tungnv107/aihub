import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SettingsRepository} from '../self_relay/store.mjs';
import {LocalPolicyStore} from '../self_relay/policy.mjs';
import {EXECUTABLE_POLICY_REVISION} from '../self_relay/policy-runtime.mjs';

export const VERSION='0.3.3';
export const PRODUCT='tdh-relay';
export const DEFAULT_PORT=18455;
export const DEFAULT_DESKTOP_BODY_BYTES=64*1024*1024;

export class ProductState {
  constructor(home){
    this.home=path.resolve(home);
    fs.mkdirSync(path.join(this.home,'data'),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path.join(this.home,'data','desktop.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS product_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS desktop_usage(id INTEGER PRIMARY KEY,ts INTEGER NOT NULL,model TEXT,status INTEGER NOT NULL,duration_ms INTEGER NOT NULL,attempts INTEGER NOT NULL,policy_revision TEXT,usage TEXT);');
    this.settings=new SettingsRepository(this.db);
    // Desktop gửi lại lịch sử/ảnh đầy đủ; không dùng mặc định 2 MiB của proxy.
    // INSERT OR IGNORE nâng mặc định của DB cũ nhưng giữ cấu hình chủ động đặt.
    this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)')
      .run('relay.max_body_bytes',JSON.stringify(DEFAULT_DESKTOP_BODY_BYTES));
    this.policies=new LocalPolicyStore(this.settings,this.db);
  }
  get(key){const row=this.db.prepare('SELECT value FROM product_meta WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
  set(key,value){this.db.prepare('INSERT INTO product_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  initialize(policy,{port=DEFAULT_PORT,codexHome}={}){
    if(!this.get('initialized')){
      this.settings.set('relay.port',port);
      this.set('control_token',crypto.randomBytes(32).toString('base64url'));
      this.set('initialized',true);
    }
    if(codexHome)this.set('codex_home',path.resolve(codexHome));
    const current=this.policies.status();
    if(current.activeRevision!==EXECUTABLE_POLICY_REVISION||current.mode!=='enforce'){
      const imported=this.policies.import({policy,expectedGeneration:current.generation,provenance:{scope:'tdh-relay-bundled-reviewed-policy'}});
      if(imported.revision!==EXECUTABLE_POLICY_REVISION)throw Error('bundled_policy_mismatch');
      this.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:imported.generation});
    }
    this.set('version',VERSION);
  }
  record(row){
    this.db.prepare('INSERT INTO desktop_usage(ts,model,status,duration_ms,attempts,policy_revision,usage) VALUES(?,?,?,?,?,?,?)')
      .run(Date.now(),row.model??null,row.status,row.duration,row.attempts,row.revision??null,row.usage?JSON.stringify(row.usage):null);
    this.db.prepare('DELETE FROM desktop_usage WHERE id < (SELECT COALESCE(MAX(id),0)-2000 FROM desktop_usage)').run();
  }
  close(){this.db.close();}
}
