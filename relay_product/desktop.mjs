import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {gunzip,brotliDecompress,inflate,zstdDecompress} from 'node:zlib';
import {RelayError,directRequest,boundedJson,upstreamRejection} from '../self_relay/security.mjs';
import {toResponses,SseDecoder,ResponseAccumulator} from '../self_relay/protocol.mjs';
import {preparePolicyRequest,wrapPolicyResponse} from '../self_relay/policy-runtime.mjs';
import {VERSION,PRODUCT} from './state.mjs';

const BASE='https://chatgpt.com/backend-api/codex';
const REQUEST_HEADERS=['chatgpt-account-id','session_id','session-id','conversation_id','originator','user-agent',
  'version','openai-beta','x-codex-beta-features','x-codex-parent-thread-id','x-codex-turn-metadata'];
function json(res,status,value,headers={}){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(value));}
function bodyTooLarge(limit,compressed=false){
  const error=new RelayError(413,compressed?'decompressed_request_too_large':'request_too_large',
    'Local relay request limit is '+limit+' bytes'+(compressed?' after decompression':'')+'. Reduce conversation or attachment size.');
  error.bodyLimit=limit;return error;
}
async function readBody(req,limit){
  if(Number(req.headers['content-length']??0)>limit)throw bodyTooLarge(limit);
  let count=0;const chunks=[];
  for await(const chunk of req){count+=chunk.length;if(count>limit)throw bodyTooLarge(limit);chunks.push(chunk);}
  let bytes=Buffer.concat(chunks);
  const encoding=String(req.headers['content-encoding']??'identity').toLowerCase();
  const codecs={gzip:gunzip,br:brotliDecompress,deflate:inflate,zstd:zstdDecompress};
  if(encoding!=='identity'){
    if(!codecs[encoding])throw new RelayError(415,'unsupported_content_encoding');
    try{bytes=await promisify(codecs[encoding])(bytes,{maxOutputLength:limit});}
    catch(error){
      if(error.code==='ERR_BUFFER_TOO_LARGE')throw bodyTooLarge(limit,true);
      throw new RelayError(400,'compressed_request_rejected');
    }
  }
  if(bytes.length>limit)throw bodyTooLarge(limit,encoding!=='identity');
  try{return JSON.parse(bytes.toString('utf8'));}catch{throw new RelayError(400,'invalid_json');}
}
export function borrowedHeaders(inbound){
  const auth=inbound.get('authorization')??'';
  if(!/^Bearer [^\s]{16,32768}$/.test(auth)||auth.startsWith('Bearer sk-'))throw new RelayError(401,'chatgpt_sign_in_required');
  const headers=new Headers({'authorization':auth,'content-type':'application/json','accept':'text/event-stream'});
  for(const name of REQUEST_HEADERS){const value=inbound.get(name);if(value&&value.length<=4096)headers.set(name,value);}
  if(!headers.has('chatgpt-account-id')){
    // Chỉ lấy gợi ý routing; OpenAI xác thực token và quyền tài khoản ở upstream.
    try{
      const token=auth.slice(7).split('.'),claims=JSON.parse(Buffer.from(token[1],'base64url'));
      const account=claims['https://api.openai.com/auth']?.chatgpt_account_id;
      if(typeof account==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(account))headers.set('chatgpt-account-id',account);
    }catch{}
  }
  return headers;
}
function responseHeaders(upstream,capture){
  const headers={'cache-control':'no-store','x-accel-buffering':'no','x-tdh-relay-version':VERSION,
    'x-relay-policy-mode':capture.identity.mode,'x-relay-policy-revision':capture.identity.revision??''};
  for(const [key,value]of upstream.headers)if(/^(x-codex-(?:primary|secondary|plan|credits)|retry-after|openai-model)/i.test(key))headers[key]=value;
  return headers;
}
async function write(res,value,signal){
  if(signal.aborted)throw new RelayError(499,'client_cancelled');
  if(!res.write(value))await once(res,'drain',{signal});
}
export function createDesktopServer(state,{transport=directRequest,onStop=()=>{},license,identity}={}){
  let active=0;
  const server=http.createServer(async(req,res)=>{
    const controller=new AbortController(),signal=controller.signal;
    req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableFinished)controller.abort();});
    const started=Date.now();let reader,attempts=0,model=null,capture,status=500,observer,counted=false,bodyStarted=false,stopWatching;
    try{
      const port=server.address().port;
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))throw new RelayError(403,'invalid_host');
      if(req.headers.origin)throw new RelayError(403,'browser_origin_denied');
      const url=new URL(req.url,'http://127.0.0.1:'+port);
      if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{ok:true,service:PRODUCT,version:VERSION,mode:'desktop',...identity,limits:{requestBodyBytes:state.settings.get('relay.max_body_bytes')},policy:state.policies.snapshot()});
      if(req.method==='POST'&&url.pathname==='/control/stop'){
        const supplied=Buffer.from(String(req.headers['x-tdh-control']??'')),expected=Buffer.from(state.get('control_token')??'');
        if(!expected.length||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))throw new RelayError(403,'control_denied');
        json(res,200,{ok:true});setImmediate(onStop);return;
      }
      const route=url.pathname.replace(/^\/v1(?=\/)/,'');
      if(!((req.method==='GET'&&route==='/models')||(req.method==='POST'&&['/responses','/responses/compact'].includes(route))))throw new RelayError(404,'route_not_found');
      const inbound=new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string'));
      const headers=borrowedHeaders(inbound);
      if(license)await license.ensure('desktop');
      if(license?.watch)stopWatching=license.watch(controller);
      if(active>=state.settings.get('relay.max_concurrency'))throw new RelayError(429,'too_many_requests');
      active++;counted=true;
      if(route==='/models'){
        const version=url.searchParams.get('client_version')??'0.155.1';
        if(!/^[A-Za-z0-9._-]{1,80}$/.test(version))throw new RelayError(400,'invalid_client_version');
        const response=await transport(BASE+'/models?client_version='+encodeURIComponent(version),{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
        if(!response.ok)throw await upstreamRejection(response);
        const data=await boundedJson(response);status=200;
        return json(res,200,{...data,object:'list',data:data.data??(data.models??[]).map(m=>({id:m.slug??m.id,object:'model',owned_by:'openai'}))});
      }
      if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new RelayError(415,'json_content_type_required');
      bodyStarted=true;
      const original=toResponses(await readBody(req,state.settings.get('relay.max_body_bytes')),false);
      model=original.model;
      const compact=route==='/responses/compact';
      const compacting=compact||(Array.isArray(original.input)&&original.input.some(x=>x?.type==='compaction_trigger'));
      let body=structuredClone(original);
      if(!compact){
        body.store=false;body.stream=true;body.instructions??='';
        if(typeof body.input==='string')body.input=[{role:'user',content:body.input}];
        if(Array.isArray(body.input))body.input=body.input.map(x=>x?.role==='system'?{...x,role:'developer'}:x);
      }
      capture=state.policies.capture();
      const prepared=preparePolicyRequest(body,capture,{adapter:'codex',compacting});body=prepared.body;
      // Turn-state cũ không áp dụng cho stream đã được policy thay đổi.
      if(!prepared.applied&&inbound.has('x-codex-turn-state'))headers.set('x-codex-turn-state',inbound.get('x-codex-turn-state'));
      const segment=async(text,segmentSignal)=>{
        // A request may cross expiry while its body is uploaded or during a continuation.
        if(license?.beforeSegment)await license.beforeSegment();
        if(signal.aborted)throw signal.reason;
        attempts++;
        const timeout=new AbortController();
        const timer=setTimeout(()=>timeout.abort(new RelayError(504,'upstream_headers_timeout')),prepared.state?.policy.limits.upstreamHdrMs??45000);
        try{return await transport(BASE+route,{method:'POST',headers,body:text,signal:AbortSignal.any([signal,segmentSignal??signal,timeout.signal])});}
        finally{clearTimeout(timer);}
      };
      let upstream=await segment(JSON.stringify(body),signal);
      const outgoing=responseHeaders(upstream,capture);
      if(!upstream.ok){status=upstream.status;throw await upstreamRejection(upstream);}
      if(compact){const data=await boundedJson(upstream);status=200;return json(res,200,data,outgoing);}
      const media=(upstream.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
      if(media&&media!=='text/event-stream'){
        await upstream.body?.cancel();throw new RelayError(502,'upstream_sse_required');
      }
      if(prepared.applied){
        const wrapped=wrapPolicyResponse(upstream,prepared.state,{signal,started,fetchSegment:segment});
        upstream=wrapped.response;observer=wrapped.observer;
      }
      reader=upstream.body.getReader();
      const streaming=original.stream!==false,decoder=new SseDecoder(),accumulator=new ResponseAccumulator();
      let terminal=null;
      if(streaming)res.writeHead(200,{'content-type':'text/event-stream',...outgoing});
      for(;;){
        const {value,done}=await reader.read();
        for(const event of decoder.push(value,done)){
          accumulator.handle(event);
          if(['response.completed','response.incomplete','response.failed'].includes(event.type))terminal=accumulator.complete(event.json.response);
        }
        if(value&&streaming)await write(res,value,signal);
        if(done||terminal)break;
      }
      if(!terminal)throw new RelayError(502,'upstream_stream_incomplete');
      status=terminal.status==='failed'?502:200;
      if(streaming)res.end();
      else json(res,200,terminal,outgoing);
    }catch(error){
      status=error instanceof RelayError?error.status:signal.aborted?499:502;
      if(res.headersSent)res.destroy();
      else if(status!==499)json(res,status,{error:{code:error instanceof RelayError?error.code:'relay_request_failed',
        message:error.bodyLimit?error.message:error instanceof RelayError?error.code:'Relay request failed.',
        ...(error.bodyLimit?{max_body_bytes:error.bodyLimit}:{})}});
      else res.destroy();
    }finally{
      stopWatching?.();
      controller.abort();
      if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
      if(counted)active--;
      if(model||bodyStarted)state.record({model,status,duration:Date.now()-started,attempts,revision:capture?.identity.revision,usage:observer?.usage()});
    }
  });
  server.on('upgrade',(req,socket)=>{socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
  server.headersTimeout=15000;server.requestTimeout=30000;server.keepAliveTimeout=5000;
  return server;
}
