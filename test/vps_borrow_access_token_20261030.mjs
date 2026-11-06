// Output is consumed only by the private verification orchestrator; never forward it to logs.
import {DatabaseSync} from 'node:sqlite';
import {decrypt} from '/source/security.mjs';
const db=new DatabaseSync('/owner/relay.sqlite',{readOnly:true});
const account=db.prepare("SELECT id,secret FROM accounts WHERE adapter='codex' AND enabled=1 AND state='ready' ORDER BY last_used DESC LIMIT 1").get();
if(!account)throw Error('owner_account_missing');
const secret=decrypt(Buffer.from(process.env.RELAY_MASTER_KEY,'base64'),account.secret,account.id);db.close();
if(secret.expiresAt<Date.now()+300000)throw Error('refresh_owner_first');
console.log(JSON.stringify({access_token:secret.accessToken,account_id:secret.accountId,expires_at:secret.expiresAt}));
