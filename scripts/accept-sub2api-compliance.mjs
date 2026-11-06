// Explicit operator action only. Never called by init/build/install scripts.
import {adminClient} from './sub2api-admin-client.mjs';
if(!process.argv.includes('--accept-after-reading'))throw Error('Read the upstream commitment before explicitly accepting it');
const {request}=await adminClient();
const current=await request('/api/v1/admin/compliance');
if(current.required)await request('/api/v1/admin/compliance/accept',{method:'POST',body:{phrase:current.ack_phrase_en,language:'en'}});
console.log(JSON.stringify({accepted:true,version:current.version}));
