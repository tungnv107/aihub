import fs from 'node:fs';
import path from 'node:path';
import {normalizeServer} from '../ch_relay/sub2api-license.mjs';

export function localEnvironment(){
  const file=path.resolve(import.meta.dirname,'../deploy/sub2api/.env');
  return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
}
export async function adminClient(){
  const env=localEnvironment(),server=normalizeServer(process.env.SUB2API_SERVER??'http://127.0.0.1:'+(env.SUB2API_PORT??18080));
  let token=process.env.SUB2API_ADMIN_TOKEN;
  async function request(route,{method='GET',body,access=token}={}){
    const response=await fetch(server+route,{method,redirect:'error',headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(access?{authorization:'Bearer '+access}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok){const error=Error('sub2api_admin_http_'+response.status);error.status=response.status;error.code=data.code??data.error?.code;throw error;}
    return data.data??data;
  }
  if(!token){
    if(process.env.SUB2API_SERVER)throw Error('Set SUB2API_ADMIN_TOKEN for remote administration; local admin password is never sent to another server');
    const result=await request('/api/v1/auth/login',{method:'POST',body:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD},access:null});
    if(!result.access_token)throw Error('admin_login_requires_interactive_auth');token=result.access_token;
  }
  return {server,request};
}
