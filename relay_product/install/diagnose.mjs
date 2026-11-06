import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const args=process.argv.slice(2);
const argument=name=>args[args.indexOf(name)+1];
const home=argument('--home'),output=argument('--out');
if(!args.includes('--home')||!args.includes('--out')||!path.isAbsolute(home)||!path.isAbsolute(output))throw Error('absolute_home_and_output_required');
const database=path.join(home,'data','desktop.sqlite');
if(!fs.existsSync(database))throw Error('desktop_relay_not_initialized');
const db=new DatabaseSync(database,{readOnly:true});
try{
  const get=key=>{const row=db.prepare('SELECT value FROM product_meta WHERE key=?').get(key);return row?JSON.parse(row.value):null;};
  const usage=db.prepare('SELECT COUNT(*) requests,COALESCE(SUM(status>=400),0) errors,COALESCE(AVG(duration_ms),0) avgDurationMs,COALESCE(SUM(attempts),0) attempts FROM desktop_usage').get();
  const statuses=Object.fromEntries(db.prepare('SELECT status,COUNT(*) n FROM desktop_usage GROUP BY status').all().map(r=>[String(r.status),r.n]));
  let licenseActive=false;
  try{
    const lease=get('license.lease'),claims=JSON.parse(Buffer.from(lease.payload,'base64url').toString());
    licenseActive=!get('license.denied')&&claims.expiresAt>Date.now();
  }catch{}
  const report={schema:'tdh-diagnostic-v1',mode:'desktop',version:String(get('version')??'unknown'),generatedAt:new Date().toISOString(),
    ...usage,avgDurationMs:Math.round(usage.avgDurationMs),statuses,licenseActive};
  // Chỉ xuất tổng số; không đọc token, nội dung hội thoại hay chữ ký thiết bị.
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({created:true,path:output,uploaded:false}));
}finally{db.close();}
