import crypto from 'node:crypto';
import https from 'node:https';
import { Readable } from 'node:stream';
import {rejectionShape} from './diagnostics.mjs';

export class RelayError extends Error {
  constructor(status, code, message = code) { super(message); this.status = status; this.code = code; }
}
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const opaque = () => crypto.randomBytes(32).toString('base64url');
export function requiredString(value, field, max = 8192) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\r\n\0]/.test(value))
    throw new RelayError(400, 'invalid_' + field);
  return value;
}
export function encrypt(key, value, context) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(key, value, context) {
  const b = Buffer.from(value, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString());
}

// Exact scheme, hostname, port and path; credentials never follow redirects.
const destinations = new Map([
  ['https://api.openai.com', new Set(['/v1/responses', '/v1/responses/compact', '/v1/models'])],
  ['https://auth.openai.com', new Set(['/api/accounts/oauth/token', '/oauth/token', '/.well-known/jwks.json'])],
  ['https://chatgpt.com', new Set(['/backend-api/codex/responses', '/backend-api/codex/responses/compact', '/backend-api/codex/models'])],
]);
export function assertDestination(value) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.protocol !== 'https:' ||
      (url.port && url.port !== '443') || !destinations.get(url.origin)?.has(url.pathname))
    throw new RelayError(502, 'outbound_destination_denied');
  if (url.search && !(url.pathname === '/backend-api/codex/models' &&
      [...url.searchParams.keys()].every(k => k === 'client_version')))
    throw new RelayError(502, 'outbound_query_denied');
  return url;
}
export const outboundManifest = () => [...destinations].map(([origin, paths]) => ({ origin, paths: [...paths] }));

// Không kế thừa globalAgent hoặc proxy môi trường của tiến trình Node.
const directAgent = new https.Agent({keepAlive: true, proxyEnv: {}, rejectUnauthorized: true});

export async function directRequest(value, options = {}) {
  const url = assertDestination(value);
  const signal = options.signal;
  if (signal?.aborted) throw signal.reason;
  const body=options.body===undefined||options.body===null?null:Buffer.from(options.body);
  const wireHeaders=new Headers(options.headers);
  wireHeaders.set('host',url.host);
  wireHeaders.delete('proxy-authorization');
  wireHeaders.delete('proxy-connection');
  if(body)wireHeaders.set('content-length',String(body.length));
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method ?? 'GET', headers: Object.fromEntries(wireHeaders.entries()),
      agent: directAgent, rejectUnauthorized: true, signal,
    }, response => {
      clearTimeout(timer);
      const headers = new Headers();
      for (const [key, v] of Object.entries(response.headers))
        if (v !== undefined) headers.set(key, Array.isArray(v) ? v.join(', ') : String(v));
      if([204,205,304].includes(response.statusCode)){response.resume();resolve(new Response(null,{status:response.statusCode,headers}));}
      else resolve(new Response(Readable.toWeb(response), {status: response.statusCode, headers}));
    });
    const timer = setTimeout(() => request.destroy(new RelayError(504, 'upstream_header_timeout')), 30000);
    request.on('error', error => {clearTimeout(timer); reject(error);});
    if (body) request.write(body);
    request.end();
  });
}

export async function boundedJson(response, max = 2 * 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw new RelayError(502, 'empty_upstream_body');
  let total = 0; const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      total += value.length;
      if (total > max) throw new RelayError(502, 'upstream_body_too_large');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally {reader.releaseLock();}
}

export async function upstreamRejection(response) {
  const error=new RelayError(response.status>=400&&response.status<500?response.status:502,'upstream_request_rejected');
  error.upstream_status=response.status;
  const media=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
  if(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(media))error.upstream_media_type=media;
  const reader=response.body?.getReader();let timer;
  if(!reader)return error;
  try {
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('error_body_timeout')),5000);
    });
    let bytes=0;const chunks=[];
    for(;;) {
      const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;
      bytes+=value.length;if(bytes>16384)throw new Error('error_body_too_large');chunks.push(Buffer.from(value));
    }
    const data=JSON.parse(Buffer.concat(chunks).toString());
    error.diagnostic=rejectionShape(data);
    error.upstream_body_kind=data?.error?'error':data?.object==='response'?'response':'other_json';
    if(['completed','failed','incomplete','in_progress','queued'].includes(data?.status))error.upstream_response_status=data.status;
    // Keep only structured identifiers. Upstream messages may echo prompts or credentials.
    const details=data?.error;
    if(typeof details?.code==='string'&&/^[a-z][a-z0-9_]{0,99}$/.test(details.code))error.upstream_code=details.code;
    if(typeof details?.param==='string'&&/^[a-z][a-z0-9_.\[\]]{0,99}$/.test(details.param))error.param=details.param;
  }catch{}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
  return error;
}

export function validateIdToken(token, jwks, {clientId, nonce, subject, now = Date.now()}) {
  const parts = requiredString(token, 'id_token', 32768).split('.');
  if (parts.length !== 3) throw new RelayError(400, 'invalid_id_token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (header.alg !== 'RS256' || !header.kid) throw new RelayError(400, 'id_token_algorithm_denied');
  const key = jwks.keys?.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
  if (!key || !crypto.verify('RSA-SHA256', Buffer.from(parts[0]+'.'+parts[1]),
      crypto.createPublicKey({key, format: 'jwk'}), Buffer.from(parts[2], 'base64url')))
    throw new RelayError(400, 'id_token_signature_invalid');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== 'https://auth.openai.com' || !audience.includes(clientId) ||
      (audience.length > 1 && claims.azp !== clientId) || !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= now || (claims.nbf && claims.nbf * 1000 > now + 30000) ||
      (nonce && claims.nonce !== nonce) || !claims.sub || (subject && claims.sub !== subject))
    throw new RelayError(400, 'id_token_claims_invalid');
  return claims;
}
