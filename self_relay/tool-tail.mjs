import {isDeepStrictEqual} from 'node:util';
import {RelayError} from './security.mjs';
import {ResponseAccumulator} from './protocol.mjs';
import {customPatchTail} from './custom-patch-tail.mjs';
import {flatFunctionTail} from './flat-function-tail.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const ANNOTATIONS = new Set(['title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', '$comment']);
const KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minProperties', 'maxProperties', 'enum', 'const', 'anyOf', 'oneOf', 'allOf']);
const own = (o, k) => Object.hasOwn(o, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = code => { throw new RelayError(502, code); };

// Conservative subset: unsupported validation keywords disable the optimization.
function supported(schema, depth = 0, budget = {left: 4096}) {
  if (--budget.left < 0 || depth > 48) return false;
  if (typeof schema === 'boolean') return true;
  if (!object(schema)) return false;
  for (const [key, value] of Object.entries(schema)) {
    if (ANNOTATIONS.has(key)) continue;
    if (!KEYWORDS.has(key)) return false;
    if (key === 'type' && !(typeof value === 'string' ? TYPES.has(value) : Array.isArray(value) && value.length && value.every(v => TYPES.has(v)))) return false;
    if (key === 'properties' && (!object(value) || !Object.values(value).every(v => supported(v, depth + 1, budget)))) return false;
    if (['additionalProperties', 'items'].includes(key) && !supported(value, depth + 1, budget)) return false;
    if (key === 'required' && (!Array.isArray(value) || !value.every(v => typeof v === 'string') || new Set(value).size !== value.length)) return false;
    if (['anyOf', 'oneOf', 'allOf'].includes(key) && (!Array.isArray(value) || !value.length || !value.every(v => supported(v, depth + 1, budget)))) return false;
    if (key === 'enum' && (!Array.isArray(value) || !value.length)) return false;
    if (key === 'uniqueItems' && typeof value !== 'boolean') return false;
    if (/^(min|max)(Items|Length|Properties)$/.test(key) && (!Number.isSafeInteger(value) || value < 0)) return false;
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].includes(key) && (!Number.isFinite(value) || (key === 'multipleOf' && value <= 0))) return false;
  }
  return true;
}

function matchesType(value, type) {
  if (type === 'object') return object(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function valid(value, s, depth = 0) {
  if (depth > 96 || s === false) return false;
  if (s === true) return true;
  if (s.type && !(Array.isArray(s.type) ? s.type : [s.type]).some(t => matchesType(value, t))) return false;
  if (own(s, 'const') && !isDeepStrictEqual(value, s.const)) return false;
  if (s.enum && !s.enum.some(v => isDeepStrictEqual(v, value))) return false;
  if (s.anyOf && !s.anyOf.some(v => valid(value, v, depth + 1))) return false;
  if (s.oneOf && s.oneOf.filter(v => valid(value, v, depth + 1)).length !== 1) return false;
  if (s.allOf && !s.allOf.every(v => valid(value, v, depth + 1))) return false;
  if (object(value)) {
    const keys = Object.keys(value);
    if (keys.length < (s.minProperties ?? 0) || keys.length > (s.maxProperties ?? Infinity)) return false;
    if (s.required?.some(k => !own(value, k))) return false;
    for (const key of keys) {
      if (own(s.properties ?? {}, key)) { if (!valid(value[key], s.properties[key], depth + 1)) return false; }
      else if (s.additionalProperties === false || (object(s.additionalProperties) && !valid(value[key], s.additionalProperties, depth + 1))) return false;
    }
  }
  if (Array.isArray(value)) {
    if (value.length < (s.minItems ?? 0) || value.length > (s.maxItems ?? Infinity)) return false;
    if (s.items !== undefined && !value.every(v => valid(v, s.items, depth + 1))) return false;
    // Canonical keys avoid quadratic pairwise equality checks.
    if (s.uniqueItems && new Set(value.map(v => canonical(v))).size !== value.length) return false;
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (length < (s.minLength ?? 0) || length > (s.maxLength ?? Infinity)) return false;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < (s.minimum ?? -Infinity) || value > (s.maximum ?? Infinity)) return false;
    if (own(s, 'exclusiveMinimum') && value <= s.exclusiveMinimum) return false;
    if (own(s, 'exclusiveMaximum') && value >= s.exclusiveMaximum) return false;
    if (s.multipleOf && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-10) return false;
  }
  return true;
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return fail('tool_tail_malformed_arguments'); }
}

function boundedDepth(value) {
  const pending = [[value, 0]];
  while (pending.length) {
    const [current, depth] = pending.pop();
    if (depth > 96) return false;
    if (current !== null && typeof current === 'object') {
      for (const child of Object.values(current)) pending.push([child, depth + 1]);
    }
  }
  return true;
}

// An anchored envelope ensures a marker inside an escaped string cannot stop the stream.
function payloadEnd(text) {
  const start = /^\s*\{\s*"payload"\s*:\s*\{/.exec(text);
  if (!start) return null;
  let level = 1, quoted = false, escaped = false;
  const begin = start[0].length - 1;
  for (let i = begin + 1; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') level++;
    else if (c === '}' || c === ']') {
      if (--level === 0) return {begin, end: i + 1};
    }
  }
  return null;
}

function unwrap(text, schema, partial) {
  if (!partial) {
    const envelope = parseJson(text);
    if (!object(envelope) || Object.keys(envelope).length !== 2 || !own(envelope, 'payload') ||
      !own(envelope, '__relay_tail') || typeof envelope.__relay_tail !== 'string') return fail('tool_tail_malformed_arguments');
    // JSON objects are unordered. Count raw outer members too: JSON.parse collapses duplicate (even escaped) keys.
    let level = 0, quoted = false, escaped = false, commas = 0;
    for (const c of text) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{' || c === '[') level++;
      else if (c === '}' || c === ']') level--;
      else if (c === ',' && level === 1 && ++commas > 1) return fail('tool_tail_malformed_arguments');
    }
    if (!boundedDepth(envelope.payload) || !valid(envelope.payload, schema)) return fail('tool_tail_invalid_payload');
    return JSON.stringify(envelope.payload);
  }
  // Only the anchored payload-first prefix can prove that an early-cut candidate is complete.
  const position = payloadEnd(text);
  if (!position) return null;
  const rest = text.slice(position.end);
  if (!/^\s*,\s*"__relay_tail"\s*:\s*"/.test(rest)) return null;
  const payload = parseJson(text.slice(position.begin, position.end));
  if (!boundedDepth(payload) || !valid(payload, schema)) return fail('tool_tail_invalid_payload');
  return JSON.stringify(payload);
}

/**
 * Optional, per-request transform. Unsupported requests are returned by identity with state:null.
 * state.process({type,json}, {allowEarly=true}) -> {events,complete,output?}. `complete:true` means the caller
 * may abort upstream and construct its terminal response using `output`; no usage is invented.
 * Forward all returned events before that terminal. Natural terminals retain real upstream usage.
 * Only the recognized Cursor patch grammar receives a short trailer; other custom tools pass through.
 */
export function prepareToolTail(body, {enabled = false, maxBytes = MAX_BYTES} = {}) {
  const skip = reason => ({body, state: null, reason});
  if (!enabled) return skip('disabled');
  if (!object(body) || !Array.isArray(body.tools) || !body.tools.length) return skip('no_function_tools');
  if (body.input?.some?.(v => ['compaction_trigger', 'compaction'].includes(v?.type)) || body.context_management) return skip('compaction');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw new TypeError('invalid_tool_tail_buffer_limit');
  const schemas = new Map(), customs = new Map(), flats = new Map(), names = new Set();
  for (const tool of body.tools) {
    if (!['function', 'custom'].includes(tool?.type) || typeof tool.name !== 'string' || !tool.name || names.has(tool.name)) return skip('unsupported_tool_type_or_name');
    names.add(tool.name);
    if (tool.type === 'custom') { const patch = customPatchTail(tool); if (patch) customs.set(tool.name, patch); continue; }
    if (tool.parameters?.type !== 'object' || !supported(tool.parameters)) return skip('unsupported_tool_schema');
    schemas.set(tool.name, structuredClone(tool.parameters));
    const flat = flatFunctionTail(tool, payload => boundedDepth(payload) && valid(payload, schemas.get(tool.name)));
    if (flat) flats.set(tool.name, flat);
  }
  if (!schemas.size && !customs.size) return skip('no_function_tools');
  const prepared = structuredClone(body);
  for (const item of Array.isArray(prepared.input) ? prepared.input : []) {
    if (item?.type === 'custom_tool_call' && customs.has(item.name)) {
      const input = customs.get(item.name).wrap(item.input);
      if (input === null) return skip('unsupported_tool_history');
      item.input = input;
      continue;
    }
    if (item?.type !== 'function_call' || !schemas.has(item.name)) continue;
    let payload;
    try { payload = JSON.parse(item.arguments); } catch { return skip('unsupported_tool_history'); }
    if (typeof item.arguments !== 'string' || !object(payload) || !boundedDepth(payload) || !valid(payload, schemas.get(item.name))) return skip('unsupported_tool_history');
    if (flats.has(item.name)) {
      item.arguments = flats.get(item.name).wrap(item.arguments);
      if (item.arguments === null) return skip('unsupported_tool_history');
    } else item.arguments = '{"payload":' + item.arguments + ',"__relay_tail":"end"}';
  }
  prepared.parallel_tool_calls = false;
  for (const tool of prepared.tools) {
    if (tool.type === 'custom' && customs.has(tool.name)) {
      tool.format = customs.get(tool.name).format;
      tool.description = (tool.description ? tool.description + '\n\n' : '') + 'After the entire original patch, emit the short relay_transport_tail required by the grammar. The caller receives the patch unchanged.';
    }
    if (tool.type !== 'function') continue;
    if (flats.has(tool.name)) { Object.assign(tool, structuredClone(flats.get(tool.name).tool)); continue; }
    tool.parameters = {
      type: 'object',
      properties: {
        payload: tool.parameters,
        __relay_tail: {type: 'string', enum: ['end'], description: 'Transport trailer only. Emit this property last with the short value "end", after the complete payload object.'},
      },
      required: ['payload', '__relay_tail'],
      additionalProperties: false,
    };
    tool.description = (tool.description ? tool.description + '\n\n' : '') + 'Transport format: emit payload first with ALL intended original arguments, including optional fields; emit __relay_tail last. The caller receives only payload.';
  }
  return {body: prepared, state: new ToolTailState(schemas, customs, flats, maxBytes, body), reason: 'enabled'};
}

class ToolTailState {
  constructor(schemas, customs, flats, maxBytes, original) {
    this.schemas = schemas;
    this.customs = customs;
    this.flats = flats;
    this.maxBytes = maxBytes;
    this.calls = new Map();
    this.items = new Map();
    this.openItems = new Set();
    this.accumulator = new ResponseAccumulator();
    this.original = structuredClone(original);
    this.pending = null;
    this.bufferBytes = 0;
    this.finished = false;
    this.customSeen = false;
  }

  checked(text) {
    if (typeof text !== 'string') return fail('tool_tail_malformed_arguments');
    if (Buffer.byteLength(text, 'utf8') > this.maxBytes) return fail('tool_tail_buffer_exceeded');
    return text;
  }

  setText(call, text) {
    this.checked(text);
    const bytes = Buffer.byteLength(text, 'utf8');
    const total = this.bufferBytes - (call.bytes ?? 0) + bytes;
    if (total > this.maxBytes) return fail('tool_tail_buffer_exceeded');
    this.bufferBytes = total;
    call.bytes = bytes;
    call.text = text;
  }

  finishCall(index, call, args, source) {
    if (call.restored !== undefined && call.restored !== args) return fail('tool_tail_arguments_changed');
    const events = [];
    const base = {output_index: index, item_id: call.item.id};
    const push = (type, fields) => events.push({type, json: {type, ...base, ...fields}});
    const field = call.item.type === 'custom_tool_call' ? 'input' : 'arguments';
    const prefix = field === 'input' ? 'response.custom_tool_call_input' : 'response.function_call_arguments';
    if (call.restored === undefined) {
      push(prefix + '.delta', {delta: args});
      push(prefix + '.done', {[field]: args});
    }
    call.restored = args;
    const item = {...call.item, ...source, [field]: args, status: 'completed'};
    call.item = item;
    this.items.set(index, item);
    if (!call.itemDone) push('response.output_item.done', {item});
    call.itemDone = true;
    this.openItems.delete(index);
    return events;
  }

  process(event, {allowEarly = true} = {}) {
    if (this.finished) return {events: [], complete: false};
    if (!object(event?.json)) return fail('tool_tail_invalid_event');
    if ((event.json.item?.type === 'custom_tool_call' && !this.customs.has(event.json.item.name)) ||
      (event.type.startsWith('response.custom_tool_call_input.') && !this.calls.has(event.json.output_index)) ||
      event.json.response?.output?.some?.(item => item?.type === 'custom_tool_call' && !this.customs.has(item.name))) this.customSeen = true;
    if (object(event.json.response)) {
      const response = structuredClone(event.json.response);
      for (const key of ['tools', 'parallel_tool_calls', 'input']) if (own(response, key)) {
        if (own(this.original, key)) response[key] = structuredClone(this.original[key]);
        else delete response[key];
      }
      // Nonterminal response snapshots cannot expose transport-only argument envelopes.
      if (!['response.completed', 'response.incomplete', 'response.failed'].includes(event.type) && Array.isArray(response.output))
        response.output = response.output.map(item => item?.type === 'function_call' && this.schemas.has(item.name) ? {...item, arguments: ''} :
          item?.type === 'custom_tool_call' && this.customs.has(item.name) ? {...item, input: ''} : item);
      event = {...event, json: {...event.json, response}};
    }
    const result = this.processEvent(event, allowEarly);
    for (const emitted of result.events) this.accumulator.handle(emitted);
    if (result.complete) result.output = this.output();
    return result;
  }

  finishPending(events, allowEarly) {
    const pending = this.pending;
    if (!allowEarly || this.customSeen || !pending || this.calls.size !== 1 || [...this.openItems].some(index => index !== pending.index))
      return {events, complete: false};
    events.push(...this.finishCall(pending.index, pending.call, pending.args));
    this.finished = true;
    return {events, complete: true};
  }

  unwrapCall(call, text, partial) {
    if (call.item.type === 'custom_tool_call') return this.customs.get(call.item.name).unwrap(text, partial);
    if (this.flats.has(call.item.name)) return this.flats.get(call.item.name).unwrap(text, partial);
    return unwrap(text, this.schemas.get(call.item.name), partial);
  }

  processEvent(event, allowEarly) {
    const {type, json: e} = event;
    if (!object(e)) return fail('tool_tail_invalid_event');
    const index = e.output_index;
    if (type === 'response.output_item.added') {
      if (!Number.isSafeInteger(index) || index < 0 || !object(e.item)) return fail('tool_tail_invalid_event');
      if (this.items.has(index)) return fail('tool_tail_invalid_event');
      this.items.set(index, structuredClone(e.item));
      this.openItems.add(index);
      const custom = e.item.type === 'custom_tool_call' && this.customs.has(e.item.name);
      if (e.item.type !== 'function_call' && !custom) return {events: [event], complete: false};
      if ((!custom && !this.schemas.has(e.item.name)) || this.calls.has(index)) return fail('tool_tail_unknown_call');
      const field = custom ? 'input' : 'arguments';
      const item = {...e.item, [field]: ''};
      const call = {item, text: ''};
      this.setText(call, e.item[field] ?? '');
      this.calls.set(index, call);
      return {events: [{...event, json: {...e, item}}], complete: false};
    }
    if (type.startsWith('response.function_call_arguments.') || (type.startsWith('response.custom_tool_call_input.') && this.calls.has(index))) {
      const call = this.calls.get(index);
      if (!call || (e.item_id !== undefined && e.item_id !== call.item.id)) return fail('tool_tail_unknown_call');
      const field = call.item.type === 'custom_tool_call' ? 'input' : 'arguments';
      if (type.startsWith('response.custom_tool_call_input.') !== (field === 'input')) return fail('tool_tail_invalid_event');
      if (type.endsWith('.delta')) {
        this.setText(call, call.text + this.checked(e.delta));
        const args = this.unwrapCall(call, call.text, true);
        if (args === null || this.calls.size !== 1) return {events: [], complete: false};
        this.pending = {index, call, args};
        return this.finishPending([], allowEarly);
      }
      if (type.endsWith('.done')) {
        const text = this.checked(e[field] ?? call.text);
        if (!text.startsWith(call.text)) return fail('tool_tail_arguments_changed');
        this.setText(call, text);
        return {events: this.finishCall(index, call, this.unwrapCall(call, text, false)), complete: false};
      }
      return fail('tool_tail_invalid_event');
    }
    if (type === 'response.output_item.done') {
      if (e.item?.type === 'function_call' || (e.item?.type === 'custom_tool_call' && this.customs.has(e.item.name))) {
        const call = this.calls.get(index);
        if (!call || e.item.id !== call.item.id || e.item.name !== call.item.name || e.item.call_id !== call.item.call_id) return fail('tool_tail_unknown_call');
        if (e.item.type !== call.item.type) return fail('tool_tail_unknown_call');
        const text = this.checked(e.item[e.item.type === 'custom_tool_call' ? 'input' : 'arguments']);
        if (!text.startsWith(call.text)) return fail('tool_tail_arguments_changed');
        return {events: this.finishCall(index, call, this.unwrapCall(call, text, false), e.item), complete: false};
      }
      this.items.set(index, structuredClone(e.item));
      this.openItems.delete(index);
      return this.finishPending([event], allowEarly);
    }
    if (['response.completed', 'response.incomplete', 'response.failed'].includes(type)) {
      const response = structuredClone(e.response);
      if (Array.isArray(response?.output)) {
        const seen = new Set();
        response.output = response.output.map(item => {
          const custom = item.type === 'custom_tool_call' && this.customs.has(item.name);
          if (item.type !== 'function_call' && !custom) return item;
          if (!custom && !this.schemas.has(item.name)) return fail('tool_tail_unknown_call');
          const field = custom ? 'input' : 'arguments';
          const args = this.unwrapCall({item}, this.checked(item[field]), false);
          const call = [...this.calls.values()].find(c => c.item.id === item.id);
          if (call) {
            if (item.type !== call.item.type || item.name !== call.item.name || item.call_id !== call.item.call_id || !item[field].startsWith(call.text) || (call.restored !== undefined && call.restored !== args)) return fail('tool_tail_arguments_changed');
            seen.add(call);
          }
          return {...item, [field]: args};
        });
        if ([...this.calls.values()].some(c => c.restored === undefined && !seen.has(c))) return fail('tool_tail_incomplete_arguments');
      } else if ([...this.calls.values()].some(c => c.restored === undefined)) return fail('tool_tail_incomplete_arguments');
      this.finished = true;
      return {events: [{...event, json: {...e, response}}], complete: false};
    }
    return {events: [event], complete: false};
  }

  output() {
    return this.accumulator.complete({output: []}).output;
  }
}
