import fs from 'node:fs';
for(const line of fs.readFileSync('/data/secrets.env','utf8').trim().split('\n')){
  const i=line.indexOf('=');process.env[line.slice(0,i)]=line.slice(i+1);
}
process.env.RELAY_DB='/data/relay.sqlite';
await import('/app/relay_product/proxy-server.mjs');
