import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function dpapi(action,value){
  try{
    return execFileSync(path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./device.ps1',import.meta.url))],
      {input:JSON.stringify({action,value}),encoding:'utf8',windowsHide:true,timeout:15000,stdio:['pipe','pipe','pipe']}).trim();
  }catch{throw Error('credential_protection_failed');}
}
export class CredentialStore {
  constructor(home){this.file=path.join(home,'credentials.json');this.cached=null;}
  load(){
    if(!fs.existsSync(this.file)){this.cached=null;throw Error('login_required');}
    if(fs.lstatSync(this.file).isSymbolicLink())throw Error('credential_symlink_denied');
    const text=fs.readFileSync(this.file,'utf8');
    if(text.length>32768)throw Error('credentials_invalid');
    if(this.cached?.text===text)return {...this.cached.value};
    let saved;try{saved=JSON.parse(text);}catch{throw Error('credentials_invalid');}
    if(saved.version!==1||!['dpapi','owner-permissions'].includes(saved.format)||typeof saved.key!=='string'||typeof saved.server!=='string')throw Error('credentials_invalid');
    if(process.platform==='win32'&&saved.format!=='dpapi')throw Error('credential_protection_required');
    const key=saved.format==='dpapi'?Buffer.from(dpapi('unprotect',saved.key),'base64').toString('utf8'):saved.key;
    const value={server:saved.server,key};this.cached={text,value};return {...value};
  }
  save({server,key}){
    const home=path.dirname(this.file);fs.mkdirSync(home,{recursive:true,mode:0o700});
    if(fs.existsSync(this.file)&&fs.lstatSync(this.file).isSymbolicLink())throw Error('credential_symlink_denied');
    const format=process.platform==='win32'?'dpapi':'owner-permissions';
    const encrypted=format==='dpapi'?dpapi('protect',Buffer.from(key).toString('base64')):key;
    const temporary=this.file+'.'+crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(temporary,JSON.stringify({version:1,server,format,key:encrypted})+'\n',{mode:0o600,flag:'wx'});
    try{fs.renameSync(temporary,this.file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    this.cached=null;
  }
  clear(){fs.rmSync(this.file,{force:true});this.cached=null;}
  device(){
    if(this.deviceCache)return this.deviceCache;
    const file=path.join(path.dirname(this.file),'device-identity.json');
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    if(!fs.existsSync(file)){
      const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
      const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
      const format=process.platform==='win32'?'dpapi':'owner-permissions';
      fs.writeFileSync(file,JSON.stringify({fingerprint:crypto.randomUUID(),publicKey:publicKey.export({type:'spki',format:'pem'}).toString(),format,privateKey:format==='dpapi'?dpapi('protect',Buffer.from(privatePem).toString('base64')):privatePem}),{flag:'wx',mode:0o600});
    }
    if(fs.lstatSync(file).isSymbolicLink())throw Error('credential_symlink_denied');
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    if(process.platform==='win32'&&value.format!=='dpapi')throw Error('credential_protection_required');
    const pem=value.format==='dpapi'?Buffer.from(dpapi('unprotect',value.privateKey),'base64').toString():value.privateKey;
    this.deviceCache={fingerprint:value.fingerprint,publicKey:value.publicKey,sign:text=>crypto.sign(null,Buffer.from(text),pem).toString('base64url')};
    return this.deviceCache;
  }
}
