import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class AdminError extends Error {
  constructor(status,code){super(code);this.status=status;}
}
export class AdminAuth {
  constructor(db,{now=Date.now}={}){
    this.db=db;this.now=now;this.busy=0;
    db.exec('CREATE TABLE IF NOT EXISTS admin_users(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 1);'+
      'CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,csrf TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS admin_events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,target TEXT,detail TEXT);'+
      'CREATE TABLE IF NOT EXISTS admin_login_attempts(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,ip_hash TEXT NOT NULL);'+
      'CREATE INDEX IF NOT EXISTS admin_attempt_time ON admin_login_attempts(at);');
  }
  async derive(password,salt){
    return (await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');
  }
  validatePassword(password){
    if(typeof password!=='string'||password.length<14||password.length>256)throw new AdminError(400,'password_length');
  }
  event(actor,kind,target=null,detail=null){
    this.db.prepare('INSERT INTO admin_events(at,actor,kind,target,detail) VALUES(?,?,?,?,?)').run(this.now(),actor,kind,target,detail);
  }
  async provision(username,password){
    if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username))throw new AdminError(400,'invalid_username');
    this.validatePassword(password);
    if(this.db.prepare('SELECT COUNT(*) n FROM admin_users').get().n)throw new AdminError(409,'admin_already_exists');
    const salt=random(),hash=await this.derive(password,salt);
    this.db.prepare('INSERT INTO admin_users VALUES(?,?,?,1)').run(username,salt,hash);
    this.event(username,'admin_provisioned');
  }
  async login(username,password,ip){
    if(this.busy>=3)throw new AdminError(429,'login_rate_limited');
    if(typeof username!=='string'||typeof password!=='string'||username.length>40||password.length>256)throw new AdminError(401,'login_failed');
    const now=this.now(),ipHash=digest(String(ip));
    this.db.prepare('DELETE FROM admin_login_attempts WHERE at<?').run(now-900000);
    const counts=this.db.prepare('SELECT COUNT(*) n,SUM(CASE WHEN ip_hash=? THEN 1 ELSE 0 END) own FROM admin_login_attempts').get(ipHash);
    if(counts.n>=100||counts.own>=10)throw new AdminError(429,'login_rate_limited');
    this.db.prepare('INSERT INTO admin_login_attempts(at,ip_hash) VALUES(?,?)').run(now,ipHash);
    this.busy++;
    try{
      const user=this.db.prepare('SELECT * FROM admin_users WHERE username=?').get(username);
      const candidate=await this.derive(password,user?.salt??'tdh-unknown-account-fixed-salt');
      if(!user||!equal(candidate,user.password_hash)){
        this.event('anonymous','login_failed');throw new AdminError(401,'login_failed');
      }
      this.db.prepare('DELETE FROM admin_login_attempts WHERE ip_hash=?').run(ipHash);
      this.db.prepare('DELETE FROM admin_sessions WHERE created_at<? OR last_seen<?').run(now-28800000,now-1800000);
      const token=random(),csrf=random();
      this.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?,?)').run(digest(token),username,csrf,now,now);
      this.event(username,'login');
      return {token,csrf,username,mustChange:!!user.must_change};
    }finally{this.busy--;}
  }
  session(token){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AdminError(401,'login_required');
    const tokenHash=digest(token);
    const s=this.db.prepare('SELECT s.*,u.must_change FROM admin_sessions s JOIN admin_users u ON u.username=s.username WHERE token_hash=?').get(tokenHash);
    if(!s||this.now()-s.created_at>=28800000||this.now()-s.last_seen>=1800000){
      this.db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(tokenHash);throw new AdminError(401,'login_required');
    }
    this.db.prepare('UPDATE admin_sessions SET last_seen=? WHERE token_hash=?').run(this.now(),tokenHash);
    return {username:s.username,csrf:s.csrf,mustChange:!!s.must_change,tokenHash};
  }
  checkCsrf(session,value){if(!equal(session.csrf,value))throw new AdminError(403,'csrf_rejected');}
  logout(session){this.db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(session.tokenHash);this.event(session.username,'logout');}
  async changePassword(session,current,password){
    this.validatePassword(password);
    if(typeof current!=='string'||current.length>256||password===current)throw new AdminError(400,'password_change_invalid');
    if(this.busy>=3)throw new AdminError(429,'try_later');
    this.busy++;
    try{
      const user=this.db.prepare('SELECT * FROM admin_users WHERE username=?').get(session.username);
      if(!equal(await this.derive(current,user.salt),user.password_hash))throw new AdminError(403,'current_password_incorrect');
      const salt=random(),hash=await this.derive(password,salt);
      this.db.exec('BEGIN IMMEDIATE');
      try{
        this.db.prepare('UPDATE admin_users SET salt=?,password_hash=?,must_change=0 WHERE username=?').run(salt,hash,session.username);
        this.db.prepare('DELETE FROM admin_sessions WHERE username=?').run(session.username);
        this.event(session.username,'password_changed');this.db.exec('COMMIT');
      }catch(error){this.db.exec('ROLLBACK');throw error;}
    }finally{this.busy--;}
  }
}
