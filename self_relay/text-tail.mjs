import {RelayError} from './security.mjs';
import {ResponseAccumulator} from './protocol.mjs';
import {flatFunctionTail} from './flat-function-tail.mjs';

const MAX_BYTES=2*1024*1024;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const terminal=new Set(['response.completed','response.incomplete','response.failed']);
const fail=code=>{throw new RelayError(502,code);};
const helper=()=>flatFunctionTail({type:'function',name:'relay_plain_answer',strict:true,
  parameters:{type:'object',properties:{answer:{type:'string',description:'The entire original plain-text answer, unchanged.'}},required:['answer'],additionalProperties:false}},value=>typeof value.answer==='string');

function metadata(value){
  if(!value)return;
  if((value.annotations!==undefined&&(!Array.isArray(value.annotations)||value.annotations.length))||
    (value.logprobs!==undefined&&value.logprobs!==null&&(!Array.isArray(value.logprobs)||value.logprobs.length)))
    fail('text_tail_unsupported_metadata');
}

/** Optional plain-text transport; response-tail composes it with tool restoration.
 * Early completion returns a complete decoded message, never a usage estimate.
 */
export function prepareTextTail(body,{enabled=false,maxBytes=MAX_BYTES,allowActiveTools=false}={}){
  const skip=reason=>({body,state:null,reason});
  if(!enabled)return skip('disabled');
  if(!object(body))return skip('unsupported_request');
  if(body.context_management||body.input?.some?.(item=>['compaction','compaction_trigger'].includes(item?.type)))return skip('compaction');
  if(body.response_format||body.logprobs||body.top_logprobs||body.audio||body.modalities||
    body.include?.some?.(item=>typeof item==='string'&&/logprob|annotation/.test(item)))return skip('unsupported_output');
  if(body.text!==undefined&&(!object(body.text)||(body.text.format!==undefined&&body.text.format?.type!=='text')))return skip('client_output_format');
  if(body.tools!==undefined&&!Array.isArray(body.tools))return skip('unsupported_tools');
  const activeTools=!!body.tools?.length&&body.tool_choice!=='none';
  const compatible=body.tools?.every(tool=>['function','custom'].includes(tool?.type)&&typeof tool.name==='string'&&tool.name.length>0);
  if(activeTools&&(!allowActiveTools||!compatible))return skip('active_tools');
  const forced=object(body.tool_choice)&&['function','custom'].includes(body.tool_choice.type)&&body.tools?.some(tool=>tool.type===body.tool_choice.type&&tool.name===body.tool_choice.name);
  if(body.tool_choice!==undefined&&!['none','auto'].includes(body.tool_choice)&&!(allowActiveTools&&activeTools&&(body.tool_choice==='required'||forced)))return skip('active_tools');
  if(Array.isArray(body.input)&&body.input.some(item=>Array.isArray(item?.content)&&item.content.some(part=>!['input_text','output_text','text','refusal'].includes(part?.type))))return skip('multimodal_input');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_BYTES)throw new TypeError('invalid_text_tail_buffer_limit');
  const transport=helper(),prepared=structuredClone(body);
  prepared.text={...prepared.text,format:{type:'json_schema',name:'relay_plain_answer',strict:true,schema:transport.tool.parameters}};
  return {body:prepared,state:new TextTailState(body,transport,maxBytes,activeTools),reason:'enabled'};
}

class TextTailState{
  constructor(original,transport,maxBytes,activeTools){
    this.original=structuredClone(original);this.transport=transport;this.maxBytes=maxBytes;
    this.messages=new Map();this.items=new Map();this.open=new Set();this.accumulator=new ResponseAccumulator();
    this.bytes=0;this.pending=null;this.refusal=false;this.finished=false;this.awaitingTerminal=false;
    this.activeTools=activeTools;this.textMayFinish=!activeTools||original.tool_choice===undefined||original.tool_choice==='auto';
  }
  message(index,id){
    if(!Number.isSafeInteger(index)||index<0)fail('text_tail_invalid_index');
    const item=this.messages.get(index);
    if(!item||(id!==undefined&&id!==item.item.id))fail('text_tail_unknown_message');
    return item;
  }
  verifyItem(item,expected){
    if(!object(item)||item.id!==expected.id||item.type!==expected.type||
      (expected.type==='message'&&['role','phase'].some(key=>expected[key]!==undefined&&item[key]!==expected[key])))
      fail('text_tail_item_changed');
  }
  observePart(message,index,type){
    if(!Number.isSafeInteger(index)||index<0||index>4096)fail('text_tail_invalid_index');
    const previous=message.contentTypes.get(index);
    if(previous!==undefined&&previous!==type)fail('text_tail_content_changed');
    message.contentTypes.set(index,type);
  }
  part(message,index){
    this.observePart(message,index,'output_text');
    let part=message.parts.get(index);
    if(!part){part={text:'',bytes:0,source:{type:'output_text',text:'',annotations:[]},added:false,done:false,partDone:false};message.parts.set(index,part);}
    return part;
  }
  setText(part,text){
    if(typeof text!=='string')fail('text_tail_invalid_text');
    const bytes=Buffer.byteLength(text),total=this.bytes-part.bytes+bytes;
    if(total>this.maxBytes)fail('text_tail_buffer_exceeded');
    part.text=text;part.bytes=bytes;this.bytes=total;
  }
  decode(text,partial){
    try{const result=this.transport.unwrap(text,partial);return result===null?null:JSON.parse(result).answer;}
    catch(error){if(error instanceof RelayError)fail('text_tail_malformed_json');throw error;}
  }
  decodeEnded(text,mode){
    try{return {answer:this.decode(text,false),deferred:false};}
    catch(error){
      if(mode==='complete'||error?.code!=='text_tail_malformed_json')throw error;
      // A complete answer may precede an interrupted trailer. Otherwise emit no guessed prefix.
      const answer=this.decode(text,true)??'';
      return {answer,deferred:mode==='defer'};
    }
  }
  checkedPart(message,index,source,mode='complete'){
    metadata(source);const part=this.part(message,index);
    if(typeof source.text!=='string'||!source.text.startsWith(part.text))fail('text_tail_text_changed');
    this.setText(part,source.text);const {answer,deferred}=this.decodeEnded(source.text,mode);
    if(part.restored!==undefined&&part.restored!==answer)fail('text_tail_text_changed');
    part.source=structuredClone(source);part.deferred=deferred;
    if(deferred)this.awaitingTerminal=true;
    return {part,answer,deferred};
  }
  emitPart(message,index,part,answer,closePart){
    if(part.restored!==undefined&&part.restored!==answer)fail('text_tail_text_changed');
    const base={output_index:message.index,item_id:message.item.id,content_index:index},events=[];
    const push=(type,values)=>events.push({type,json:{type,...base,...values}});
    if(!part.added){push('response.content_part.added',{part:{...part.source,text:''}});part.added=true;}
    if(part.restored===undefined){push('response.output_text.delta',{delta:answer});part.restored=answer;}
    if(!part.done){push('response.output_text.done',{text:answer});part.done=true;}
    if(closePart&&!part.partDone){push('response.content_part.done',{part:{...part.source,text:answer}});part.partDone=true;}
    return events;
  }
  early(events,allowed){
    const pending=this.pending;
    if(!allowed||this.awaitingTerminal||!this.textMayFinish||this.refusal||!pending||this.messages.size!==1||pending.message.parts.size!==1||
      (this.activeTools&&pending.message.item.phase!=='final_answer')||
      [...this.items.values()].filter(item=>item.type.endsWith('_call')).length>1||
      (pending.message.item.phase!==undefined&&pending.message.item.phase!=='final_answer')||
      [...this.open].some(index=>index!==pending.message.index))return {events,complete:false};
    const {message,index,part,answer}=pending;
    events.push(...this.emitPart(message,index,part,answer,true));
    const item={...message.item,status:'completed',content:[{...part.source,text:answer}]};
    if(!message.done)events.push({type:'response.output_item.done',json:{type:'response.output_item.done',output_index:message.index,item}});
    message.done=true;this.open.delete(message.index);this.finished=true;
    return {events,complete:true};
  }
  restoreItem(item,record,mode='complete'){
    if(record){
      this.verifyItem(item,record.item);
      if(item.content!==undefined&&!Array.isArray(item.content))fail('text_tail_unsupported_content');
      for(const [index,type] of record.contentTypes){
        if(!item.content?.[index])fail('text_tail_incomplete_text');
        if(item.content[index].type!==type)fail('text_tail_content_changed');
      }
    }
    if(item?.type!=='message')return structuredClone(item);
    const restored=structuredClone(item);
    restored.content=(item.content??[]).map((part,index)=>{
      if(part.type==='refusal'){this.refusal=true;return structuredClone(part);}
      if(part.type!=='output_text')fail('text_tail_unsupported_content');
      metadata(part);
      if(record){const checked=this.checkedPart(record,index,part,mode);return {...part,text:checked.answer};}
      if(typeof part.text!=='string'||Buffer.byteLength(part.text)>this.maxBytes)fail('text_tail_buffer_exceeded');
      return {...part,text:this.decodeEnded(part.text,mode).answer};
    });
    return restored;
  }
  process(event,{allowEarly=true}={}){
    if(this.finished)return {events:[],complete:false};
    if(!object(event?.json)||typeof event.type!=='string')fail('text_tail_invalid_event');
    if(event.type==='response.output_text.annotation.added')fail('text_tail_unsupported_metadata');
    metadata(event.json);let prepared=event;
    if(object(event.json.response)){
      const response=structuredClone(event.json.response);
      if(Object.hasOwn(this.original,'text'))response.text=structuredClone(this.original.text);else delete response.text;
      const interrupted=event.type==='response.incomplete'||event.type==='response.failed';
      if(interrupted){
        if(response.output!=null&&!Array.isArray(response.output))fail('text_tail_invalid_event');
        response.output??=[];
        const observed=this.accumulator.complete({output:[]}).output??[];
        // Failed responses may omit output. Retain observed identity and buffered content, then sanitize it below.
        for(const [index,identity] of this.items)if(!response.output[index]){
          const item=structuredClone(observed.find(value=>value.id===identity.id));
          if(!item)continue;
          const record=this.messages.get(index);
          if(record){
            item.content??=[];
            for(const [partIndex,part] of record.parts)item.content[partIndex]={...part.source,text:part.text};
            if(!record.done)item.status='incomplete';
          }
          response.output[index]=item;
        }
      }
      if(terminal.has(event.type)&&Array.isArray(response.output))for(const [index,item] of this.items){
        if(response.output[index])this.verifyItem(response.output[index],item);
        else if(this.messages.get(index)?.contentTypes.size)fail('text_tail_incomplete_text');
      }
      if(Array.isArray(response.output))response.output=response.output.map(item=>{
        if(terminal.has(event.type)){
          const record=[...this.messages.values()].find(message=>message.item.id===item.id);
          return this.restoreItem(item,record,interrupted?'interrupted':'complete');
        }
        if(item?.type!=='message')return item;
        return {...item,content:(item.content??[]).map(part=>{metadata(part);return part.type==='output_text'?{...part,text:''}:part;})};
      });
      prepared={...event,json:{...event.json,response}};
    }
    const result=this.processEvent(prepared,allowEarly);
    for(const output of result.events)this.accumulator.handle(output);
    if(result.complete)result.output=this.accumulator.complete({output:[]}).output;
    return result;
  }
  processEvent(event,allowEarly){
    const {type,json:e}=event,index=e.output_index;
    if(type==='response.output_item.added'){
      if(!Number.isSafeInteger(index)||index<0||!object(e.item)||typeof e.item.id!=='string'||!e.item.id||typeof e.item.type!=='string'||!e.item.type||
        this.items.has(index)||[...this.items.values()].some(item=>item.id===e.item.id))fail('text_tail_invalid_item');
      this.items.set(index,{id:e.item.id,type:e.item.type,role:e.item.role,phase:e.item.phase});this.open.add(index);
      if(e.item.type!=='message')return {events:[event],complete:false};
      const message={index,item:structuredClone(e.item),parts:new Map(),contentTypes:new Map(),done:false};this.messages.set(index,message);
      const content=(e.item.content??[]).map((source,partIndex)=>{
        metadata(source);if(source.type==='refusal'){this.observePart(message,partIndex,'refusal');this.refusal=true;return source;}
        if(source.type!=='output_text')fail('text_tail_unsupported_content');
        const part=this.part(message,partIndex);part.source=structuredClone(source);this.setText(part,source.text??'');return {...source,text:''};
      });
      return {events:[{...event,json:{...e,item:{...e.item,content}}}],complete:false};
    }
    if(type==='response.content_part.added'){
      const message=this.message(index,e.item_id);metadata(e.part);
      if(e.part?.type==='refusal'){this.observePart(message,e.content_index,'refusal');this.refusal=true;return {events:[event],complete:false};}
      if(e.part?.type!=='output_text')fail('text_tail_unsupported_content');
      const part=this.part(message,e.content_index);if(part.added)fail('text_tail_duplicate_part');
      this.setText(part,e.part.text??'');part.source=structuredClone(e.part);part.added=true;
      return {events:[{...event,json:{...e,part:{...e.part,text:''}}}],complete:false};
    }
    if(type.startsWith('response.refusal.')){this.observePart(this.message(index,e.item_id),e.content_index,'refusal');this.refusal=true;return {events:[event],complete:false};}
    if(type==='response.output_text.delta'){
      const message=this.message(index,e.item_id),part=this.part(message,e.content_index);
      if(part.done||typeof e.delta!=='string')fail('text_tail_invalid_text');this.setText(part,part.text+e.delta);
      const answer=this.decode(part.text,true);
      if(answer===null)return {events:[],complete:false};
      this.pending={message,index:e.content_index,part,answer};return this.early([],allowEarly);
    }
    if(type==='response.output_text.done'){
      const message=this.message(index,e.item_id),part=this.part(message,e.content_index);
      const checked=this.checkedPart(message,e.content_index,{...part.source,text:e.text},'defer');
      if(checked.deferred)return {events:[],complete:false};
      return {events:this.emitPart(message,e.content_index,checked.part,checked.answer,false),complete:false};
    }
    if(type==='response.content_part.done'){
      const message=this.message(index,e.item_id);metadata(e.part);
      if(e.part?.type==='refusal'){this.observePart(message,e.content_index,'refusal');this.refusal=true;return {events:[event],complete:false};}
      if(e.part?.type!=='output_text')fail('text_tail_unsupported_content');
      const checked=this.checkedPart(message,e.content_index,e.part,'defer');
      if(checked.deferred)return {events:[],complete:false};
      return {events:this.emitPart(message,e.content_index,checked.part,checked.answer,true),complete:false};
    }
    if(type==='response.output_item.done'){
      const identity=this.items.get(index);
      if(!identity||!this.open.has(index))fail('text_tail_unknown_item');
      this.verifyItem(e.item,identity);
      this.open.delete(index);
      if(e.item?.type!=='message')return this.early([event],allowEarly);
      const message=this.message(index,e.item.id),item=this.restoreItem(e.item,message,'defer'),events=[];
      if([...message.parts.values()].some(part=>part.deferred))return {events:[],complete:false};
      for(const [partIndex,part] of message.parts)if(part.restored!==undefined||part.text){
        const answer=item.content?.[partIndex]?.text;if(typeof answer!=='string')fail('text_tail_incomplete_text');
        events.push(...this.emitPart(message,partIndex,part,answer,true));
      }
      if(!message.done)events.push({...event,json:{...e,item}});message.done=true;
      return {events,complete:false};
    }
    if(terminal.has(type)){
      if(!Array.isArray(e.response?.output)&&this.messages.size)fail('text_tail_incomplete_text');
      for(const message of this.messages.values())if(!e.response.output?.some(item=>item.id===message.item.id)&&!message.done)fail('text_tail_incomplete_text');
      const events=[];
      if(type!=='response.completed')for(const message of this.messages.values())if(!message.done&&message.parts.size){
        const item=e.response.output.find(value=>value.id===message.item.id);
        for(const [index,part] of message.parts)events.push(...this.emitPart(message,index,part,item.content[index].text,true));
        events.push({type:'response.output_item.done',json:{type:'response.output_item.done',output_index:message.index,item}});
        message.done=true;this.open.delete(message.index);
      }
      this.finished=true;return {events:[...events,event],complete:false};
    }
    if(type.startsWith('response.output_text.'))fail('text_tail_unsupported_event');
    return {events:[event],complete:false};
  }
}
