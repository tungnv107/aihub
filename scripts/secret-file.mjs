import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export function restrictSecretFile(file){
  if(process.platform!=='win32'){fs.chmodSync(file,0o600);return;}
  const owner=[process.env.USERDOMAIN,process.env.USERNAME].filter(Boolean).join('\\');
  if(!owner)throw Error('windows_identity_required');
  execFileSync(path.join(process.env.SystemRoot??'C:/Windows','System32/icacls.exe'),
    [path.resolve(file),'/inheritance:r','/grant:r',owner+':(F)','*S-1-5-18:(F)','*S-1-5-32-544:(F)'],
    {windowsHide:true,stdio:['ignore','pipe','pipe']});
}
