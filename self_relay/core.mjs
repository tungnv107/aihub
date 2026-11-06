import {RelayError,hash,assertDestination,directRequest,boundedJson,upstreamRejection} from './security.mjs';
import {OAuth} from './oauth.mjs';
import {sessionDetails,toResponses,shapeRequest,SseDecoder,ResponseAccumulator,ChatStream,chatResponse,sse} from './protocol.mjs';
import {requestMetrics,measuredUsage,requestKind,responseKind} from './accounting.mjs';
import {toolInventory,requestShape} from './diagnostics.mjs';
import {TurnRouting,validTurnState} from './turn-routing.mjs';
import {applyContextBudget} from './context-budget.mjs';
import {prepareResponseTail} from './response-tail.mjs';
import {preparePolicyRequest,wrapPolicyResponse} from './policy-runtime.mjs';

const inferenceBase=adapter=>adapter==='codex'?'https://chatgpt.com/backend-api/codex':'https://api.openai.com/v1';
const tokenEndpoint=adapter=>adapter==='codex'?'https://auth.openai.com/oauth/token':'https://auth.openai.com/api/accounts/oauth/token';

export class Relay {
  constructor(store,{transport=directRequest}={}) {
    this.store=store;this.refreshes=new Map();this.active=0;this.busy=new Map();this.replays=new Map();
    this.turnRouting=new TurnRouting(store.settings);
    this.request=(url,options)=>{assertDestination(url);return transport(url,options);};
    this.oauth=new OAuth(store,this.request);
  }
  async credentials(account,force=false,rejectedToken) {
    if(this.refreshes.has(account.id))return this.refreshes.get(account.id);
    const current=this.store.account(account.id),secret=this.store.credentials(current);
    if(current.refresh_pending||['needs_reauth','refresh_uncertain'].includes(current.state))throw new RelayError(503,'account_requires_reauthentication');
    if(force&&rejectedToken&&secret.accessToken!==rejectedToken)return secret;
    if(!force&&secret.accessToken&&(account.adapter==='api'||secret.expiresAt>Date.now()+60000))return secret;
    const promise=this.refresh(current,secret,force).finally(()=>this.refreshes.delete(account.id));
    this.refreshes.set(account.id,promise);return promise;
  }
  async refresh(account,secret,force) {
    if(!secret.refreshToken||!secret.clientId){this.store.changeState(account.id,'needs_reauth');throw new RelayError(503,'reauthentication_required');}
    if(secret.earliestRefreshAt>Date.now()) {
      if(!force&&secret.expiresAt>Date.now()+5000)return secret;
      throw new RelayError(503,'refresh_not_yet_allowed');
    }
    // Journal before network I/O. After a crash/ambiguous response require a new sign-in.
    this.store.db.prepare('UPDATE accounts SET refresh_pending=1 WHERE id=?').run(account.id);
    try {
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:secret.refreshToken,client_id:secret.clientId});
      if(account.adapter==='plan')body.set('resource','https://api.openai.com/v1');
      const response=await this.request(tokenEndpoint(account.adapter),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:body.toString(),signal:AbortSignal.timeout(30000)});
      if(!response.ok) {
        const status=response.status;await response.body?.cancel();
        if(status===400||status===401){this.store.changeState(account.id,'needs_reauth');throw new RelayError(503,'refresh_rejected');}
        throw new RelayError(503,'refresh_result_uncertain');
      }
      const data=await boundedJson(response);
      if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=0||
          (account.adapter==='plan'&&!data.refresh_token)||(force&&data.access_token===secret.accessToken))
        throw new RelayError(503,'refresh_result_uncertain');
      if(data.id_token&&secret.subject)validateRefreshIdentity(data.id_token,await this.oauth.jwks(),secret);
      const scopes=data.scope?data.scope.split(' '):secret.scopes;
      if(account.adapter==='plan'&&!scopes.includes('chatgpt.tokens.use.direct'))throw new RelayError(503,'plan_scope_revoked');
      const updated={...secret,accessToken:data.access_token,refreshToken:data.refresh_token??secret.refreshToken,
        idToken:data.id_token??secret.idToken,scopes,expiresAt:Date.now()+data.expires_in*1000,
        earliestRefreshAt:Number(data.earliest_refresh_at??0)*1000};
      this.store.saveCredentials(account.id,updated);return updated;
    } catch(error) {
      if(this.store.account(account.id).state!=='needs_reauth')this.store.changeState(account.id,'refresh_uncertain');
      throw new RelayError(503,error instanceof RelayError?error.code:'refresh_result_uncertain');
    }
  }
  select(caller,session,model,exclude=new Set(),requested) {
    const now=Date.now(),available=this.store.list(caller.tenant).filter(a=>a.enabled&&a.state==='ready'&&(!a.refresh_pending||this.refreshes.has(a.id))&&a.cooldown_until<=now&&!exclude.has(a.id));
    const key=hash(JSON.stringify([caller.id,caller.tenant,session,model]));
    const pin=session?this.store.db.prepare('SELECT * FROM affinity WHERE key=? AND expires_at>?').get(key,now):null;
    let account=requested?available.find(a=>a.id===requested):pin?available.find(a=>a.id===pin.account_id):null;
    if(requested&&!account)throw new RelayError(503,'selected_account_unavailable');
    account??=available.sort((a,b)=>(this.busy.get(a.id)??0)-(this.busy.get(b.id)??0)||a.last_used-b.last_used||a.id.localeCompare(b.id))[0];
    if(!account)throw new RelayError(503,'no_usable_account');
    if(session)this.store.db.prepare('INSERT INTO affinity VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET account_id=excluded.account_id,expires_at=excluded.expires_at')
      .run(key,account.id,now+this.store.settings.get('affinity.ttl_ms'));
    this.store.db.prepare('UPDATE accounts SET last_used=? WHERE id=?').run(now,account.id);
    return account;
  }
  cooldown(account,response) {
    const value=response.headers.get('retry-after');let delay=Number(value)*1000;
    if(value&&!Number.isFinite(delay))delay=Date.parse(value)-Date.now();
    if(!delay||delay<0)delay=response.status===429?60000:30000;
    this.store.changeState(account.id,'ready',Date.now()+Math.min(delay,86400000));
  }
  headers(requestHeaders,account,secret,session,turnState=null) {
    const headers=new Headers({'authorization':'Bearer '+secret.accessToken,'content-type':'application/json','accept':'text/event-stream'});
    if(account.adapter==='codex'&&secret.accountId)headers.set('chatgpt-account-id',secret.accountId);
    if(session)headers.set('session_id',hash(session));
    if(account.adapter==='codex'&&validTurnState(turnState))headers.set('x-codex-turn-state',turnState);
    // Only protocol metadata is forwarded; inbound credentials and arbitrary headers stay local.
    for(const name of ['openai-beta','x-codex-parent-thread-id','x-codex-turn-metadata']) {
      const value=requestHeaders.get(name);if(value&&value.length<4096)headers.set(name,value);
    }
    // Giữ khai báo khả năng của client, đặc biệt remote_compaction_v2; không tự bật tính năng mới.
    const features=requestHeaders.get('x-codex-beta-features');
    if(account.adapter==='codex'&&features&&features.length<=1024&&
      /^[a-z][a-z0-9_-]{0,63}(?:\s*,\s*[a-z][a-z0-9_-]{0,63}){0,15}$/.test(features))
      headers.set('x-codex-beta-features',features);
    return headers;
  }
  async models(caller,requested) {
    const configured=this.store.settings.get('relay.models');
    if(configured.length)return {object:'list',data:configured.map(id=>({id,object:'model',owned_by:'configured'}))};
    const account=this.select(caller,'','',new Set(),requested),secret=await this.credentials(account);
    const url=inferenceBase(account.adapter)+'/models'+(account.adapter==='codex'?'?client_version=0.155.1':'');
    const response=await this.request(url,{headers:this.headers(new Headers(),account,secret,''),signal:AbortSignal.timeout(30000)});
    if(!response.ok){await response.body?.cancel();throw new RelayError(502,'models_upstream_failed');}
    const body=await boundedJson(response);
    return {object:'list',data:body.data??(body.models??[]).filter(x=>!x.visibility||x.visibility==='list').map(x=>({id:x.slug??x.id,object:'model',owned_by:'openai'}))};
  }
  async infer({caller,headers,raw,route,signal,sink}) {
    const started=Date.now(),chat=route==='/v1/chat/completions',compact=route==='/v1/responses/compact';
    let input;try{input=JSON.parse(raw.toString('utf8'));}catch{throw new RelayError(400,'invalid_json');}
    const body=toResponses(input,chat),sessionInfo=sessionDetails(headers,body,this.store.settings.get('cache.affinity_fallback')),session=sessionInfo.key;
    const compacting=compact||(Array.isArray(body.input)&&body.input.some(item=>item?.type==='compaction_trigger'));
    const policyCapture=this.store.policies.capture();
    const audit={raw_bytes:raw.length,wire_bytes:0,sent_bytes:0,session_source:sessionInfo.source,before:requestMetrics(body),
      request_kind:requestKind(body,compacting),response_kind:'unknown',policy:policyCapture.identity};
    if(typeof session!=='string'||session.length>4096)throw new RelayError(400,'invalid_session');
    const configured=this.store.settings.get('relay.models');
    if(configured.length&&!configured.includes(body.model))throw new RelayError(400,'model_not_configured');
    const stream=!compact&&input.stream===true,requested=headers.get('x-relay-account-id');
    const idem=headers.get('idempotency-key');
    if(idem&&idem.length>200)throw new RelayError(400,'idempotency_key_too_long');
    const cacheKey=idem?hash(caller.id+'|'+idem):null;
    const fingerprint=hash(JSON.stringify([caller.tenant,route,body.model,session,requested,hash(raw),audit.policy.mode,audit.policy.revision]));
    for(const [key,value]of this.replays)if(!value.pending&&value.expires<Date.now())this.replays.delete(key);
    if(cacheKey&&this.replays.has(cacheKey)) {
      const replay=this.replays.get(cacheKey);
      if(replay.fingerprint!==fingerprint)throw new RelayError(409,'idempotency_key_conflict');
      if(replay.pending)throw new RelayError(409,'request_in_progress');
      const account=this.store.account(replay.account);
      if(!account?.enabled||account.tenant!==caller.tenant)throw new RelayError(409,'replay_account_unavailable');
      sink.start(200,replay.type,{'x-relay-cache':'hit','x-relay-account-id':account.id});await sink.write(replay.body);await sink.end();
      this.store.usage({caller:caller.id,account:account.id,model:body.model,servedModel:replay.servedModel,status:200,outcome:'replay',replay:true,
        attempts:0,replaySavedInput:measuredUsage(replay.usage).input,
        audit:{...audit,cache_key:replay.cache_key,response_kind:replay.response_kind??'unknown'},duration:Date.now()-started});return;
    }
    if(this.active>=this.store.settings.get('relay.max_concurrency'))throw new RelayError(429,'relay_concurrency_limit');
    if(cacheKey)this.replays.set(cacheKey,{pending:true,fingerprint});
    this.active++;
    let account,response,secret,outcome='failed',status=502,usage,servedModel,success=false,lockedAccount,attempts=0,downstreamEnded=false;
    let routingContext=null,turnState=null,receivedTurnState=null,toolTail=null,earlyFinished=false,finishKind='tool',policyState=null,policyObserver=null;
    const release=()=>{if(lockedAccount){this.busy.set(lockedAccount,Math.max(0,(this.busy.get(lockedAccount)??1)-1));lockedAccount=null;}};
    const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);
    const recordChunks=[];let recordBytes=0;
    const emit=async bytes=>{
      combined.throwIfAborted();const buffer=Buffer.from(bytes);recordBytes+=buffer.length;
      if(recordBytes<=this.store.settings.get('cache.max_bytes'))recordChunks.push(buffer);else recordChunks.length=0;
      await sink.write(buffer);
    };
    try {
      const exclude=new Set();
      for(let attempt=0;attempt<this.store.settings.get('relay.max_attempts');attempt++) {
        combined.throwIfAborted();release();account=this.select(caller,session,body.model,exclude,requested);
        lockedAccount=account.id;this.busy.set(account.id,(this.busy.get(account.id)??0)+1);exclude.add(account.id);
        try{secret=await this.credentials(account);}catch(error){if(requested)throw error;continue;}
        let shaped=shapeRequest(body,account.adapter,{caller:caller.id,tenant:caller.tenant,account:account.id,session});
        audit.context=null;
        if(!compacting&&account.adapter==='codex'){
          const context=applyContextBudget(shaped,this.store);
          shaped=context.body;audit.context=context.stats;
        }
        if(compact)for(const field of ['stream','store','prompt_cache_key'])delete shaped[field];
        const policyPrepared=preparePolicyRequest(shaped,policyCapture,{adapter:account.adapter,compacting});
        shaped=policyPrepared.body;policyState=policyPrepared.state??null;audit.policy_applied=policyPrepared.reason;
        const tail=prepareResponseTail(shaped,{
          toolsEnabled:!policyState&&!compacting&&account.adapter==='codex'&&this.store.settings.get('tools.early_finish'),
          textEnabled:!policyState&&!compacting&&account.adapter==='codex'&&this.store.settings.get('output.early_finish')});
        shaped=tail.body;toolTail=tail.state;audit.tool_tail=tail.toolReason;audit.text_tail=tail.textReason;
        if(this.store.settings.get('diagnostics.tool_shapes'))console.info(JSON.stringify({event:'relay_tool_inventory',
          at:new Date().toISOString(),route,model:body.model,adapter:account.adapter,
          incoming:toolInventory(input),converted:toolInventory(body),upstream:toolInventory(shaped),shape:requestShape(shaped),context:audit.context}));
        const wireBody=JSON.stringify(shaped);
        audit.wire_bytes=Buffer.byteLength(wireBody);audit.cache_key=shaped.prompt_cache_key;audit.after=requestMetrics(shaped);
        const url=inferenceBase(account.adapter)+'/responses'+(compact?'/compact':'');
        const upstreamSession=body.prompt_cache_key||session;
        routingContext=compacting?null:this.turnRouting.context(caller,account,shaped,upstreamSession,headers);
        turnState=this.turnRouting.resolve(routingContext);
        const send=async(text=wireBody,segmentSignal=combined)=>{
          attempts++;audit.sent_bytes+=Buffer.byteLength(text);
          const headerAbort=new AbortController();let timer;
          if(policyState)timer=setTimeout(()=>headerAbort.abort(new RelayError(504,'upstream_headers_timeout')),policyState.policy.limits.upstreamHdrMs);
          try{return await this.request(url,{method:'POST',headers:this.headers(headers,account,secret,upstreamSession,turnState),body:text,
            signal:AbortSignal.any([combined,segmentSignal,headerAbort.signal])});}finally{clearTimeout(timer);}
        };
        response=await send();
        if(response.status===401&&secret.refreshToken) {
          await response.body?.cancel();
          this.turnRouting.forget(routingContext);turnState=null;
          try{secret=await this.credentials(account,true,secret.accessToken);response=await send();}
          catch(error){response=null;if(requested)throw error;continue;}
        }
        audit.quota=this.store.noteQuota(account.id,response.headers);
        if(response.ok){
          receivedTurnState=routingContext?(turnState||validTurnState(response.headers.get('x-codex-turn-state'))):null;
          if(policyState){
            const media=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
            if(media&&media!=='text/event-stream')throw new RelayError(502,'upstream_sse_required');
            const wrapped=wrapPolicyResponse(response,policyState,{signal:combined,started,
              fetchSegment:async(text,segmentSignal)=>{
                const next=await send(text,segmentSignal);audit.quota=this.store.noteQuota(account.id,next.headers);return next;
              }});
            response=wrapped.response;policyObserver=wrapped.observer;
          }
          break;
        }
        this.turnRouting.forget(routingContext);
        status=response.status;
        if([401,403,429,500,502,503,504].includes(status)) {
          if(status===401||status===403)this.store.changeState(account.id,'needs_reauth');else this.cooldown(account,response);
          await response.body?.cancel();response=null;
          if(requested)throw new RelayError(status,'selected_account_upstream_failed');
          continue;
        }
        throw await upstreamRejection(response);
      }
      if(!response?.ok)throw new RelayError(503,'accounts_exhausted');
      servedModel=response.headers.get('openai-model')??null;
      const type=stream?'text/event-stream':'application/json';
      const upstreamMediaType=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
      const begin=()=>sink.start(200,type,{'x-relay-cache':'miss','x-relay-account-id':account.id,
        'x-relay-policy-mode':audit.policy.mode,'x-relay-policy-revision':audit.policy.revision??'none',
        'x-relay-policy-applied':audit.policy_applied??'off',
        'x-relay-context':audit.context?.mode??'off','x-relay-context-removed-bytes':String(audit.context?.removed_bytes??0),
        'x-relay-turn-state':turnState?'reused':receivedTurnState?'new':'none',
        'x-relay-tool-tail':audit.tool_tail,
        'x-relay-text-tail':audit.text_tail??'disabled',
        ...(receivedTurnState?{'x-codex-turn-state':receivedTurnState}:{}),
        'x-relay-upstream-content-type':upstreamMediaType==='text/event-stream'?upstreamMediaType:upstreamMediaType?'other':'missing'});
      if(compact) {
        const result=await boundedJson(response);if(result.error)throw new RelayError(502,'compact_upstream_failed');
        usage=result.usage;servedModel=result.model??servedModel;audit.response_kind=responseKind(result,true);
        begin();await emit(JSON.stringify(result));success=true;
      } else {
        // Some upstream paths omit Content-Type. Require real SSE framing and a terminal event below.
        if(upstreamMediaType&&upstreamMediaType!=='text/event-stream') {
          const error=await upstreamRejection(response);error.code='upstream_sse_required';error.status=502;throw error;
        }
        const decoder=new SseDecoder(),accumulator=new ResponseAccumulator(),chatStream=new ChatStream(body.model,!!input.stream_options?.include_usage);
        const reader=response.body.getReader();let completed=null,failed=false,incomplete=false,ended=false,responseEnvelope=null,sequence=0;
        const deliver=async event=>{
          if(ended)throw new RelayError(502,'event_after_terminal');
          accumulator.handle(event);
          if((event.type==='response.completed'||event.type==='response.incomplete')&&event.json.response)
            event.json.response=accumulator.complete(event.json.response);
          if(event.json.response)responseEnvelope=event.json.response;
          if(event.type==='error'||event.type==='response.failed') {failed=true;ended=true;
            const code=event.json.response?.error?.code??event.json.error?.code??event.json.code;
            if(/usage_limit|rate_limit|usage_unavailable/.test(code??''))this.cooldown(account,new Response(null,{status:429}));
          }
          if(event.type==='response.incomplete'){incomplete=true;ended=true;completed=event.json.response;}
          if(event.type==='response.completed'){completed=event.json.response;ended=true;}
          if(completed)audit.response_kind=responseKind(completed,compacting);
          if(!earlyFinished&&event.json.response?.usage)usage=event.json.response.usage;
          if(event.json.response?.model)servedModel=event.json.response.model;
          if(stream) {
            begin();
            if(chat) {
              if(failed)await emit(sse({error:{type:'upstream_error',code:'upstream_response_failed',message:'Upstream response failed.'}}));
              else for(const chunk of chatStream.handle(event))await emit(chunk);
            } else if(toolTail)await emit(sse({...event.json,sequence_number:sequence++}));
          }
        };
        try {
          for(;;) {
            let timer;
            const {done,value}=await Promise.race([reader.read(),new Promise((_,reject)=>{
              timer=setTimeout(()=>{controller.abort();reject(new RelayError(504,'upstream_stream_timeout'));},this.store.settings.get('relay.stream_idle_ms'));
            })]).finally(()=>clearTimeout(timer));
            const events=decoder.push(value,done);
            const hasTerminal=events.some(event=>['response.completed','response.incomplete','response.failed','error'].includes(event.type));
            for(const incoming of events) {
              const transformed=toolTail?toolTail.process(incoming,{allowEarly:!hasTerminal&&typeof responseEnvelope?.id==='string'}):{events:[incoming]};
              for(const event of transformed.events)await deliver(event);
              if(transformed.complete){
                earlyFinished=true;finishKind=transformed.kind;usage=undefined;
                // Cancel only this upstream reader; downstream still needs its validated tool and terminal.
                await reader.cancel().catch(()=>{});
                const terminal={...responseEnvelope,object:'response',model:servedModel??body.model,status:'completed',
                  output:accumulator.complete({output:[]}).output??[],usage:null,error:null,incomplete_details:null};
                await deliver({type:'response.completed',json:{type:'response.completed',response:terminal}});
                break;
              }
            }
            if(stream&&!chat&&!toolTail&&value){begin();await emit(value);}
            // A terminal event completes the protocol; upstream EOF may arrive much later.
            if(ended){
              if(!failed&&!incomplete&&!earlyFinished&&!policyState)this.turnRouting.remember(routingContext,receivedTurnState,completed);
              else this.turnRouting.forget(routingContext);
              if(stream&&!failed){
                if(chat)await emit(Buffer.from('data: [DONE]\n\n'));
                combined.throwIfAborted();await sink.end();downstreamEnded=true;
              }
              break;
            }
            if(done)break;
          }
        } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
        if(failed)throw new RelayError(502,'upstream_response_failed');
        if(!completed)throw new RelayError(502,'upstream_stream_incomplete');
        if(!stream){begin();await emit(JSON.stringify(chat?chatResponse(completed):completed));}
        success=!incomplete;outcome=incomplete?'incomplete':policyObserver?.outcome?.cut&&policyObserver.outcome.cut!=='off'?'policy_completed':earlyFinished?finishKind+'_completed_early':'completed';
        if(policyObserver){usage=policyObserver.usage();servedModel=policyObserver.model()??servedModel;}
      }
      combined.throwIfAborted();if(!downstreamEnded)await sink.end();status=200;if(compact)outcome='completed';
      if(cacheKey&&success&&recordBytes<=this.store.settings.get('cache.max_bytes')&&this.store.settings.get('cache.ttl_ms')>0) {
        this.replays.set(cacheKey,{fingerprint,account:account.id,body:Buffer.concat(recordChunks),type,usage,servedModel,cache_key:audit.cache_key,
          response_kind:audit.response_kind,
          expires:Date.now()+this.store.settings.get('cache.ttl_ms')});
        for(const [key,value]of this.replays) {
          if(this.replays.size<=this.store.settings.get('cache.max_entries'))break;
          if(!value.pending)this.replays.delete(key);
        }
      }
    } catch(error) {
      this.turnRouting.forget(routingContext);
      if(this.store.settings.get('diagnostics.tool_shapes')&&error.diagnostic)console.info(JSON.stringify({event:'relay_upstream_rejection',
        at:new Date().toISOString(),status:error.upstream_status,code:error.upstream_code,param:error.param,diagnostic:error.diagnostic}));
      status=signal.aborted?499:error instanceof RelayError?error.status:502;
      outcome=signal.aborted?'cancelled':error instanceof RelayError?error.code:'upstream_transport_failed';
      if(!signal.aborted&&error instanceof RelayError)throw error;
      throw new RelayError(status,outcome);
    } finally {
      controller.abort();await response?.body?.cancel().catch(()=>{});release();this.active--;
      if(cacheKey&&this.replays.get(cacheKey)?.pending)this.replays.delete(cacheKey);
      if(policyObserver&&Object.values(policyObserver.streamStats).some(count=>count>0))console.info(JSON.stringify({
        event:'relay_policy_stream_progress',at:new Date().toISOString(),status,outcome,duration_ms:Date.now()-started,...policyObserver.streamStats}));
      this.store.usage({caller:caller.id,account:account?.id,model:body.model,servedModel,status,outcome,usage,attempts,audit,duration:Date.now()-started});
    }
  }
}

import {validateIdToken} from './security.mjs';
function validateRefreshIdentity(token,keys,secret){return validateIdToken(token,keys,{clientId:secret.clientId,subject:secret.subject});}
