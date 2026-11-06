import {AdminError} from './auth.mjs';
import crypto from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function requireId(id){if(!uuid.test(id??''))throw new AdminError(400,'invalid_id');return id;}
function number(value,min,max){if(!Number.isFinite(value)||value<min||value>max)throw new AdminError(400,'invalid_value');return value;}
export class Dashboard {
  constructor(authority,auth){
    this.authority=authority;this.db=authority.db;this.auth=auth;
    this.db.exec('CREATE TABLE IF NOT EXISTS admin_reports(id TEXT PRIMARY KEY,license_id TEXT NOT NULL,at INTEGER NOT NULL,report TEXT NOT NULL);');
  }
  overview(){
    const now=this.authority.now();
    const counts=this.db.prepare('SELECT COUNT(*) total,COALESCE(SUM(revoked=0 AND started_at IS NULL),0) pending,COALESCE(SUM(revoked=0 AND started_at IS NOT NULL AND expires_at>?),0) active,'+
      'COALESCE(SUM(revoked=0 AND started_at IS NOT NULL AND expires_at<=?),0) expired,COALESCE(SUM(revoked=1),0) revoked,'+
      'COALESCE(SUM(revoked=0 AND expires_at>? AND expires_at<=?),0) expiring FROM licenses').get(now,now,now,now+7*86400000);
    const devices=this.db.prepare('SELECT COUNT(*) total,COALESCE(SUM(a.revoked=0 AND l.revoked=0 AND l.expires_at>? AND a.last_seen>?),0) recent FROM activations a JOIN licenses l ON l.id=a.license_id').get(now,now-600000);
    const activity=this.db.prepare("SELECT strftime('%Y-%m-%d',at/1000,'unixepoch') day,kind,COUNT(*) count FROM audit WHERE at>=? GROUP BY day,kind ORDER BY day").all(now-30*86400000);
    const expiring=this.db.prepare('SELECT id,label,expires_at FROM licenses WHERE revoked=0 AND expires_at>? AND expires_at<=? ORDER BY expires_at LIMIT 8').all(now,now+7*86400000);
    return {counts,devices,activity,expiring,now,telemetry:'local_only',timeZone:'UTC'};
  }
  licenses(params){
    const page=Math.floor(Math.max(1,Math.min(100000,Number(params.get('page'))||1))),limit=25;
    const query=String(params.get('q')??'').trim().slice(0,120),status=params.get('status')??'all',now=this.authority.now();
    const statusSql={all:'1=1',pending:'l.revoked=0 AND l.started_at IS NULL',active:'l.revoked=0 AND l.started_at IS NOT NULL AND l.expires_at>'+now,expired:'l.revoked=0 AND l.started_at IS NOT NULL AND l.expires_at<='+now,revoked:'l.revoked=1',expiring:'l.revoked=0 AND l.expires_at>'+now+' AND l.expires_at<='+(now+7*86400000)}[status];
    if(!statusSql)throw new AdminError(400,'invalid_status');
    const filter='('+statusSql+') AND (instr(lower(l.label),lower(?))>0 OR instr(l.id,?)>0)';
    const total=this.db.prepare('SELECT COUNT(*) n FROM licenses l WHERE '+filter).get(query,query).n;
    const rows=this.db.prepare('SELECT l.id,l.label,l.expires_at,l.max_devices,l.revoked,l.created_at,l.duration_ms,l.started_at,'+
      '(SELECT COUNT(*) FROM activations a WHERE a.license_id=l.id AND a.revoked=0) devices,'+
      '(SELECT MAX(last_seen) FROM activations a WHERE a.license_id=l.id) last_seen FROM licenses l WHERE '+filter+' ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?').all(query,query,limit,(page-1)*limit);
    return {rows,page,limit,total,now};
  }
  detail(id){
    requireId(id);
    const license=this.db.prepare('SELECT id,label,expires_at,max_devices,revoked,created_at,duration_ms,started_at FROM licenses WHERE id=?').get(id);
    if(!license)throw new AdminError(404,'record_not_found');
    const devices=this.db.prepare('SELECT id,device_id,revoked,created_at,last_seen FROM activations WHERE license_id=? ORDER BY created_at DESC').all(id);
    const events=this.db.prepare('SELECT at,kind,activation_id FROM audit WHERE license_id=? OR activation_id IN (SELECT id FROM activations WHERE license_id=?) ORDER BY id DESC LIMIT 50').all(id,id);
    const reports=this.db.prepare('SELECT id,at,report FROM admin_reports WHERE license_id=? ORDER BY at DESC LIMIT 10').all(id).map(r=>({...r,report:JSON.parse(r.report)}));
    return {license,devices,events,reports};
  }
  issue(body,actor){
    const result=this.authority.issue({label:body.label,days:body.days,maxDevices:body.maxDevices});
    this.auth.event(actor,'license_issued',result.id);return result;
  }
  issueBatch(body,actor){
    const result=this.authority.issueBatch({label:body.label,days:body.days,maxDevices:body.maxDevices,count:body.count});
    this.auth.event(actor,'license_batch_issued',null,String(result.count));return result;
  }
  change(id,action,body,actor){
    requireId(id);this.detail(id);
    if(['extend','revoke'].includes(action)){
      this.authority.change(action,id,{days:body.days});
    }else if(action==='update'){
      if(typeof body.label!=='string'||!body.label.trim()||body.label.length>120)throw new AdminError(400,'invalid_label');
      const maxDevices=number(body.maxDevices,1,100);
      if(!Number.isInteger(maxDevices))throw new AdminError(400,'invalid_value');
      this.db.exec('BEGIN IMMEDIATE');
      try{
        const used=this.db.prepare('SELECT COUNT(*) n FROM activations WHERE license_id=? AND revoked=0').get(id).n;
        if(maxDevices<used)throw new AdminError(409,'device_limit_below_activated');
        this.db.prepare('UPDATE licenses SET label=?,max_devices=? WHERE id=?').run(body.label.trim(),maxDevices,id);
        this.db.exec('COMMIT');
      }catch(error){this.db.exec('ROLLBACK');throw error;}
    }else throw new AdminError(404,'route_not_found');
    this.auth.event(actor,'license_'+action,id);return {ok:true};
  }
  device(id,action,actor){
    requireId(id);
    const row=this.db.prepare('SELECT license_id FROM activations WHERE id=?').get(id);
    if(!row)throw new AdminError(404,'record_not_found');
    if(!['revoke-device','reset-device'].includes(action))throw new AdminError(400,'invalid_action');
    this.authority.change(action,id);this.auth.event(actor,action,row.license_id,id);return {ok:true};
  }
  events(params){
    const page=Math.floor(Math.max(1,Math.min(100000,Number(params.get('page'))||1))),limit=40;
    const rows=this.db.prepare("SELECT at,kind,'license-service' actor,license_id target,activation_id detail FROM audit UNION ALL SELECT at,kind,actor,target,detail FROM admin_events ORDER BY at DESC LIMIT ? OFFSET ?").all(limit,(page-1)*limit);
    const total=this.db.prepare('SELECT (SELECT COUNT(*) FROM audit)+(SELECT COUNT(*) FROM admin_events) n').get().n;
    return {rows,page,limit,total};
  }
  importReport(id,input,actor,{source='owner_imported'}={}){
    this.detail(id);
    if(!input||input.schema!=='tdh-diagnostic-v1'||input.mode!=='desktop')throw new AdminError(400,'invalid_diagnostic');
    // Chỉ nhận số liệu định trước, không giữ payload gốc hay nội dung hội thoại.
    const report={schema:input.schema,mode:'desktop',version:String(input.version??'unknown').slice(0,32),
      generatedAt:new Date(number(Date.parse(input.generatedAt),0,this.authority.now()+86400000)).toISOString(),
      requests:number(input.requests,0,1e9),errors:number(input.errors,0,1e9),avgDurationMs:number(input.avgDurationMs,0,1e10),
      attempts:number(input.attempts,0,1e10),licenseActive:input.licenseActive===true,
      statuses:{},source,verifiedClient:false};
    if(!/^[a-zA-Z0-9.-]{1,32}$/.test(report.version))throw new AdminError(400,'invalid_diagnostic');
    for(const [code,value] of Object.entries(input.statuses??{})){
      if(!/^[1-5][0-9]{2}$/.test(code))throw new AdminError(400,'invalid_diagnostic');
      report.statuses[code]=number(value,0,1e9);
    }
    if(report.errors>report.requests)throw new AdminError(400,'invalid_diagnostic');
    const reportId=crypto.randomUUID();
    this.db.prepare('INSERT INTO admin_reports VALUES(?,?,?,?)').run(reportId,id,this.authority.now(),JSON.stringify(report));
    this.auth.event(actor,'diagnostic_imported',id);
    this.db.prepare('DELETE FROM admin_reports WHERE license_id=? AND id NOT IN (SELECT id FROM admin_reports WHERE license_id=? ORDER BY at DESC LIMIT 20)').run(id,id);
    return {ok:true,id:reportId,report};
  }
}
