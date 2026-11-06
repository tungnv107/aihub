import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {ProductState} from '../relay_product/state.mjs';
import {createDesktopServer} from '../relay_product/desktop.mjs';
import {sse} from '../self_relay/protocol.mjs';
const testRoot=path.dirname(fileURLToPath(import.meta.url));
const root=fs.mkdtempSync(path.join(testRoot,'codex-product-client-'));
const codexHome=path.join(root,'codex');fs.mkdirSync(codexHome);
const state=new ProductState(path.join(root,'relay'));
state.initialize(JSON.parse(fs.readFileSync(path.join(testRoot,'../relay_product/policy.local-reference.json'))));
let requests=0,bodyPolicy=false;const inbound=[];
const server=createDesktopServer(state,{transport:async(target,options)=>{
  if(target.includes('/models'))return Response.json({models:[]});
  requests++;
  const body=JSON.parse(options.body);bodyPolicy=body.text?.format?.name==='codehole_response';
  const text=JSON.stringify({answer:'CODEX_PRODUCT_OK',notes:'a1 b2 '.repeat(160)});
  const envelope={id:'resp_codex_fixture',object:'response',model:body.model,status:'in_progress',output:[],usage:null};
  const item={id:'msg_codex_fixture',type:'message',role:'assistant',phase:'final_answer',status:'in_progress',content:[]};
  const bytes=Buffer.concat([
    {type:'response.created',response:envelope},
    {type:'response.output_item.added',output_index:0,item},
    {type:'response.content_part.added',output_index:0,content_index:0,item_id:item.id,part:{type:'output_text',text:'',annotations:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text}
  ].map(sse));
  let emitted=false;
  return new Response(new ReadableStream({pull(controller){if(!emitted){emitted=true;controller.enqueue(bytes);}}},{highWaterMark:0}),{headers:{'content-type':'text/event-stream'}});
}});
server.prependListener('request',req=>inbound.push({route:req.url,method:req.method,encoding:req.headers['content-encoding']??'identity',contentType:req.headers['content-type']}));
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port+'/v1';
const claims={sub:'fixture-user',email:'fixture@example.invalid',exp:Math.floor(Date.now()/1000)+3600,
 'https://api.openai.com/auth':{chatgpt_account_id:'fixture-account',chatgpt_plan_type:'plus'}};
const jwt=Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture';
fs.writeFileSync(path.join(codexHome,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:{id_token:jwt,access_token:jwt,refresh_token:'fixture-no-live-refresh',account_id:'fixture-account'},last_refresh:new Date().toISOString()}));
fs.writeFileSync(path.join(codexHome,'config.toml'),'openai_base_url = '+JSON.stringify(base)+'\nmodel = "gpt-6-astra"\ncli_auth_credentials_store = "file"\n');
const binary='C:/nvm4w/nodejs/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe';
const finalFile=path.join(root,'answer.txt');
const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
env.CODEX_HOME=codexHome;
const child=spawn(binary,['exec','--skip-git-repo-check','--sandbox','read-only','--json','--output-last-message',finalFile,'Reply exactly CODEX_PRODUCT_OK. Do not run tools.'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
const timer=setTimeout(()=>child.kill(),45000);
const [exitCode]=await once(child,'exit');clearTimeout(timer);
server.closeAllConnections();await new Promise(resolve=>server.close(resolve));state.close();
const answer=fs.existsSync(finalFile)?fs.readFileSync(finalFile,'utf8').trim():null;
const report={exitCode,requests,bodyPolicy,answer,inbound,passed:exitCode===0&&requests>0&&answer==='CODEX_PRODUCT_OK',
  client:'codex-cli 0.154.0 Windows',authentication:'synthetic ChatGPT-shaped fixture, no real credentials',external_inference:false,
  stderr:stderr.slice(-1800),stdout:stdout.slice(-1800)};
fs.writeFileSync(path.join(testRoot,'ch-relay-evidence/product-20261030/codex-client.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
