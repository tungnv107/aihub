import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LicenseAuthority} from '../license-server.mjs';
import {AdminAuth,AdminError} from './auth.mjs';
import {Dashboard} from './dashboard.mjs';
import {CustomerPortal} from './customer.mjs';

const web=path.join(import.meta.dirname,'web');
const assets={'/admin':'index.html','/admin/':'index.html','/admin/assets/app.js':'app.js','/admin/assets/style.css':'style.css',
  '/portal':'portal.html','/portal/':'portal.html','/portal/assets/portal.js':'portal.js'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
async function body(req){
  if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new AdminError(415,'json_required');
  if(Number(req.headers['content-length']??0)>32768){req.resume();throw new AdminError(413,'request_too_large');}
  let length=0;const chunks=[];
  // Do not destroy the request socket when rejecting an oversized body: the
  // caller must still receive the structured 413 response, including on Windows.
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    length+=chunk.length;
    if(length>32768){req.resume();throw new AdminError(413,'request_too_large');}
    chunks.push(chunk);
  }
  let value;try{value=JSON.parse(Buffer.concat(chunks));}catch{throw new AdminError(400,'invalid_json');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new AdminError(400,'invalid_json');
  return value;
}
export function createAdminServer(authority,{origin='https://codex.tudonghoa.me',secure=true,trustProxy=false,healthChecks=[]}={}){
  const expected=new URL(origin),auth=new AdminAuth(authority.db,{now:authority.now}),dashboard=new Dashboard(authority,auth);
  const customer=new CustomerPortal(authority,dashboard,auth);
  if(expected.origin!==origin||(!secure&&!['localhost','127.0.0.1'].includes(expected.hostname)))throw Error('invalid_admin_origin');
  const cookieName=secure?'__Host-tdh-admin':'tdh-admin-dev';
  const cookie=(token,clear=false)=>cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(clear?0:28800)+(secure?'; Secure':'');
  const customerCookieName=secure?'__Host-tdh-customer':'tdh-customer-dev';
  const customerCookie=(token,clear=false)=>customerCookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(clear?0:86400)+(secure?'; Secure':'');
  const server=http.createServer(async(req,res)=>{
    const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',
      'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'permissions-policy':'camera=(), microphone=(), geolocation=()'};
    const json=(status,value,extra={})=>{res.writeHead(status,{...headers,'content-type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
    try{
      if(req.url==='/healthz'&&req.method==='GET')return json(200,{ok:true,service:'tdh-admin'});
      if(req.headers.host!==expected.host)throw new AdminError(403,'invalid_host');
      const url=new URL(req.url,origin);
      if(['GET','HEAD'].includes(req.method)&&assets[url.pathname]){
        const file=path.join(web,assets[url.pathname]);
        res.writeHead(200,{...headers,'content-type':types[path.extname(file)]});
        return res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
      }
      if(!url.pathname.startsWith('/admin/api/')&&!url.pathname.startsWith('/portal/api/'))throw new AdminError(404,'route_not_found');
      const isWrite=req.method==='POST';
      if(!['GET','POST'].includes(req.method))throw new AdminError(405,'method_not_allowed');
      if(isWrite&&(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))throw new AdminError(403,'origin_rejected');
      if(url.pathname.startsWith('/portal/api/')){
        const route=url.pathname.slice('/portal/api/'.length);
        if(route==='login'&&isWrite){
          const input=await body(req),ip=trustProxy?String(req.headers['x-tdh-client-ip']??req.socket.remoteAddress):req.socket.remoteAddress;
          const result=customer.login(input.key,ip);
          return json(200,{csrf:result.csrf,licenseId:result.licenseId},{'set-cookie':customerCookie(result.token)});
        }
        const cookies=String(req.headers.cookie??'').split(';').map(s=>s.trim().split('='));
        const s=customer.session(cookies.find(([name])=>name===customerCookieName)?.[1]);
        if(isWrite)auth.checkCsrf(s,req.headers['x-csrf-token']);
        if(route==='session'&&req.method==='GET')return json(200,{csrf:s.csrf,licenseId:s.licenseId});
        if(route==='summary'&&req.method==='GET')return json(200,customer.summary(s));
        if(route==='logout'&&isWrite){customer.logout(s);return json(200,{ok:true},{'set-cookie':customerCookie('',true)});}
        if(route==='report'&&isWrite){const input=await body(req);return json(201,customer.report(s,input.report));}
        throw new AdminError(404,'route_not_found');
      }
      if(url.pathname==='/admin/api/login'&&isWrite){
        const input=await body(req),ip=trustProxy?String(req.headers['x-tdh-client-ip']??req.socket.remoteAddress):req.socket.remoteAddress;
        const session=await auth.login(input.username,input.password,ip);
        return json(200,{username:session.username,csrf:session.csrf,mustChange:session.mustChange},{'set-cookie':cookie(session.token)});
      }
      const cookies=String(req.headers.cookie??'').split(';').map(s=>s.trim().split('='));
      const session=auth.session(cookies.find(([name])=>name===cookieName)?.[1]);
      if(isWrite)auth.checkCsrf(session,req.headers['x-csrf-token']);
      const route=url.pathname.slice('/admin/api/'.length);
      if(route==='session'&&req.method==='GET')return json(200,{username:session.username,csrf:session.csrf,mustChange:session.mustChange});
      if(route==='logout'&&isWrite){auth.logout(session);return json(200,{ok:true},{'set-cookie':cookie('',true)});}
      if(route==='password'&&isWrite){const input=await body(req);await auth.changePassword(session,input.current,input.password);return json(200,{ok:true},{'set-cookie':cookie('',true)});}
      if(session.mustChange)throw new AdminError(403,'password_change_required');
      if(req.method==='GET'){
        if(route==='overview')return json(200,dashboard.overview());
        if(route==='licenses')return json(200,dashboard.licenses(url.searchParams));
        if(/^licenses\/[^/]+$/.test(route))return json(200,dashboard.detail(route.split('/')[1]));
        if(route==='events')return json(200,dashboard.events(url.searchParams));
        if(route==='diagnostics'){
          const services=await Promise.all(healthChecks.map(async({name,url:target})=>{
            const started=Date.now();try{
              const response=await fetch(target,{signal:AbortSignal.timeout(2500),redirect:'error'});
              const value=await response.json();
              return {name,ok:response.ok&&value.ok===true,durationMs:Date.now()-started};
            }catch{return {name,ok:false,durationMs:Date.now()-started};}
          }));
          return json(200,{now:Date.now(),database:authority.db.prepare('PRAGMA quick_check').get().quick_check==='ok',services,
            reportCount:authority.db.prepare('SELECT COUNT(*) n FROM admin_reports').get().n,
            clientTelemetry:'manual_report_only',leaseMinutes:authority.leaseMs/60000});
        }
      }else{
        const input=await body(req);
        if(route==='licenses')return json(201,dashboard.issue(input,session.username));
        if(route==='licenses/batch')return json(201,dashboard.issueBatch(input,session.username));
        const match=/^licenses\/([^/]+)\/(extend|revoke|update|report)$/.exec(route);
        if(match)return json(200,match[2]==='report'?dashboard.importReport(match[1],input.report,session.username):dashboard.change(match[1],match[2],input,session.username));
        const device=/^devices\/([^/]+)\/(revoke-device|reset-device)$/.exec(route);
        if(device)return json(200,dashboard.device(device[1],device[2],session.username));
      }
      throw new AdminError(404,'route_not_found');
    }catch(error){
      req.resume();
      const code=error instanceof AdminError?error.message:/^(invalid_license_parameters|invalid_batch_parameters|invalid_days|record_not_found)$/.test(error.message)?error.message:'operation_failed';
      return json(error.status??(code==='operation_failed'?500:400),{error:code});
    }
  });
  server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=3000;
  return {server,auth,dashboard,customer};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const home=process.env.TDH_LICENSE_DATA??'/data';
  if(!fs.existsSync(path.join(home,'signing-private.pem'))||!fs.existsSync(path.join(home,'licenses.sqlite')))throw Error('existing_license_data_required');
  const authority=new LicenseAuthority(home);
  const {server}=createAdminServer(authority,{trustProxy:true,healthChecks:[
    {name:'Cấp phép',url:'http://tdh-relay-license:8081/healthz'},
    {name:'Bộ cài',url:'http://tdh-relay-distribution:8080/healthz'}]});
  server.listen(8082,'0.0.0.0');
  const stop=()=>server.close(()=>{authority.close();process.exit(0);});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
