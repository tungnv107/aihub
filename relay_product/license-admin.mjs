import fs from 'node:fs';
import {LicenseAuthority} from './license-server.mjs';
import {signEnvelope} from './license-protocol.mjs';
const args=process.argv.slice(2),command=args.shift();
function arg(name,fallback){const i=args.indexOf(name);return i===-1?fallback:args[i+1];}
const authority=new LicenseAuthority(arg('--home',process.env.TDH_LICENSE_DATA??'/data'));
try{
  let result;
  if(command==='public-key')result={publicKey:authority.publicKey};
  else if(command==='issue'){
    const out=arg('--out');if(!out)throw Error('secure_output_file_required');
    const fd=fs.openSync(out,'wx',0o600);
    try{
      result=authority.issue({label:arg('--label'),days:Number(arg('--days',1)),maxDevices:Number(arg('--max-devices',1))});
      fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');delete result.key;result.keyFile=out;
    }finally{fs.closeSync(fd);}
  }else if(command==='list')result=authority.list();
  else if(command==='devices')result=authority.db.prepare('SELECT id,license_id,device_id,revoked,created_at,last_seen FROM activations WHERE license_id=?').all(arg('--id'));
  else if(command==='sign-release'){
    const value=JSON.parse(fs.readFileSync(arg('--input'),'utf8'));
    if(value.kind!=='tdh-relay-release-v1')throw Error('invalid_release_manifest');
    fs.writeFileSync(arg('--out'),JSON.stringify(signEnvelope(value,authority.privateKey))+'\n',{mode:0o600,flag:'wx'});result={signed:true};
  }else result=authority.change(command,arg('--id'),{days:Number(arg('--days'))});
  console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({error:/^[a-z_]+$/.test(error.message)?error.message:'admin_failed'}));process.exitCode=1;}
finally{authority.close();}
