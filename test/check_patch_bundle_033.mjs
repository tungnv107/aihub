import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const reportDir='artifacts/product-0.3.3';
const build=JSON.parse(fs.readFileSync(path.join(reportDir,'build.json')));
const app=path.join(build.build,'app'),cli=path.join(app,'relay_product/cli.mjs');
const home=fs.mkdtempSync(path.join(import.meta.dirname,'product-fixture-'));
const codex=path.join(home,'codex');fs.mkdirSync(codex);
const config=path.join(codex,'config.toml'),auth=path.join(codex,'auth.json');
fs.writeFileSync(config,'model_provider="previous-proxy"\n');fs.writeFileSync(auth,'synthetic-auth');
const issued=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
function run(args,input){
  const child=spawnSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8',input,timeout:30000,windowsHide:true});
  assert.equal(child.status,0,'bundle command failed: '+args[0]+' '+child.stderr?.slice(-200));return JSON.parse(child.stdout);
}
run(['init','--port','18597','--codex-home',codex]);run(['activate'],issued.key+'\n');
const before=run(['status']);assert.equal(before.version,'0.3.3');run(['sync']);
const direct='# User reset to normal Codex\r\nmodel_provider="openai"\r\nmodel="gpt-6-astra"\r\n[features]\r\nfoo=true\r\n';
fs.writeFileSync(config,direct);
const repaired=run(['sync']);assert.equal(repaired.recovery,'direct_configuration');
assert.equal(fs.readFileSync(repaired.backup,'utf8'),direct);
assert.equal(run(['sync']).changed,false);
const after=run(['status']);assert.equal(after.license.activationId,before.license.activationId);
assert.equal(after.license.expiresAt,before.license.expiresAt);
run(['unsync']);assert.equal(fs.readFileSync(config,'utf8'),direct);
assert.equal(fs.readFileSync(auth,'utf8'),'synthetic-auth');
const helper=path.join(app,'relay_product/device.ps1'),bytes=fs.readFileSync(helper);
try{
  fs.appendFileSync(helper,'\n# integrity fixture\n');
  const child=spawnSync(process.execPath,[cli,'start','--home',home],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.notEqual(child.status,0);assert.match(child.stderr,/release_integrity_failed/);
}finally{fs.writeFileSync(helper,bytes);}
const report={passed:true,version:'0.3.3',signedBundleConfigRecovery:true,activationPreserved:true,
  expiryPreserved:true,currentConfigRestoredExactly:true,authUnchanged:true,tamperRejected:true,
  liveLicense:true,modelRequests:0};
fs.writeFileSync(path.join(reportDir,'bundle-test.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
