import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {VERSION} from '../ch_relay/settings.mjs';

const packageName=process.env.AIHUB_TEST_PACKAGE??'aihub-local';
assert.match(packageName,/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const root=path.resolve(import.meta.dirname,'..'),archive=path.join(root,'dist',packageName.replace(/^@/,'').replace('/','-')+'-'+VERSION+'.tgz');
function run(command,args,{input='',env=process.env}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env,windowsHide:true,windowsVerbatimArguments:process.platform==='win32'&&path.basename(command).toLowerCase()==='cmd.exe',stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();reject(Error('child_timeout'));},30000);
    child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);
    child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});child.stdin.end(input);
  });
}
test('packed npm installs and supports login/start/expire/renew/unsync/logout in isolated homes',{skip:!fs.existsSync(archive),timeout:60000},async()=>{
  const dir=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-')),home=path.join(dir,'home'),codex=path.join(dir,'codex'),prefix=path.join(dir,'npm');
  const key='sk-'+'package-smoke-synthetic-key';let active=true;
  const authority=http.createServer((req,res)=>{
    if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end('{}');return;}
    res.writeHead(active?200:403,{'content-type':'application/json'});
    res.end(JSON.stringify(active?{schema:'ch-relay-license-v1',active:true,feature:'ch-relay',key_id:1,
      server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}:{error:{code:'API_KEY_EXPIRED'}}));
  });authority.listen(0,'127.0.0.1');await once(authority,'listening');const base='http://127.0.0.1:'+authority.address().port;
  const portServer=http.createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const cli=path.join(prefix,process.platform==='win32'?'node_modules':'lib/node_modules',packageName,'bin/ch-relay.mjs');
  const invoke=(command,args=[],input='')=>run(process.execPath,[cli,...(command?[command]:[]),'--home',home,...args],{input});
  try{
    const install=await run(process.execPath,[npmCli,'install','--global','--prefix',prefix,'--no-audit','--no-fund','--ignore-scripts','--offline',archive]);
    assert.equal(install.code,0,install.stderr);
    const bin=path.join(prefix,process.platform==='win32'?'aihub.cmd':'bin/aihub');
    assert.equal(fs.existsSync(bin),true);
    const shim=process.platform==='win32'?await run(process.env.ComSpec??'cmd.exe',['/d','/s','/c','""'+bin+'" --version"']):await run(bin,['--version']);
    assert.equal(shim.code,0,shim.stderr);assert.equal(shim.stdout.trim(),VERSION);
    fs.mkdirSync(codex);const original='model = "fixture-model"\n';fs.writeFileSync(path.join(codex,'config.toml'),original);
    fs.writeFileSync(path.join(codex,'auth.json'),'existing-chatgpt-login');
    let result=await invoke('', ['--server',base,'--port',String(port),'--codex-home',codex,'--key-stdin','--yes'],key);
    assert.equal(result.code,0,result.stderr);assert.equal((result.stdout+result.stderr).includes(key),false);
    assert.match(result.stdout,/Hoàn tất/);
    // Truly no arguments on the second run: persisted credentials/settings are reused.
    const repeatEnv={...process.env,AIHUB_HOME:home};delete repeatEnv.AIHUB_API_KEY;delete repeatEnv.CH_RELAY_API_KEY;
    result=await run(process.execPath,[cli],{env:repeatEnv});assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/đang chạy nền/);
    assert.equal((await (await fetch('http://127.0.0.1:'+port+'/healthz')).json()).service,'ch-relay');
    active=false;result=await invoke('license');assert.equal(result.code,1);assert.match(result.stderr,/api_key_expired/);
    const denied=await fetch('http://127.0.0.1:'+port+'/v1/models',{headers:{authorization:'Bearer fixture-chatgpt-token-0000000'}});
    assert.equal(denied.status,403);await denied.arrayBuffer();
    active=true;result=await invoke('license');assert.equal(result.code,0,result.stderr);
    result=await invoke('stop');assert.equal(result.code,0,result.stderr);
    active=false;result=await invoke('unsync');assert.equal(result.code,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(codex,'config.toml'),'utf8'),original);
    assert.equal(fs.readFileSync(path.join(codex,'auth.json'),'utf8'),'existing-chatgpt-login');
    result=await invoke('logout');assert.equal(result.code,0,result.stderr);assert.equal(fs.existsSync(path.join(home,'credentials.json')),false);
  }finally{
    if(fs.existsSync(cli))await invoke('stop');
    authority.closeAllConnections();await new Promise(r=>authority.close(r));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
