import crypto from 'node:crypto';

export const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const publicText=key=>crypto.createPublicKey(key).export({type:'spki',format:'der'}).toString('base64url');
export function readPublic(text){
  if(typeof text!=='string'||text.length>150)throw Error('invalid_device_key');
  const key=crypto.createPublicKey({key:Buffer.from(text,'base64url'),type:'spki',format:'der'});
  if(key.asymmetricKeyType!=='ed25519')throw Error('invalid_device_key');
  return key;
}
export function signEnvelope(value,privateKey){
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return {payload,signature:crypto.sign(null,Buffer.from(payload),privateKey).toString('base64url')};
}
export function verifyEnvelope(envelope,publicKey){
  if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>100000||
    typeof envelope.signature!=='string'||!crypto.verify(null,Buffer.from(envelope.payload),readPublic(publicKey),Buffer.from(envelope.signature,'base64url')))throw Error('signature_invalid');
  return JSON.parse(Buffer.from(envelope.payload,'base64url'));
}
export function proofText(action,nonce,deviceId,publicKey){
  return Buffer.from(JSON.stringify(['tdh-relay-license-v1',action,nonce,deviceId,publicKey]));
}
export function signProof(action,nonce,deviceId,publicKey,privateKey){
  return crypto.sign(null,proofText(action,nonce,deviceId,publicKey),privateKey).toString('base64url');
}
export function verifyProof(action,nonce,deviceId,publicKey,signature){
  try{return crypto.verify(null,proofText(action,nonce,deviceId,publicKey),readPublic(publicKey),Buffer.from(signature,'base64url'));}catch{return false;}
}
