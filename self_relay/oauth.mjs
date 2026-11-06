import {hash,opaque,RelayError,requiredString,boundedJson,validateIdToken} from './security.mjs';

export class OAuth {
  constructor(store,request){this.store=store;this.request=request;this.keys=null;}
  start({label,exclusive_refresh_owner,account_id},tenant,port) {
    if(exclusive_refresh_owner!==true)throw new RelayError(409,'exclusive_refresh_ownership_required');
    requiredString(label,'label',100);
    const account=account_id?this.store.account(account_id):null;
    if(account_id&&(!account||account.tenant!==tenant||account.adapter!=='plan'))throw new RelayError(404,'account_not_found');
    const previous=account?this.store.credentials(account):null;
    const clientId=previous?.clientId??'dynamic_agent_client';
    const verifier=opaque(),nonce=opaque(),redirectUri=`http://127.0.0.1:${port}/auth/callback`;
    const hostId=this.store.db.prepare("SELECT value FROM meta WHERE key='host_id'").get().value;
    const state=this.store.beginOAuth({verifier,nonce,redirectUri,clientId,label,tenant,accountId:account?.id,subject:previous?.subject});
    const url=new URL('https://auth.openai.com/api/accounts/authorize');
    url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,
      scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:'https://api.openai.com/v1',
      ext_agent_host_id:hostId,state,nonce,code_challenge_method:'S256',code_challenge:Buffer.from(hash(verifier),'hex').toString('base64url')}).toString();
    if(clientId==='dynamic_agent_client')url.searchParams.set('agent_name_hint',this.store.settings.get('oauth.agent_name'));
    if(previous?.idToken)url.searchParams.set('id_token_hint',previous.idToken);
    return {authorization_url:url.href,expires_in:600};
  }
  async jwks() {
    if(this.keys?.expires>Date.now())return this.keys.value;
    const response=await this.request('https://auth.openai.com/.well-known/jwks.json',{signal:AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel();throw new RelayError(502,'jwks_unavailable');}
    const value=await boundedJson(response,524288);this.keys={value,expires:Date.now()+600000};return value;
  }
  async complete(params) {
    const pending=this.store.takeOAuth(requiredString(params.state,'state',200));
    if(params.error)throw new RelayError(400,'oauth_denied');
    const code=requiredString(params.code,'code',8192);
    let clientId=pending.clientId;
    if(clientId==='dynamic_agent_client') {
      clientId=requiredString(params.client_id,'issued_client_id',200);
      if(clientId==='dynamic_agent_client')throw new RelayError(400,'issued_client_id_required');
    } else if(params.client_id&&params.client_id!==clientId)throw new RelayError(400,'oauth_client_id_mismatch');
    const response=await this.request('https://auth.openai.com/api/accounts/oauth/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:pending.verifier,
        redirect_uri:pending.redirectUri,resource:'https://api.openai.com/v1'}).toString(),signal:AbortSignal.timeout(30000)});
    if(!response.ok){await response.body?.cancel();throw new RelayError(400,'oauth_code_exchange_failed');}
    const tokens=await boundedJson(response);
    const claims=validateIdToken(tokens.id_token,await this.jwks(),{clientId,nonce:pending.nonce,subject:pending.subject});
    tokens.client_id=clientId;
    if(!tokens.scope?.split(' ').includes('chatgpt.tokens.use.direct'))throw new RelayError(403,'chatgpt_plan_scope_required');
    if(!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0||!tokens.refresh_token||!tokens.access_token)
      throw new RelayError(502,'invalid_token_response');
    if(pending.accountId) {
      const account=this.store.account(pending.accountId);
      if(!account||account.tenant!==pending.tenant)throw new RelayError(404,'account_not_found');
      this.store.saveCredentials(account.id,{accessToken:tokens.access_token,refreshToken:tokens.refresh_token,
        clientId,subject:claims.sub,idToken:tokens.id_token,expiresAt:Date.now()+tokens.expires_in*1000,
        earliestRefreshAt:Number(tokens.earliest_refresh_at??0)*1000,scopes:tokens.scope.split(' '),accountId:null});
      return this.store.publicAccount(this.store.account(account.id));
    }
    return this.store.importAccount({label:pending.label,adapter:'plan',exclusive_refresh_owner:true,tokens,subject:claims.sub},pending.tenant);
  }
}
