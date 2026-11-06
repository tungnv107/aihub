// Counts from upstream stay separate from local replay and byte measurements.
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export function requestKind(body,compacting=false) {
  if(compacting)return 'compaction';
  if(!Array.isArray(body?.input))return 'inference';
  const lastUser=body.input.findLastIndex(item=>item?.role==='user');
  return body.input.slice(lastUser+1).some(item=>['function_call_output','custom_tool_call_output'].includes(item?.type))?
    'tool_continuation':'inference';
}

export function responseKind(response,compacting=false) {
  if(compacting)return 'compaction';
  const output=Array.isArray(response?.output)?response.output:[];
  if(output.some(item=>item?.type==='compaction'))return 'compaction';
  const tool=output.some(item=>['function_call','custom_tool_call'].includes(item?.type));
  const messages=output.filter(item=>item?.type==='message'&&item.role==='assistant'&&Array.isArray(item.content)&&
    item.content.some(part=>['output_text','refusal'].includes(part?.type)));
  const text=messages.some(item=>item.phase!=='commentary');
  return tool&&text?'mixed':tool?'tool_call':text?'final_text':messages.length?'commentary':'unknown';
}

export function measuredUsage(usage, replay=false) {
  if(replay)return {input:0,cached:0,uncached:0,output:0,reasoning:0,cacheWrite:0,source:'local_replay',anomaly:null};
  const input=count(usage?.input_tokens),cached=count(usage?.input_tokens_details?.cached_tokens);
  const output=count(usage?.output_tokens),reasoning=count(usage?.output_tokens_details?.reasoning_tokens);
  const cacheWrite=count(usage?.input_tokens_details?.cache_write_tokens);
  const anomaly=cached!==null&&input!==null&&cached>input?'cached_exceeds_input':
    reasoning!==null&&output!==null&&reasoning>output?'reasoning_exceeds_output':null;
  return {input,cached,uncached:input!==null&&cached!==null&&cached<=input?input-cached:null,
    output,reasoning,cacheWrite,source:[input,cached,output,reasoning,cacheWrite].some(x=>x!==null)?'upstream':'unknown',anomaly};
}

export function requestMetrics(body) {
  let textBytes=0,toolSchemaBytes=0;
  const text=value=>{
    if(typeof value==='string')textBytes+=Buffer.byteLength(value);
    else if(Array.isArray(value))for(const part of value)if(typeof part?.text==='string')textBytes+=Buffer.byteLength(part.text);
  };
  const tools=value=>{if(Array.isArray(value))toolSchemaBytes+=Buffer.byteLength(JSON.stringify(value));};
  text(body.instructions);tools(body.tools);
  if(typeof body.input==='string')text(body.input);
  else for(const item of Array.isArray(body.input)?body.input:[]) {
    if(!item||typeof item!=='object')continue;
    if(item.type==='additional_tools')tools(item.tools);
    else if(item.type==='function_call')text(item.arguments);
    else if(item.type==='custom_tool_call')text(item.input);
    else if(item.type==='function_call_output'||item.type==='custom_tool_call_output')text(item.output);
    else text(item.content);
  }
  return {text_bytes:textBytes,tool_schema_bytes:toolSchemaBytes};
}
