import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),checkout=path.join(root,'.reference/sub2api');
const revision='25608d216bb7be04e4a646830cb065cd09b7d7e9';
function git(args){return execFileSync('git',['-c','safe.directory='+checkout.replaceAll('\\','/'),...args],{cwd:fs.existsSync(checkout)?checkout:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
if(!fs.existsSync(path.join(checkout,'.git'))){
  fs.mkdirSync(path.dirname(checkout),{recursive:true});
  execFileSync('git',['clone','--no-checkout','https://github.com/Wei-Shaw/sub2api.git',checkout],{stdio:'inherit',windowsHide:true});
  git(['checkout','--detach',revision]);
}
if(git(['rev-parse','HEAD'])!==revision)throw Error('sub2api_revision_mismatch');
function edit(file,before,after){
  const target=path.join(checkout,file),text=fs.readFileSync(target,'utf8').replaceAll('\r\n','\n');
  if(text.includes(after))return;
  if(text.split(before).length!==2)throw Error('patch_context_mismatch: '+file);
  fs.writeFileSync(target,text.replace(before,after));
}
edit('backend/internal/server/middleware/api_key_auth.go',
  '\t\tapiKey, err := apiKeyService.GetByKey(c.Request.Context(), apiKeyString)',
  '\t\tlicenseRequest := c.Request.URL.Path == "/v1/ch-relay/license"\n\t\tvar apiKey *service.APIKey\n\t\tvar err error\n\t\tif licenseRequest {\n\t\t\tapiKey, err = apiKeyService.GetByKeyForChRelay(c.Request.Context(), apiKeyString)\n\t\t} else {\n\t\t\tapiKey, err = apiKeyService.GetByKey(c.Request.Context(), apiKeyString)\n\t\t}');
edit('backend/internal/server/middleware/api_key_auth.go','skipBilling := c.Request.URL.Path == "/v1/usage" || billingInfoRequest ||',
  'skipBilling := licenseRequest || c.Request.URL.Path == "/v1/usage" || billingInfoRequest ||');
edit('backend/internal/server/middleware/api_key_auth.go','if isSubscriptionType && subscriptionService != nil && !billingInfoRequest {',
  'if isSubscriptionType && subscriptionService != nil && !billingInfoRequest && !licenseRequest {');
edit('backend/internal/server/routes/gateway.go','\tgateway.GET("/sub2api/billing", h.Gateway.KeyBillingInfo)',
  '\tgateway.GET("/ch-relay/license", h.Gateway.ChRelayLicense)\n\tgateway.GET("/sub2api/billing", h.Gateway.KeyBillingInfo)');
edit('backend/internal/server/routes/user.go','keys.POST("", h.APIKey.Create)','keys.POST("", middleware.ChRelayManagedKeysOnly(), h.APIKey.Create)');
edit('backend/internal/server/routes/user.go','keys.PUT("/:id", h.APIKey.Update)','keys.PUT("/:id", middleware.ChRelayManagedKeysOnly(), h.APIKey.Update)');
edit('backend/internal/server/routes/admin.go','\t\tregisterAdminAPIKeyRoutes(admin, h)',
  '\t\tadmin.POST("/ch-relay/licenses", h.APIKey.CreateChRelayLicense)\n\t\tadmin.PUT("/ch-relay/licenses/:id", h.APIKey.UpdateChRelayLicense)\n\t\tregisterAdminAPIKeyRoutes(admin, h)');
const overlay=path.join(root,'integrations/sub2api/overlay');
edit('backend/internal/pkg/adminaccess/catalog.go','var definitions = []permissionDefinition{',
  'var definitions = []permissionDefinition{\n\t{Permission{"chrelay.licenses.write", "Manage AIHub relay licenses", "AIHub", "global"}, []string{"POST /ch-relay/licenses", "PUT /ch-relay/licenses/:id"}},');
function copy(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const source=path.join(dir,entry.name),target=path.join(checkout,path.relative(overlay,source));
  if(entry.isDirectory())copy(source);else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
}}
copy(overlay);
console.log(JSON.stringify({prepared:true,revision,checkout,licenseEndpoint:'/v1/ch-relay/license'}));
