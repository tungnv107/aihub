import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {LicenseAuthority} from '../license-server.mjs';
import {AdminAuth} from './auth.mjs';
const home=process.env.TDH_LICENSE_DATA??'/data',output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('private_output_path_required');
if(!fs.existsSync(path.join(home,'signing-private.pem'))||!fs.existsSync(path.join(home,'licenses.sqlite')))throw Error('existing_license_data_required');
const authority=new LicenseAuthority(home);
try{
  const auth=new AdminAuth(authority.db),password=crypto.randomBytes(24).toString('base64url');
  const fd=fs.openSync(output,'wx',0o600);
  try{
    await auth.provision('owner',password);
    fs.writeFileSync(fd,JSON.stringify({url:'https://codex.tudonghoa.me/admin',username:'owner',password,changePasswordRequired:true},null,2));
  }finally{fs.closeSync(fd);}
  console.log(JSON.stringify({provisioned:true,credentialsFile:output}));
}finally{authority.close();}
