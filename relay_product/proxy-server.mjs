import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../self_relay/store.mjs';
import {Relay} from '../self_relay/core.mjs';
import {createServer} from '../self_relay/server.mjs';
import {ProductState} from './state.mjs';
import {LicenseClient} from './license-client.mjs';
import {verifyInstalledRelease} from './release-integrity.mjs';
verifyInstalledRelease(path.dirname(fileURLToPath(import.meta.url)));
const home=path.dirname(process.env.RELAY_DB??'/data/relay.sqlite');
const state=new ProductState(home),license=new LicenseClient(state);
await license.ensure('proxy');
const store=new Store(path.join(home,'relay.sqlite'),Buffer.from(process.env.RELAY_MASTER_KEY??'','base64'));
store.bootstrap(process.env.RELAY_ADMIN_KEY,process.env.RELAY_API_KEY);
const relay=new Relay(store);
for(const name of ['infer','models']){
  const original=relay[name].bind(relay);
  relay[name]=async(...args)=>{await license.ensure('proxy');return original(...args);};
}
const server=createServer(relay);
server.listen(store.settings.get('relay.port'),store.settings.get('relay.bind_host'));
const stop=()=>{server.close(()=>{store.close();state.close();});server.closeIdleConnections();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
