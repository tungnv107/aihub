import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Store} from './store.mjs';
import {RelayError} from './security.mjs';

let store;
try {
  const [command,...args]=process.argv.slice(2),options={};
  if(!['status','import','select','rollback'].includes(command))throw new RelayError(400,'policy_command_required');
  for(let i=0;i<args.length;i+=2){
    if(!['--db','--file','--sha256','--generation','--revision','--mode'].includes(args[i]) || !args[i+1] || Object.hasOwn(options,args[i]))
      throw new RelayError(400,'invalid_policy_cli_arguments');
    options[args[i]]=args[i+1];
  }
  if(!options['--db'])throw new RelayError(400,'explicit_policy_database_required');
  const filename=path.resolve(options['--db']);
  if(!fs.existsSync(filename))throw new RelayError(400,'existing_policy_database_required');
  let imported;
  if(command==='import'){
    if(!options['--file']||!/^[a-f0-9]{64}$/.test(options['--sha256']??''))throw new RelayError(400,'policy_file_and_hash_required');
    if(fs.statSync(options['--file']).size>131072)throw new RelayError(413,'policy_too_large');
    const bytes=fs.readFileSync(options['--file']),actual=crypto.createHash('sha256').update(bytes).digest('hex');
    if(actual!==options['--sha256'])throw new RelayError(400,'policy_file_hash_mismatch');
    imported={policy:JSON.parse(bytes.toString('utf8')),provenance:{policy_file_sha256:actual,scope:'local_import_content_hash_checked'}};
  }
  const generation=options['--generation'];
  if(command!=='status'&&!/^(0|[1-9][0-9]*)$/.test(generation??''))throw new RelayError(400,'policy_generation_required');
  store=new Store(filename,Buffer.from(process.env.RELAY_MASTER_KEY??'','base64'));
  const expectedGeneration=Number(generation);
  const result=command==='status'?store.policies.status():command==='import'?store.policies.import({...imported,expectedGeneration}):
    command==='rollback'?store.policies.rollback({expectedGeneration}):store.policies.select({
      revision:options['--revision']==='none'?null:options['--revision'],mode:options['--mode'],expectedGeneration});
  console.log(JSON.stringify(result,null,2));
}catch(error){
  console.error(JSON.stringify({error:error instanceof RelayError?error.code:'policy_command_failed'}));process.exitCode=1;
}finally{store?.close();}
