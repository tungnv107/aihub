import {workerData,parentPort} from 'node:worker_threads';
import {LicenseAuthority} from '../relay_product/license-server.mjs';
const authority=new LicenseAuthority(workerData.home,{now:()=>workerData.now});
try{parentPort.postMessage(authority.activate(workerData.body));}finally{authority.close();}
