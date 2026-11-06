import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const cli=path.resolve(import.meta.dirname,'../ch_relay/cli.mjs');
const key='sk-'+'interactive-fixture-secret-key';
async function fixture(){
  const dir=fs.mkdtempSync(path.join(import.meta.dirname,'ch-relay-fixture-')),codex=path.join(dir,'codex'),home=path.join(dir,'home');
  fs.mkdirSync(codex);fs.writeFileSync(path.join(codex,'config.toml'),'model = "fixture"\n');fs.writeFileSync(path.join(codex,'auth.json'),'unchanged');
  const preload=path.join(dir,'terminal.mjs');
  // Only the test process simulates a TTY; production always uses the actual terminal.
  fs.writeFileSync(preload,"Object.defineProperty(process.stdin,'isTTY',{value:true});process.stdin.setRawMode=()=>process.stdin;\n");
  let active=true;
  const server=http.createServer((req,res)=>{
    assert.equal(req.headers.authorization,'Bearer '+key);
    res.writeHead(active?200:403,{'content-type':'application/json'});
    res.end(JSON.stringify(active?{schema:'ch-relay-license-v1',active:true,feature:'ch-relay',key_id:2,
      server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}:{error:{code:'API_KEY_EXPIRED'}}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  async function run(answers,{tty=true,env={},args=[]}={}){
    return new Promise((resolve,reject)=>{
      const childEnv={...process.env,...env};delete childEnv.CH_RELAY_API_KEY;delete childEnv.AIHUB_API_KEY;
      const child=spawn(process.execPath,[...(tty?['--import',pathToFileURL(preload).href]:[]),cli,'--home',home,'--codex-home',codex,...args],{env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
      let stdout='',stderr='',index=0;const timer=setTimeout(()=>{child.kill();reject(Error('wizard_timeout: '+stdout+stderr));},20000);
      const answer=()=>{
        const next=answers[index];if(!next||!(stdout+stderr).includes(next.when))return;
        next.before?.();index++;
        if(index===answers.length)child.stdin.end(next.value);else child.stdin.write(next.value);
      };
      child.stdout.on('data',x=>{stdout+=x;answer();});child.stderr.on('data',x=>{stderr+=x;answer();});
      child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
      if(!answers.length)child.stdin.end();
    });
  }
  return {dir,codex,home,base,run,expire:()=>{active=false;},close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}};
}
test('default command prompts URL and hidden key, permits cancellation, and resumes without asking for the key again',{timeout:30000},async()=>{
  const f=await fixture();try{
    let result=await f.run([
      {when:'Địa chỉ máy chủ dịch vụ:',value:f.base+'\n'},
      {when:'API key Sub2API (ẩn):',value:key+'\r'},
      {when:'Nhấn Enter để áp dụng',value:'n\n'},
    ]);
    assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/Đã hủy áp dụng/);
    assert.equal((result.stdout+result.stderr).includes(key),false);
    assert.equal(fs.readFileSync(path.join(f.codex,'config.toml'),'utf8'),'model = "fixture"\n');
    result=await f.run([{when:'Nhấn Enter để áp dụng',value:'n\n'}]);
    assert.equal(result.code,0,result.stderr);assert.equal(result.stderr.includes('API key Sub2API'),false);
    assert.equal(fs.readFileSync(path.join(f.codex,'auth.json'),'utf8'),'unchanged');
  }finally{await f.close();}
});
test('expiry during the confirmation prompt prevents configuration changes',{timeout:30000},async()=>{
  const f=await fixture();try{
    const result=await f.run([
      {when:'API key Sub2API (ẩn):',value:key+'\r'},
      {when:'Nhấn Enter để áp dụng',before:f.expire,value:'\n'},
    ],{env:{AIHUB_SERVER:f.base}});
    assert.equal(result.code,1);assert.match(result.stderr,/Key đã hết hạn/);
    assert.equal((result.stdout+result.stderr).includes(key),false);
    assert.equal(fs.readFileSync(path.join(f.codex,'config.toml'),'utf8'),'model = "fixture"\n');
  }finally{await f.close();}
});
test('no terminal and no explicit automation options do not silently apply setup',async()=>{
  const f=await fixture();try{
    const result=await f.run([],{tty:false});assert.equal(result.code,1);assert.match(result.stderr,/terminal/);
    assert.equal(fs.readFileSync(path.join(f.codex,'config.toml'),'utf8'),'model = "fixture"\n');
  }finally{await f.close();}
});
