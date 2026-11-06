import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),command=args.shift()??'status';
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const home=path.resolve(option('--home','proxy-data'));
const base=new URL(option('--base-url','http://127.0.0.1:18320'));
if(!['127.0.0.1','localhost','self-relay','tdh-relay'].includes(base.hostname)||base.protocol!=='http:'||base.username||base.password)throw Error('local_admin_endpoint_required');
const env=Object.fromEntries(fs.readFileSync(path.join(home,'secrets.env'),'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
async function request(route,body){
  const response=await fetch(new URL(route,base),{method:body?'POST':'GET',headers:{authorization:'Bearer '+env.RELAY_ADMIN_KEY,'content-type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error?.code??'admin_request_failed');
  return result;
}
try{
  if(command==='key')console.log(env.RELAY_API_KEY);
  else if(command==='status')console.log(JSON.stringify({accounts:await request('/admin/accounts'),policy:await request('/admin/policies')},null,2));
  else if(command==='import-codex'){
    if(!args.includes('--exclusive-refresh-owner'))throw Error('exclusive_refresh_owner_flag_required');
    const file=option('--file');if(!file)throw Error('auth_file_required');
    const auth=JSON.parse(fs.readFileSync(path.resolve(file),'utf8')),tokens=auth.tokens;
    if(!tokens?.access_token||!tokens.refresh_token)throw Error('chatgpt_auth_file_required');
    const claims=JSON.parse(Buffer.from(tokens.access_token.split('.')[1],'base64url'));
    let idClaims={};try{idClaims=JSON.parse(Buffer.from(tokens.id_token.split('.')[1],'base64url'));}catch{}
    const audience=typeof idClaims.aud==='string'?idClaims.aud:Array.isArray(idClaims.aud)&&idClaims.aud.length===1?idClaims.aud[0]:null;
    const clientId=option('--client-id',tokens.client_id??claims.client_id??claims.azp??audience);
    if(!clientId||!/^[A-Za-z0-9_-]{4,200}$/.test(clientId)||!Number.isFinite(claims.exp))throw Error('token_client_or_expiry_missing_use_client_id');
    const result=await request('/admin/accounts/import',{adapter:'codex',label:option('--label','Dedicated ChatGPT account'),exclusive_refresh_owner:true,
      tokens:{...tokens,client_id:clientId,expires_at:claims.exp*1000,account_id:tokens.account_id??claims['https://api.openai.com/auth']?.chatgpt_account_id}});
    console.log(JSON.stringify(result,null,2));
  }else throw Error('use_status_key_or_import_codex');
}catch(error){console.error(JSON.stringify({error:/^[a-z0-9_]+$/.test(error.message)?error.message:'operation_failed'}));process.exitCode=1;}
