import {hash} from './security.mjs';

const outputs=new Set(['function_call_output','custom_tool_call_output']);
const calls=new Set(['function_call','custom_tool_call']);
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function validTurnState(value) {
  return typeof value==='string'&&value.length>0&&value.length<=16384&&/^[\x21-\x7e]+$/.test(value)?value:null;
}

// Routing hints are scoped to a verified upstream account and one tool turn.
// Never treat a client-supplied opaque token as an account-independent credential.
export class TurnRouting {
  constructor(settings) {this.settings=settings;this.entries=new Map();}
  context(caller,account,body,session,headers) {
    if(account.adapter!=='codex'||!Array.isArray(body.input))return null;
    const lastUser=body.input.findLastIndex(item=>item?.role==='user');
    if(lastUser<0)return null;
    let turnId=null;
    try {
      const raw=headers.get('x-codex-turn-metadata');
      const metadata=raw&&raw.length<=4096?JSON.parse(raw):null;
      if(typeof metadata?.turn_id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(metadata.turn_id))turnId=metadata.turn_id;
    }catch{}
    const anchor=hash(JSON.stringify(canonical([body.instructions??'',body.input.slice(0,lastUser+1)])));
    const key=hash(JSON.stringify([caller.tenant,caller.id,account.id,body.model,session,turnId,anchor]));
    const completedCalls=body.input.slice(lastUser+1).filter(item=>outputs.has(item?.type)).map(item=>item.call_id);
    return {key,turnId,completedCalls};
  }
  resolve(context) {
    const now=Date.now();
    for(const [key,entry] of this.entries)if(entry.expires<=now)this.entries.delete(key);
    if(!context||this.settings.get('routing.turn_state_ttl_ms')===0)return null;
    const entry=this.entries.get(context.key);
    if(!entry)return null;
    // Explicit Codex turn identity or an output for a tool issued by this relay.
    if(!context.turnId&&!context.completedCalls.some(id=>entry.pending.has(id)))return null;
    return entry.token;
  }
  remember(context,token,response) {
    if(!context)return;
    const ttl=this.settings.get('routing.turn_state_ttl_ms');
    token=validTurnState(token);
    const pending=(response?.output??[]).filter(item=>calls.has(item?.type)&&typeof item.call_id==='string').map(item=>item.call_id);
    if(!ttl||!token||!pending.length||pending.length>100){this.forget(context);return;}
    this.entries.delete(context.key);
    this.entries.set(context.key,{token,pending:new Set(pending),expires:Date.now()+ttl});
    const limit=this.settings.get('routing.max_turn_states');
    while(this.entries.size>limit)this.entries.delete(this.entries.keys().next().value);
  }
  forget(context) {if(context)this.entries.delete(context.key);}
}
