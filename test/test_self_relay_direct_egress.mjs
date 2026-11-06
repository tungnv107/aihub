import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {once} from 'node:events';
import {directRequest,assertDestination,outboundManifest} from '../self_relay/security.mjs';

test('all declared inference and OAuth endpoints pass; external destinations fail before transport',async()=>{
  for(const entry of outboundManifest())for(const pathname of entry.paths)assertDestination(entry.origin+pathname);
  assertDestination('https://chatgpt.com/backend-api/codex/models?client_version=0.155.1');
  const original=https.request;let called=0;
  https.request=()=>{called++;throw new Error('unexpected transport');};
  try{
    for(const destination of ['http://api.openai.com/v1/responses','https://api.openai.com.evil.test/v1/responses',
      'https://api.openai.com:8443/v1/responses','https://127.0.0.1/v1/responses',
      'https://user:password@api.openai.com/v1/responses','https://api.openai.com/v1/responses#fragment',
      'https://api.openai.com/v1/responses?redirect=https://evil.test',
      'https://chatgpt.com/backend-api/codex/models?redirect=https://evil.test']){
      await assert.rejects(directRequest(destination),error=>/^outbound_/.test(error.code));
    }
    assert.equal(called,0);
  }finally{https.request=original;}
});

test('explicit direct agent ignores proxy environment and global agent; redirects are never followed',async()=>{
  let proxyCalls=0;const received=[];let directAgent;
  const trap=http.createServer((request,response)=>{proxyCalls++;response.end('unexpected proxy');});
  trap.on('connect',(request,socket)=>{proxyCalls++;socket.destroy();});
  const target=http.createServer((request,response)=>{
    const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
      received.push({headers:request.headers,body:Buffer.concat(chunks).toString()});
      response.writeHead(302,{location:`http://127.0.0.1:${trap.address().port}/redirect`});response.end('redirect');
    });
  });
  trap.listen(0,'127.0.0.1');target.listen(0,'127.0.0.1');
  await Promise.all([once(trap,'listening'),once(target,'listening')]);
  const proxyUrl=`http://127.0.0.1:${trap.address().port}`;
  const envNames=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_USE_ENV_PROXY'];
  const oldEnv=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
  for(const name of envNames)process.env[name]=name==='NODE_USE_ENV_PROXY'?'1':proxyUrl;
  const originalRequest=https.request,originalGlobal=https.globalAgent;
  const poisonedGlobal=new https.Agent({proxyEnv:{HTTPS_PROXY:proxyUrl,HTTP_PROXY:proxyUrl}});
  https.globalAgent=poisonedGlobal;
  let originalConnection;
  https.request=(url,options,callback)=>{
    assert.equal(url.origin,'https://api.openai.com');
    assert.ok(options.agent instanceof https.Agent);
    assert.notEqual(options.agent,https.globalAgent);
    assert.deepEqual(options.agent.options.proxyEnv,{});
    assert.equal(options.rejectUnauthorized,true);
    assert.equal(options.agent.options.rejectUnauthorized,true);
    if(!directAgent){
      directAgent=options.agent;originalConnection=directAgent.createConnection;
      // Test-only socket injection: every real socket stays on loopback, with no OpenAI traffic.
      directAgent.createConnection=()=>net.connect({host:'127.0.0.1',port:target.address().port});
    }
    assert.equal(options.agent,directAgent);
    return originalRequest(url,options,callback);
  };
  try{
    for(let index=0;index<2;index++){
      const response=await directRequest('https://api.openai.com/v1/responses',{
        method:'POST',body:'synthetic body',signal:AbortSignal.timeout(3000),
        headers:{authorization:'Bearer synthetic-test-only',host:'evil.test','proxy-authorization':'synthetic-proxy-secret','proxy-connection':'keep-alive'},
      });
      assert.equal(response.status,302);await response.text();
    }
    assert.equal(received.length,2);assert.equal(proxyCalls,0);
    for(const request of received){
      assert.equal(request.headers.host,'api.openai.com');
      assert.equal(request.headers.authorization,'Bearer synthetic-test-only');
      assert.equal(request.headers['proxy-authorization'],undefined);
      assert.equal(request.headers['proxy-connection'],undefined);
      assert.equal(request.body,'synthetic body');
    }
  }finally{
    https.request=originalRequest;https.globalAgent=originalGlobal;poisonedGlobal.destroy();
    if(directAgent){directAgent.destroy();directAgent.createConnection=originalConnection;}
    for(const name of envNames){if(oldEnv[name]===undefined)delete process.env[name];else process.env[name]=oldEnv[name];}
    target.closeAllConnections();trap.closeAllConnections();
    await Promise.all([new Promise(resolve=>target.close(resolve)),new Promise(resolve=>trap.close(resolve))]);
  }
});
