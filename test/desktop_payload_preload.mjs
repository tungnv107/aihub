// Test-process-only transport shim: signed bundle stays byte-for-byte intact.
// A synthetic request reaches a loopback fixture, never the actual model service.
import https from 'node:https';
import http from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
const original=https.request,port=Number(process.env.TDH_TEST_UPSTREAM_PORT);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('fixture_port_required');
https.request=function(url,options,callback){
  if(url.hostname==='chatgpt.com'&&url.pathname.startsWith('/backend-api/codex/')){
    return http.request(new URL('http://127.0.0.1:'+port+url.pathname),{...options,agent:false,headers:{...options.headers,host:'127.0.0.1:'+port}},callback);
  }
  return original.call(this,url,options,callback);
};
syncBuiltinESMExports();
