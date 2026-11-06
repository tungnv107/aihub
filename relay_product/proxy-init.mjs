import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {EXECUTABLE_POLICY_REVISION} from '../self_relay/policy-runtime.mjs';
import {ProductState} from './state.mjs';
import {verifyInstalledRelease} from './release-integrity.mjs';
import bundledPolicy from './policy.local-reference.json' with {type:'json'};

const directory=path.dirname(fileURLToPath(import.meta.url));
verifyInstalledRelease(directory);
const i=process.argv.indexOf('--home'),home=path.resolve(i<0?'proxy-data':process.argv[i+1]);
fs.mkdirSync(home,{recursive:true,mode:0o700});
const secretFile=path.join(home,'secrets.env');
if(!fs.existsSync(secretFile)){
  const names=['RELAY_MASTER_KEY','RELAY_ADMIN_KEY','RELAY_API_KEY'];
  fs.writeFileSync(secretFile,names.map(name=>name+'='+crypto.randomBytes(32).toString('base64')).join('\n')+'\n',{mode:0o600,flag:'wx'});
}
const secret=Object.fromEntries(fs.readFileSync(secretFile,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const store=new Store(path.join(home,'relay.sqlite'),Buffer.from(secret.RELAY_MASTER_KEY,'base64'));
try{
  store.bootstrap(secret.RELAY_ADMIN_KEY,secret.RELAY_API_KEY);
  store.settings.set('relay.port',8320);
  store.settings.set('relay.bind_host','0.0.0.0');
  store.settings.set('relay.extra_allowed_hosts',['self-relay:8320','tdh-relay:8320','127.0.0.1:18320','localhost:18320']);
  const policy=bundledPolicy;
  const current=store.policies.status();
  if(current.activeRevision!==EXECUTABLE_POLICY_REVISION||current.mode!=='enforce'){
    const imported=store.policies.import({policy,expectedGeneration:current.generation,provenance:{scope:'tdh-relay-proxy-package'}});
    store.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:imported.generation});
  }
  console.log(JSON.stringify({initialized:true,database:store.filename,secrets:secretFile,policy:store.policies.snapshot(),accounts:store.list('local').length}));
  const product=new ProductState(home);try{product.initialize(policy);}finally{product.close();}
}finally{store.close();}
