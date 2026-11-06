import crypto from 'node:crypto';
import {AdminError} from './auth.mjs';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
export class CustomerPortal {
  constructor(authority,dashboard,auth){
    this.authority=authority;this.db=authority.db;this.dashboard=dashboard;this.auth=auth;this.now=authority.now;
    this.db.exec('CREATE TABLE IF NOT EXISTS customer_sessions(token_hash TEXT PRIMARY KEY,license_id TEXT NOT NULL,csrf TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS customer_login_attempts(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,ip_hash TEXT NOT NULL);'+
      'CREATE INDEX IF NOT EXISTS customer_attempt_time ON customer_login_attempts(at);');
  }
  login(key,ip){
    const now=this.now(),ipHash=digest(String(ip));
    this.db.prepare('DELETE FROM customer_login_attempts WHERE at<?').run(now-900000);
    const counts=this.db.prepare('SELECT COUNT(*) total,SUM(ip_hash=?) own FROM customer_login_attempts').get(ipHash);
    if(counts.total>=500||counts.own>=10)throw new AdminError(429,'customer_rate_limited');
    this.db.prepare('INSERT INTO customer_login_attempts(at,ip_hash) VALUES(?,?)').run(now,ipHash);
    const normalized=typeof key==='string'?key.trim():'';
    const row=/^TDH-[A-Za-z0-9_-]{32}$/.test(normalized)?this.db.prepare('SELECT id FROM licenses WHERE key_hash=?').get(digest(normalized)):null;
    if(!row)throw new AdminError(401,'customer_key_invalid');
    this.db.prepare('DELETE FROM customer_login_attempts WHERE ip_hash=?').run(ipHash);
    this.db.prepare('DELETE FROM customer_sessions WHERE created_at<? OR last_seen<?').run(now-86400000,now-1800000);
    const token=random(),csrf=random();
    this.db.prepare('INSERT INTO customer_sessions VALUES(?,?,?,?,?)').run(digest(token),row.id,csrf,now,now);
    this.db.prepare('DELETE FROM customer_sessions WHERE license_id=? AND token_hash NOT IN (SELECT token_hash FROM customer_sessions WHERE license_id=? ORDER BY created_at DESC LIMIT 20)').run(row.id,row.id);
    return {token,csrf,licenseId:row.id};
  }
  session(token){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AdminError(401,'customer_login_required');
    const tokenHash=digest(token),row=this.db.prepare('SELECT s.* FROM customer_sessions s JOIN licenses l ON l.id=s.license_id WHERE token_hash=?').get(tokenHash);
    if(!row||this.now()-row.created_at>=86400000||this.now()-row.last_seen>=1800000){
      this.db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').run(tokenHash);throw new AdminError(401,'customer_login_required');
    }
    this.db.prepare('UPDATE customer_sessions SET last_seen=? WHERE token_hash=?').run(this.now(),tokenHash);
    return {licenseId:row.license_id,csrf:row.csrf,tokenHash};
  }
  logout(session){this.db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').run(session.tokenHash);}
  summary(session){
    const row=this.db.prepare('SELECT id,label,started_at,duration_ms,expires_at,max_devices,revoked,created_at FROM licenses WHERE id=?').get(session.licenseId);
    const devices=this.db.prepare('SELECT id,substr(device_id,1,16) fingerprint,created_at,last_seen,revoked FROM activations WHERE license_id=? ORDER BY created_at DESC').all(session.licenseId);
    const reports=this.db.prepare('SELECT at,report FROM admin_reports WHERE license_id=? ORDER BY at DESC LIMIT 10').all(session.licenseId).map(r=>({receivedAt:r.at,...JSON.parse(r.report)}));
    const status=row.revoked?'revoked':row.started_at===null?'pending':row.expires_at<=this.now()?'expired':'active';
    return {license:{...row,expires_at:row.started_at===null?null:row.expires_at,status},devices,reports,now:this.now(),telemetry:'manual_report_only'};
  }
  report(session,input){
    const recent=this.db.prepare('SELECT COUNT(*) n FROM admin_reports WHERE license_id=? AND at>?').get(session.licenseId,this.now()-3600000).n;
    if(recent>=10)throw new AdminError(429,'report_rate_limited');
    return this.dashboard.importReport(session.licenseId,input,'customer:'+session.licenseId,{source:'customer_imported'});
  }
}
