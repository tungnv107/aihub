import {createPolicyEngine} from './policy-engine.generated.mjs';
import {RelayError} from './security.mjs';
import {SseDecoder,sse} from './protocol.mjs';

export const EXECUTABLE_POLICY_REVISION='4287bfe46f9e4a0c8e40c0a61e7986d1bb46a4639788a79db163674d1affe79a';
export const POLICY_RUNTIME_PROFILE='local-v7-20261030';

// Chỉ chuẩn hóa metadata được khai báo. UUID và nội dung user/tool vẫn nguyên vẹn.
export function normalizePolicyMetadata(body){
  let changed=0;
  const normalize=value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    for(const key of ['turn_id','root_turn_id','parent_turn_id','session_id','thread_id','rollout_id']){
      if(typeof value[key]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[key])){
        value[key]='00000000-0000-0000-0000-000000000000';changed++;
      }
    }
    if(typeof value.create_time==='number'){delete value.create_time;changed++;}
  };
  normalize(body.metadata);
  for(const item of Array.isArray(body.input)?body.input:[])if(item?.type==='metadata')normalize(item.metadata);
  return changed;
}

export function preparePolicyRequest(body,capture,{adapter,compacting=false}={}){
  if(capture.identity.mode!=='enforce'||!capture.policy)return {body,applied:false,reason:capture.identity.mode};
  if(adapter!=='codex'||compacting)return {body,applied:false,reason:compacting?'compaction_passthrough':'adapter_passthrough'};
  if(capture.identity.revision!==EXECUTABLE_POLICY_REVISION)throw new RelayError(409,'policy_revision_not_executable');
  const policy=capture.policy,engine=createPolicyEngine(policy),shaped=structuredClone(body);
  if(shaped.reasoning&&typeof shaped.reasoning==='object'&&shaped.reasoning.summary===undefined)shaped.reasoning.summary='auto';
  const effort=engine.effort(shaped),trimmed=engine.trim(shaped),stripped=engine.stripReasoning(shaped);
  engine.effortFloor(shaped);
  const model=engine.lightModel(shaped)??engine.collabModel(shaped);if(model)shaped.model=model;
  engine.schemaFix(shaped);
  const plainBody=JSON.stringify(shaped),cleanEcho={};
  for(const key of ['instructions','tools','parallel_tool_calls','text'])if(key in shaped)cleanEcho[key]=structuredClone(shaped[key]);
  const state={policy,engine,cleanEcho,plainBody,wire:shaped.model,requestedModel:body.model,cutAt:policy.limits.cutChars,
    jsCalls:new Set(),markerArmed:false,jsonSchema:false,padRequired:{},applied:true,profile:POLICY_RUNTIME_PROFILE};
  const astra=shaped.model.startsWith('gpt-6-astra'),structured=engine.structured(),slim=engine.slim(),clientFormat=shaped.text?.format!=null;
  if(!clientFormat){
    const instruction=astra?(engine.legacy()?(structured?'':slim?engine.slimAstra():engine.toolPad()+'\n\n'+engine.sentinel()):''):
      structured&&!engine.legacy()?'':slim?engine.slimMarker():engine.marker();
    state.markerArmed=!!instruction;
    if(instruction){
      if(shaped.instructions?.trim())shaped.instructions+='\n\n'+instruction;
      else if(Array.isArray(shaped.input))shaped.input.push({type:'message',role:'developer',content:[{type:'input_text',text:instruction}]});
      else shaped.instructions=instruction;
    }
    if(!astra&&!slim){
      if(Array.isArray(shaped.input))shaped.input.push({type:'message',role:'user',content:[{type:'input_text',text:engine.markerNote()}]});
      engine.injectPadCall(shaped);
    }
  }
  if(Array.isArray(shaped.tools)&&shaped.tools.length){
    state.padRequired=engine.requiredTools(shaped.tools);
    engine.toolCompatibility(shaped.tools,Array.isArray(shaped.input)?shaped.input:[]);
    engine.injectTools(shaped,{descHints:!slim,jsCalls:state.jsCalls});
  }
  const extra=engine.injectAdditional(shaped,{descHints:!slim});
  if(extra){state.codePad=extra.codePad;state.padRequired={...state.padRequired,...extra.padRequired};state.aliasOf=extra.aliasOf;
    for(const name of extra.jsCalls??[])state.jsCalls.add(name);}
  if((astra?structured:true)&&(!slim||structured||engine.legacy())&&policy.limits.jsonLane&&engine.injectJsonLane(shaped))state.jsonSchema=true;
  else if(clientFormat){const required=engine.injectClientJson(shaped);if(required)state.padRequired.__client_json__=required;}
  const normalized=policy.limits.cacheNorm?normalizePolicyMetadata(shaped):0;
  state.origBody=shaped;state.mutated=JSON.stringify(shaped)!==plainBody;
  return {body:shaped,applied:true,reason:POLICY_RUNTIME_PROFILE,state,stats:{effort:effort??null,trimmed,stripped,normalized}};
}

// Đọc usage gốc trước khi engine khôi phục stream. Thiếu số đo thì trả null.
export class PolicyUsageObserver{
  constructor(){this.segments=[];this.early=false;this.outcome=null;this.streamStats={buffered_reads:0,control_reads:0,empty_reads:0};}
  wrap(response){
    if(!response.ok||!response.body)return response;
    const item={usage:null,terminal:false,model:null};this.segments.push(item);
    const reader=response.body.getReader(),decoder=new SseDecoder();let ended=false;
    const release=()=>{if(!ended){ended=true;try{reader.releaseLock();}catch{}}};
    const body=new ReadableStream({
      async pull(controller){try{
        const {done,value}=await reader.read();
        for(const event of decoder.push(value,done)){
          if(event.json.response?.model)item.model=event.json.response.model;
          if(['response.completed','response.incomplete','response.failed'].includes(event.type)){
            item.terminal=true;item.usage=event.json.response?.usage??null;
          }
        }
        if(done){release();controller.close();}else controller.enqueue(value);
      }catch(error){release();controller.error(error);}},
      async cancel(reason){try{await reader.cancel(reason);}finally{release();}},
    },{highWaterMark:0});
    return new Response(body,{status:response.status,headers:response.headers});
  }
  usage(){
    if(!this.segments.length||this.segments.some(x=>!x.terminal||!x.usage))return null;
    const sum=path=>{const values=this.segments.map(x=>path.reduce((a,k)=>a?.[k],x.usage));return values.every(v=>Number.isSafeInteger(v)&&v>=0)?values.reduce((a,b)=>a+b,0):null;};
    const input=sum(['input_tokens']),output=sum(['output_tokens']);if(input===null||output===null)return null;
    const cached=sum(['input_tokens_details','cached_tokens']),reasoning=sum(['output_tokens_details','reasoning_tokens']);
    return {input_tokens:input,output_tokens:output,total_tokens:input+output,
      ...(cached===null?{}:{input_tokens_details:{cached_tokens:cached}}),...(reasoning===null?{}:{output_tokens_details:{reasoning_tokens:reasoning}})};
  }
  model(){return this.segments.map(s=>s.model).filter(Boolean).at(-1);}
}

export function wrapPolicyResponse(response,state,{signal,fetchSegment,abortFirst,started,observer=new PolicyUsageObserver()}={}){
  const engineStream=state.engine.stream({...state,first:observer.wrap(response),signal,started,
    abortFirst,fetchSeg:async(body,segmentSignal)=>observer.wrap(await fetchSegment(body,segmentSignal)),
    maxSegments:state.policy.limits.maxSegments,plainBody:state.mutated?state.plainBody:undefined,
    done(outcome){observer.outcome=outcome;observer.early=/autocut|marker|sentinel|args|json|postcall|tool/.test(outcome.cut??'');},
  });
  const reader=engineStream.getReader(),decoder=new SseDecoder();let ended=false;
  const release=()=>{if(!ended){ended=true;try{reader.releaseLock();}catch{}}};
  const body=new ReadableStream({
    async pull(controller){try{
      // Với highWaterMark=0, pull phải tạo đầu ra hoặc tiếp tục đọc; trả về
      // sau frame bị lọc sẽ để reader phía dưới chờ vô hạn.
      for(;;){
        const {value,done}=await reader.read();
        const events=decoder.push(value,done);
        for(const event of events){
          if(event.json.response){event.json.response.usage=observer.usage();const model=observer.model();if(model)event.json.response.model=model;}
          controller.enqueue(sse(event.json));
        }
        if(done){release();controller.close();return;}
        if(events.length)return;
        if(!value?.byteLength){observer.streamStats.empty_reads++;continue;}
        if(decoder.buffer.length){observer.streamStats.buffered_reads++;continue;}
        // Dùng comment chuẩn cho control frame; không gửi lại chunk gốc vì
        // chunk đó có thể chứa cả event đã được gửi và đã được sửa usage.
        observer.streamStats.control_reads++;
        controller.enqueue(Buffer.from(': keep-alive\n\n'));return;
      }
    }catch(error){release();controller.error(error);}},
    async cancel(reason){try{await reader.cancel(reason);}finally{release();}},
  },{highWaterMark:0});
  return {response:new Response(body,{status:response.status,headers:response.headers}),observer};
}
