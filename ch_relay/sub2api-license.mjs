import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {RelayError,boundedJson} from '../self_relay/security.mjs';
import {PINNED_SERVER} from './settings.mjs';

export const LICENSE_PATH='/v1/ch-relay/license';
export const RECHECK_MS=30000;
const fail=(status,code)=>new RelayError(status,code);
export function normalizeServer(value){
  let url;try{url=new URL(value);}catch{throw fail(400,'sub2api_server_invalid');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.hash||url.search||!['http:','https:'].includes(url.protocol)||url.protocol==='http:'&&!local)
    throw fail(400,'sub2api_https_required');
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*\/?$/.test(url.pathname))throw fail(400,'sub2api_server_invalid');
  url.pathname=url.pathname.replace(/\/$/,'').replace(/\/v1$/,'');
  return url.toString().replace(/\/$/,'');
}
export function validateKey(key){
  if(typeof key!=='string'||key.length<16||key.length>4096||/[^\x21-\x7E]/.test(key))throw fail(400,'api_key_invalid');
  return key;
}
export class Sub2ApiLicense {
  constructor({credentials,fetchImpl=fetch,monotonic=()=>performance.now(),pinnedServer=PINNED_SERVER,timeoutMs=10000,recheckMs=RECHECK_MS}){
    this.credentials=credentials;this.fetch=fetchImpl;this.clock=monotonic;this.pinnedServer=pinnedServer?normalizeServer(pinnedServer):'';
    this.timeoutMs=timeoutMs;this.recheckMs=recheckMs;this.current=null;this.pending=null;this.listeners=new Set();
  }
  async validate({server,key}){
    server=normalizeServer(server);validateKey(key);
    if(this.pinnedServer&&server!==this.pinnedServer)throw fail(403,'sub2api_server_not_allowed');
    const started=this.clock();let response,data;
    try{
      response=await this.fetch(server+LICENSE_PATH,{method:'GET',redirect:'error',cache:'no-store',
        headers:{authorization:'Bearer '+key,accept:'application/json'},signal:AbortSignal.timeout(this.timeoutMs)});
      data=await boundedJson(response,16384);
    }catch{throw fail(503,'sub2api_unavailable');}
    if(!response.ok&&String(data?.error?.code??'').toLowerCase()==='device_activation_required'&&this.credentials.device){
      ({response,data}=await this.deviceRequest(server,key));
    }
    if(response.status===404)throw fail(503,'sub2api_license_endpoint_missing');
    if(!response.ok){
      const code=String(data?.error?.code??data?.code??'').toLowerCase();
      const known=new Set(['api_key_expired','api_key_disabled','invalid_api_key','user_inactive','access_denied','license_expiry_required','license_disabled','device_limit_reached','device_change_cooldown','device_signature_invalid','device_activation_required','device_key_mismatch']);
      throw fail(response.status===429?429:response.status>=500?503:403,known.has(code)?code:'sub2api_access_denied');
    }
    const serverTime=Date.parse(data?.server_time),expires=Date.parse(data?.expires_at);
    if(data?.schema!=='ch-relay-license-v1'||data.active!==true||data.feature!=='ch-relay'||
      !Number.isFinite(serverTime)||!Number.isFinite(expires)||!Number.isSafeInteger(data.key_id)||data.key_id<1)
      throw fail(403,'sub2api_license_invalid');
    // The server's clock is authoritative. Starting the countdown before the request is conservative.
    const deadline=started+expires-serverTime;
    if(deadline<=this.clock())throw fail(403,'api_key_expired');
    return {server,keyId:data.key_id,expiresAt:new Date(expires).toISOString(),serverTime:new Date(serverTime).toISOString(),deadline};
  }
  async deviceRequest(server,key){
    const identity=this.credentials.device();
    const request=async(path,body)=>{
      try{const response=await this.fetch(server+'/api/v1/license/'+path,{method:'POST',redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(this.timeoutMs)});return {response,data:await boundedJson(response,16384)};}catch{throw fail(503,'sub2api_unavailable');}
    };
    const perform=async action=>{const challenge=await request('challenge',{});if(!challenge.response.ok)return challenge;const nonce=challenge.data.nonce;if(!/^[a-f0-9]{64}$/.test(nonce))throw fail(403,'sub2api_license_invalid');return request(action,{fingerprint:identity.fingerprint,publicKey:identity.publicKey,name:os.hostname().slice(0,80),os:process.platform,nonce,signature:identity.sign(`aihub-device-v1\n${action}\n${nonce}\n${identity.fingerprint}`)});};
    const checked=await perform('validate');
    if(!checked.response.ok&&checked.data?.error?.code==='device_activation_required')return perform('activate');
    return checked;
  }
  async ensure(){
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      try{
        const claims=await this.validate(this.credentials.load());
        this.current=claims;for(const listener of this.listeners)listener(null,claims);return claims;
      }catch(error){
        this.current=null;
        const safe=error instanceof RelayError?error:fail(403,/^[a-z_]+$/.test(error.message)?error.message:'login_required');
        for(const listener of this.listeners)listener(safe);throw safe;
      }
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
  beforeSegment(){return this.ensure();}
  watch(controller){
    let expiryTimer,checkTimer,stopped=false;
    const stop=()=>{stopped=true;clearTimeout(expiryTimer);clearTimeout(checkTimer);this.listeners.delete(changed);controller.signal.removeEventListener('abort',stop);};
    const changed=(error,claims)=>{
      clearTimeout(expiryTimer);
      if(error){controller.abort(error);return;}
      const arm=()=>{
        if(stopped)return;
        const remaining=claims.deadline-this.clock();
        if(remaining<=0){controller.abort(fail(403,'api_key_expired'));return;}
        expiryTimer=setTimeout(arm,Math.min(remaining,2147483647));expiryTimer.unref?.();
      };arm();
    };
    const check=async()=>{
      if(stopped)return;
      try{await this.ensure();}catch(error){controller.abort(error);}
      if(!stopped){checkTimer=setTimeout(check,this.recheckMs);checkTimer.unref?.();}
    };
    this.listeners.add(changed);controller.signal.addEventListener('abort',stop,{once:true});
    if(controller.signal.aborted)stop();
    else if(!this.current)controller.abort(fail(403,'login_required'));
    else{
      changed(null,this.current);
      if(!stopped){checkTimer=setTimeout(check,this.recheckMs);checkTimer.unref?.();}
    }
    return stop;
  }
  status(){
    if(!this.current||this.current.deadline<=this.clock())return {active:false};
    const {server,keyId,expiresAt,serverTime}=this.current;
    return {active:true,server,keyId,expiresAt,serverTime};
  }
}
