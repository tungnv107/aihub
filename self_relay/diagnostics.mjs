// Opt-in protocol metadata only: never retain prompts, schemas, or tool arguments.
import {createHmac,randomBytes} from 'node:crypto';
const diagnosticSalt=randomBytes(32);
const fingerprint=value=>createHmac('sha256',diagnosticSalt).update(JSON.stringify(value??null)).digest('hex').slice(0,20);
const textBytes=value=>typeof value==='string'?Buffer.byteLength(value):Array.isArray(value)?value.reduce((n,p)=>n+(typeof p?.text==='string'?Buffer.byteLength(p.text):0),0):0;
export function contextProfile(body){
  const profile={instructions_bytes:textBytes(body?.instructions),message_bytes:{},tool_argument_bytes:0,tool_output_bytes:0,
    tool_output_sizes:{up_to_1500:0,up_to_6200:0,over_6200:0},prefix:{instructions:fingerprint(body?.instructions),tools:fingerprint(body?.tools),items:[]}};
  for(const item of Array.isArray(body?.input)?body.input:[]){
    if(!item||typeof item!=='object')continue;
    if(item.type==='function_call'||item.type==='custom_tool_call')profile.tool_argument_bytes+=textBytes(item.arguments??item.input);
    else if(item.type==='function_call_output'||item.type==='custom_tool_call_output'){
      profile.tool_output_bytes+=textBytes(item.output);
      const parts=typeof item.output==='string'?[item.output]:Array.isArray(item.output)?item.output.map(p=>p?.text).filter(t=>typeof t==='string'):[];
      for(const text of parts)profile.tool_output_sizes[text.length<=1500?'up_to_1500':text.length<=6200?'up_to_6200':'over_6200']++;
    }else{
      const role=['system','developer','user','assistant'].includes(item.role)?item.role:'other';
      profile.message_bytes[role]=(profile.message_bytes[role]??0)+textBytes(item.content);
    }
    if(profile.prefix.items.length<8)profile.prefix.items.push(fingerprint(item));
  }
  return profile;
}
export function toolInventory(body) {
  const entries=[];let omitted=0;
  const label=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value)?value:null;
  const visit=(tools,location,namespace=null,depth=0)=>{
    if(!Array.isArray(tools))return;
    for(const tool of tools){
      if(entries.length>=256||depth>4){omitted++;continue;}
      const spec=tool?.function??tool?.custom??tool;
      entries.push({location,namespace,type:label(tool?.type),name:label(spec?.name),format:label(spec?.format?.type)});
      if(tool?.type==='namespace')visit(tool.tools,location,label(tool.name),depth+1);
    }
  };
  visit(body?.tools,'tools');
  visit(body?.functions,'legacy_functions');
  if(Array.isArray(body?.input))for(const item of body.input)
    if(item?.type==='additional_tools')visit(item.tools,'additional_tools');
  return {entries,omitted,tool_choice:typeof body?.tool_choice==='string'?label(body.tool_choice):label(body?.tool_choice?.type)};
}

// Closed vocabularies: unknown request values and upstream prose never reach logs.
const fields=new Set(('model input instructions tools tool_choice parallel_tool_calls reasoning text include store stream stream_options background conversation previous_response_id prompt prompt_cache_key prompt_cache_retention prompt_cache_options metadata max_output_tokens max_tool_calls temperature top_p top_logprobs truncation service_tier safety_identifier user moderation multi_agent').split(' '));
const values=new Set(('message system developer user assistant input_text output_text input_image input_file function_call function_call_output custom_tool_call custom_tool_call_output reasoning item_reference additional_tools function custom namespace tool_search web_search web_search_preview grammar json text json_schema auto none required minimal low medium high xhigh concise detailed generate enabled disabled').split(' '));
export function requestShape(body) {
  const count={};
  for(const item of Array.isArray(body?.input)?body.input:[]){
    const type=values.has(item?.type)?item.type:item?.type?'other':'message';
    const role=values.has(item?.role)?item.role:'none';const key=type+':'+role;count[key]=(count[key]??0)+1;
  }
  const enumValue=value=>values.has(value)?value:value===undefined?'absent':'other';
  return {fields:Object.keys(body??{}).filter(k=>fields.has(k)),unknown_fields:Object.keys(body??{}).filter(k=>!fields.has(k)).length,
    input_items:count,reasoning_effort:enumValue(body?.reasoning?.effort),reasoning_summary:enumValue(body?.reasoning?.summary),
    text_format:enumValue(body?.text?.format?.type),tool_choice:enumValue(typeof body?.tool_choice==='string'?body.tool_choice:body?.tool_choice?.type),
    context_profile:contextProfile(body)};
}
export function rejectionShape(data) {
  const message=typeof data?.error?.message==='string'?data.error.message:typeof data?.detail==='string'?data.detail:typeof data?.message==='string'?data.message:'';
  const words=new Set([...fields,...values,...('unsupported invalid unknown parameter value required missing supplied false true schema strict properties additionalProperties anyOf oneOf allOf enum type name arguments format definition syntax defer_loading deferred context token tokens limit maximum exceeded encrypted_content not supported model'.split(' '))]);
  return {kind:data?.error?'error':data?.detail?'detail':data?.message?'message':'other',
    terms:[...new Set(message.match(/[A-Za-z_][A-Za-z0-9_]*/g)??[])].filter(word=>words.has(word)||words.has(word.toLowerCase())).slice(0,48)};
}
