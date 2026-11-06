#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ProductState} from '../relay_product/state.mjs';
import {syncCodex,unsyncCodex} from '../relay_product/config.mjs';
import {createDesktopServer} from '../relay_product/desktop.mjs';
import policy from '../relay_product/policy.local-reference.json' with {type:'json'};
import {CredentialStore} from './credentials.mjs';
import {Sub2ApiLicense,normalizeServer} from './sub2api-license.mjs';
import {VERSION,PRODUCT,DEFAULT_PORT,PINNED_SERVER} from './settings.mjs';
import {promptLine,confirmSetup,showReady,showError} from './terminal.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const defaultHome=()=>process.platform==='win32'?path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ChRelay'):
  process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/ChRelay'):path.join(os.homedir(),'.local/share/ch-relay');
const instance=state=>crypto.createHash('sha256').update(state.get('control_token')??'').digest('hex').slice(0,24);
const help=`AIHub ${VERSION} — đăng nhập bằng API key Sub2API

  aihub                                        Thiết lập lần đầu hoặc chạy lại
  aihub setup                                  Tiếp tục thiết lập trong terminal
  aihub login${PINNED_SERVER?'':' --server https://aihub.example.com'}   Nhập/đổi key ẩn
  aihub sync                                   Sao lưu và kết nối Codex với relay
  aihub start | serve | stop                    Chạy nền / chạy foreground / dừng
  aihub status | license                        Xem trạng thái, kiểm tra key online
  aihub unsync                                  Khôi phục cấu hình Codex
  aihub logout                                  Dừng relay và xóa key đã lưu

Tùy chọn: --home <thư mục>, --codex-home <thư mục>, --port <cổng>
Tự động hóa: --server <URL> --key-stdin --yes; hoặc AIHUB_API_KEY.
--yes đồng ý áp dụng cấu hình khi setup không có terminal tương tác.
HTTP chỉ được dùng với localhost. Dùng HTTPS cho máy chủ thật.
Khách vẫn đăng nhập tài khoản ChatGPT riêng trong Codex.
`;
function parse(argv){
  const args=[...argv],command=args[0]&&!args[0].startsWith('--')?args.shift():'launch',options={};
  while(args.length){
    const key=args.shift();
    if(['--key-stdin','--yes'].includes(key)){options[key]=true;continue;}
    if(!['--home','--server','--codex-home','--port'].includes(key)||options[key]!==undefined)throw Error('invalid_arguments');
    const value=args.shift();if(!value||value.startsWith('--'))throw Error('invalid_arguments');options[key]=value;
  }
  if(options['--port']&&!/^\d+$/.test(options['--port']))throw Error('invalid_port');
  const port=Number(options['--port']??DEFAULT_PORT);if(port<1024||port>65535)throw Error('invalid_port');
  return {command,options,port};
}
async function readKey(options){
  if(options['--key-stdin']){
    let text='';for await(const chunk of process.stdin){text+=chunk.toString();if(text.length>4098)throw Error('api_key_invalid');}return text.trim();
  }
  if(process.env.AIHUB_API_KEY||process.env.CH_RELAY_API_KEY){
    const key=process.env.AIHUB_API_KEY??process.env.CH_RELAY_API_KEY;
    delete process.env.AIHUB_API_KEY;delete process.env.CH_RELAY_API_KEY;return key.trim();
  }
  if(!process.stdin.isTTY)throw Error('use_key_stdin_or_interactive_terminal');
  process.stderr.write('API key Sub2API (ẩn): ');process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let key='';
    const finish=(error)=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');error?reject(error):resolve(key);};
    const onData=chunk=>{
      for(const char of chunk.toString('utf8')){
        if(char==='\u0003')return finish(Error('login_cancelled'));
        if(char==='\r'||char==='\n')return finish();
        if(char==='\u007f'||char==='\b')key=key.slice(0,-1);
        else if(char>=' '&&char<='~')key+=char;
        if(key.length>4096)return finish(Error('api_key_invalid'));
      }
    };process.stdin.on('data',onData);
  });
}
async function health(state,retries=2,starting=false){
  let response;
  try{response=await fetch('http://127.0.0.1:'+state.settings.get('relay.port')+'/healthz',{signal:AbortSignal.timeout(5000)});}
  catch(error){
    if(error.cause?.code==='ECONNREFUSED')return null;
    if(['ECONNRESET','UND_ERR_SOCKET'].includes(error.cause?.code)){
      if(retries>0){await sleep(150);return health(state,retries-1,starting);}
      // On Windows a closed loopback port can report reset instead of refused.
      // Only startup may probe by binding; EADDRINUSE still prevents taking another service's port.
      if(starting)return null;
    }
    throw Error('relay_control_unavailable_'+String(error.cause?.code??error.name).toLowerCase());
  }
  let data;try{data=await response.json();}catch{throw Error('port_owned_by_another_service');}
  if(!response.ok||data.service!==PRODUCT||data.instance!==instance(state))throw Error('port_owned_by_another_service');
  return data;
}
async function stop(state){
  if(!await health(state))return {stopped:true,wasRunning:false};
  const response=await fetch('http://127.0.0.1:'+state.settings.get('relay.port')+'/control/stop',{
    method:'POST',headers:{'x-tdh-control':state.get('control_token')},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('relay_stop_failed');await response.arrayBuffer();
  for(let i=0;i<60;i++){if(!await health(state))return {stopped:true,wasRunning:true};await sleep(100);}
  throw Error('relay_still_stopping');
}
async function start(state,home){
  const running=await health(state,2,true);if(running)return {started:false,health:running};
  const logs=path.join(home,'logs');fs.mkdirSync(logs,{recursive:true,mode:0o700});
  const fd=fs.openSync(path.join(logs,'relay.log'),'a',0o600);
  let child;
  try{
    const env={...process.env};delete env.CH_RELAY_API_KEY;delete env.AIHUB_API_KEY;
    child=spawn(process.execPath,[path.resolve(process.argv[1]),'serve','--home',home],{detached:true,windowsHide:true,stdio:['ignore',fd,fd],env});
  }finally{fs.closeSync(fd);}
  let failed=false;child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;});child.unref();
  for(let i=0;i<150;i++){
    const running=await health(state,2,true);if(running)return {started:true,health:running};
    if(failed)break;await sleep(100);
  }
  throw Error('relay_start_failed_read_local_log');
}
async function serve(state,license){
  if(state.policies.snapshot().mode!=='enforce')throw Error('reviewed_policy_not_enabled');
  await license.ensure();let stopping=false;
  const shutdown=()=>{
    if(stopping)return;stopping=true;
    server.close(()=>{state.close();process.exitCode=0;});
    server.closeIdleConnections();setTimeout(()=>server.closeAllConnections(),1000).unref();
  };
  const server=createDesktopServer(state,{license,onStop:shutdown,identity:{service:PRODUCT,version:VERSION,instance:instance(state)}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(state.settings.get('relay.port'),'127.0.0.1',resolve);});
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  console.log(JSON.stringify({event:'listening',service:PRODUCT,version:VERSION,address:server.address(),license:license.status()}));
}
export async function main(argv=process.argv.slice(2)){
  // Preserve existing installations while AIHub becomes the public brand.
  for(const name of ['HOME','SERVER','API_KEY'])if(!process.env['AIHUB_'+name]&&process.env['CODEXUNLIMIT_'+name])process.env['AIHUB_'+name]=process.env['CODEXUNLIMIT_'+name];
  delete process.env.CODEXUNLIMIT_API_KEY;
  if(['--help','-h'].includes(argv[0]))argv=['help'];
  if(argv[0]==='--version')argv=['version'];
  const {command,options,port}=parse(argv);
  if(command==='help'){console.log(help);return;}
  if(command==='version'){console.log(VERSION);return;}
  if(!['launch','setup','login','sync','unsync','start','stop','serve','status','license','logout'].includes(command))throw Error('unknown_command');
  const home=path.resolve(options['--home']??process.env.AIHUB_HOME??defaultHome()),state=new ProductState(home),credentials=new CredentialStore(home);
  const license=new Sub2ApiLicense({credentials});let serving=false;
  try{
    if(['launch','login','setup'].includes(command)){
      const interactive=command!=='login';
      if(interactive)console.log('AIHub '+VERSION+'\n');
      if(options['--port']&&state.get('initialized')&&state.settings.get('relay.port')!==port)throw Error('port_change_requires_new_home');
      const codexHome=options['--codex-home']??state.get('codex_home')??process.env.CODEX_HOME??path.join(os.homedir(),'.codex');
      if(state.get('codex_sync')&&path.resolve(codexHome)!==state.get('codex_home'))throw Error('unsync_before_changing_codex_home');
      const saved=state.get('initialized')&&fs.existsSync(credentials.file);
      const newKey=command==='login'||!saved||options['--key-stdin']||process.env.AIHUB_API_KEY||process.env.CH_RELAY_API_KEY;
      if(newKey){
        const selectedServer=options['--server']||PINNED_SERVER||process.env.AIHUB_SERVER||(saved?credentials.load().server:'')||await promptLine('Địa chỉ máy chủ dịch vụ: ');
        const server=normalizeServer(selectedServer),candidate={server,key:await readKey(options)};
        await license.validate(candidate);
        // Invalid login leaves the existing credential and running process intact.
        if(state.get('initialized'))await stop(state);
        state.initialize(policy,{port,codexHome});credentials.save(candidate);candidate.key='';
      }else if(options['--server']&&normalizeServer(options['--server'])!==credentials.load().server){
        throw Error('use_login_to_change_server');
      }
      await license.ensure();
      if(command==='login'){console.log(JSON.stringify({loggedIn:true,home,license:license.status()}));return;}
      let started;
      if(!state.get('codex_sync')||command==='setup'){
        console.log('Key hợp lệ. Hạn sử dụng: '+new Date(license.status().expiresAt).toLocaleString('vi-VN')+'.');
        console.log('Thiết lập sẽ sao lưu cấu hình và kết nối Codex với dịch vụ local.');
        if(!await confirmSetup({yes:options['--yes']})){console.log('Đã hủy áp dụng kết nối. Chạy aihub để tiếp tục khi sẵn sàng.');return;}
        // Recheck after the user prompt, which may remain open past expiry.
        await license.ensure();
        state.initialize(policy,{port,codexHome});
        // Ensure a working listener before changing Codex's route.
        started=await start(state,home);
        try{
          const configured=syncCodex(state);
          if(configured.backup)console.log('Bản sao cấu hình: '+configured.backup);
        }catch(error){if(started.started)await stop(state).catch(()=>{});throw error;}
      }
      started??=await start(state,home);showReady(license.status(),started);return;
    }
    if(!state.get('initialized')){
      if(command==='logout'){credentials.clear();console.log(JSON.stringify({loggedOut:true}));return;}
      throw Error('login_required');
    }
    let result;
    if(command==='stop')result=await stop(state);
    else if(command==='unsync')result=unsyncCodex(state);
    else if(command==='logout'){await stop(state);credentials.clear();result={loggedOut:true};}
    else if(command==='status'){
      let error;try{await license.ensure();}catch(e){error=e.code??e.message;process.exitCode=1;}
      result={service:PRODUCT,version:VERSION,home,license:{...license.status(),...(error?{error}:{})},health:await health(state),codexConfigured:!!state.get('codex_sync')};
    }else{
      await license.ensure();
      if(command==='license')result=license.status();
      if(command==='sync')result=syncCodex(state);
      if(command==='start')result=await start(state,home);
      if(command==='serve'){await serve(state,license);serving=true;return;}
    }
    console.log(JSON.stringify(result));
  }finally{if(!serving)state.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{
    const first=process.argv[2];
    if(!first||first.startsWith('--')||first==='setup')showError(error);
    else console.error(JSON.stringify({error:/^[a-z_]+$/.test(error.code??error.message)?error.code??error.message:'operation_failed',help:'Chạy aihub --help. Kiểm tra URL Sub2API, trạng thái key và ngày hết hạn.'}));
    process.exitCode=1;
  });
}
