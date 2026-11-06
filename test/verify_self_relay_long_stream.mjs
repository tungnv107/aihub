// Isolated synthetic HTTP probe: no credentials or external model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {Store} from '../self_relay/store.mjs';import {Relay} from '../self_relay/core.mjs';
import {createServer} from '../self_relay/server.mjs';import {SseDecoder,sse} from '../self_relay/protocol.mjs';
const duration=125000,started=Date.now(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdh-long-stream-'));
const store=new Store(path.join(directory,'relay.sqlite'),crypto.randomBytes(32));
const key='synthetic-long-stream-caller-012345678901234567890';
const policy=JSON.parse(fs.readFileSync(new URL('./ch-relay-evidence/policy-export-20261030/policy.local-reference.json',import.meta.url)));
let interval,finish,server,cancelled=false;
const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(Error('long_stream_deadline')),duration+15000);
try{
  store.bootstrap('synthetic-long-stream-admin-012345678901234567890',key);
  store.importAccount({label:'synthetic',adapter:'codex',exclusive_refresh_owner:true,tokens:{access_token:'synthetic-token',expires_at:Date.now()+3600000}});
  const imported=store.policies.import({policy,expectedGeneration:0});store.policies.select({revision:imported.revision,mode:'enforce',expectedGeneration:1});
  assert.equal(store.settings.get('relay.stream_idle_ms'),120000);
  const usage={input_tokens:10,output_tokens:4,total_tokens:14};
  const envelope={id:'resp_long_stream',object:'response',model:'gpt-6-astra',status:'in_progress',output:[],usage:null};
  const transport=async()=>new Response(new ReadableStream({
    start(c){
      c.enqueue(Buffer.from('\n'));c.enqueue(sse({type:'response.created',response:envelope}));
      interval=setInterval(()=>{c.enqueue(Buffer.from('event: ping\n\n'));c.enqueue(sse({type:'response.in_progress',response:envelope}));},10000);
      finish=setTimeout(()=>{
        clearInterval(interval);
        const item={id:'msg_long_stream',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"ok":true}',annotations:[]}]};
        for(const e of [
          {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
          {type:'response.output_text.delta',output_index:0,item_id:item.id,content_index:0,delta:'{"ok":true}'},
          {type:'response.output_item.done',output_index:0,item},
          {type:'response.completed',response:{...envelope,status:'completed',output:[item],usage}},
        ])c.enqueue(sse(e));
        c.close();
      },duration);
    },cancel(){cancelled=true;clearInterval(interval);clearTimeout(finish);},
  }),{headers:{'content-type':'text/event-stream'}});
  const relay=new Relay(store,{transport});server=createServer(relay);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const result=await fetch('http://127.0.0.1:'+server.address().port+'/v1/responses',{method:'POST',signal:abort.signal,headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:envelope.model,stream:true,text:{format:{type:'json_object'}},input:'Synthetic long stream verification'})});
  assert.equal(result.status,200);
  const decoder=new SseDecoder(),events=[];let firstByte=null,last=started,maxGap=0,bytes=0;
  for await(const chunk of result.body){const now=Date.now();firstByte??=now-started;maxGap=Math.max(maxGap,now-last);last=now;bytes+=chunk.byteLength;events.push(...decoder.push(chunk));}
  events.push(...decoder.push(undefined,true));
  const terminals=events.filter(e=>e.type==='response.completed');
  assert.equal(terminals.length,1);assert.deepEqual(terminals[0].json.response.usage,usage);
  assert(firstByte<5000);assert(maxGap<20000);assert(Date.now()-started>=duration);
  assert.equal(relay.active,0);assert.equal(store.db.prepare('SELECT status FROM usage ORDER BY id DESC LIMIT 1').get().status,200);
  console.log(JSON.stringify({result:'passed',duration_ms:Date.now()-started,first_byte_ms:firstByte,max_gap_ms:maxGap,bytes,terminal_count:terminals.length,idle_limit_ms:120000,external_calls:0,cancelled}));
}finally{
  clearTimeout(deadline);clearTimeout(finish);clearInterval(interval);abort.abort();
  if(server){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  store.close();fs.rmSync(directory,{recursive:true,force:true});
}
