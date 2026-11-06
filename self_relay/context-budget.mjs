import {hash} from './security.mjs';

// Giữ prefix ổn định giữa các mốc; chỉ đánh giá lại khi có lợi ích đủ lớn.
export function applyContextBudget(body,store) {
  const key=body.prompt_cache_key,settings=store.contextSettings(key);
  const previous=store.contextTrimPlan(key),pinned=trimToolHistory(body,settings,previous);
  if(!settings.get('context.trim_tool_history')||!Array.isArray(body.input))return pinned;
  const now=Date.now(),checkpoint=store.contextCheckpoint(key);
  const marker=body.input.findLast(item=>item?.type==='compaction');
  const compactionKey=marker?hash(JSON.stringify(marker)):null;
  const historyBytes=pinned.stats.tool_bytes_before;
  const idle=settings.get('context.replan_idle_ms'),growth=settings.get('context.replan_growth_bytes');
  let reason=!previous?'initial':!checkpoint?'legacy_plan_adopted':
    checkpoint.compaction_key!==compactionKey?'compaction_boundary':
    idle>0&&now-checkpoint.last_used>=idle?'idle_resume':
    growth>0&&historyBytes-checkpoint.history_bytes>=growth?'history_growth':'prefix_preserved';
  let selected=pinned,replace=false;
  if(['compaction_boundary','idle_resume','history_growth'].includes(reason)){
    const fresh=trimToolHistory(body,settings);
    // Qua compaction dùng lịch sử mới; các mốc khác giữ nguyên những lần cắt đã áp dụng.
    const items=reason==='compaction_boundary'?fresh.plan.items:
      [...new Map([...fresh.plan.items,...previous.items].map(item=>[item.fingerprint,item])).values()];
    if(items.length<=4096){
      const plan={version:1,items},candidate=trimToolHistory(body,settings,plan);
      const extra=candidate.stats.removed_bytes-pinned.stats.removed_bytes;
      if(reason==='compaction_boundary'||extra>0&&extra>=(settings.get('context.min_removed_bytes')??16384)){
        selected=candidate;replace=true;
      }else reason=reason+'_below_savings_threshold';
    }else reason='plan_capacity';
  }
  selected.stats.replan_reason=reason;
  store.saveContextTrimPlan(key,selected.plan,{replace,checkpoint:{
    history_bytes:!checkpoint||replace?historyBytes:checkpoint.history_bytes,
    last_used:now,compaction_key:compactionKey}});
  return selected;
}

// Chỉ rút gọn kết quả cũ đã khớp; kế hoạch giữ prefix ổn định giữa các mốc đánh giá lại.
const callType=new Map([['function_call_output','function_call'],['custom_tool_call_output','custom_tool_call']]);
const discoveryTool=name=>typeof name==='string'&&/^(?:.*\.)?(?:GetDynamicTools|CallDynamicTool|ToolSearch|SearchTools|ListTools|tool_search|search_tools|list_tools)$/i.test(name);
const bytes=value=>typeof value==='string'?Buffer.byteLength(value):Array.isArray(value)?value.reduce((n,p)=>n+(typeof p?.text==='string'?Buffer.byteLength(p.text):0),0):0;
function shorten(value,limit) {
  if(value.length<=limit+200)return value;
  let end=Math.ceil(limit*2/3),start=value.length-(limit-end);
  if(end>0&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;
  if(start<value.length&&/[\uDC00-\uDFFF]/.test(value[start]))start++;
  const head=value.slice(0,end),tail=value.slice(start),omitted=Buffer.byteLength(value)-Buffer.byteLength(head)-Buffer.byteLength(tail);
  return head+`\n[Relay: earlier tool output shortened; ${omitted} bytes omitted. Re-run the original tool if exact omitted content is needed.]\n`+tail;
}
export function trimToolHistory(body,settings,plan) {
  const nextPlan={version:1,items:[]};
  const stats={mode:'off',reason:'disabled',trimmed_items:0,removed_bytes:0,tool_bytes_before:0,tool_bytes_after:0,
    output_items:0,eligible_items:0,protected_items:0,unmatched_items:0,old_batch_items:0,candidate_removed_bytes:0};
  if(!settings.get('context.trim_tool_history')||!Array.isArray(body?.input))return {body,stats,plan:plan??nextPlan};
  stats.mode='unchanged';
  const calls=new Map(),duplicates=new Set(),results=new Map();
  for(let i=0;i<body.input.length;i++){
    const item=body.input[i];if(typeof item?.call_id!=='string'||!item.call_id)continue;
    if(['function_call','custom_tool_call'].includes(item.type)){
      if(calls.has(item.call_id))duplicates.add(item.call_id);
      else calls.set(item.call_id,{type:item.type,index:i,name:item.name});
    }else if(callType.has(item.type))results.set(item.call_id,(results.get(item.call_id)??0)+1);
  }
  const eligible=[];
  for(let i=0;i<body.input.length;i++){
    const item=body.input[i],call=calls.get(item?.call_id);
    if(!callType.has(item?.type))continue;
    stats.output_items++;
    stats.tool_bytes_before+=bytes(item.output);
    if(call?.type===callType.get(item.type)&&call.index<i&&!duplicates.has(item.call_id)&&results.get(item.call_id)===1){
      if(discoveryTool(call.name))stats.protected_items++;else eligible.push(i);
    }else stats.unmatched_items++;
  }
  stats.eligible_items=eligible.length;
  stats.tool_bytes_after=stats.tool_bytes_before;
  if(!plan&&stats.tool_bytes_before<settings.get('context.min_tool_history_bytes')){stats.reason='below_byte_threshold';return {body,stats,plan:nextPlan};}
  const keep=settings.get('context.keep_recent_tool_outputs'),batch=settings.get('context.trim_batch_size');
  const count=Math.max(0,Math.floor((eligible.length-keep)/batch)*batch),limit=settings.get('context.old_tool_output_chars');
  stats.old_batch_items=count;stats.reason=plan?'session_prefix_preserved':count?'no_oversized_old_output':'below_batch_count';
  const pinned=plan?new Map(plan.items.map(item=>[item.fingerprint,item.limit])):null;
  let next;
  for(const index of plan?eligible:eligible.slice(0,count)){
    const item=body.input[index];
    const fingerprint=hash(JSON.stringify([item.type,item.call_id,calls.get(item.call_id).name,item.output]));
    const itemLimit=plan?pinned.get(fingerprint):limit;
    if(itemLimit===undefined)continue;
    const output=typeof item.output==='string'?shorten(item.output,itemLimit):Array.isArray(item.output)?item.output.map(part=>
      typeof part?.text==='string'&&['text','input_text','output_text'].includes(part.type)?{...part,text:shorten(part.text,itemLimit)}:part):item.output;
    const removed=bytes(item.output)-bytes(output);if(removed<=0)continue;
    next??={...body,input:[...body.input]};next.input[index]={...item,output};
    stats.trimmed_items++;stats.removed_bytes+=removed;
    nextPlan.items.push({fingerprint,limit:itemLimit});
  }
  stats.candidate_removed_bytes=stats.removed_bytes;
  if(!plan&&next&&(stats.removed_bytes<(settings.get('context.min_removed_bytes')??16384)||nextPlan.items.length>4096)){
    stats.trimmed_items=0;stats.removed_bytes=0;stats.reason=nextPlan.items.length>4096?'plan_capacity':'below_savings_threshold';
    return {body,stats,plan:{version:1,items:[]}};
  }
  stats.tool_bytes_after-=stats.removed_bytes;if(next){stats.mode='trimmed';stats.reason='trimmed';}
  return {body:next??body,stats,plan:plan??nextPlan};
}
