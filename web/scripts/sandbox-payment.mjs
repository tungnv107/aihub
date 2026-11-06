import 'dotenv/config';
import {createHmac,randomUUID} from 'node:crypto';
const [orderCode,amountText,eventId=randomUUID()]=process.argv.slice(2),amount=Number(amountText);
if(process.env.NODE_ENV==='production'||process.env.PAYMENT_PROVIDER!=='sandbox'||!['127.0.0.1','localhost'].includes(new URL(process.env.BETTER_AUTH_URL).hostname))throw Error('Sandbox helper requires a loopback test environment');
if(!/^AH[A-F0-9]{16}$/.test(orderCode??'')||!Number.isSafeInteger(amount)||amount<=0)throw Error('Usage: node --env-file=.env scripts/sandbox-payment.mjs ORDER_CODE AMOUNT [EVENT_ID]');
const body=JSON.stringify({id:eventId,transferType:'in',transferAmount:amount,accountNumber:'sandbox',content:orderCode});
const timestamp=String(Math.floor(Date.now()/1000)),signature='sha256='+createHmac('sha256',process.env.SANDBOX_PAYMENT_SECRET).update(timestamp+'.'+body).digest('hex');
const response=await fetch(process.env.BETTER_AUTH_URL+'/api/v1/webhooks/sandbox',{method:'POST',headers:{'content-type':'application/json','x-sepay-timestamp':timestamp,'x-sepay-signature':signature},body});console.log(JSON.stringify({status:response.status,result:await response.json()}));if(!response.ok)process.exitCode=1;
