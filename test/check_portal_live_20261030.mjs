// Explicit live smoke: creates only its own short-lived key, then revokes it.
// Never reads owner credentials or existing customer keys.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {LicenseClient} from '../relay_product/license-client.mjs';
import {VERSION} from '../relay_product/state.mjs';
import {hash,publicText} from '../relay_product/license-protocol.mjs';
const require=createRequire(path.join(process.env.TDH_TEST_PACKAGES??'C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright/package.json'));
const {chromium}=require('playwright'),base='https://codex.tudonghoa.me';
const output=path.resolve('artifacts/portal-ui');fs.mkdirSync(output,{recursive:true});
const ssh=(...command)=>{
  try{return execFileSync('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','ubuntu@134.185.93.244','sudo','-n',...command],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});}
  catch{throw Error('live_smoke_remote_command_failed');}
};
const tag='portal-smoke-'+Date.now(),keyfile='/data/issued/'+tag+'.json';
let issued,browser,cleanup=false;
try{
  issued=JSON.parse(ssh('docker','exec','tdh-relay-license','node','/app/license-admin.mjs','issue','--label',tag,'--days','1','--max-devices','1','--out',keyfile));
  const secret=JSON.parse(ssh('docker','exec','tdh-relay-license','cat',keyfile));
  assert.equal(secret.id,issued.id);
  browser=await chromium.launch({headless:true,executablePath:process.env.TDH_TEST_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await page.goto(base+'/')).status(),200);
  await page.getByRole('link',{name:'Trang khách hàng',exact:true}).click();
  await page.getByRole('heading',{name:'Quản lý relay của bạn'}).waitFor();
  await page.getByLabel('Key TDH Relay',{exact:true}).fill(secret.key);await page.getByRole('button',{name:'Vào trang khách hàng'}).click();
  await page.getByRole('heading',{name:'Key của tôi'}).waitFor();await page.getByText('Chờ kích hoạt',{exact:true}).waitFor();
  let summary=await (await context.request.get(base+'/portal/api/summary')).json();
  assert.equal(summary.license.id,issued.id);assert.equal(summary.license.started_at,null);assert.equal(summary.devices.length,0);
  const cookie=(await context.cookies()).find(c=>c.name==='__Host-tdh-customer');
  assert.ok(cookie?.httpOnly&&cookie.secure&&cookie.sameSite==='Strict');
  assert.equal((await context.request.get(base+'/admin/api/overview')).status(),401);
  const state=new Map(),pair=crypto.generateKeyPairSync('ed25519');
  const device=new LicenseClient({get:k=>state.get(k),set:(k,v)=>state.set(k,v)},{
    device:{deviceId:hash(crypto.randomBytes(20)),publicKey:publicText(pair.privateKey),privateKey:pair.privateKey},
    publicKey:'MCowBQYDK2VwAyEA4FYKItVx5gIWcZPVcwFesTiqdiDgxogmYCaRtmaMGX0',
    request:async(route,body)=>{
      const r=await fetch(base+'/api/licenses/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      const result=await r.json();if(!r.ok)throw Error(result.error);return result;
    }
  });
  await device.activate(secret.key);
  await page.getByRole('button',{name:'Làm mới'}).click();await page.getByText('Đang sử dụng',{exact:true}).waitFor();
  summary=await (await context.request.get(base+'/portal/api/summary')).json();
  assert.equal(summary.license.expires_at-summary.license.started_at,86400000);
  assert.equal(summary.devices.length,1);
  await device.activate(secret.key);
  const repeated=await (await context.request.get(base+'/portal/api/summary')).json();assert.equal(repeated.license.started_at,summary.license.started_at);
  await page.screenshot({path:path.join(output,'portal-live-desktop.png'),fullPage:true});
  await page.getByRole('link',{name:'Thống kê',exact:true}).click();
  const report={schema:'tdh-diagnostic-v1',mode:'desktop',version:'0.3.1',generatedAt:new Date().toISOString(),requests:0,errors:0,attempts:0,avgDurationMs:0,statuses:{},licenseActive:true};
  await page.getByLabel('File JSON do công cụ TDH xuất (tối đa 20 KB)').setInputFiles({name:'smoke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
  await page.getByRole('button',{name:'Tải báo cáo lên'}).click();await page.getByRole('heading',{name:'Báo cáo gần nhất'}).waitFor();
  await page.getByRole('link',{name:'Cài đặt & hỗ trợ',exact:true}).click();await page.getByRole('heading',{name:'Cài TDH Relay trên Windows'}).waitFor();
  await page.setViewportSize({width:375,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'portal-live-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Đăng xuất / đổi key'}).click();await page.getByRole('heading',{name:'Quản lý relay của bạn'}).waitFor();
  assert.equal((await context.request.get(base+'/portal/api/summary')).status(),401);
  const manifest=await (await fetch(base+'/manifest.json')).json();assert.equal(manifest.admin.version,'1.1.0');assert.equal(manifest.version,VERSION);
  const installer=await (await fetch(base+'/setup.ps1')).text();assert.ok(installer.includes('/portal'));assert.ok(!installer.includes('@@'));assert.ok(installer.includes(manifest.artifacts['tdh-relay.zip'].sha256));
  fs.writeFileSync(path.join(output,'setup-live.ps1'),installer);
  const mac=await (await fetch(base+'/setup.sh')).text();assert.ok(mac.includes('/portal'));assert.ok(!mac.includes('@@'));fs.writeFileSync(path.join(output,'setup-live.sh'),mac);
  await page.goto(base+'/admin');await page.getByRole('heading',{name:'Đăng nhập quản trị'}).waitFor();assert.deepEqual(errors,[]);
  ssh('docker','exec','tdh-relay-license','node','/app/license-admin.mjs','revoke','--id',issued.id);cleanup=true;
  await assert.rejects(device.ensure('desktop',{online:true}),/invalid|expired/);
  const result={passed:true,https:true,version:'1.1.0',clientVersion:VERSION,firstActivation:true,portalLoginDoesNotStartTerm:true,secureCookie:true,customerIsolation:true,reportUpload:true,logout:true,revocation:true,smokeKeyRevoked:true,ownerCredentialsUntouched:true,pageErrors:errors};
  fs.writeFileSync('artifacts/portal-live-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(browser)await browser.close();
  if(issued?.id&&!cleanup)ssh('docker','exec','tdh-relay-license','node','/app/license-admin.mjs','revoke','--id',issued.id);
  if(issued?.id)ssh('docker','exec','tdh-relay-license','rm','--',keyfile);
}
