import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {zstdCompressSync} from 'node:zlib';
import {sse} from '../self_relay/protocol.mjs';
const build=JSON.parse(fs.readFileSync('artifacts/product-0.3.2/build.json'));
const app=path.join(build.build,'app'),cli=path.join(app,'relay_product/cli.mjs');
const home=fs.mkdtempSync(path.join(import.meta.dirname,'product-fixture-')),codex=path.join(home,'codex');fs.mkdirSync(codex);
const issued=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const input='signed-bundle-history '.repeat(410000);let forwarded=0;
const upstream=http.createServer(async(req,res)=>{
  const parts=[];for await(const chunk of req)parts.push(chunk);const request=JSON.parse(Buffer.concat(parts));
  assert.equal(request.input[0].content,input);forwarded++;
  const text=JSON.stringify({answer:'LARGE_BODY_OK',notes:'a1 b2 '.repeat(160)});
  const response={id:'r',object:'response',model:'gpt-6-astra',status:'in_progress',output:[]};
  const item={id:'m',type:'message',role:'assistant',phase:'final_answer',status:'in_progress',content:[]};
  res.writeHead(200,{'content-type':'text/event-stream'});
  for(const event of [
    {type:'response.created',response},
    {type:'response.output_item.added',output_index:0,item},
    {type:'response.content_part.added',output_index:0,content_index:0,item_id:'m',part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,item_id:'m',delta:text},
    {type:'response.completed',response:{...response,status:'completed',output:[{...item,status:'completed',content:[{type:'output_text',text}]}]}}
  ])res.write(sse(event));
  res.end();
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
const env={...process.env,TDH_TEST_UPSTREAM_PORT:String(upstream.address().port),NODE_OPTIONS:'--import='+pathToFileURL(path.join(import.meta.dirname,'desktop_payload_preload.mjs')).href};
function run(args,input){
  const child=spawnSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8',input,env,timeout:30000,windowsHide:true});
  assert.equal(child.status,0,'bundle command failed: '+args[0]+' '+child.stderr?.slice(-200));return JSON.parse(child.stdout);
}
let started=false;
try{
  run(['init','--port','18597','--codex-home',codex]);run(['activate'],issued.key+'\n');run(['start']);started=true;
  const health=await (await fetch('http://127.0.0.1:18597/healthz')).json();assert.equal(health.version,'0.3.2');assert.equal(health.limits.requestBodyBytes,67108864);
  const original=Buffer.from(JSON.stringify({model:'gpt-6-astra',stream:false,input}));assert.ok(original.length>8388608);
  const response=await fetch('http://127.0.0.1:18597/v1/responses',{method:'POST',headers:{authorization:'Bearer synthetic.bundle.fixture.signature','content-type':'application/json','content-encoding':'zstd'},body:zstdCompressSync(original)});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.output[0].content[0].text,'LARGE_BODY_OK');assert.equal(forwarded,1);
  run(['stop']);started=false;
  const helper=path.join(app,'relay_product/device.ps1'),bytes=fs.readFileSync(helper);
  try{
    fs.appendFileSync(helper,'\n# integrity fixture\n');
    const child=spawnSync(process.execPath,[cli,'start','--home',home],{encoding:'utf8',timeout:15000,windowsHide:true});
    assert.notEqual(child.status,0);assert.match(child.stderr,/release_integrity_failed/);
  }finally{fs.writeFileSync(helper,bytes);}
  const report={passed:true,version:'0.3.2',decodedBytes:original.length,policyOutput:'LARGE_BODY_OK',upstream:'synthetic_loopback_fixture',liveLicense:true,signedBundleUnchanged:true,tamperRejected:true,bodyLimit:health.limits.requestBodyBytes};
  fs.writeFileSync('artifacts/product-0.3.2/bundle-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  if(started)run(['stop']);
  upstream.closeAllConnections();await new Promise(r=>upstream.close(r));
}
