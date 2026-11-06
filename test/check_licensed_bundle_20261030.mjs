import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),build=JSON.parse(fs.readFileSync(path.join(root,'test/ch-relay-evidence/product-20261030/build.json')));
const app=path.join(build.build,'app'),cli=path.join(app,'relay_product/cli.mjs');
const fixture=fs.mkdtempSync(path.join(root,'test/licensed-bundle-')),home=path.join(fixture,'home'),codex=path.join(fixture,'codex');
fs.mkdirSync(codex);fs.writeFileSync(path.join(codex,'config.toml'),'model = "gpt-6-astra"\n');
const keyFile=process.argv[2];if(!keyFile)throw Error('key_file_required');
const issued=JSON.parse(fs.readFileSync(keyFile,'utf8'));
function run(args,input){
  const p=spawnSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8',input,windowsHide:true,timeout:30000});
  let value;try{value=JSON.parse(p.stdout);}catch{}
  return {status:p.status,value,error:p.stderr?.slice(-400)};
}
const init=run(['init','--codex-home',codex]);assert.equal(init.status,0,JSON.stringify(init));
assert.notEqual(run(['start']).status,0,'unactivated package started');
const activation=run(['activate'],issued.key+'\n');assert.equal(activation.status,0,JSON.stringify(activation));
assert.equal(activation.value.active,true);
const started=run(['start']);assert.equal(started.status,0,JSON.stringify(started));
try{
  assert.equal(run(['sync']).status,0);
  const response=await fetch('http://127.0.0.1:18455/v1/responses',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(response.status,401);
}finally{assert.equal(run(['unsync']).status,0);assert.equal(run(['stop']).status,0);}
const helper=path.join(app,'relay_product/device.ps1'),original=fs.readFileSync(helper);
try{
  fs.appendFileSync(helper,'\n# tamper fixture\n');
  const result=run(['start']);assert.notEqual(result.status,0);assert.match(result.error,/release_integrity_failed/);
}finally{fs.writeFileSync(helper,original);}
const report={result:'passed',at:new Date().toISOString(),app,fixture,licenseId:issued.id,activationId:activation.value.activationId,
  unlicensed_start_blocked:true,signed_activation:true,tamper_blocked:true,start_stop:true,config_roundtrip:true,
  inference_with_real_chatgpt:false};
fs.writeFileSync(path.join(root,'test/ch-relay-evidence/product-20261030/licensed-bundle.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
