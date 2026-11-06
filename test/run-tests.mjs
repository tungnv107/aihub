import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const directory=import.meta.dirname;
fs.mkdirSync(path.join(directory,'self-relay-fixtures'),{recursive:true});
const files=fs.readdirSync(directory).filter(name=>
  /^test_(self_relay|ch_relay).*\.mjs$/.test(name)||['test_relay_product_20261030.mjs','test_product_config_recovery.mjs','test_product_license_20261030.mjs','test_admin_20261030.mjs','test_customer_portal_20261030.mjs'].includes(name))
  .sort().map(name=>path.join(directory,name));
const child=spawn(process.execPath,['--test','--test-concurrency=2',...files],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.code??'test_runner_failed');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
