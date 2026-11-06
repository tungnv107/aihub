import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {hash,publicText,readPublic,signEnvelope,verifyProof} from './license-protocol.mjs';

export class LicenseAuthority {
  constructor(home,{now=Date.now,leaseMs=600000}={}){
    fs.mkdirSync(home,{recursive:true,mode:0o700});this.home=home;this.now=now;this.leaseMs=leaseMs;
    const keyfile=path.join(home,'signing-private.pem');
    if(!fs.existsSync(keyfile)){
      const pair=crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync(keyfile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
    }
    this.privateKey=crypto.createPrivateKey(fs.readFileSync(keyfile));this.publicKey=publicText(this.privateKey);
    this.db=new DatabaseSync(path.join(home,'licenses.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;'+
      'CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY,key_hash TEXT UNIQUE NOT NULL,label TEXT NOT NULL,expires_at INTEGER NOT NULL,max_devices INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS activations(id TEXT PRIMARY KEY,license_id TEXT NOT NULL,device_id TEXT NOT NULL,public_key TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,UNIQUE(license_id,device_id));'+
      'CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,nonce TEXT NOT NULL,device_id TEXT NOT NULL,public_key TEXT NOT NULL,expires_at INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,license_id TEXT,activation_id TEXT);');
    this.migrateActivationTerm();
  }
  migrateActivationTerm(){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const columns=new Set(this.db.prepare('PRAGMA table_info(licenses)').all().map(row=>row.name));
      if(!columns.has('duration_ms')){
        this.db.exec('ALTER TABLE licenses ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0; ALTER TABLE licenses ADD COLUMN started_at INTEGER;');
        this.db.exec('UPDATE licenses SET duration_ms=MAX(1,expires_at-created_at),started_at=COALESCE('+
          "(SELECT MIN(at) FROM audit WHERE audit.license_id=licenses.id AND kind='activated'),"+
          '(SELECT MIN(created_at) FROM activations WHERE activations.license_id=licenses.id));');
        // Key từng kích hoạt giữ nguyên hạn; key chưa dùng được trả về trạng thái chờ.
        this.db.exec('UPDATE licenses SET expires_at=0 WHERE started_at IS NULL;');
      }
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  audit(kind,licenseId=null,activationId=null){
    this.db.prepare('INSERT INTO audit(at,kind,license_id,activation_id) VALUES(?,?,?,?)').run(this.now(),kind,licenseId,activationId);
  }
  issue({label,days,maxDevices=1}){
    if(typeof label!=='string'||!label.trim()||label.length>120||!Number.isFinite(days)||days<=0||days>3660||!Number.isInteger(maxDevices)||maxDevices<1||maxDevices>100)throw Error('invalid_license_parameters');
    const id=crypto.randomUUID(),key='TDH-'+crypto.randomBytes(24).toString('base64url'),durationMs=Math.max(1,Math.round(days*86400000));
    this.db.prepare('INSERT INTO licenses(id,key_hash,label,expires_at,max_devices,created_at,duration_ms) VALUES(?,?,?,0,?,?,?)').run(id,hash(key),label.trim(),maxDevices,this.now(),durationMs);
    this.audit('issued',id);return {id,key,label:label.trim(),expiresAt:null,startedAt:null,durationMs,maxDevices};
  }
  issueBatch({count,...options}){
    if(!Number.isInteger(count)||count<1||count>100||typeof options.label!=='string'||!options.label.trim()||options.label.trim().length>110)throw Error('invalid_batch_parameters');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const licenses=Array.from({length:count},(_,i)=>this.issue({...options,label:count===1?options.label:options.label.trim()+' '+String(i+1).padStart(3,'0')}));
      this.db.exec('COMMIT');return {count,licenses};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  challenge({deviceId,publicKey}){
    if(typeof deviceId!=='string'||!/^[a-f0-9]{64}$/.test(deviceId))throw Error('invalid_device');
    readPublic(publicKey);
    this.db.prepare('DELETE FROM challenges WHERE expires_at<?').run(this.now());
    if(this.db.prepare('SELECT COUNT(*) n FROM challenges').get().n>=10000)throw Error('try_later');
    const id=crypto.randomUUID(),nonce=crypto.randomBytes(32).toString('base64url'),expiresAt=this.now()+60000;
    this.db.prepare('INSERT INTO challenges VALUES(?,?,?,?,?)').run(id,nonce,deviceId,publicKey,expiresAt);
    return {id,nonce,expiresAt};
  }
  consume(body,action){
    const row=this.db.prepare('DELETE FROM challenges WHERE id=? RETURNING *').get(String(body.challengeId??''));
    if(!row||row.expires_at<=this.now()||!verifyProof(action,row.nonce,row.device_id,row.public_key,body.proof))throw Error('proof_rejected');
    return row;
  }
  validLicense(row,{allowPending=false}={}){
    if(!row||row.revoked||(row.started_at===null?(!allowPending||row.duration_ms<=0):row.expires_at<=this.now()))throw Error('license_invalid_or_expired');
    return row;
  }
  lease(license,activation){
    if(activation.revoked)throw Error('device_revoked');
    const issuedAt=this.now();
    this.db.prepare('UPDATE activations SET last_seen=? WHERE id=?').run(issuedAt,activation.id);
    return signEnvelope({kind:'tdh-relay-lease-v1',product:'tdh-relay',licenseId:license.id,activationId:activation.id,
      deviceId:activation.device_id,keyHash:hash(activation.public_key),features:['desktop','proxy'],
      issuedAt,expiresAt:Math.min(issuedAt+this.leaseMs,license.expires_at),licenseExpiresAt:license.expires_at},this.privateKey);
  }
  activate(body){
    if(typeof body.key!=='string'||!/^TDH-[A-Za-z0-9_-]{32}$/.test(body.key))throw Error('license_invalid_or_expired');
    const proof=this.consume(body,'activate:'+hash(body.key));
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const license=this.validLicense(this.db.prepare('SELECT * FROM licenses WHERE key_hash=?').get(hash(body.key)),{allowPending:true});
      let activation=this.db.prepare('SELECT * FROM activations WHERE license_id=? AND device_id=?').get(license.id,proof.device_id);
      if(activation&&(activation.public_key!==proof.public_key||activation.revoked))throw Error('device_already_bound_or_revoked');
      if(!activation){
        const count=this.db.prepare('SELECT COUNT(*) n FROM activations WHERE license_id=? AND revoked=0').get(license.id).n;
        if(count>=license.max_devices)throw Error('device_limit_reached');
        activation={id:crypto.randomUUID(),license_id:license.id,device_id:proof.device_id,public_key:proof.public_key,revoked:0};
        this.db.prepare('INSERT INTO activations VALUES(?,?,?,?,0,?,?)').run(activation.id,license.id,proof.device_id,proof.public_key,this.now(),this.now());
        this.audit('activated',license.id,activation.id);
      }
      if(license.started_at===null){
        license.started_at=this.now();license.expires_at=license.started_at+license.duration_ms;
        this.db.prepare('UPDATE licenses SET started_at=?,expires_at=? WHERE id=? AND started_at IS NULL').run(license.started_at,license.expires_at,license.id);
        this.audit('term_started',license.id,activation.id);
      }
      const lease=this.lease(license,activation);this.db.exec('COMMIT');return {lease};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  renew(body){
    const proof=this.consume(body,'renew:'+String(body.activationId));
    const activation=this.db.prepare('SELECT * FROM activations WHERE id=?').get(String(body.activationId));
    if(!activation||activation.device_id!==proof.device_id||activation.public_key!==proof.public_key)throw Error('activation_invalid');
    const license=this.validLicense(this.db.prepare('SELECT * FROM licenses WHERE id=?').get(activation.license_id));
    return {lease:this.lease(license,activation)};
  }
  list(){
    return this.db.prepare('SELECT l.id,l.label,l.expires_at,l.max_devices,l.revoked,l.created_at,l.duration_ms,l.started_at,'+
      '(SELECT COUNT(*) FROM activations a WHERE a.license_id=l.id AND a.revoked=0) devices FROM licenses l ORDER BY created_at DESC').all();
  }
  change(command,id,{days}={}){
    let result;
    if(command==='revoke')result=this.db.prepare('UPDATE licenses SET revoked=1 WHERE id=?').run(id);
    else if(command==='extend'){
      if(!Number.isFinite(days)||days<=0||days>3660)throw Error('invalid_days');
      const extra=Math.max(1,Math.round(days*86400000));
      result=this.db.prepare('UPDATE licenses SET expires_at=CASE WHEN started_at IS NULL THEN 0 ELSE MAX(expires_at,?)+? END,duration_ms=duration_ms+?,revoked=0 WHERE id=?').run(this.now(),extra,extra,id);
    }else if(command==='revoke-device')result=this.db.prepare('UPDATE activations SET revoked=1 WHERE id=?').run(id);
    else if(command==='reset-device')result=this.db.prepare('DELETE FROM activations WHERE id=?').run(id);
    else throw Error('unknown_admin_command');
    if(!result.changes)throw Error('record_not_found');
    this.audit(command,command.includes('device')?null:id,command.includes('device')?id:null);
    return {ok:true,command,id};
  }
  close(){this.db.close();}
}
export function createLicenseServer(authority){
  const buckets=new Map();
  const server=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    try{
      if(req.url==='/healthz'&&req.method==='GET')return reply(200,{ok:true,service:'tdh-license'});
      if(req.method!=='POST'||!['/api/licenses/challenge','/api/licenses/activate','/api/licenses/renew'].includes(req.url))return reply(404,{error:'not_found'});
      if(req.headers.origin)return reply(403,{error:'browser_origin_denied'});
      const now=Date.now(),ip=req.socket.remoteAddress+':'+String(req.headers['x-tdh-client-ip']??'').slice(0,80);
      for(const [key,b]of buckets)if(now-b.at>60000)buckets.delete(key);
      const bucket=buckets.get(ip)??{at:now,n:0};bucket.n++;buckets.set(ip,bucket);
      if(bucket.n>120||buckets.size>10000)return reply(429,{error:'try_later'});
      if(!String(req.headers['content-type']??'').startsWith('application/json'))return reply(415,{error:'json_required'});
      let n=0;const chunks=[];
      for await(const chunk of req){n+=chunk.length;if(n>8192)return reply(413,{error:'request_too_large'});chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{return reply(400,{error:'invalid_json'});}
      if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'invalid_json'});
      reply(200,authority[req.url.split('/').at(-1)](body));
    }catch(error){reply(403,{error:/^[a-z_]{1,60}$/.test(error.message)?error.message:'license_request_rejected'});}
  });
  server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=3000;return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const authority=new LicenseAuthority(process.env.TDH_LICENSE_DATA??'/data');
  const server=createLicenseServer(authority);server.listen(8081,'0.0.0.0');
  const stop=()=>server.close(()=>{authority.close();process.exit(0);});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
