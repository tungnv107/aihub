import {RelayError, hash} from './security.mjs';
import {measuredUsage} from './accounting.mjs';

export function sessionDetails(headers, body, fallback=true) {
  for(const name of ['session-id','session_id','x-codex-parent-thread-id','thread-id']) {
    const value=headers.get(name);if(value)return {key:value,source:name};
  }
  if(body.prompt_cache_key)return {key:body.prompt_cache_key,source:'prompt_cache_key'};
  if(!fallback)return {key:'',source:'none'};
  const first=Array.isArray(body.input)?body.input.find(item=>item?.role==='user')?.content:body.input;
  const prefix=(typeof first==='string'?first:JSON.stringify(first??'')).slice(0,2048);
  // Routing hint only: preserve all prompt text, IDs and history on the wire.
  const anchor=JSON.stringify([(body.instructions??'').slice?.(0,4096)??'',body.tools??[],prefix]);
  return {key:'prefix:'+hash(anchor),source:'content_prefix'};
}
export function sessionFrom(headers, body, fallback=true) {
  return sessionDetails(headers,body,fallback).key;
}
export function toResponses(body, chat) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RelayError(400,'invalid_request');
  if (typeof body.model !== 'string' || !/^[\w.:-]{1,100}$/.test(body.model)) throw new RelayError(400,'model_required');
  if (body.previous_response_id) throw new RelayError(400,'full_history_required','Send complete input history; previous_response_id is not supported by this stateless relay.');
  if (body.background) throw new RelayError(400,'background_not_supported');
  if(body.prompt_cache_key!==undefined&&(typeof body.prompt_cache_key!=='string'||body.prompt_cache_key.length>4096))
    throw new RelayError(400,'invalid_prompt_cache_key');
  if (!chat) return structuredClone(body);
  if (!Array.isArray(body.messages)) throw new RelayError(400,'messages_required');
  if (body.n && body.n !== 1) throw new RelayError(400,'multiple_choices_not_supported');
  const input=[];
  for(const message of body.messages) {
    if(message.role==='tool') {input.push({type:'function_call_output',call_id:message.tool_call_id,output:message.content ?? ''});continue;}
    if(!['system','developer','user','assistant'].includes(message.role))throw new RelayError(400,'unsupported_message_role');
    if(message.content !== null && message.content !== undefined) {
      const content=typeof message.content==='string' ? message.content : message.content.map(part=>{
        if(part.type==='text')return {type:message.role==='assistant'?'output_text':'input_text',text:part.text};
        if(part.type==='image_url' && message.role!=='assistant')return {type:'input_image',image_url:part.image_url.url,detail:part.image_url.detail??'auto'};
        throw new RelayError(400,'unsupported_content_part');
      });
      input.push({role:message.role,content});
    }
    for(const call of message.tool_calls??[]) {
      if(call.type!=='function')throw new RelayError(400,'unsupported_tool_type');
      input.push({type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments});
    }
  }
  const result={model:body.model,input};
  for(const key of ['temperature','top_p','parallel_tool_calls','prompt_cache_key','service_tier'])
    if(body[key]!==undefined)result[key]=body[key];
  if(body.max_completion_tokens??body.max_tokens)result.max_output_tokens=body.max_completion_tokens??body.max_tokens;
  if(body.reasoning_effort)result.reasoning={effort:body.reasoning_effort};
  if(body.tools)result.tools=body.tools.map(tool=>{
    if(tool.type!=='function')throw new RelayError(400,'unsupported_tool_type');
    return {type:'function',...tool.function};
  });
  if(body.tool_choice)result.tool_choice=typeof body.tool_choice==='object'?{type:'function',name:body.tool_choice.function.name}:body.tool_choice;
  if(body.response_format?.type==='json_schema')result.text={format:{type:'json_schema',...body.response_format.json_schema}};
  else if(body.response_format?.type==='json_object')result.text={format:{type:'json_object'}};
  else if(body.response_format && body.response_format.type!=='text')throw new RelayError(400,'unsupported_response_format');
  return result;
}

export function shapeRequest(body, adapter, scope) {
  const result=structuredClone(body);
  result.store=false;result.stream=true;
  // An explicit client group may span sessions, but never callers or accounts.
  const cacheSession=body.prompt_cache_key||scope.session;
  // Retain v2 keys when the client group already supplied session affinity.
  result.prompt_cache_key=hash(JSON.stringify(['v2',scope.caller,scope.tenant??'local',scope.account,body.model,cacheSession,body.prompt_cache_key??'']));
  if(adapter==='plan') {
    // ChatGPT plan OAuth has a narrower Responses contract than API billing.
    for(const key of ['background','conversation','max_output_tokens','max_tool_calls','metadata','moderation','multi_agent','prompt',
      'prompt_cache_retention','safety_identifier','temperature','top_logprobs','top_p','truncation','user']) {
      if(result[key]!==undefined&&result[key]!==null&&!(key==='background'&&result[key]===false)) {
        const error=new RelayError(400,'plan_unsupported_parameter');error.param=key;throw error;
      }
      delete result[key];
    }
    if(typeof result.input==='string')result.input=[{role:'user',content:result.input}];
    if(!Array.isArray(result.input))throw new RelayError(400,'plan_input_array_required');
    result.input=result.input.map(item=>item?.role==='system'?{...item,role:'developer'}:item);
    if(result.tools) {
      if(!Array.isArray(result.tools))throw new RelayError(400,'tools_array_required');
      const localTools=result.tools.filter(tool=>['function','custom'].includes(tool.type));
      const hosted=result.tools.filter(tool=>!['function','custom'].includes(tool.type));
      if(hosted.some(tool=>!['namespace','web_search','web_search_preview'].includes(tool.type)))
        throw new RelayError(400,'plan_unsupported_tool');
      // additional_tools keeps original names, call IDs and tool_choice semantics.
      if(localTools.length)result.input.unshift({type:'additional_tools',role:'developer',tools:localTools});
      if(hosted.length)result.tools=hosted;else delete result.tools;
    }
  }
  if(adapter==='codex') {
    for(const key of ['metadata','temperature','top_p','max_output_tokens','prompt_cache_retention','prompt_cache_options','truncation'])delete result[key];
    if(typeof result.input==='string')result.input=[{role:'user',content:result.input}];
    // Codex rejects explicit system messages; developer retains application instructions.
    if(Array.isArray(result.input))result.input=result.input.map(item=>
      item?.role==='system'&&(!item.type||item.type==='message')?{...item,role:'developer'}:item);
    result.instructions=result.instructions??'';
  }
  return result;
}

export class SseDecoder {
  constructor(){this.decoder=new TextDecoder();this.buffer='';}
  push(bytes, final=false) {
    this.buffer+=this.decoder.decode(bytes??new Uint8Array(),{stream:!final});
    const events=[];let match;
    while((match=/\r?\n\r?\n/.exec(this.buffer))) {
      if(Buffer.byteLength(this.buffer.slice(0,match.index))>2097152)throw new RelayError(502,'upstream_event_too_large');
      const frame=this.buffer.slice(0,match.index);this.buffer=this.buffer.slice(match.index+match[0].length);
      const lines=frame.split(/\r?\n/);let event='';const data=[];
      for(const line of lines){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));}
      if(!data.length)continue;
      const value=data.join('\n');if(value==='[DONE]')continue;
      let json;try{json=JSON.parse(value);}catch{throw new RelayError(502,'invalid_upstream_event');}
      events.push({type:json.type??event,json});
    }
    if(Buffer.byteLength(this.buffer)>2097152)throw new RelayError(502,'upstream_event_too_large');
    if(final && this.buffer.trim())throw new RelayError(502,'truncated_upstream_event');
    return events;
  }
}
export const sse = object => Buffer.from('data: '+JSON.stringify(object)+'\n\n');

export class ResponseAccumulator {
  constructor(){this.items=new Map();}
  handle({type,json:e}) {
    if(!Number.isSafeInteger(e.output_index)||e.output_index<0)return;
    const index=e.output_index;
    if((type==='response.output_item.added'||type==='response.output_item.done')&&e.item) {
      const previous=this.items.get(index),item=structuredClone(e.item);
      if(previous?.content?.length&&(!item.content||item.content.length===0))item.content=previous.content;
      this.items.set(index,item);return;
    }
    let item=this.items.get(index);
    if(type.startsWith('response.function_call_arguments.')) {
      item??={type:'function_call',id:e.item_id,arguments:''};
      item.arguments=type.endsWith('.done')?e.arguments??item.arguments:(item.arguments??'')+(e.delta??'');
      this.items.set(index,item);return;
    }
    if(type.startsWith('response.custom_tool_call_input.')) {
      item??={type:'custom_tool_call',id:e.item_id,input:''};
      item.input=type.endsWith('.done')?e.input??item.input:(item.input??'')+(e.delta??'');
      this.items.set(index,item);return;
    }
    if(!['response.content_part.added','response.content_part.done','response.output_text.delta','response.output_text.done',
      'response.refusal.delta','response.refusal.done'].includes(type))return;
    item??={type:'message',id:e.item_id,role:'assistant',content:[]};item.content??=[];
    const partIndex=Number.isSafeInteger(e.content_index)&&e.content_index>=0?e.content_index:0;
    if(partIndex>4096)throw new RelayError(502,'upstream_content_index_invalid');
    if(e.part)item.content[partIndex]=structuredClone(e.part);
    else {
      const refusal=type.includes('.refusal.'),field=refusal?'refusal':'text';
      const part=item.content[partIndex]??={type:refusal?'refusal':'output_text',[field]:''};
      part[field]=type.endsWith('.done')?e[field]??part[field]:(part[field]??'')+(e.delta??'');
    }
    this.items.set(index,item);
  }
  complete(response) {
    if(Array.isArray(response?.output)&&response.output.length)return response;
    if(!this.items.size)return response;
    return {...response,output:[...this.items].sort((a,b)=>a[0]-b[0]).map(([,item])=>structuredClone(item))};
  }
}

export function chatUsage(usage) {
  const measured=measuredUsage(usage);
  if(measured.input===null||measured.output===null)return undefined;
  return {prompt_tokens:measured.input,completion_tokens:measured.output,total_tokens:measured.input+measured.output,
    ...(measured.cached!==null?{prompt_tokens_details:{cached_tokens:measured.cached}}:{}),
    ...(measured.reasoning!==null?{completion_tokens_details:{reasoning_tokens:measured.reasoning}}:{})};
}
export function chatResponse(response) {
  const content=[],tools=[];let refusal='';
  for(const item of response.output??[]) {
    if(item.type==='function_call')tools.push({id:item.call_id??item.id,type:'function',function:{name:item.name,arguments:item.arguments??''}});
    if(item.type==='message')for(const part of item.content??[]) {
      if(part.type==='output_text')content.push(part.text??'');
      if(part.type==='refusal')refusal+=part.refusal??'';
    }
  }
  return {id:response.id??'chatcmpl-relay',object:'chat.completion',created:response.created_at??Math.floor(Date.now()/1000),model:response.model,
    choices:[{index:0,message:{role:'assistant',content:content.length?content.join(''):null,...(tools.length?{tool_calls:tools}:{}),...(refusal?{refusal}:{})},
      finish_reason:response.status==='incomplete'?'length':tools.length?'tool_calls':'stop'}],usage:chatUsage(response.usage)};
}

export class ChatStream {
  constructor(model,includeUsage=false){this.model=model;this.id='chatcmpl-relay';this.created=Math.floor(Date.now()/1000);this.started=false;this.tools=new Map();this.text='';this.refusal='';this.includeUsage=includeUsage;}
  chunk(delta,finish=null){return {id:this.id,object:'chat.completion.chunk',created:this.created,model:this.model,choices:[{index:0,delta,finish_reason:finish}]};}
  handle({type,json:e}) {
    const output=[];
    if(e.response){this.id=e.response.id??this.id;this.model=e.response.model??this.model;this.created=e.response.created_at??this.created;}
    if(!this.started){output.push(this.chunk({role:'assistant',content:''}));this.started=true;}
    if(type==='response.output_text.delta'){this.text+=e.delta??'';output.push(this.chunk({content:e.delta??''}));}
    if(type==='response.refusal.delta'){this.refusal+=e.delta??'';output.push(this.chunk({refusal:e.delta??''}));}
    if(type==='response.output_item.added'&&e.item?.type==='function_call')this.addTool(e.item,e.output_index,output);
    if(type==='response.function_call_arguments.delta') {
      const tool=this.tools.get(e.output_index);
      if(!tool)throw new RelayError(502,'tool_delta_without_item');
      tool.arguments+=e.delta??'';output.push(this.chunk({tool_calls:[{index:tool.index,function:{arguments:e.delta??''}}]}));
    }
    if(type==='response.output_item.done'&&e.item?.type==='function_call')this.completeTool(e.item,e.output_index,output);
    if(type==='response.completed'||type==='response.incomplete') {
      const full=chatResponse(e.response);
      if(!this.text&&full.choices[0].message.content)output.push(this.chunk({content:full.choices[0].message.content}));
      if(!this.refusal&&full.choices[0].message.refusal)output.push(this.chunk({refusal:full.choices[0].message.refusal}));
      for(const [index,item] of (e.response.output??[]).entries())if(item.type==='function_call')this.completeTool(item,index,output);
      output.push(this.chunk({},full.choices[0].finish_reason));
      const usage=chatUsage(e.response.usage);
      if(this.includeUsage&&usage)output.push({id:this.id,object:'chat.completion.chunk',created:this.created,model:this.model,choices:[],usage});
    }
    return output.map(sse);
  }
  addTool(item,key,output){
    if(this.tools.has(key))return;
    const tool={index:this.tools.size,id:item.call_id??item.id,arguments:item.arguments??''};this.tools.set(key,tool);
    output.push(this.chunk({tool_calls:[{index:tool.index,id:item.call_id??item.id,type:'function',function:{name:item.name,arguments:tool.arguments}}]}));
  }
  completeTool(item,key,output){
    const known=[...this.tools].find(([,tool])=>tool.id&&(tool.id===(item.call_id??item.id)));
    if(known)key=known[0];
    this.addTool(item,key,output);const tool=this.tools.get(key),full=item.arguments??'';
    if(!full.startsWith(tool.arguments))throw new RelayError(502,'tool_arguments_mismatch');
    if(full.length>tool.arguments.length)output.push(this.chunk({tool_calls:[{index:tool.index,function:{arguments:full.slice(tool.arguments.length)}}]}));
    tool.arguments=full;
  }
}
