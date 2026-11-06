import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './store.mjs';
import {Relay} from './core.mjs';
import {RelayError,requiredString,outboundManifest} from './security.mjs';

async function readBody(request,limit){
  if(Number(request.headers['content-length']??0)>limit)throw new RelayError(413,'request_too_large');
  let size=0;const chunks=[];
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw new RelayError(413,'request_too_large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function json(response,status,data){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(data));}
function parseBody(raw){try{return JSON.parse(raw.toString());}catch{throw new RelayError(400,'invalid_json');}}
function apiHeaders(raw){const headers=new Headers();for(const [k,v] of Object.entries(raw))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v);return headers;}

export function createServer(relay){
  const store=relay.store;
  const server=http.createServer(async(req,res)=>{
    const abort=new AbortController();req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableFinished)abort.abort();});
    try {
      const port=server.address()?.port;
      if(![`127.0.0.1:${port}`,`localhost:${port}`,...store.settings.get('relay.extra_allowed_hosts')].includes(req.headers.host))throw new RelayError(403,'invalid_host');
      if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))throw new RelayError(403,'cross_origin_denied');
      const url=new URL(req.url,'http://127.0.0.1:'+port),headers=apiHeaders(req.headers);
      if(req.method==='GET'&&url.pathname==='/healthz')return json(res,200,{ok:true,service:'private-independent-relay'});
      if(req.method==='GET'&&url.pathname==='/auth/callback') {
        const account=await relay.oauth.complete(Object.fromEntries(url.searchParams));
        return json(res,200,{ok:true,account});
      }
      const authorization=headers.get('authorization')??'';
      if(!authorization.startsWith('Bearer '))throw new RelayError(401,'api_key_required');
      const admin=url.pathname.startsWith('/admin/'),caller=store.caller(authorization.slice(7),admin);
      if(req.method==='GET'&&url.pathname==='/v1/models')return json(res,200,await relay.models(caller,headers.get('x-relay-account-id')));
      if(admin){
        if(req.method==='GET'&&url.pathname==='/admin/accounts')return json(res,200,{accounts:store.list(caller.tenant).map(a=>store.publicAccount(a))});
        if(req.method==='GET'&&url.pathname==='/admin/usage')return json(res,200,{usage:store.recentUsage(caller.tenant)});
        if(req.method==='GET'&&url.pathname==='/admin/usage/summary')return json(res,200,store.usageSummary(caller.tenant));
        if(req.method==='GET'&&url.pathname==='/admin/policy')return json(res,200,store.localPolicy());
        if(url.pathname.startsWith('/admin/policies')&&caller.tenant!=='local')throw new RelayError(403,'local_admin_required');
        if(req.method==='GET'&&url.pathname==='/admin/policies')return json(res,200,store.policies.status());
        if(req.method==='GET'&&url.pathname==='/admin/settings')return json(res,200,{settings:store.settings.all(),outbound:outboundManifest()});
        if(req.method==='POST'){
          const body=parseBody(await readBody(req,store.settings.get('relay.max_body_bytes')));
          if(url.pathname==='/admin/accounts/import')return json(res,201,store.importAccount(body,caller.tenant));
          if(url.pathname==='/admin/callers')return json(res,201,store.addCaller({...body,tenant:caller.tenant,role:'caller'}));
          if(url.pathname==='/admin/settings') {
            if(body.key==='policy.state')throw new RelayError(400,'use_policy_revision_api');
            store.settings.set(body.key,body.value);return json(res,200,{ok:true});
          }
          if(url.pathname==='/admin/policies/import')return json(res,201,store.policies.import(body));
          if(url.pathname==='/admin/policies/select')return json(res,200,store.policies.select(body));
          if(url.pathname==='/admin/policies/rollback')return json(res,200,store.policies.rollback(body));
          if(url.pathname==='/admin/oauth/start')return json(res,200,relay.oauth.start(body,caller.tenant,port));
          if(url.pathname==='/admin/accounts/state'){
            const account=store.account(requiredString(body.id,'account_id',100));
            if(!account||account.tenant!==caller.tenant)throw new RelayError(404,'account_not_found');
            if(typeof body.enabled!=='boolean')throw new RelayError(400,'enabled_must_be_boolean');
            store.db.prepare('UPDATE accounts SET enabled=? WHERE id=?').run(body.enabled?1:0,account.id);
            if(!body.enabled)store.db.prepare('DELETE FROM affinity WHERE account_id=?').run(account.id);
            return json(res,200,store.publicAccount(store.account(account.id)));
          }
        }
        throw new RelayError(404,'route_not_found');
      }
      if(req.method!=='POST'||!['/v1/responses','/v1/responses/compact','/v1/chat/completions'].includes(url.pathname))throw new RelayError(404,'route_not_found');
      if(!headers.get('content-type')?.startsWith('application/json'))throw new RelayError(415,'json_content_type_required');
      const raw=await readBody(req,store.settings.get('relay.max_body_bytes'));
      const sink={
        start(status,type,extra){if(!res.headersSent)res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-accel-buffering':'no',...extra});},
        async write(bytes){
          if(abort.signal.aborted)throw new RelayError(499,'client_cancelled');
          if(!res.write(bytes))await new Promise((resolve,reject)=>{
            const cleanup=()=>{res.off('drain',drain);res.off('close',close);res.off('error',error);};
            const drain=()=>{cleanup();resolve();},close=()=>{cleanup();reject(new RelayError(499,'client_cancelled'));},error=()=>{cleanup();reject(new RelayError(502,'downstream_write_failed'));};
            res.once('drain',drain);res.once('close',close);res.once('error',error);
          });
        },
        async end(){await new Promise((resolve,reject)=>{
          const cleanup=()=>{res.off('finish',finish);res.off('close',close);res.off('error',error);};
          const finish=()=>{cleanup();resolve();},close=()=>{cleanup();reject(new RelayError(499,'client_cancelled'));},error=()=>{cleanup();reject(new RelayError(502,'downstream_write_failed'));};
          res.once('finish',finish);res.once('close',close);res.once('error',error);res.end();
        });},
      };
      await relay.infer({caller,headers,raw,route:url.pathname,signal:abort.signal,sink});
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      const code=error instanceof RelayError?error.code:'internal_error';
      const status=error instanceof RelayError?error.status:500;
      if(status===499){res.destroy();return;}
      const detailKeys=['param','upstream_code','upstream_status','upstream_media_type','upstream_body_kind','upstream_response_status'];
      const details=error instanceof RelayError?Object.fromEntries(detailKeys.filter(key=>error[key]!==undefined).map(key=>[key,error[key]])):{};
      json(res,status,{error:{type:status<500?'invalid_request_error':'server_error',code,message:code,...details}});
    }
  });
  server.headersTimeout=15000;server.requestTimeout=30000;server.keepAliveTimeout=5000;
  return server;
}

async function main(){
  const master=Buffer.from(process.env.RELAY_MASTER_KEY??'','base64');
  const file=process.env.RELAY_DB??path.join(path.dirname(fileURLToPath(import.meta.url)),'data','relay.sqlite');
  const store=new Store(file,master);
  try{
    store.bootstrap(process.env.RELAY_ADMIN_KEY,process.env.RELAY_API_KEY);
    const portIndex=process.argv.indexOf('--port');
    if(portIndex!==-1)store.settings.set('relay.port',Number(process.argv[portIndex+1]));
    const relay=new Relay(store),server=createServer(relay);
    const port=store.settings.get('relay.port');
    const address=store.settings.get('relay.bind_host');
    server.listen(port,address,()=>console.log(JSON.stringify({event:'listening',address,port})));
    server.on('error',error=>{console.error(JSON.stringify({event:'server_start_failed',code:error.code??'unknown'}));store.close();process.exitCode=1;});
    const shutdown=()=>{server.close(()=>{store.close();});server.closeIdleConnections();};
    process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  }catch(error){store.close();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error(JSON.stringify({event:'startup_failed',code:error instanceof RelayError?error.code:'internal_error'}));process.exitCode=1;});
