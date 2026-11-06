import {prepareToolTail} from './tool-tail.mjs';
import {prepareTextTail} from './text-tail.mjs';
import {customPatchTail} from './custom-patch-tail.mjs';
import {ResponseAccumulator} from './protocol.mjs';

// Keep request schemas stable when a client retains its tool inventory on its final turn.
export function prepareResponseTail(body,{toolsEnabled=false,textEnabled=false,maxBytes}={}){
  const limits=maxBytes===undefined?{}:{maxBytes};
  const tools=prepareToolTail(body,{enabled:toolsEnabled,...limits});
  const knownInventory=!!tools.state&&body.tools.every(tool=>tool.type==='function'||tool.type==='custom'&&customPatchTail(tool)!==null);
  const text=prepareTextTail(tools.body,{enabled:textEnabled,allowActiveTools:knownInventory,...limits});
  return {body:text.body,toolReason:tools.reason,textReason:text.reason,
    reason:tools.state||text.state?'enabled':'disabled',
    state:tools.state||text.state?new ResponseTailState(text.state,tools.state):null};
}

class ResponseTailState{
  constructor(text,tools){this.text=text;this.tools=tools;this.accumulator=new ResponseAccumulator();this.finished=false;}
  process(event,options={}){
    if(this.finished)return {events:[],complete:false};
    const text=this.text?this.text.process(event,options):{events:[event],complete:false};
    const events=[];let kind=text.complete?'text':null;
    for(const decoded of text.events){
      // Once text has finished, flush its complete event sequence without a second cutoff.
      const result=this.tools?this.tools.process(decoded,{...options,allowEarly:options.allowEarly!==false&&!text.complete}):{events:[decoded],complete:false};
      for(const output of result.events){events.push(output);this.accumulator.handle(output);}
      if(result.complete){kind='tool';break;}
    }
    if(kind){this.finished=true;return {events,complete:true,kind,output:this.accumulator.complete({output:[]}).output};}
    return {events,complete:false};
  }
}
