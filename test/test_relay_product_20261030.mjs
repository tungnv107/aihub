import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {zstdCompressSync,gzipSync,brotliCompressSync,deflateSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {ProductState,DEFAULT_DESKTOP_BODY_BYTES} from '../relay_product/state.mjs';
import {SettingsRepository} from '../self_relay/store.mjs';
import {managedConfig,restoreConfig,syncCodex,unsyncCodex} from '../relay_product/config.mjs';
import {createDesktopServer,borrowedHeaders} from '../relay_product/desktop.mjs';
import {sse} from '../self_relay/protocol.mjs';
const root=new URL('./',import.meta.url),policy=JSON.parse(fs.readFileSync(new URL('../relay_product/policy.local-reference.json',import.meta.url)));
const fixtures=fs.mkdtempSync(path.join(import.meta.dirname,'product-fixture-'));
const url='http://127.0.0.1:18455/v1';
const token='fixture.header.signature00000000';
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
const cases=[
 '', 'model = "gpt-6-astra"\n',
 '# user settings\nopenai_base_url = "http://localhost:11500/v1"\nmodel_provider = "OpenAI"\nmodel_catalog_json = "old.json"\n[projects]\nname="hello"\n',
 '\uFEFFmodel = "gpt-6-astra"\r\n[features]\r\nmulti_agent = true\r\n',
 '"openai_base_url"="https://example.invalid/v1"\nmodel_provider = "custom"\n'
];
for(let i=0;i<cases.length;i++)test('config restore retains original bytes '+i,()=>{
  const modified=managedConfig(cases[i],url);assert(modified.includes(url));assert.equal(restoreConfig(modified,url),cases[i]);
});
test('uninstall keeps unrelated edits and rejects a modified managed endpoint',()=>{
  const text=managedConfig('model = "gpt-6-astra"\n',url);
  assert.equal(restoreConfig(text+'\n[features]\nx = true\n',url),'model = "gpt-6-astra"\n\n[features]\nx = true\n');
  assert.throws(()=>restoreConfig(text.replace(url,'http://127.0.0.1:9999/v1'),url),/changed_review/);
  assert.throws(()=>managedConfig('instructions = """\n[not-a-table]\n"""\n',url),/multiline/);
});
test('SQLite policy initialization and config installation are idempotent',()=>{
  const home=path.join(fixtures,'install'),codexHome=path.join(fixtures,'codex');fs.mkdirSync(codexHome);
  fs.writeFileSync(path.join(codexHome,'config.toml'),'model = "gpt-6-astra"\n');
  fs.writeFileSync(path.join(codexHome,'auth.json'),'do-not-read-or-modify');
  let state=new ProductState(home);state.initialize(policy,{codexHome});
  const generation=state.policies.snapshot().generation;
  assert(syncCodex(state).changed);assert.equal(syncCodex(state).changed,false);state.close();
  state=new ProductState(home);state.initialize(policy,{codexHome});
  assert.equal(state.policies.snapshot().generation,generation);
  unsyncCodex(state);assert.equal(fs.readFileSync(path.join(codexHome,'config.toml'),'utf8'),'model = "gpt-6-astra"\n');
  assert.equal(fs.readFileSync(path.join(codexHome,'auth.json'),'utf8'),'do-not-read-or-modify');state.close();
});

test('existing desktop DB adopts 64 MiB without overwriting explicit limits or proxy defaults',()=>{
  const home=path.join(fixtures,'legacy-body-limit');let state=new ProductState(home);state.initialize(policy);
  state.db.prepare('DELETE FROM settings WHERE key=?').run('relay.max_body_bytes');
  state.set('version','0.3.1');state.set('license.activation','synthetic-activation');
  const generation=state.policies.snapshot().generation;state.close();
  state=new ProductState(home);
  assert.equal(state.settings.get('relay.max_body_bytes'),64*1024*1024);
  assert.equal(state.get('license.activation'),'synthetic-activation');assert.equal(state.policies.snapshot().generation,generation);
  state.settings.set('relay.max_body_bytes',1048576);state.close();
  state=new ProductState(home);assert.equal(state.settings.get('relay.max_body_bytes'),1048576);state.close();
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  assert.equal(new SettingsRepository(db).get('relay.max_body_bytes'),2097152);db.close();
});
test('borrowed credentials are scoped to OpenAI protocol headers',()=>{
  const result=borrowedHeaders(new Headers({...headers,'cookie':'secret','proxy-authorization':'private','x-api-key':'never-forward','x-codex-turn-state':'old'}));
  assert.equal(result.get('authorization'),headers.authorization);
  for(const key of ['cookie','proxy-authorization','x-api-key','x-codex-turn-state'])assert.equal(result.get(key),null);
  assert.throws(()=>borrowedHeaders(new Headers()),/chatgpt_sign_in/);
  assert.throws(()=>borrowedHeaders(new Headers({authorization:'Bearer sk-not-for-plus-billing'})),/chatgpt_sign_in/);
});
function fixtureStream(){
  const text=JSON.stringify({answer:'DESKTOP_OK',notes:'a1 b2 '.repeat(160)});
  const response={id:'resp_fixture',object:'response',model:'gpt-6-astra',status:'in_progress',output:[],usage:null};
  const item={id:'msg_fixture',type:'message',role:'assistant',status:'in_progress',phase:'final_answer',content:[]};
  const events=[
    {type:'response.created',response},
    {type:'response.output_item.added',output_index:0,item},
    {type:'response.content_part.added',output_index:0,content_index:0,item_id:item.id,part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text}
  ];
  const bytes=Buffer.concat(events.map(sse));let sent=false,cancelled=false;
  return {get cancelled(){return cancelled;},response:new Response(new ReadableStream({
    pull(controller){if(!sent){sent=true;controller.enqueue(bytes);}},
    cancel(){cancelled=true;}
  },{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}})};
}
async function serverFixture(callback,transport){
  const home=fs.mkdtempSync(path.join(fixtures,'http-')),state=new ProductState(home);state.initialize(policy);
  const server=createDesktopServer(state,{transport});server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await callback('http://127.0.0.1:'+server.address().port,state);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));state.close();}
}
test('desktop HTTP transforms upstream and restores answer without persisting tokens',{timeout:10000},async()=>{
  const source=fixtureStream();let calls=0;
  await serverFixture(async(base,state)=>{
    const result=await fetch(base+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'gpt-6-astra',stream:false,input:'fixture'}),signal:AbortSignal.timeout(5000)});
    assert.equal(result.status,200);const body=await result.json();
    assert.equal(body.output[0].content[0].text,'DESKTOP_OK');assert.equal(body.usage,null);
    assert(source.cancelled);assert.equal(calls,1);
    const rows=state.db.prepare('SELECT * FROM desktop_usage').all();assert.equal(rows.length,1);assert.equal(rows[0].usage,null);
    for(const file of fs.readdirSync(path.join(state.home,'data')))assert(!fs.readFileSync(path.join(state.home,'data',file)).includes(Buffer.from(token)));
  },async(target,options)=>{
    calls++;assert.equal(target,'https://chatgpt.com/backend-api/codex/responses');
    assert.equal(options.headers.get('authorization'),headers.authorization);
    assert.equal(JSON.parse(options.body).text.format.name,policy.jsonLaneName);
    return source.response;
  });
});
test('loopback listener rejects browser origins, missing auth and remote host',async()=>{
  await serverFixture(async(base)=>{
    assert.equal((await fetch(base+'/v1/models',{headers:{origin:'https://attacker.invalid',...headers}})).status,403);
    assert.equal((await fetch(base+'/v1/models')).status,401);
    const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/healthz',{headers:{host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
    assert.equal(hostStatus,403);
    assert.equal((await fetch(base+'/control/stop',{method:'POST'})).status,403);
    assert.equal((await fetch(base+'/admin/accounts',{headers})).status,404);
  },async()=>{throw Error('must_not_reach_upstream');});
});
test('upstream 401 is preserved so Codex can refresh its own session',async()=>{
  await serverFixture(async(base)=>{
    const result=await fetch(base+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'gpt-6-astra',input:'fixture'})});
    assert.equal(result.status,401);
  },async()=>new Response(JSON.stringify({error:{code:'token_expired'}}),{status:401,headers:{'content-type':'application/json'}}));
});
test('compaction body and user session are passed through unchanged',async()=>{
  const input={model:'gpt-6-astra',input:[{role:'user',content:'fixture'}],instructions:'preserve me'};
  await serverFixture(async(base)=>{
    const result=await fetch(base+'/v1/responses/compact',{method:'POST',headers:{...headers,session_id:'original-session'},body:JSON.stringify(input)});
    assert.equal(result.status,200);assert.equal((await result.json()).object,'response.compaction');
  },async(target,options)=>{
    assert(target.endsWith('/responses/compact'));assert.deepEqual(JSON.parse(options.body),input);
    assert.equal(options.headers.get('session_id'),'original-session');
    return Response.json({object:'response.compaction',output:[]});
  });
});
test('native Codex zstd request is decoded before policy shaping',async()=>{
  const source=fixtureStream();
  await serverFixture(async(base)=>{
    const compressed=zstdCompressSync(Buffer.from(JSON.stringify({model:'gpt-6-astra',stream:false,input:'zstd fixture'})));
    const response=await fetch(base+'/v1/responses',{method:'POST',headers:{...headers,'content-encoding':'zstd'},body:compressed});
    assert.equal(response.status,200);assert.equal((await response.json()).output[0].content[0].text,'DESKTOP_OK');
  },async()=>source.response);
});

test('large desktop zstd history passes the default limit intact',{timeout:15000},async()=>{
  const input='large-history-fixture '.repeat(410000),source=fixtureStream();let forwarded=false;
  await serverFixture(async(base)=>{
    const original=Buffer.from(JSON.stringify({model:'gpt-6-astra',stream:false,input}));
    assert.ok(original.length>8*1024*1024);
    const compressed=zstdCompressSync(original);assert.ok(compressed.length<2097152);
    const response=await fetch(base+'/v1/responses',{method:'POST',headers:{...headers,'content-encoding':'zstd'},body:compressed});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(result.output[0].content[0].text,'DESKTOP_OK');assert.equal(forwarded,true);
  },async(target,options)=>{
    assert.equal(JSON.parse(options.body).input[0].content,input);forwarded=true;return source.response;
  });
});

test('large compressed compaction including image data reaches upstream unchanged',{timeout:15000},async()=>{
  const original={model:'gpt-6-astra',instructions:'preserve compaction',input:[
    {role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,'+Buffer.alloc(3*1024*1024,10).toString('base64')}]},
    {type:'function_call_output',call_id:'call_fixture',output:'Tiếng Việt '.repeat(180000)}
  ]};
  await serverFixture(async(base,state)=>{
    const response=await fetch(base+'/v1/responses/compact',{method:'POST',headers:{...headers,'content-encoding':'zstd'},body:zstdCompressSync(Buffer.from(JSON.stringify(original)))});
    assert.equal(response.status,200);assert.equal((await response.json()).object,'response.compaction');
    const health=await (await fetch(base+'/healthz')).json();assert.equal(health.limits.requestBodyBytes,DEFAULT_DESKTOP_BODY_BYTES);
  },async(target,options)=>{
    assert.ok(target.endsWith('/responses/compact'));assert.deepEqual(JSON.parse(options.body),original);
    assert.equal(options.headers.has('content-encoding'),false);
    return Response.json({object:'response.compaction',output:[]});
  });
});

test('all supported codecs enforce decoded byte boundaries and distinguish malformed compression',async()=>{
  let calls=0;
  await serverFixture(async(base,state)=>{
    state.settings.set('relay.max_body_bytes',4096);
    const baseBody={model:'gpt-6-astra',input:''},overhead=Buffer.byteLength(JSON.stringify(baseBody));
    const exact=Buffer.from(JSON.stringify({...baseBody,input:'x'.repeat(4096-overhead)}));
    const excess=Buffer.from(JSON.stringify({...baseBody,input:'x'.repeat(4097-overhead)}));
    for(const [encoding,compress]of [['identity',x=>x],['gzip',gzipSync],['br',brotliCompressSync],['deflate',deflateSync],['zstd',zstdCompressSync]]){
      const send=buffer=>fetch(base+'/v1/responses/compact',{method:'POST',headers:{...headers,'content-encoding':encoding},body:compress(buffer)});
      const accepted=await send(exact);assert.equal(accepted.status,200,encoding);await accepted.arrayBuffer();
      const before=calls,rejected=await send(excess);assert.equal(rejected.status,413,encoding);
      const result=await rejected.json();assert.equal(result.error.max_body_bytes,4096);
      assert.equal(result.error.code,encoding==='identity'?'request_too_large':'decompressed_request_too_large');assert.equal(calls,before);
    }
    for(const encoding of ['gzip','br','deflate','zstd']){
      const response=await fetch(base+'/v1/responses',{method:'POST',headers:{...headers,'content-encoding':encoding},body:Buffer.from('invalid-compressed-data')});
      assert.equal(response.status,400);assert.equal((await response.json()).error.code,'compressed_request_rejected');
    }
    const unsupported=await fetch(base+'/v1/responses',{method:'POST',headers:{...headers,'content-encoding':'zstd,gzip'},body:'{}'});
    assert.equal(unsupported.status,415);assert.equal(calls,5);
  },async()=>{calls++;return Response.json({object:'response.compaction',output:[]});});
});
test('compressed request cannot expand beyond the configured body limit',async()=>{
  await serverFixture(async(base,state)=>{
    state.settings.set('relay.max_body_bytes',2097152);
    const compressed=gzipSync(Buffer.from('x'.repeat(3*1024*1024)));
    const response=await fetch(base+'/v1/responses',{method:'POST',headers:{...headers,'content-encoding':'gzip'},body:compressed});
    assert.equal(response.status,413);
    const result=await response.json();assert.equal(result.error.code,'decompressed_request_too_large');assert.equal(result.error.max_body_bytes,2097152);
    const usage=state.db.prepare('SELECT * FROM desktop_usage').get();assert.equal(usage.status,413);assert.equal(usage.model,null);assert.equal(usage.attempts,0);
  },async()=>{throw Error('must_not_reach_upstream');});
});
test('headerless SSE upstream remains compatible and must produce a valid terminal response',async()=>{
  const source=fixtureStream();source.response.headers.delete('content-type');
  await serverFixture(async(base)=>{
    const response=await fetch(base+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'gpt-6-astra',stream:false,input:'fixture'})});
    assert.equal(response.status,200);assert.equal((await response.json()).output[0].content[0].text,'DESKTOP_OK');
  },async()=>source.response);
});
