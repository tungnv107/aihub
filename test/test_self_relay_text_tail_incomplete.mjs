import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTextTail} from '../self_relay/text-tail.mjs';
import {prepareResponseTail} from '../self_relay/response-tail.mjs';
const ev=(type,json={})=>({type,json:{type,...json}});
const message=(text,status='incomplete')=>({type:'message',id:'m1',role:'assistant',phase:'final_answer',status,content:[{type:'output_text',text,annotations:[]}]});
const start=state=>state.process(ev('response.output_item.added',{output_index:0,item:{...message('','in_progress'),content:[]}}));
const delta=text=>ev('response.output_text.delta',{output_index:0,item_id:'m1',content_index:0,delta:text});
const usage={input_tokens:124,output_tokens:9};
const ending=(text,type='response.incomplete')=>ev(type,{response:{id:'r1',status:type.split('.')[1],output:[message(text,type.split('.')[1])],usage,
  ...(type==='response.incomplete'?{incomplete_details:{reason:'max_output_tokens'}}:{error:{code:'server_error',message:'upstream error'}})}});
const make=()=>prepareTextTail({}, {enabled:true}).state;
const endResponse=result=>result.events.find(e=>['response.incomplete','response.failed','response.completed'].includes(e.type))?.json.response;

test('incomplete answer preserves terminal reason and usage without leaking transport JSON',()=>{
  const state=make(),raw='{"answer":"partial';start(state);state.process(delta(raw),{allowEarly:false});
  const result=state.process(ending(raw));assert.equal(result.complete,false);const response=endResponse(result);
  assert.equal(response.status,'incomplete');assert.deepEqual(response.incomplete_details,{reason:'max_output_tokens'});assert.deepEqual(response.usage,usage);
  assert.equal(response.output[0].content[0].text,'');assert.equal(JSON.stringify(result).includes(raw),false);
});

test('interrupted trailer retains the already complete Unicode answer',()=>{
  const state=make(),raw='{"answer":"xin chào 😀","zz_relay_tail":"e';start(state);state.process(delta(raw),{allowEarly:false});
  const result=state.process(ending(raw));assert.equal(result.complete,false);assert.equal(endResponse(result).output[0].content[0].text,'xin chào 😀');
});

test('truncated done events wait for incomplete terminal instead of becoming 502',()=>{
  for(const raw of ['{"answer":"partial','{"answer":"done","zz_relay_tail":"e']){
    const state=make();start(state);state.process(delta(raw),{allowEarly:false});
    for(const event of [ev('response.output_text.done',{output_index:0,item_id:'m1',content_index:0,text:raw}),
      ev('response.content_part.done',{output_index:0,item_id:'m1',content_index:0,part:message(raw).content[0]}),
      ev('response.output_item.done',{output_index:0,item:message(raw)})]){
      const result=state.process(event);assert.equal(result.complete,false);assert.deepEqual(result.events,[]);
    }
    const result=state.process(ending(raw));assert.equal(result.complete,false);assert.deepEqual(endResponse(result).usage,usage);
    assert.equal(result.events.filter(e=>e.type==='response.output_item.done').length,1);
    assert.equal(JSON.stringify(result.events).includes('zz_relay_tail'),false);
  }
});

test('failed terminal without output keeps upstream error and sanitized buffered message',()=>{
  const state=make();start(state);state.process(delta('{"answer":"cut'),{allowEarly:false});
  const response={id:'r1',status:'failed',error:{code:'server_error',message:'upstream error'},usage};
  const result=state.process(ev('response.failed',{response})),restored=endResponse(result);
  assert.equal(result.complete,false);assert.deepEqual(restored.error,response.error);assert.deepEqual(restored.usage,usage);assert.equal(restored.status,'failed');
  assert.equal(restored.output[0].content[0].text,'');assert.equal(restored.output[0].status,'incomplete');
});

test('malformed natural completion still fails after deferred done events',()=>{
  const state=make(),raw='{"answer":"partial';start(state);state.process(delta(raw),{allowEarly:false});
  assert.deepEqual(state.process(ev('response.output_text.done',{output_index:0,item_id:'m1',content_index:0,text:raw})).events,[]);
  assert.throws(()=>state.process(ending(raw,'response.completed')),{code:'text_tail_malformed_json'});
});

test('interrupted terminal still rejects changed message identity and text',()=>{
  for(const mutation of [event=>event.json.response.output[0].id='other',event=>event.json.response.output[0].content[0].text='{"answer":"other']){
    const state=make(),raw='{"answer":"partial';start(state);state.process(delta(raw),{allowEarly:false});
    const event=ending(raw);mutation(event);assert.throws(()=>state.process(event));
  }
});

test('combined active-tool text transport preserves incomplete status and usage',()=>{
  const {state}=prepareResponseTail({tool_choice:'auto',tools:[{type:'function',name:'ReadFile',strict:true,parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}]},
    {toolsEnabled:true,textEnabled:true});start(state);state.process(delta('{"answer":"partial'),{allowEarly:false});
  const result=state.process(ending('{"answer":"partial'));assert.equal(result.complete,false);assert.deepEqual(endResponse(result).usage,usage);assert.equal(endResponse(result).status,'incomplete');
});
