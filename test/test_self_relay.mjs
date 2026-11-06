import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {createServer} from '../self_relay/server.mjs';
import {assertDestination,validateIdToken,hash,directRequest} from '../self_relay/security.mjs';
import {SseDecoder,ResponseAccumulator,toResponses,shapeRequest,sessionDetails} from '../self_relay/protocol.mjs';
import {measuredUsage,requestMetrics} from '../self_relay/accounting.mjs';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'self-relay-fixtures');fs.mkdirSync(root,{recursive:true});
const fixture=t=>{
  const dir=fs.mkdtempSync(path.join(root,'case-')),key=crypto.randomBytes(32),file=path.join(dir,'relay.sqlite');
  const store=new Store(file,key),admin=crypto.randomBytes(32).toString('hex'),api=crypto.randomBytes(32).toString('hex');
  store.bootstrap(admin,api);t.after(()=>store.db&&store.close());return {store,key,file,admin,api,caller:store.caller(api)};
};
function account(store,{label='synthetic',adapter='plan',tenant='local',expired=false,...extras}={}){
  return store.importAccount({label,adapter,exclusive_refresh_owner:true,tokens:{
    access_token:'synthetic-access-'+crypto.randomUUID(),refresh_token:'synthetic-refresh-'+crypto.randomUUID(),client_id:'oaiapp_synthetic',
    expires_at:Date.now()+(expired?-10000:3600000),scopes:['chatgpt.tokens.use.direct'],...extras,
  }},tenant);
}
const responseObject=(text='Xin chào',tools=false)=>({id:'resp_synthetic',object:'response',status:'completed',model:'test-model',created_at:1,
  output:[{type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text}]} ,...(tools?[{type:'function_call',id:'fc_1',call_id:'call_1',name:'weather',arguments:'{"city":"Hà Nội"}'}]:[])],
  usage:{input_tokens:20,input_tokens_details:{cached_tokens:12},output_tokens:4,total_tokens:24}});
function events({text='Xin chào',tools=false,failed=false,incomplete=false,terminal=true}={}){
  const response=responseObject(text,tools),list=[{type:'response.created',response:{...response,output:[],usage:null,status:'in_progress'}},
    {type:'response.output_item.added',output_index:0,item:response.output[0]},
    {type:'response.output_text.delta',output_index:0,item_id:'msg_1',delta:text}];
  if(tools)list.push({type:'response.output_item.added',output_index:1,item:{...response.output[1],arguments:''}},
    {type:'response.function_call_arguments.delta',output_index:1,item_id:'fc_1',delta:'{"city":'},
    {type:'response.function_call_arguments.delta',output_index:1,item_id:'fc_1',delta:'"Hà Nội"}'},
    {type:'response.output_item.done',output_index:1,item:response.output[1]});
  if(failed)list.push({type:'response.failed',response:{...response,status:'failed',error:{code:'subscription_sharing_usage_limit_exceeded'}}});
  else if(terminal)list.push({type:incomplete?'response.incomplete':'response.completed',response:{...response,status:incomplete?'incomplete':'completed'}});
  return list;
}
function upstream(options={},headers={}){
  const bytes=Buffer.from(events(options).map(e=>'event: '+e.type+'\r\ndata: '+JSON.stringify(e)+'\r\n\r\n').join(''));
  let pos=0;
  return new Response(new ReadableStream({pull(controller){if(pos>=bytes.length){controller.close();return;}controller.enqueue(bytes.subarray(pos,pos+=17));}}),
    {headers:{'content-type':'text/event-stream',...headers}});
}
function sink(){return {chunks:[],started:false,ended:false,start(status,type,headers){if(!this.started){this.started=true;this.status=status;this.type=type;this.headers=headers;}},
  async write(b){this.chunks.push(Buffer.from(b));},async end(){this.ended=true;},body(){return Buffer.concat(this.chunks).toString();}};}
async function infer(relay,caller,{headers={},body={model:'test-model',input:'hello'},route='/v1/responses',signal=new AbortController().signal,target=sink()}={}){
  await relay.infer({caller,headers:new Headers(headers),raw:Buffer.from(JSON.stringify(body)),route,signal,sink:target});return target;
}
const usageRows=store=>store.db.prepare('SELECT * FROM usage ORDER BY id').all();

test('encrypted credentials, hashed inbound keys, and redacted administration',t=>{
  const f=fixture(t),a=account(f.store),secret=f.store.credentials(f.store.account(a.id));
  assert(!JSON.stringify(a).includes(secret.accessToken));assert(!JSON.stringify(f.store.account(a.id)).includes(secret.refreshToken));
  assert(!fs.readFileSync(f.file).includes(Buffer.from(secret.accessToken)));
  assert.throws(()=>f.store.caller(f.api,true));assert.equal(f.store.caller(f.admin,true).role,'admin');
});
test('database ownership lock prevents concurrent refreshers and wrong key is rejected',t=>{
  const f=fixture(t);assert.throws(()=>new Store(f.file,f.key),/database_already_owned/);
  f.store.close();assert.throws(()=>new Store(f.file,crypto.randomBytes(32)),/database_open_failed/);
  const reopened=new Store(f.file,f.key);assert.equal(reopened.caller(f.api).id,'local');reopened.close();
});
test('import requires explicit refresh ownership and prevents duplicate refresh tokens',t=>{
  const f=fixture(t);assert.throws(()=>f.store.importAccount({label:'test'}),/exclusive_refresh/);
  account(f.store,{refresh_token:'synthetic-duplicate'});assert.throws(()=>account(f.store,{refresh_token:'synthetic-duplicate'}));
});
test('exact outbound allowlist blocks HTTP, arbitrary hosts, path tricks and query exfiltration',()=>{
  assertDestination('https://api.openai.com/v1/responses');
  for(const url of ['http://api.openai.com/v1/responses','https://api.openai.com.evil.test/v1/responses','https://user:secret@api.openai.com/v1/responses',
    'https://api.openai.com:444/v1/responses','https://api.openai.com/v1/files','https://api.openai.com/v1/responses?secret=synthetic','https://127.0.0.1/v1/responses'])
    assert.throws(()=>assertDestination(url));
});
test('settings reject unknown keys and invalid types',t=>{
  const {store}=fixture(t);assert.throws(()=>store.settings.set('upstream.url','https://example.com'));
  assert.throws(()=>store.settings.set('relay.max_attempts',0));store.settings.set('relay.models',['test-model']);assert.deepEqual(store.settings.get('relay.models'),['test-model']);
});
test('SSE decoding preserves split UTF-8, CRLF, tool calls and completed usage',t=>{
  const bytes=Buffer.from(events({tools:true}).map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));const decoder=new SseDecoder();const output=[];
  for(const b of bytes)output.push(...decoder.push(Uint8Array.of(b)));output.push(...decoder.push(null,true));
  assert.equal(output.find(e=>e.type==='response.output_text.delta').json.delta,'Xin chào');assert.equal(output.at(-1).json.response.usage.input_tokens,20);
});
test('Responses non-streaming returns complete response and usage comes from actual upstream',async t=>{
  const f=fixture(t),a=account(f.store);let sent;
  const relay=new Relay(f.store,{transport:async(url,options)=>{sent={url,body:JSON.parse(options.body),headers:options.headers};return upstream();}});
  const result=await infer(relay,f.caller);
  assert.equal(JSON.parse(result.body()).output[0].content[0].text,'Xin chào');assert.equal(sent.url,'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store,false);assert.equal(sent.body.stream,true);assert.deepEqual(sent.body.input,[{role:'user',content:'hello'}]);assert.equal(usageRows(f.store)[0].account_id,a.id);
  assert.equal(usageRows(f.store)[0].cached_tokens,12);
});
test('Responses stream preserves event bytes and terminal marker',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>upstream({tools:true})});
  const result=await infer(relay,f.caller,{body:{model:'test-model',input:'hello',stream:true}});
  assert(result.body().includes('response.completed'));assert(result.body().includes('function_call_arguments.delta'));assert(result.ended);
});
test('Chat Completions conversion retains tools, history, JSON schema, text and usage',async t=>{
  const f=fixture(t);account(f.store);let sent;
  const relay=new Relay(f.store,{transport:async(url,options)=>{sent=JSON.parse(options.body);return upstream({tools:true});}});
  const body={model:'test-model',messages:[{role:'system',content:'Be concise'},{role:'assistant',content:null,tool_calls:[{id:'previous',type:'function',function:{name:'weather',arguments:'{}'}}]},
    {role:'tool',tool_call_id:'previous',content:'sunny'},{role:'user',content:'next'}],tools:[{type:'function',function:{name:'weather',parameters:{type:'object'}}}],
    response_format:{type:'json_schema',json_schema:{name:'answer',schema:{type:'object'}}}};
  const result=JSON.parse((await infer(relay,f.caller,{route:'/v1/chat/completions',body})).body());
  assert.equal(sent.input[0].type,'additional_tools');assert.equal(sent.input[0].tools[0].name,'weather');assert.equal(sent.input[1].role,'developer');
  assert.equal(sent.input[2].type,'function_call');assert.equal(sent.input[3].type,'function_call_output');assert.equal(sent.tools,undefined);
  assert.equal(sent.text.format.type,'json_schema');assert.equal(result.choices[0].message.tool_calls[0].id,'call_1');assert.equal(result.choices[0].finish_reason,'tool_calls');
  assert.equal(result.usage.prompt_tokens_details.cached_tokens,12);
});
test('Chat streaming tool arguments assemble exactly once and usage is opt-in',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>upstream({tools:true})});
  const result=await infer(relay,f.caller,{route:'/v1/chat/completions',body:{model:'test-model',messages:[{role:'user',content:'hi'}],stream:true,stream_options:{include_usage:true}}});
  const chunks=result.body().split('\n').filter(l=>l.startsWith('data: {')).map(l=>JSON.parse(l.slice(6)));
  const argumentsText=chunks.flatMap(c=>c.choices?.[0]?.delta?.tool_calls??[]).map(c=>c.function?.arguments??'').join('');
  assert.equal(argumentsText,'{"city":"Hà Nội"}');assert.equal(chunks.filter(c=>c.choices?.[0]?.finish_reason==='tool_calls').length,1);
  assert.equal(chunks.at(-1).usage.prompt_tokens,20);assert(result.body().endsWith('data: [DONE]\n\n'));
});
test('stable affinity, caller/account cache isolation, and caller tokens never reach upstream',async t=>{
  const f=fixture(t);account(f.store);account(f.store);const observed=[];
  const relay=new Relay(f.store,{transport:async(url,o)=>{observed.push({headers:o.headers,body:JSON.parse(o.body)});return upstream();}});
  const options={headers:{'session-id':'synthetic-session','authorization':'Bearer inbound-only','chatgpt-account-id':'wrong-account'}};
  await infer(relay,f.caller,options);await infer(relay,f.caller,options);
  assert.equal(usageRows(f.store)[0].account_id,usageRows(f.store)[1].account_id);assert.equal(observed[0].body.prompt_cache_key,observed[1].body.prompt_cache_key);
  assert.notEqual(observed[0].headers.get('authorization'),'Bearer inbound-only');assert.equal(observed[0].headers.get('chatgpt-account-id'),null);
  const caller=f.store.addCaller({token:crypto.randomBytes(32).toString('hex')});await infer(relay,caller,options);
  assert.notEqual(observed[0].body.prompt_cache_key,observed[2].body.prompt_cache_key);
});

test('explicit cache group keeps both upstream key and session header stable',async t=>{
  const f=fixture(t);account(f.store);const observed=[];
  const relay=new Relay(f.store,{transport:async(url,options)=>{
    observed.push({body:JSON.parse(options.body),headers:options.headers});return upstream();
  }});
  const body={model:'test-model',input:'same prompt',prompt_cache_key:'shared-client-group'};
  for(const session of ['client-session-a','client-session-b'])
    await infer(relay,f.caller,{body,headers:{'session-id':session}});
  assert.equal(observed[0].body.prompt_cache_key,observed[1].body.prompt_cache_key);
  assert.equal(observed[0].headers.get('session_id'),observed[1].headers.get('session_id'));
  assert.equal(observed[0].headers.get('session_id'),hash(body.prompt_cache_key));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM affinity').get().n,2);
  assert(usageRows(f.store).every(r=>r.session_source==='session-id'));
});
test('tenant isolation and requested account selection',async t=>{
  const f=fixture(t),a=account(f.store,{tenant:'other'});const relay=new Relay(f.store,{transport:async()=>{throw Error('must not call');}});
  await assert.rejects(infer(relay,f.caller),/no_usable_account/);
  await assert.rejects(infer(relay,f.caller,{headers:{'x-relay-account-id':a.id}}),/selected_account_unavailable/);
});
test('refresh single-flight persists replacement token before subsequent request',async t=>{
  const f=fixture(t),a=account(f.store,{expired:true});let count=0;
  const relay=new Relay(f.store,{transport:async()=>{count++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'synthetic-new',refresh_token:'synthetic-rotated',expires_in:3600,scope:'chatgpt.tokens.use.direct'});}});
  const [one,two]=await Promise.all([relay.credentials(f.store.account(a.id)),relay.credentials(f.store.account(a.id))]);
  assert.equal(count,1);assert.equal(one.accessToken,two.accessToken);assert.equal(f.store.credentials(f.store.account(a.id)).refreshToken,'synthetic-rotated');assert.equal(f.store.account(a.id).refresh_pending,0);
});
test('401 refresh retries same account with fresh token',async t=>{
  const f=fixture(t),a=account(f.store);let calls=0,refreshes=0;
  const relay=new Relay(f.store,{transport:async(url,o)=>{
    if(url.includes('/oauth/token')){refreshes++;return Response.json({access_token:'synthetic-after401',refresh_token:'synthetic-rotate401',expires_in:3600,scope:'chatgpt.tokens.use.direct'});}
    if(++calls===1)return new Response('',{status:401});assert.equal(o.headers.get('authorization'),'Bearer synthetic-after401');return upstream();
  }});
  await infer(relay,f.caller);assert.equal(calls,2);assert.equal(refreshes,1);assert.equal(usageRows(f.store)[0].account_id,a.id);
});
test('ambiguous refresh is not retried and remains blocked after restart',async t=>{
  const f=fixture(t),a=account(f.store,{expired:true});let count=0;
  const relay=new Relay(f.store,{transport:async()=>{count++;throw Error('ambiguous network outcome');}});
  await assert.rejects(relay.credentials(f.store.account(a.id)));await assert.rejects(relay.credentials(f.store.account(a.id)));assert.equal(count,1);
  f.store.close();const reopened=new Store(f.file,f.key);assert.equal(reopened.account(a.id).state,'refresh_uncertain');reopened.close();
});
test('429 failover sets cooldown, clears affinity, and attributes quota to selected upstream',async t=>{
  const f=fixture(t);account(f.store);account(f.store);let calls=0;
  const relay=new Relay(f.store,{transport:async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':'2'}}):upstream({}, {'x-codex-primary-used-percent':'23'})});
  await infer(relay,f.caller,{headers:{'session-id':'session'}});assert.equal(calls,2);
  const used=usageRows(f.store)[0].account_id;assert.equal(JSON.parse(f.store.account(used).quota).windows.primary.used_percent,23);
  assert(f.store.list('local').some(a=>a.id!==used&&a.cooldown_until>Date.now()));
});
test('replay requires explicit idempotency and avoids repeated upstream calls',async t=>{
  const f=fixture(t);account(f.store);let calls=0;const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream();}});
  const options={headers:{'idempotency-key':'retry-1','session-id':'session'}};
  const one=await infer(relay,f.caller,options),two=await infer(relay,f.caller,options);
  assert.equal(one.body(),two.body());assert.equal(calls,1);assert.equal(two.headers['x-relay-cache'],'hit');
  await infer(relay,f.caller);await infer(relay,f.caller);assert.equal(calls,3);
});
test('idempotency conflict, cross-caller separation and disabled-account replay rejection',async t=>{
  const f=fixture(t),a=account(f.store);let calls=0;const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream();}});
  const options={headers:{'idempotency-key':'id'}};await infer(relay,f.caller,options);
  await assert.rejects(infer(relay,f.caller,{...options,body:{model:'test-model',input:'changed'}}),/idempotency_key_conflict/);
  const other=f.store.addCaller({token:crypto.randomBytes(32).toString('hex')});await infer(relay,other,options);assert.equal(calls,2);
  f.store.db.prepare('UPDATE accounts SET enabled=0 WHERE id=?').run(a.id);await assert.rejects(infer(relay,f.caller,options),/replay_account_unavailable/);
});
test('clean EOF without completion, failed and incomplete responses are never replayed',async t=>{
  for(const mode of [{terminal:false},{failed:true},{incomplete:true}]) {
    const f=fixture(t);account(f.store);let calls=0;
    const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream(mode);}});
    const options={headers:{'idempotency-key':'bad'},body:{model:'test-model',input:'hi'}};
    if(mode.incomplete){await infer(relay,f.caller,options);await infer(relay,f.caller,options);assert.equal(calls,2);}
    else await assert.rejects(infer(relay,f.caller,options));
    assert.equal(relay.replays.size,0);
  }
});
test('cancelled downstream stops streaming, releases slots and skips cache',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>upstream()});const control=new AbortController(),target=sink();
  target.write=async()=>{control.abort();};
  await assert.rejects(infer(relay,f.caller,{body:{model:'test-model',input:'hi',stream:true},headers:{'idempotency-key':'cancel'},signal:control.signal,target}));
  assert.equal(relay.active,0);assert.equal(relay.replays.size,0);assert.equal(usageRows(f.store)[0].status,499);
});

for(const route of ['/v1/responses','/v1/chat/completions'])test('HTTP terminal completes before delayed upstream EOF: '+route,async t=>{
  const f=fixture(t);account(f.store);f.store.settings.set('relay.stream_idle_ms',100);
  let upstreamCancelled=false;
  const relay=new Relay(f.store,{transport:async()=>new Response(new ReadableStream({
    start(controller){controller.enqueue(Buffer.from(events().map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join('')));},
    async cancel(){upstreamCancelled=true;await new Promise(resolve=>setTimeout(resolve,100));},
  }),{headers:{'content-type':'text/event-stream'}})}),server=createServer(relay);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const body=route==='/v1/responses'?{model:'test-model',input:'hi',stream:true}:
    {model:'test-model',messages:[{role:'user',content:'hi'}],stream:true,stream_options:{include_usage:true}};
  const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',
    headers:{authorization:'Bearer '+f.api,'content-type':'application/json','idempotency-key':'terminal-close'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(2000)});
  const reader=response.body.getReader();let received='';
  for(;;){const {done,value}=await reader.read();received+=Buffer.from(value??[]).toString();
    if(done||received.includes(route==='/v1/responses'?'"type":"response.completed"':'data: [DONE]'))break;
  }
  await reader.cancel();
  for(let i=0;i<100&&relay.active;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert(upstreamCancelled);assert.equal(relay.active,0);assert.equal(usageRows(f.store)[0].status,200);
  assert.equal(usageRows(f.store)[0].outcome,'completed');assert.equal(usageRows(f.store)[0].input_tokens,20);
  assert.equal(relay.replays.size,1);
});
test('refuses implicit continuation IDs and keeps custom Responses tools intact',()=>{
  assert.throws(()=>toResponses({model:'test-model',previous_response_id:'resp_old'},false),/complete input history/);
  const body={model:'test-model',input:[],tools:[{type:'custom',name:'patch',format:{type:'text'}}]};assert.deepEqual(toResponses(body,false),body);
});
test('compact route passes JSON response and models catalog reflects upstream',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async url=>url.endsWith('/models')?Response.json({models:[{slug:'test-model',visibility:'list'}]}):Response.json({object:'response.compaction',output:[]})});
  assert.equal((await relay.models(f.caller)).data[0].id,'test-model');const output=await infer(relay,f.caller,{route:'/v1/responses/compact'});assert.equal(JSON.parse(output.body()).object,'response.compaction');
});

const keyPair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...keyPair.publicKey.export({format:'jwk'}),kid:'synthetic-key',use:'sig'};
function idToken(claims){const head=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url'),body=Buffer.from(JSON.stringify(claims)).toString('base64url');return head+'.'+body+'.'+crypto.sign('RSA-SHA256',Buffer.from(head+'.'+body),keyPair.privateKey).toString('base64url');}
test('OIDC signature, audience, nonce and selected-account identity are verified',()=>{
  const claims={iss:'https://auth.openai.com',aud:'oaiapp_test',sub:'subject',nonce:'nonce',exp:Math.floor(Date.now()/1000)+3600};const token=idToken(claims);
  assert.equal(validateIdToken(token,{keys:[jwk]},{clientId:'oaiapp_test',nonce:'nonce'}).sub,'subject');
  for(const options of [{clientId:'wrong'},{clientId:'oaiapp_test',nonce:'wrong'},{clientId:'oaiapp_test',subject:'wrong'}])assert.throws(()=>validateIdToken(token,{keys:[jwk]},options));
});
test('OAuth dynamic registration PKCE and one-use callback import without vendor calls',async t=>{
  const f=fixture(t);let authUrl,tokenBody;const relay=new Relay(f.store,{transport:async(url,options)=>{
    if(url.endsWith('jwks.json'))return Response.json({keys:[jwk]});
    tokenBody=new URLSearchParams(options.body);
    return Response.json({access_token:'synthetic-oauth-access',refresh_token:'synthetic-oauth-refresh',expires_in:3600,scope:'openid chatgpt.tokens.use.direct offline_access',
      id_token:idToken({iss:'https://auth.openai.com',aud:'oaiapp_issued',sub:'synthetic-subject',nonce:authUrl.searchParams.get('nonce'),exp:Math.floor(Date.now()/1000)+3600})});
  }});
  authUrl=new URL(relay.oauth.start({label:'New account',exclusive_refresh_owner:true},'local',8320).authorization_url);
  assert.equal(authUrl.searchParams.get('client_id'),'dynamic_agent_client');
  const params={state:authUrl.searchParams.get('state'),code:'synthetic-code',client_id:'oaiapp_issued'};
  const saved=await relay.oauth.complete(params);assert.equal(saved.adapter,'plan');assert.equal(tokenBody.get('client_id'),'oaiapp_issued');
  assert.equal(Buffer.from(hash(tokenBody.get('code_verifier')),'hex').toString('base64url'),authUrl.searchParams.get('code_challenge'));
  await assert.rejects(relay.oauth.complete(params),/oauth_state/);
});
test('HTTP smoke: inbound auth, admin separation, account import, inference and usage',async t=>{
  const f=fixture(t),relay=new Relay(f.store,{transport:async()=>upstream()}),server=createServer(relay);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/admin/accounts')).status,401);
  assert.equal((await fetch(base+'/admin/accounts',{headers:{authorization:'Bearer '+f.api}})).status,401);
  const imported=await fetch(base+'/admin/accounts/import',{method:'POST',headers:{authorization:'Bearer '+f.admin,'content-type':'application/json'},body:JSON.stringify({
    label:'HTTP fake',adapter:'plan',exclusive_refresh_owner:true,tokens:{access_token:'synthetic-http-access',refresh_token:'synthetic-http-refresh',client_id:'oaiapp_test',expires_in:3600,scope:'chatgpt.tokens.use.direct'}})});
  assert.equal(imported.status,201);assert(!(await imported.text()).includes('synthetic-http-access'));
  const response=await fetch(base+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+f.api,'content-type':'application/json'},body:JSON.stringify({model:'test-model',input:'hello'})});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'completed');
  const usage=await (await fetch(base+'/admin/usage',{headers:{authorization:'Bearer '+f.admin}})).json();assert.equal(usage.usage.length,1);
  assert.equal((await fetch(base+'/admin/accounts',{headers:{authorization:'Bearer '+f.admin,origin:'https://evil.test'}})).status,403);
});

test('concurrent inference waits for the same refresh and records two requests',async t=>{
  const f=fixture(t);account(f.store,{expired:true});let refreshes=0,inferences=0;
  const relay=new Relay(f.store,{transport:async url=>{
    if(url.includes('/oauth/token')){refreshes++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'synthetic-concurrent',refresh_token:'synthetic-concurrent-rotated',expires_in:3600,scope:'chatgpt.tokens.use.direct'});}
    inferences++;return upstream();
  }});
  await Promise.all([infer(relay,f.caller),infer(relay,f.caller)]);
  assert.equal(refreshes,1);assert.equal(inferences,2);assert.equal(usageRows(f.store).length,2);assert.equal(usageRows(f.store)[0].served_model,'test-model');
});
test('stream idle timeout cancels upstream and does not cache partial output',async t=>{
  const f=fixture(t);account(f.store);f.store.settings.set('relay.stream_idle_ms',100);let cancelled=false;
  const relay=new Relay(f.store,{transport:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}})});
  await assert.rejects(infer(relay,f.caller,{headers:{'idempotency-key':'timeout'}}),/upstream_stream_timeout/);
  assert(cancelled);assert.equal(relay.active,0);assert.equal(relay.replays.size,0);
});
test('pending identical idempotency key does not start a second inference',async t=>{
  const f=fixture(t);account(f.store);let release,calls=0;
  const relay=new Relay(f.store,{transport:async()=>{calls++;await new Promise(r=>{release=r;});return upstream();}});
  const first=infer(relay,f.caller,{headers:{'idempotency-key':'pending'}});
  while(!release)await new Promise(r=>setTimeout(r,1));
  await assert.rejects(infer(relay,f.caller,{headers:{'idempotency-key':'pending'}}),/request_in_progress/);release();await first;assert.equal(calls,1);
});
test('oversized replay entries and expired entries are not reused',async t=>{
  const f=fixture(t);account(f.store);let calls=0;f.store.settings.set('cache.max_bytes',10);
  const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream();}}),options={headers:{'idempotency-key':'size'}};
  await infer(relay,f.caller,options);await infer(relay,f.caller,options);assert.equal(calls,2);assert.equal(relay.replays.size,0);
  f.store.settings.set('cache.max_bytes',524288);f.store.settings.set('cache.ttl_ms',1);
  await infer(relay,f.caller,options);await new Promise(r=>setTimeout(r,3));await infer(relay,f.caller,options);assert.equal(calls,4);
});
test('retries on 5xx use a different account and redirect responses are refused',async t=>{
  const f=fixture(t);account(f.store);account(f.store);let calls=0;
  const relay=new Relay(f.store,{transport:async()=>++calls===1?new Response('',{status:503}):upstream()});await infer(relay,f.caller);assert.equal(calls,2);
  const f2=fixture(t);account(f2.store);let redirected=0;
  const r2=new Relay(f2.store,{transport:async()=>{redirected++;return new Response(null,{status:302,headers:{location:'https://evil.test'}});}});
  await assert.rejects(infer(r2,f2.caller),/upstream_request_rejected/);assert.equal(redirected,1);
});
test('OAuth state mismatch and denied callback never exchange a code',async t=>{
  const f=fixture(t);let calls=0;const relay=new Relay(f.store,{transport:async()=>{calls++;throw Error('forbidden');}});
  await assert.rejects(relay.oauth.complete({state:'wrong',code:'synthetic'}),/oauth_state/);
  const auth=new URL(relay.oauth.start({label:'denied',exclusive_refresh_owner:true},'local',8320).authorization_url);
  await assert.rejects(relay.oauth.complete({state:auth.searchParams.get('state'),error:'access_denied'}),/oauth_denied/);assert.equal(calls,0);
});
test('codex adapter uses selected credential account header and direct OpenAI endpoint',async t=>{
  const f=fixture(t);account(f.store,{adapter:'codex',account_id:'selected-account'});let sent;
  const relay=new Relay(f.store,{transport:async(url,options)=>{sent={url,options};return upstream();}});
  await infer(relay,f.caller,{headers:{'chatgpt-account-id':'spoofed'},body:{model:'test-model',input:'hello',temperature:0.5,prompt_cache_options:{test:true}}});
  assert.equal(sent.url,'https://chatgpt.com/backend-api/codex/responses');assert.equal(sent.options.headers.get('chatgpt-account-id'),'selected-account');
  const body=JSON.parse(sent.options.body);assert.equal(body.temperature,undefined);assert.equal(body.prompt_cache_options,undefined);assert.equal(body.input[0].content,'hello');
});

test('real HTTPS transport forwards web Headers as native headers and enforces TLS',async()=>{
  const original=https.request;let observed;
  https.request=(url,options,callback)=>{
    observed={url,options};const request=new EventEmitter();request.write=()=>{};request.destroy=()=>{};
    request.end=()=>queueMicrotask(()=>{const response=Readable.from([Buffer.from('{"ok":true}')]);response.headers={'content-type':'application/json'};response.statusCode=200;callback(response);});
    return request;
  };
  try {
    const response=await directRequest('https://api.openai.com/v1/models',{headers:new Headers({authorization:'Bearer synthetic-transport'})});
    assert.equal((await response.json()).ok,true);assert.equal(observed.options.headers.authorization,'Bearer synthetic-transport');assert.equal(observed.options.rejectUnauthorized,true);
    await directRequest('https://api.openai.com/v1/responses',{method:'POST',body:'Xin chào',headers:new Headers({'content-length':'999'})});
    assert.equal(observed.options.headers['content-length'],String(Buffer.byteLength('Xin chào')));
  }finally{https.request=original;}
});

test('plan adapter normalizes input and fails before network for unsupported token limits',async t=>{
  const f=fixture(t);account(f.store);let calls=0;
  const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream();}});
  for(const field of ['max_output_tokens','temperature','conversation','max_tool_calls']) {
    await assert.rejects(infer(relay,f.caller,{body:{model:'test-model',input:'hello',[field]:1}}),
      error=>error.code==='plan_unsupported_parameter'&&error.param===field);
  }
  assert.equal(calls,0);
  const scope={caller:'caller',account:'account',session:'session'};
  const plan=shapeRequest({model:'test-model',input:[{type:'message',role:'system',content:'Rules'},{role:'user',content:'hello'}]},'plan',scope);
  assert.equal(plan.input[0].role,'developer');assert.equal(plan.input[1].role,'user');
  const api=shapeRequest({model:'test-model',input:'hello',max_output_tokens:32},'api',scope);
  assert.equal(api.max_output_tokens,32);assert.equal(api.input,'hello');
});

test('plan adapter preserves local tool names and custom schemas and rejects unsupported hosted tools',()=>{
  const tools=[{type:'function',name:'weather',parameters:{type:'object'}},{type:'custom',name:'patch',format:{type:'text'}}];
  const original={model:'test-model',input:[{role:'user',content:'hi'}],tools,tool_choice:{type:'function',name:'weather'}};
  const shaped=shapeRequest(original,'plan',{caller:'c',account:'a',session:'s'});
  assert.deepEqual(shaped.input[0],{type:'additional_tools',role:'developer',tools});assert.deepEqual(shaped.tool_choice,original.tool_choice);
  assert.deepEqual(original.input,[{role:'user',content:'hi'}]);
  for(const type of ['tool_search','image_generation','file_search','code_interpreter','mcp'])
    assert.throws(()=>shapeRequest({...original,tools:[{type}]},'plan',{caller:'c',account:'a',session:'s'}),/plan_unsupported_tool/);
});

test('upstream validation exposes only code and parameter, never raw message or body',async t=>{
  const f=fixture(t);account(f.store);let calls=0;
  const relay=new Relay(f.store,{transport:async()=>{calls++;return Response.json({error:{code:'unsupported_parameter',param:'max_output_tokens',
    message:'Bearer synthetic-sensitive-secret, raw private prompt',token:'synthetic-sensitive-secret'}},{status:400});}});
  const server=createServer(relay);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/responses',{method:'POST',
    headers:{authorization:'Bearer '+f.api,'content-type':'application/json'},body:JSON.stringify({model:'test-model',input:'hello'})});
  const body=await response.text();assert.equal(response.status,400);assert.equal(calls,1);
  assert.equal(JSON.parse(body).error.upstream_code,'unsupported_parameter');assert.equal(JSON.parse(body).error.param,'max_output_tokens');
  assert(!body.includes('synthetic-sensitive-secret'));assert(!body.includes('private prompt'));
});

test('HTTP 200 JSON is diagnosed without fabricating an SSE completion or exposing text',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>Response.json(responseObject('private synthetic answer'))});
  await assert.rejects(infer(relay,f.caller,{body:{model:'test-model',input:'hi',stream:true}}),error=>{
    assert.equal(error.code,'upstream_sse_required');assert.equal(error.upstream_status,200);
    assert.equal(error.upstream_media_type,'application/json');assert.equal(error.upstream_body_kind,'response');
    assert.equal(error.upstream_response_status,'completed');assert(!JSON.stringify(error).includes('private synthetic answer'));return true;
  });
  assert.equal(usageRows(f.store)[0].outcome,'upstream_sse_required');assert.equal(relay.replays.size,0);
});

test('SSE without Content-Type still requires real completion and never accepts JSON as SSE',async t=>{
  const f=fixture(t);account(f.store);let mode='sse';
  const relay=new Relay(f.store,{transport:async()=>{
    const response=mode==='sse'?upstream():mode==='partial'?upstream({terminal:false}):Response.json(responseObject());
    response.headers.delete('content-type');return response;
  }});
  const result=await infer(relay,f.caller,{body:{model:'test-model',input:'hi',stream:true}});
  assert(result.body().includes('response.completed'));assert.equal(result.headers['x-relay-upstream-content-type'],'missing');
  mode='partial';await assert.rejects(infer(relay,f.caller),/upstream_stream_incomplete/);
  mode='json';await assert.rejects(infer(relay,f.caller),/truncated_upstream_event/);
});

test('missing session uses stable prefix affinity across history growth and can be disabled',async t=>{
  const f=fixture(t);account(f.store);account(f.store);const seen=[];
  const relay=new Relay(f.store,{transport:async(url,o)=>{seen.push(JSON.parse(o.body));return upstream();}});
  const input=[{role:'user',content:'Stable document prefix'}];
  await infer(relay,f.caller,{body:{model:'test-model',input}});
  await infer(relay,f.caller,{body:{model:'test-model',input:[...input,{role:'user',content:'A new tail question'}]}});
  const rows=usageRows(f.store);assert.equal(rows[0].account_id,rows[1].account_id);
  assert.equal(seen[0].prompt_cache_key,seen[1].prompt_cache_key);assert.equal(rows[0].session_source,'content_prefix');
  assert.equal(rows[1].input_text_bytes_before,rows[1].input_text_bytes_after);
  f.store.settings.set('cache.affinity_fallback',false);
  assert.equal(sessionDetails(new Headers(),{input},false).key,'');
  assert.throws(()=>f.store.settings.set('cache.affinity_fallback','false'),/invalid_setting/);
});

test('client prompt cache keys remain distinct with same session and preserve content identifiers',()=>{
  const scope={caller:'c',tenant:'t',account:'a',session:'same'};
  const body={model:'test-model',input:[{role:'user',content:'Keep UUID 11111111-2222-4333-8444-555555555555, create_time=12345.'}],prompt_cache_key:'prefix-a'};
  body.input[0].content='Keep UUID '+crypto.randomUUID()+', create_time=12345.';
  const a=shapeRequest(body,'plan',scope),b=shapeRequest({...body,prompt_cache_key:'prefix-b'},'plan',scope);
  assert.notEqual(a.prompt_cache_key,b.prompt_cache_key);assert.deepEqual(a.input,body.input);
  assert.equal(a.prompt_cache_key.length,64);
  for(const key of ['caller','tenant','account'])assert.notEqual(a.prompt_cache_key,shapeRequest(body,'plan',{...scope,[key]:'different'}).prompt_cache_key);
  assert.equal(a.prompt_cache_key,shapeRequest(body,'plan',{...scope,session:'different'}).prompt_cache_key);
  assert.notEqual(a.prompt_cache_key,shapeRequest({...body,model:'other-model'},'plan',scope).prompt_cache_key);
  assert.throws(()=>toResponses({...body,prompt_cache_key:42},false),/invalid_prompt_cache_key/);
});

test('usage arithmetic never invents cache hits and does not add reasoning twice',t=>{
  const f=fixture(t);
  const record=usage=>f.store.usage({caller:f.caller.id,model:'test-model',status:200,outcome:'completed',duration:1,attempts:1,usage});
  record({input_tokens:20,input_tokens_details:{cached_tokens:12,cache_write_tokens:5},output_tokens:4,output_tokens_details:{reasoning_tokens:2}});
  record({input_tokens:100,input_tokens_details:{cached_tokens:90},output_tokens:1});
  record({input_tokens:7,output_tokens:2});record(undefined);
  const summary=f.store.usageSummary('local');
  assert.equal(summary.observed_input_tokens,127);assert.equal(summary.observed_cached_tokens,102);
  assert.equal(summary.observed_uncached_input_tokens,18);assert.equal(summary.observed_cache_ratio,102/120);
  assert.equal(summary.observed_total_tokens,134);assert.equal(summary.observed_reasoning_tokens,2);
  assert.equal(summary.observed_cache_write_tokens,5);assert.equal(summary.rows_with_unknown_usage,1);
  assert.equal(summary.rows_with_unknown_cache,1);assert.equal(summary.quota_savings_estimate,null);
  assert.equal(usageRows(f.store).at(-1).usage_source,'unknown');assert.equal(usageRows(f.store).at(-1).cached_tokens,null);
  assert.equal(measuredUsage({input_tokens:10,input_tokens_details:{cached_tokens:20}}).anomaly,'cached_exceeds_input');
  assert.equal(measuredUsage({input_tokens:10,input_tokens_details:{cached_tokens:20}}).uncached,null);
});

test('replay accounting records zero new upstream tokens and preserves original response usage',async t=>{
  const f=fixture(t);account(f.store);let calls=0;const relay=new Relay(f.store,{transport:async()=>{calls++;return upstream();}});
  const options={headers:{'idempotency-key':'accounting'}};
  const first=await infer(relay,f.caller,options),replay=await infer(relay,f.caller,options);
  assert.equal(first.body(),replay.body());assert.equal(calls,1);
  const rows=usageRows(f.store),last=rows.at(-1);assert.equal(last.input_tokens,0);assert.equal(last.output_tokens,0);
  assert.equal(last.usage_source,'local_replay');assert.equal(last.upstream_attempts,0);assert.equal(last.upstream_sent_bytes,0);
  assert.equal(last.replay_saved_input_tokens,20);
  const summary=f.store.usageSummary('local');assert.equal(summary.observed_input_tokens,20);assert.equal(summary.observed_cached_tokens,12);
  assert.equal(summary.upstream_attempts_known,1);assert.equal(summary.replay_hits,1);assert.equal(summary.replay_avoided_input_tokens,20);
});

test('request byte audit preserves visible content and tools without token estimation',()=>{
  const body={model:'test-model',instructions:'Quy tắc',input:[{role:'user',content:'Xin chào'},{type:'function_call',call_id:'c1',name:'f',arguments:'{}'},
    {type:'function_call_output',call_id:'c1',output:'kết quả'}],tools:[{type:'function',name:'f',parameters:{type:'object',properties:{}}}]};
  const before=requestMetrics(body),after=requestMetrics(shapeRequest(body,'plan',{caller:'c',account:'a',session:'s'}));
  assert.deepEqual(before,after);assert.equal(before.text_bytes,Buffer.byteLength('Quy tắcXin chào{}kết quả'));
  assert(!('estimated_tokens' in before));
});

test('v2 usage migration keeps rows and credentials and version stays at v4 on restart',t=>{
  const f=fixture(t),a=account(f.store),secret=f.store.credentials(f.store.account(a.id));
  f.store.usage({caller:f.caller.id,account:a.id,model:'test-model',status:200,outcome:'completed',duration:1,usage:{input_tokens:20,input_tokens_details:{cached_tokens:12},output_tokens:4}});
  f.store.close();const db=new DatabaseSync(f.file);
  db.exec(`CREATE TABLE usage_old(id INTEGER PRIMARY KEY,ts INTEGER NOT NULL,caller_id TEXT NOT NULL,account_id TEXT,model TEXT,status INTEGER,outcome TEXT,
    input_tokens INTEGER,cached_tokens INTEGER,output_tokens INTEGER,replay INTEGER NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL,served_model TEXT);
    INSERT INTO usage_old SELECT id,ts,caller_id,account_id,model,status,outcome,input_tokens,cached_tokens,output_tokens,replay,duration_ms,served_model FROM usage;
    DROP TABLE usage;ALTER TABLE usage_old RENAME TO usage;PRAGMA user_version=2;`);db.close();
  const reopened=new Store(f.file,f.key);assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version,5);
  assert.equal(reopened.credentials(reopened.account(a.id)).refreshToken,secret.refreshToken);
  assert.equal(usageRows(reopened)[0].uncached_input_tokens,8);assert.equal(usageRows(reopened)[0].upstream_attempts,null);reopened.close();
  const again=new Store(f.file,f.key);assert.equal(again.db.prepare('PRAGMA user_version').get().user_version,5);assert.equal(usageRows(again).length,1);again.close();
});

test('admin usage and local policy expose measured settings without leaking another tenant',async t=>{
  const f=fixture(t);const other=f.store.addCaller({id:'other-admin',tenant:'other',role:'admin',token:crypto.randomBytes(32).toString('hex')});
  f.store.usage({caller:other.id,status:200,outcome:'completed',duration:1,usage:{input_tokens:9999,output_tokens:2}});
  f.store.usage({caller:f.caller.id,status:200,outcome:'completed',duration:1,usage:{input_tokens:7,output_tokens:1}});
  const server=createServer(new Relay(f.store));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port,headers={authorization:'Bearer '+f.admin};
  const rows=await (await fetch(base+'/admin/usage',{headers})).json();assert.equal(rows.usage.length,1);
  const summary=await (await fetch(base+'/admin/usage/summary',{headers})).json();assert.equal(summary.observed_input_tokens,7);
  const policy=await (await fetch(base+'/admin/policy',{headers})).json();assert.equal(policy.source,'local_sqlite');assert.equal(policy.vendor_policy_loaded,false);
  assert.equal(policy.cache.affinity_fallback,true);assert.equal(policy.accounting.missing_usage,'unknown');assert.equal(policy.prompt.injected_padding,false);
  assert.equal((await fetch(base+'/admin/policy')).status,401);
});

function sparseTerminalStream(withTool=false) {
  const response={...responseObject('CACHE_OK'),output:[]};
  const list=[{type:'response.created',response:{...response,status:'in_progress',usage:null}},
    {type:'response.output_item.added',output_index:0,item:{id:'msg_sparse',type:'message',role:'assistant',content:[]}},
    {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:''}},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'CACHE_'},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'OK'},
    {type:'response.output_text.done',output_index:0,content_index:0,text:'CACHE_OK'}];
  if(withTool)list.push({type:'response.output_item.added',output_index:1,item:{type:'function_call',id:'fc_sparse',call_id:'call_sparse',name:'f',arguments:''}},
    {type:'response.function_call_arguments.delta',output_index:1,delta:'{"ok":'},
    {type:'response.function_call_arguments.delta',output_index:1,delta:'true}'},
    {type:'response.function_call_arguments.done',output_index:1,arguments:'{"ok":true}'});
  list.push({type:'response.completed',response});
  return new Response(list.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
}

test('sparse terminal response assembles text and function calls for non-streaming clients',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>sparseTerminalStream(true)});
  const response=JSON.parse((await infer(relay,f.caller)).body());
  assert.equal(response.output[0].content[0].text,'CACHE_OK');assert.equal(response.output[1].arguments,'{"ok":true}');
  assert.equal(response.usage.input_tokens,20);
  const chat=JSON.parse((await infer(relay,f.caller,{route:'/v1/chat/completions',body:{model:'test-model',messages:[{role:'user',content:'hi'}]}})).body());
  assert.equal(chat.choices[0].message.content,'CACHE_OK');assert.equal(chat.choices[0].message.tool_calls[0].function.arguments,'{"ok":true}');
  assert.equal(chat.choices[0].finish_reason,'tool_calls');
});

test('sparse terminal keeps raw Responses bytes and Chat tool arguments are not duplicated',async t=>{
  const f=fixture(t);account(f.store);const relay=new Relay(f.store,{transport:async()=>sparseTerminalStream(true)});
  const responses=await infer(relay,f.caller,{body:{model:'test-model',input:'hi',stream:true}});
  assert.equal(responses.body(),await sparseTerminalStream(true).text());
  const chat=await infer(relay,f.caller,{route:'/v1/chat/completions',body:{model:'test-model',messages:[{role:'user',content:'hi'}],stream:true}});
  const chunks=chat.body().split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(chunks.flatMap(c=>c.choices?.[0]?.delta?.tool_calls??[]).map(c=>c.function?.arguments??'').join(''),'{"ok":true}');
  assert.equal(chunks.filter(c=>c.choices?.[0]?.finish_reason==='tool_calls').length,1);
  assert.equal(chunks.map(c=>c.choices?.[0]?.delta?.content??'').join(''),'CACHE_OK');
});

test('accumulator preserves custom tool input and authoritative completed output',()=>{
  const accumulator=new ResponseAccumulator();
  const events=[{type:'response.output_item.added',output_index:0,item:{type:'custom_tool_call',id:'custom1',call_id:'call1',name:'patch',input:''}},
    {type:'response.custom_tool_call_input.delta',output_index:0,delta:'line one'},
    {type:'response.custom_tool_call_input.done',output_index:0,input:'line one\nline two'}];
  for(const event of events)accumulator.handle({type:event.type,json:event});
  assert.equal(accumulator.complete({output:[]}).output[0].input,'line one\nline two');
  const final={output:[{type:'message',content:[{type:'output_text',text:'authoritative'}]}]};
  assert.equal(accumulator.complete(final),final);
});

test('Chat Completions does not fabricate zero token usage when upstream omits it',async t=>{
  const f=fixture(t);account(f.store);const response=responseObject();delete response.usage;
  const relay=new Relay(f.store,{transport:async()=>new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\n',
    {headers:{'content-type':'text/event-stream'}})});
  const body={model:'test-model',messages:[{role:'user',content:'hi'}]};
  const json=JSON.parse((await infer(relay,f.caller,{route:'/v1/chat/completions',body})).body());assert(!('usage' in json));
  const streamed=await infer(relay,f.caller,{route:'/v1/chat/completions',body:{...body,stream:true,stream_options:{include_usage:true}}});
  assert(!streamed.body().includes('prompt_tokens'));assert.equal(usageRows(f.store)[0].usage_source,'unknown');
  assert.equal(usageRows(f.store)[0].input_tokens,null);
});

test('completed replay stays available while upstream concurrency is saturated',async t=>{
  const f=fixture(t);account(f.store);f.store.settings.set('relay.max_concurrency',1);let calls=0,release;
  const relay=new Relay(f.store,{transport:async()=>{calls++;if(calls===2)await new Promise(resolve=>{release=resolve;});return upstream();}});
  const cached={headers:{'idempotency-key':'capacity-cached'}};await infer(relay,f.caller,cached);
  const pending=infer(relay,f.caller,{headers:{'idempotency-key':'capacity-active'}});
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  const replay=await infer(relay,f.caller,cached);assert.equal(replay.headers['x-relay-cache'],'hit');assert.equal(calls,2);
  await assert.rejects(infer(relay,f.caller,{headers:{'idempotency-key':'capacity-new'}}),/relay_concurrency_limit/);
  release();await pending;assert.equal(relay.active,0);
});

test('container binding is explicit and additional Host authorities remain exact',async t=>{
  const f=fixture(t);assert.equal(f.store.settings.get('relay.bind_host'),'127.0.0.1');
  assert.deepEqual(f.store.settings.get('relay.extra_allowed_hosts'),[]);
  for(const value of ['::','example.com','',null])assert.throws(()=>f.store.settings.set('relay.bind_host',value));
  for(const value of [['*'],['http://self-relay:18320'],['self-relay:99999'],['self-relay:0'],['self-relay:18320/path'],[1],null])
    assert.throws(()=>f.store.settings.set('relay.extra_allowed_hosts',value));
  const server=createServer(new Relay(f.store));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  const status=(route,headers)=>new Promise((resolve,reject)=>{
    const request=http.get(base+route,{headers},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);
  });
  assert.equal(await status('/healthz',{host:'self-relay:18320'}),403);
  f.store.settings.set('relay.bind_host','0.0.0.0');f.store.settings.set('relay.extra_allowed_hosts',['self-relay:18320']);
  assert.equal(await status('/healthz',{host:'self-relay:18320'}),200);
  assert.equal(await status('/admin/accounts',{host:'self-relay:18320'}),401);
  assert.equal(await status('/healthz',{host:'self-relay:18321'}),403);
  assert.equal(await status('/healthz',{host:'self-relay:18320',origin:'https://untrusted.example'}),403);
});
