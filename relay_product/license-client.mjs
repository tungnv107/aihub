import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {LICENSE_PUBLIC_KEY,LICENSE_ORIGIN} from './license-config.mjs';
import {hash,publicText,signProof,verifyEnvelope} from './license-protocol.mjs';
import {RelayError} from '../self_relay/security.mjs';

function windowsDevice(action,value){
  const executable=path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  try{return execFileSync(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./device.ps1',import.meta.url))],
    {input:JSON.stringify({action,value}),encoding:'utf8',windowsHide:true,timeout:15000,stdio:['pipe','pipe','pipe']}).trim();}
  catch{throw Error('device_protection_failed');}
}
export function machineIdentity(){
  let value;
  if(process.platform==='win32')value=windowsDevice('identity');
  else if(process.platform==='darwin'){
    const text=execFileSync('/usr/sbin/ioreg',['-rd1','-c','IOPlatformExpertDevice'],{encoding:'utf8',timeout:10000});
    value=text.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1];
  }else{
    const file=fs.existsSync('/run/tdh-machine-id')?'/run/tdh-machine-id':'/etc/machine-id';
    value=fs.readFileSync(file,'utf8').trim();
  }
  if(!value||value.length<16)throw Error('stable_machine_identity_required');
  return hash('tdh-relay-device-v1:'+process.platform+':'+value.trim().toLowerCase());
}
export function loadDevice(state){
  const deviceId=machineIdentity();let saved=state.get('license.device');
  if(!saved){
    const pair=crypto.generateKeyPairSync('ed25519');
    const raw=pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');
    saved={deviceId,publicKey:publicText(pair.privateKey),format:process.platform==='win32'?'dpapi':'owner-permissions',
      privateKey:process.platform==='win32'?windowsDevice('protect',raw):raw};
    state.set('license.device',saved);
  }
  if(saved.deviceId!==deviceId)throw Error('activation_belongs_to_another_device');
  const raw=saved.format==='dpapi'?windowsDevice('unprotect',saved.privateKey):saved.privateKey;
  const privateKey=crypto.createPrivateKey({key:Buffer.from(raw,'base64'),format:'der',type:'pkcs8'});
  if(publicText(privateKey)!==saved.publicKey)throw Error('device_key_mismatch');
  return {deviceId,publicKey:saved.publicKey,privateKey};
}
async function requestLicense(route,body){
  let response;
  try{response=await fetch(LICENSE_ORIGIN+'/api/licenses/'+route,{method:'POST',redirect:'error',
    headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
  catch{throw Error('license_server_unavailable');}
  const text=await response.text();
  if(text.length>16384)throw Error('license_response_invalid');
  let data;try{data=JSON.parse(text);}catch{throw Error('license_server_unavailable');}
  if(!response.ok)throw Error(typeof data.error==='string'&&/^[a-z_]+$/.test(data.error)?data.error:'license_request_rejected');
  return data;
}
export class LicenseClient {
  constructor(state,{publicKey=LICENSE_PUBLIC_KEY,request=requestLicense,device,now=Date.now}={}){
    this.state=state;this.publicKey=publicKey;this.request=request;this.device=device??loadDevice(state);this.now=now;this.pending=null;this.nextAttempt=0;
    this.wallStart=now();this.monotonicStart=performance.now();
  }
  check(envelope=this.state.get('license.lease'),feature='desktop'){
    let claims;try{claims=verifyEnvelope(envelope,this.publicKey);}catch{throw Error('license_signature_invalid');}
    const now=this.now(),last=this.state.get('license.clock')??0;
    if(now<last-30000||now<this.wallStart+performance.now()-this.monotonicStart-30000)throw Error('clock_rollback_detected');
    if(claims.kind!=='tdh-relay-lease-v1'||claims.product!=='tdh-relay'||claims.deviceId!==this.device.deviceId||
      claims.keyHash!==hash(this.device.publicKey)||!claims.features?.includes(feature)||
      !Number.isFinite(claims.issuedAt)||!Number.isFinite(claims.expiresAt)||claims.issuedAt>now+60000||
      claims.expiresAt<=now||claims.expiresAt>claims.issuedAt+600000||claims.expiresAt>claims.licenseExpiresAt)throw Error('license_invalid_or_expired');
    if(now>last+10000)this.state.set('license.clock',now);
    return claims;
  }
  async proof(action){
    const challenge=await this.request('challenge',{deviceId:this.device.deviceId,publicKey:this.device.publicKey});
    if(typeof challenge.id!=='string'||typeof challenge.nonce!=='string'||challenge.nonce.length>100)throw Error('challenge_invalid');
    return {challengeId:challenge.id,proof:signProof(action,challenge.nonce,this.device.deviceId,this.device.publicKey,this.device.privateKey)};
  }
  save(response){
    const claims=this.check(response.lease);
    this.state.set('license.lease',response.lease);this.state.set('license.activation',claims.activationId);
    this.state.set('license.denied',false);this.nextAttempt=0;return claims;
  }
  async activate(key){
    if(typeof key!=='string'||!/^TDH-[A-Za-z0-9_-]{32}$/.test(key.trim()))throw Error('invalid_activation_key');
    key=key.trim();const proof=await this.proof('activate:'+hash(key));
    return this.save(await this.request('activate',{...proof,key}));
  }
  async renew(){
    if(this.pending)return this.pending;
    const activationId=this.state.get('license.activation');if(!activationId)throw Error('activation_required');
    this.pending=(async()=>{
      try{
        const proof=await this.proof('renew:'+activationId);
        return this.save(await this.request('renew',{...proof,activationId}));
      }catch(error){
        if(['license_invalid_or_expired','device_revoked','activation_invalid','device_already_bound_or_revoked'].includes(error.message)){
          this.state.set('license.denied',true);this.state.set('license.lease',null);
        }
        this.nextAttempt=this.now()+30000;throw error;
      }finally{this.pending=null;}
    })();
    return this.pending;
  }
  async ensure(feature='desktop',{online=false}={}){
    let current;try{if(!this.state.get('license.denied'))current=this.check(undefined,feature);}catch{}
    if(online||!current||current.expiresAt-this.now()<300000){
      if(online||this.now()>=this.nextAttempt){
        try{await this.renew();}
        catch(error){if(!current||this.state.get('license.denied')||online)throw new RelayError(403,error.message);}
      }
    }
    if(this.state.get('license.denied'))throw new RelayError(403,'license_revoked');
    try{return this.check(undefined,feature);}catch(error){throw new RelayError(403,error.message);}
  }
  status(){
    try{const c=this.check();return {active:!this.state.get('license.denied'),licenseId:c.licenseId,activationId:c.activationId,
      leaseUntil:new Date(c.expiresAt).toISOString(),expiresAt:new Date(c.licenseExpiresAt).toISOString()};}
    catch{return {active:false,activationRequired:!this.state.get('license.activation')};}
  }
}
