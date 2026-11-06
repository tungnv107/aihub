import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {ProductState,VERSION,PRODUCT,DEFAULT_PORT} from './state.mjs';
import {syncCodex,unsyncCodex} from './config.mjs';
import {createDesktopServer} from './desktop.mjs';
import {LicenseClient} from './license-client.mjs';
import {verifyInstalledRelease} from './release-integrity.mjs';
import bundledPolicy from './policy.local-reference.json' with {type:'json'};

const directory=path.dirname(fileURLToPath(import.meta.url));
const defaults=process.platform==='win32'?path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'TDHRelay'):
  process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/TDHRelay'):path.join(os.homedir(),'.local/share/tdh-relay');
const args=process.argv.slice(2),command=args.shift()??'status';
function argument(name,fallback){const i=args.indexOf(name);if(i===-1)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('missing_'+name);return args[i+1];}
const home=path.resolve(argument('--home',defaults));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(state,route,options={}){
  const response=await fetch('http://127.0.0.1:'+state.settings.get('relay.port')+route,{...options,signal:AbortSignal.timeout(1500)});
  if(!response.ok)throw Error('control_http_'+response.status);
  const data=await response.json();
  if(route==='/healthz'&&(data.service!==PRODUCT||data.mode!=='desktop'))throw Error('port_owned_by_another_service');
  return data;
}
async function running(state){
  try{return await request(state,'/healthz');}
  catch(error){if(error.message==='port_owned_by_another_service')throw error;return null;}
}
async function stop(state){
  if(!await running(state))return {stopped:true,wasRunning:false};
  await request(state,'/control/stop',{method:'POST',headers:{'x-tdh-control':state.get('control_token')}});
  for(let attempt=0;attempt<60;attempt++){if(!await running(state))return {stopped:true,wasRunning:true};await sleep(100);}
  throw Error('relay_still_stopping');
}
async function start(state){
  const existing=await running(state);if(existing)return {started:false,health:existing};
  const logs=path.join(home,'logs');fs.mkdirSync(logs,{recursive:true,mode:0o700});
  const output=fs.openSync(path.join(logs,'desktop.log'),'a',0o600);
  const child=spawn(process.execPath,[path.join(directory,'cli.mjs'),'serve','--home',home],{detached:true,windowsHide:true,stdio:['ignore',output,output]});
  child.unref();fs.closeSync(output);
  for(let attempt=0;attempt<60;attempt++){const health=await running(state);if(health)return {started:true,health};await sleep(100);}
  throw Error('relay_start_failed_read_local_log');
}
async function main(){
  if(command==='version'){console.log(VERSION);return;}
  // Stop and unsync remain available even after license expiry or a damaged update.
  if(!['stop','unsync'].includes(command))verifyInstalledRelease(directory);
  const state=new ProductState(home);let serving=false;
  try{
    let result;
    if(command==='init'){
      const policy=bundledPolicy;
      state.initialize(policy,{port:Number(argument('--port',DEFAULT_PORT)),codexHome:argument('--codex-home',process.env.CODEX_HOME??path.join(os.homedir(),'.codex'))});
      result={initialized:true,home,version:VERSION,policy:state.policies.snapshot()};
    }else{
      if(!state.get('initialized'))throw Error('run_init_first');
      const license=['stop','unsync'].includes(command)?null:new LicenseClient(state);
      if(command==='activate'){
        let key='';for await(const chunk of process.stdin){key+=chunk.toString();if(key.length>200)throw Error('invalid_activation_key');}
        await license.activate(key.trim());result=license.status();key='';
      }else if(command==='license'){await license.ensure('desktop',{online:true});result=license.status();}
      else if(command==='sync'){await license.ensure();result=syncCodex(state);}
      else if(command==='unsync')result=unsyncCodex(state);
      else if(command==='start'){await license.ensure();result=await start(state);}
      else if(command==='stop')result=await stop(state);
      else if(command==='health'){result=await running(state);if(!result)throw Error('relay_not_running');}
      else if(command==='status')result={version:VERSION,home,license:license.status(),health:await running(state),policy:state.policies.snapshot(),codexConfigured:!!state.get('codex_sync'),
        requests:state.db.prepare('SELECT COUNT(*) count FROM desktop_usage').get().count};
      else if(command==='serve'){
        if(state.policies.snapshot().mode!=='enforce')throw Error('reviewed_policy_not_enabled');
        await license.ensure();
        let shuttingDown=false;
        const shutdown=()=>{
          if(shuttingDown)return;shuttingDown=true;
          server.close(()=>{setTimeout(()=>process.exit(0),100).unref();});
          server.closeIdleConnections();
          setTimeout(()=>server.closeAllConnections(),1000).unref();
        };
        const server=createDesktopServer(state,{onStop:shutdown,license});
        server.listen(state.settings.get('relay.port'),'127.0.0.1');
        await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
        serving=true;
        process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
        console.log(JSON.stringify({event:'listening',product:PRODUCT,version:VERSION,address:'127.0.0.1',port:state.settings.get('relay.port'),policy:state.policies.snapshot()}));
        return;
      }else throw Error('unknown_command');
    }
    console.log(JSON.stringify(result));
  }finally{if(!serving)state.close();}
}
main().catch(error=>{console.error(JSON.stringify({error:/^[a-z0-9_]+$/.test(error.message)?error.message:'operation_failed',help:'See local logs and the TDH Relay installation guide.'}));process.exitCode=1;});
