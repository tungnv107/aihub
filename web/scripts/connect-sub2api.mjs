import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {adminClient} from '../../scripts/sub2api-admin-client.mjs';
import {restrictSecretFile} from '../../scripts/secret-file.mjs';
const root=path.resolve(import.meta.dirname,'../..'),file=path.join(root,'web/.env');
let text=fs.readFileSync(file,'utf8');
const env=Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z0-9_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
if(env.SUB2API_URL!=='http://127.0.0.1:18080')throw Error('This helper only configures the local Sub2API instance');
const {request}=await adminClient();
const set=(key,value)=>{const pattern=new RegExp('^'+key+'=.*$','m');text=pattern.test(text)?text.replace(pattern,key+'='+value):text+'\n'+key+'='+value;};
if(!env.SUB2API_ADMIN_API_KEY){const result=await request('/api/v1/admin/settings/admin-api-keys',{method:'POST',body:{name:'AIHub license provisioning (local)',enabled:true,policy:{global_permissions:['chrelay.licenses.write'],rules:[]}}});if(!result.key)throw Error('Admin key response invalid');set('SUB2API_ADMIN_API_KEY',result.key);fs.writeFileSync(file,text);restrictSecretFile(file);}
if(!env.SUB2API_LICENSE_USER_ID){const users=await request('/api/v1/admin/users?page=1&page_size=100&search=aihub-license-owner%40example.local');const existing=(users.items??users.users??[]).find(u=>u.email==='aihub-license-owner@example.local');const user=existing??await request('/api/v1/admin/users',{method:'POST',body:{email:'aihub-license-owner@example.local',password:crypto.randomBytes(40).toString('base64url'),username:'AIHub License Authority',balance:0,concurrency:1}});if(!user.id)throw Error('License owner response invalid');set('SUB2API_LICENSE_USER_ID',user.id);fs.writeFileSync(file,text);restrictSecretFile(file);}
console.log('Local Sub2API connected with a license-only scoped administration key. Restart web and worker to load it.');
