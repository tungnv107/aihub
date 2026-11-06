import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTextTail} from '../self_relay/text-tail.mjs';
const ev=(type,json={})=>({type,json:{type,...json}});
const msg=(content=[],extra={})=>({type:'message',id:'m1',role:'assistant',phase:'final_answer',content,...extra});
const part=text=>({type:'output_text',text,annotations:[]});
const envelope=answer=>JSON.stringify({answer,zz_relay_tail:'end'});
const make=()=>prepareTextTail({model:'test',input:[{role:'user',content:'hello'}]},{enabled:true});
const add=(state,index=0,extra={})=>state.process(ev('response.output_item.added',{output_index:index,item:msg([],{id:'m'+(index+1),...extra})}));
const delta=(text,index=0)=>ev('response.output_text.delta',{output_index:index,item_id:'m'+(index+1),content_index:0,delta:text});
const terminal=(text,usage={input_tokens:10,output_tokens:5})=>ev('response.completed',{response:{id:'r',status:'completed',text:{format:{type:'json_schema'}},output:[msg([part(text)],{status:'completed'})],usage}});

test('only plain text without active tools is eligible and request metadata stays unchanged',()=>{
  const body={model:'x',instructions:'preserve',reasoning:{effort:'high'},text:{verbosity:'low'},input:[{role:'assistant',content:'prior'}],tools:[{type:'function',name:'x'}],tool_choice:'none'};
  const copy=structuredClone(body),result=prepareTextTail(body,{enabled:true});assert.ok(result.state);assert.deepEqual(body,copy);
  assert.deepEqual(result.body.input,body.input);assert.equal(result.body.text.verbosity,'low');assert.deepEqual(result.body.reasoning,body.reasoning);
  for(const other of [{...body,tool_choice:'auto'},{...body,text:{format:{type:'json_schema'}}},{...body,input:[{role:'user',content:[{type:'input_image',image_url:'x'}]}]},{...body,include:['message.output_text.logprobs']},{...body,context_management:[]}])assert.equal(prepareTextTail(other,{enabled:true}).state,null);
  assert.equal(prepareTextTail(body).body,body);
});
test('all split boundaries preserve Unicode escapes and marker text in answer',()=>{
  const answer='xin chào 😀 \\ "zz_relay_tail"\nline\t終',text=envelope(answer),boundary=text.lastIndexOf(':"end"')+2;
  for(let n=0;n<boundary;n++){
    const {state}=make();add(state);const a=state.process(delta(text.slice(0,n)));assert.equal(a.complete,false);
    const b=state.process(delta(text.slice(n)));assert.equal(b.complete,true);assert.deepEqual(b.output,[msg([part(answer)],{status:'completed'})]);
    assert.equal(b.events.find(e=>e.type==='response.output_text.delta').json.delta,answer);
  }
});
test('natural terminal decodes reversed keys and retains upstream usage plus original text format',()=>{
  const {state}=prepareTextTail({text:{format:{type:'text'},verbosity:'low'}},{enabled:true});
  const result=state.process(terminal(JSON.stringify({zz_relay_tail:'end',answer:'correct'})));
  assert.equal(result.complete,false);assert.deepEqual(result.events[0].json.response.output[0].content,[part('correct')]);
  assert.deepEqual(result.events[0].json.response.usage,{input_tokens:10,output_tokens:5});assert.deepEqual(result.events[0].json.response.text,{format:{type:'text'},verbosity:'low'});
});
test('duplicate keys, invalid JSON, wrong trailer and size bounds fail explicitly',()=>{
  for(const value of ['{"answer":"x","answer":"y","zz_relay_tail":"end"}','{"answer":"x","answ\\u0065r":"y","zz_relay_tail":"end"}','{"answer":1,"zz_relay_tail":"end"}','{"answer":"x"}'])assert.throws(()=>make().state.process(terminal(value)));
  const {state}=prepareTextTail({}, {enabled:true,maxBytes:12});add(state);assert.throws(()=>state.process(delta('x'.repeat(13))),{code:'text_tail_buffer_exceeded'});
});
test('open reasoning delays early completion and opaque content is preserved',()=>{
  const {state}=make();state.process(ev('response.output_item.added',{output_index:0,item:{type:'reasoning',id:'rr',summary:[]}}));add(state,1);
  assert.equal(state.process(delta(envelope('done'),1)).complete,false);
  const reason={type:'reasoning',id:'rr',summary:[],encrypted_content:'opaque'};
  const result=state.process(ev('response.output_item.done',{output_index:0,item:reason}));assert.equal(result.complete,true);assert.deepEqual(result.output[0],reason);
});
test('multiple messages and commentary never trigger early completion',()=>{
  const {state}=make();add(state,0,{phase:'commentary'});assert.equal(state.process(delta(envelope('first'))).complete,false);add(state,1);
  assert.equal(state.process(delta(envelope('second'),1)).complete,false);
  const result=state.process(ev('response.completed',{response:{status:'completed',output:[msg([part(envelope('first'))],{phase:'commentary'}),msg([part(envelope('second'))],{id:'m2'})]}}));
  assert.deepEqual(result.events[0].json.response.output.map(i=>i.content[0].text),['first','second']);
});
test('refusal passes through without JSON parsing or early completion',()=>{
  const {state}=make();add(state);const refusal={type:'refusal',refusal:'cannot help'};
  const event=ev('response.content_part.added',{output_index:0,item_id:'m1',content_index:0,part:refusal});assert.deepEqual(state.process(event).events,[event]);
  const end=ev('response.completed',{response:{status:'completed',output:[msg([refusal])],usage:{input_tokens:1}}});
  assert.deepEqual(state.process(end).events[0].json.response.output,[msg([refusal])]);
});
test('annotations and logprobs cannot leak incorrect offsets',()=>{
  for(const event of [ev('response.output_text.annotation.added',{output_index:0,annotation:{type:'url_citation'}}),ev('response.output_text.delta',{output_index:0,content_index:0,delta:'',logprobs:[{}]}),ev('response.content_part.added',{output_index:0,content_index:0,part:{...part(''),annotations:[{}]}})]){
    const {state}=make();add(state);assert.throws(()=>state.process(event),{code:'text_tail_unsupported_metadata'});
  }
});
test('terminal in same batch suppresses early completion and preserves natural output',()=>{
  const {state}=make();add(state);assert.equal(state.process(delta(envelope('yes')),{allowEarly:false}).complete,false);
  const done=state.process(ev('response.output_text.done',{output_index:0,item_id:'m1',content_index:0,text:envelope('yes')}));assert.equal(done.complete,false);
  const result=state.process(terminal(envelope('yes')));assert.equal(result.events[0].json.response.output[0].content[0].text,'yes');
});
test('nonterminal snapshots restore original text format without exposing transport JSON',()=>{
  const {state}=make();const result=state.process(ev('response.created',{response:{text:{format:{type:'json_schema'}},output:[msg([part(envelope('hidden'))])]}}));
  assert.equal(Object.hasOwn(result.events[0].json.response,'text'),false);assert.equal(result.events[0].json.response.output[0].content[0].text,'');
});
test('terminal cannot contradict previously buffered or restored text',()=>{
  const {state}=make();add(state);state.process(delta('{"answer":"first'),{allowEarly:false});assert.throws(()=>state.process(terminal(envelope('other'))),{code:'text_tail_text_changed'});
});
test('terminal cannot omit or replace an observed text part',()=>{
  for(const content of [[],[{type:'refusal',refusal:'replaced'}]]){
    const {state}=make();add(state);state.process(delta(envelope('keep this')),{allowEarly:false});
    assert.throws(()=>state.process(ev('response.completed',{response:{status:'completed',output:[msg(content)]}})));
  }
  const {state}=make();add(state);state.process(delta(envelope('already emitted')),{allowEarly:false});
  state.process(ev('response.output_text.done',{output_index:0,item_id:'m1',content_index:0,text:envelope('already emitted')}));
  assert.throws(()=>state.process(ev('response.completed',{response:{status:'completed',output:[msg([])]}})));
});
test('terminal retains observed message identity, type and role',()=>{
  for(const changed of [{id:'different'},{type:'reasoning'},{role:'user'}]){
    const {state}=make();add(state);state.process(delta(envelope('keep this')),{allowEarly:false});
    assert.throws(()=>state.process(ev('response.completed',{response:{status:'completed',output:[msg([part(envelope('keep this'))],changed)]}})));
  }
});
test('item done must match its added identity and type before allowing early completion',()=>{
  for(const changed of [{id:'reason-wrong'},{type:'message'}]){
    const {state}=make();state.process(ev('response.output_item.added',{output_index:0,item:{type:'reasoning',id:'reason-real',summary:[]}}));add(state,1);
    assert.equal(state.process(delta(envelope('pending'),1)).complete,false);
    assert.throws(()=>state.process(ev('response.output_item.done',{output_index:0,item:{type:'reasoning',id:'reason-real',summary:[],...changed}})));
  }
  assert.throws(()=>make().state.process(ev('response.output_item.done',{output_index:0,item:{type:'reasoning',id:'never-added',summary:[]}})));
});
test('empty partial terminal and natural refusal remain valid',()=>{
  const {state}=make();add(state);
  const ended=ev('response.incomplete',{response:{status:'incomplete',output:[msg([])],incomplete_details:{reason:'max_output_tokens'}}});
  assert.deepEqual(state.process(ended).events,[ended]);
  const other=make().state;add(other);const refusal={type:'refusal',refusal:'cannot help'};
  other.process(ev('response.content_part.added',{output_index:0,item_id:'m1',content_index:0,part:refusal}));
  assert.throws(()=>other.process(terminal(envelope('replaced refusal'))));
});
