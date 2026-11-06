import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareToolTail} from '../self_relay/tool-tail.mjs';
import {ResponseAccumulator} from '../self_relay/protocol.mjs';

const schema = {type: 'object', properties: {path: {type: 'string'}, optional: {type: 'string'}, count: {type: 'integer', minimum: 1}, tags: {type: 'array', items: {type: 'string'}, uniqueItems: true}}, required: ['path'], additionalProperties: false};
const fixture = () => ({model: 'test-model', instructions: 'Keep these instructions.', input: [{type: 'reasoning', encrypted_content: 'opaque'}, {role: 'user', content: 'unchanged'}], tools: [{type: 'function', name: 'EditFile', description: 'Edit a file.', parameters: structuredClone(schema), strict: false}], parallel_tool_calls: true});
const ev = (type, fields = {}) => ({type, json: {type, ...fields}});
const item = (extra = {}) => ({type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'EditFile', arguments: '', ...extra});
const added = (index = 1, extra = {}) => ev('response.output_item.added', {output_index: index, item: item(extra)});
const delta = text => ev('response.function_call_arguments.delta', {output_index: 1, item_id: 'fc_1', delta: text});
const envelope = payload => JSON.stringify({payload, __relay_tail: 'relay_tail'});
const prepare = (options = {}) => prepareToolTail(fixture(), {enabled: true, ...options});

test('disabled and ineligible requests are unchanged by identity', () => {
  const body = fixture();
  assert.equal(prepareToolTail(body).body, body);
  for (const tools of [[{type: 'custom', name: 'ApplyPatch'}], [{type: 'web_search'}], [{type: 'namespace'}], [{...body.tools[0], parameters: {type: 'object', patternProperties: {}}}], [{...body.tools[0], parameters: {type: 'object', properties: {x: {$ref: '#/$defs/x'}}}}]]) {
    const request = {...body, tools};
    const result = prepareToolTail(request, {enabled: true});
    assert.equal(result.state, null);
    assert.equal(result.body, request);
  }
  assert.equal(prepareToolTail({...body, input: [{type: 'compaction_trigger'}]}, {enabled: true}).state, null);
  assert.equal(prepareToolTail({...body, context_management: []}, {enabled: true}).state, null);
});

test('wrapper preserves entire original schema, names, instructions, input, and original body', () => {
  const body = fixture(), original = structuredClone(body);
  const result = prepareToolTail(body, {enabled: true});
  assert.deepEqual(body, original);
  assert.deepEqual(result.body.tools[0].parameters.properties.payload, schema);
  assert.deepEqual(result.body.input, body.input);
  assert.equal(result.body.instructions, body.instructions);
  assert.equal(result.body.model, body.model);
  assert.equal(result.body.tools[0].name, 'EditFile');
  assert.equal(result.body.parallel_tool_calls, false);
  assert.deepEqual(result.body.tools[0].parameters.required, ['payload', '__relay_tail']);
});

test('early finish waits for full optional fields and tail key; preserves call and encrypted reasoning', () => {
  const {state} = prepare();
  const reasoning = {type: 'reasoning', id: 'r1', encrypted_content: 'keep-exactly', summary: []};
  state.process(ev('response.output_item.done', {output_index: 0, item: reasoning}));
  state.process(added());
  const first = state.process(delta('{"payload":{"path":"test.md"'));
  assert.deepEqual(first, {events: [], complete: false});
  const second = state.process(delta(',"optional":"keep me","count":2},"__relay_tail":'));
  assert.equal(second.complete, false);
  const result = state.process(delta('"relay_'));
  assert.equal(result.complete, true);
  const args = JSON.stringify({path: 'test.md', optional: 'keep me', count: 2});
  assert.deepEqual(result.events.map(e => e.type), ['response.function_call_arguments.delta', 'response.function_call_arguments.done', 'response.output_item.done']);
  assert.equal(result.events[0].json.delta, args);
  assert.deepEqual(result.output[0], reasoning);
  assert.equal(result.output[1].arguments, args);
  assert.equal(result.output[1].call_id, 'call_1');
  assert.equal(result.output[1].id, 'fc_1');
  assert.equal(Object.hasOwn(result, 'usage'), false);
  assert.equal(JSON.stringify(result).includes('__relay_tail'), false);
});

test('all character boundaries handle escapes and marker strings inside payload', () => {
  const payload = {path: 'test.md', optional: 'a \\" } , "__relay_tail":" [nested] 😁'};
  const text = envelope(payload);
  for (let boundary = 1; boundary < text.length; boundary++) {
    const {state} = prepare();
    state.process(added());
    const a = state.process(delta(text.slice(0, boundary)));
    const b = a.complete ? a : state.process(delta(text.slice(boundary)));
    assert.equal(b.complete, true, 'boundary=' + boundary);
    assert.deepEqual(JSON.parse(b.output[0].arguments), payload);
  }
});

test('schema validation rejects wrong types, missing required, additional properties, duplicate items', () => {
  for (const payload of [{path: 2}, {optional: 'missing path'}, {path: 'x', extra: true}, {path: 'x', count: 0}, {path: 'x', tags: ['same', 'same']}]) {
    const {state} = prepare();
    state.process(added());
    assert.throws(() => state.process(delta(envelope(payload))), {code: 'tool_tail_invalid_payload'});
  }
});

test('natural terminal unwraps JSON-only output and retains genuine usage', () => {
  const {state} = prepare();
  const usage = {input_tokens: 50, output_tokens: 12, input_tokens_details: {cached_tokens: 40}};
  const response = {id: 'resp1', status: 'completed', usage, output: [item({arguments: envelope({path: 'x', optional: 'retained'})})]};
  const input = ev('response.completed', {response});
  const result = state.process(input);
  assert.deepEqual(result.events[0].json.response.usage, usage);
  assert.deepEqual(JSON.parse(result.events[0].json.response.output[0].arguments), {path: 'x', optional: 'retained'});
  assert.equal(response.output[0].arguments, envelope({path: 'x', optional: 'retained'}));
  assert.equal(result.complete, false);
});

test('natural argument done emits original arguments once and accumulator receives original call', () => {
  const {state} = prepare(), acc = new ResponseAccumulator();
  const dispatch = event => { const result = state.process(event); result.events.forEach(e => acc.handle(e)); return result; };
  dispatch(added());
  dispatch(delta('{"payload":'));
  const text = envelope({path: 'x', optional: 'full'});
  const result = dispatch(ev('response.function_call_arguments.done', {output_index: 1, item_id: 'fc_1', arguments: text}));
  assert.equal(result.complete, false);
  const duplicated = dispatch(ev('response.output_item.done', {output_index: 1, item: item({arguments: text})}));
  assert.deepEqual(duplicated.events, []);
  const completed = acc.complete({status: 'completed'});
  assert.deepEqual(JSON.parse(completed.output[0].arguments), {path: 'x', optional: 'full'});
});

test('malformed natural envelopes fail explicitly and cannot leak wrapper', () => {
  for (const args of ['{"path":"x"}', '{"payload":{"path":"x"}}', '{"payload":{"path":"x"},"__relay_tail":2}', '{"payload":{"path":"x"},"payload":{"path":"z"},"__relay_tail":"x"}', '{"payload":{"path":"x"},"__relay_tail":"x","extra":1}', '{"payload":{"path":"x"},"__relay_tail":"x","__relay_tail":"y"}']) {
    const {state} = prepare();
    assert.throws(() => state.process(ev('response.completed', {response: {output: [item({arguments: args})]}})), {code: 'tool_tail_malformed_arguments'});
  }
});

test('UTF8 byte limit and unknown tool delta are enforced', () => {
  const {state} = prepare({maxBytes: 40});
  state.process(added());
  assert.throws(() => state.process(delta('{"payload":{"path":"' + '😀'.repeat(10))), {code: 'tool_tail_buffer_exceeded'});
  assert.throws(() => prepare().state.process(delta('x')), {code: 'tool_tail_unknown_call'});
  assert.throws(() => prepare({maxBytes: 2 * 1024 * 1024 + 1}), /invalid_tool_tail_buffer_limit/);
});

test('delta and full done disagreement is rejected', () => {
  const {state} = prepare();
  state.process(added());
  state.process(delta('{"payload":{"path":"x'));
  assert.throws(() => state.process(ev('response.function_call_arguments.done', {output_index: 1, arguments: envelope({path: 'different'})})), {code: 'tool_tail_arguments_changed'});
});

test('multiple advertised calls disable early cutoff and retain both natural outputs', () => {
  const {state} = prepare();
  state.process(added());
  state.process(added(2, {id: 'fc_2', call_id: 'call_2'}));
  assert.equal(state.process(delta(envelope({path: 'x'}))).complete, false);
  const a = state.process(ev('response.function_call_arguments.done', {output_index: 1, arguments: envelope({path: 'x'})}));
  const b = state.process(ev('response.function_call_arguments.done', {output_index: 2, arguments: envelope({path: 'y'})}));
  assert.equal(a.complete, false);
  assert.equal(b.complete, false);
  assert.equal(state.output().length, 2);
});

test('common nested nullable schemas retain their semantics', () => {
  const body = fixture();
  body.tools[0].parameters = {type: 'object', properties: {value: {anyOf: [{type: 'null'}, {type: 'array', minItems: 1, items: {type: 'object', properties: {name: {type: 'string', minLength: 1}}, required: ['name'], additionalProperties: false}}]}}, required: ['value'], additionalProperties: false};
  for (const payload of [{value: null}, {value: [{name: 'a'}]}]) {
    const {state} = prepareToolTail(body, {enabled: true});
    state.process(added());
    assert.equal(state.process(delta(envelope(payload))).complete, true);
  }
  const {state} = prepareToolTail(body, {enabled: true});
  state.process(added());
  assert.throws(() => state.process(delta(envelope({value: [{name: ''}]}))), {code: 'tool_tail_invalid_payload'});
});

test('buffer limit is shared across unexpected simultaneous calls', () => {
  const {state} = prepare({maxBytes: 60});
  state.process(added());
  state.process(added(2, {id: 'fc_2', call_id: 'call_2'}));
  state.process(delta('{"payload":{"path":"' + 'x'.repeat(20)));
  assert.throws(() => state.process(ev('response.function_call_arguments.delta', {output_index: 2, item_id: 'fc_2', delta: '{"payload":{"path":"' + 'y'.repeat(20)})), {code: 'tool_tail_buffer_exceeded'});
});

test('natural completion cannot omit pending call or contradict its prefix', () => {
  for (const output of [[], [item({arguments: envelope({path: 'changed'})})]]) {
    const {state} = prepare();
    state.process(added());
    state.process(delta('{"payload":{"path":"original'));
    assert.throws(() => state.process(ev('response.completed', {response: {output}})), {code: output.length ? 'tool_tail_arguments_changed' : 'tool_tail_incomplete_arguments'});
  }
});

test('early completion waits for open reasoning and preserves its encrypted terminal state', () => {
  const {state} = prepare();
  state.process(ev('response.output_item.added', {output_index: 0, item: {type: 'reasoning', id: 'reason', summary: [], status: 'in_progress'}}));
  state.process(added());
  assert.equal(state.process(delta('{"payload":{"path":"x"},"__relay_tail":"')).complete, false);
  const reasoning = {type: 'reasoning', id: 'reason', summary: [], encrypted_content: 'opaque+/==', status: 'completed'};
  const result = state.process(ev('response.output_item.done', {output_index: 0, item: reasoning}));
  assert.equal(result.complete, true);
  assert.deepEqual(result.output[0], reasoning);
  assert.equal(result.output[1].arguments, '{"path":"x"}');
});

test('open message prevents cutoff and complete output preserves accumulated text', () => {
  const {state} = prepare();
  const message = {type: 'message', id: 'message', role: 'assistant', content: []};
  state.process(ev('response.output_item.added', {output_index: 0, item: message}));
  state.process(ev('response.output_text.delta', {output_index: 0, item_id: 'message', content_index: 0, delta: 'Giữ nguyên câu này.'}));
  state.process(added());
  assert.equal(state.process(delta(envelope({path: 'x'}))).complete, false);
  const result = state.process(ev('response.output_item.done', {output_index: 0, item: {...message, status: 'completed'}}));
  assert.equal(result.complete, true);
  assert.equal(result.output[0].content[0].text, 'Giữ nguyên câu này.');
  assert.equal(result.output[0].status, 'completed');
});

test('allowEarly false keeps natural terminal usage even after a complete candidate', () => {
  const {state} = prepare();
  state.process(added(), {allowEarly: false});
  const argumentsText = envelope({path: 'x', optional: 'still here'});
  const candidate = state.process(delta(argumentsText), {allowEarly: false});
  assert.deepEqual(candidate, {events: [], complete: false});
  state.process(ev('response.function_call_arguments.done', {output_index: 1, item_id: 'fc_1', arguments: argumentsText}), {allowEarly: false});
  const usage = {input_tokens: 100, output_tokens: 20};
  const result = state.process(ev('response.completed', {response: {id: 'natural', output: [item({arguments: argumentsText})], usage}}), {allowEarly: false});
  assert.equal(result.complete, false);
  assert.deepEqual(result.events[0].json.response.usage, usage);
  assert.equal(result.events[0].json.response.output[0].arguments, '{"path":"x","optional":"still here"}');
});

test('all response metadata echoes restore original tools, input and parallel preference', () => {
  for (const type of ['response.created', 'response.in_progress', 'response.completed', 'response.incomplete', 'response.failed', 'error']) {
    const body = fixture();
    const {body: sent, state} = prepareToolTail(body, {enabled: true});
    const event = ev(type, {response: {id: 'echo', tools: sent.tools, input: sent.input, parallel_tool_calls: false, output: []}});
    const result = state.process(event, {allowEarly: false});
    const response = result.events[0].json.response;
    assert.deepEqual(response.tools, body.tools, type);
    assert.deepEqual(response.input, body.input, type);
    assert.equal(response.parallel_tool_calls, true, type);
    assert.equal(JSON.stringify(response).includes('__relay_tail'), false, type);
  }
  const body = fixture();
  delete body.parallel_tool_calls;
  const {state} = prepareToolTail(body, {enabled: true});
  const result = state.process(ev('response.created', {response: {parallel_tool_calls: false}}));
  assert.equal(Object.hasOwn(result.events[0].json.response, 'parallel_tool_calls'), false);
});

test('continuation wraps matching history once while preserving caller data and short trailer', () => {
  const body = fixture();
  const originalCall = item({arguments: '{ "path": "x", "optional": "payload field is user data" }'});
  const resultItem = {type: 'function_call_output', call_id: originalCall.call_id, output: 'File edited.'};
  body.input.push(originalCall, resultItem);
  const snapshot = structuredClone(body);
  const {body: first, state} = prepareToolTail(body, {enabled: true});
  assert.deepEqual(body, snapshot);
  assert.deepEqual(JSON.parse(first.input.at(-2).arguments), {payload: {path: 'x', optional: 'payload field is user data'}, __relay_tail: 'end'});
  assert.equal(first.input.at(-2).call_id, originalCall.call_id);
  assert.deepEqual(first.input.at(-1), resultItem);
  assert.deepEqual(first.input[0], body.input[0]);
  assert.deepEqual(prepareToolTail(body, {enabled: true}).body, first, 'same client history produces stable upstream bytes');
  assert.deepEqual(first.tools[0].parameters.properties.__relay_tail.enum, ['end']);
  assert.equal(JSON.stringify(first.tools).includes('512'), false);
  const restored = state.process(ev('response.created', {response: {input: first.input}}));
  assert.deepEqual(restored.events[0].json.response.input, snapshot.input);
});

test('invalid historical arguments skip optimization without mutating the request', () => {
  for (const argumentsText of ['invalid JSON', '[]', '{"path":12}', '{"path":"x","extra":"bad"}']) {
    const body = fixture();
    body.input.push(item({arguments: argumentsText}));
    const result = prepareToolTail(body, {enabled: true});
    assert.equal(result.state, null);
    assert.equal(result.reason, 'unsupported_tool_history');
    assert.equal(result.body, body);
  }
});

const applyPatchCustom = {type: 'custom', name: 'ApplyPatch', description: 'Apply this patch exactly.',
  format: {type: 'grammar', syntax: 'lark', definition: 'start: "*** Begin Patch" /[\\s\\S]*/ "*** End Patch"'}};

test('mixed Cursor tools transform functions and retain native ApplyPatch grammar unchanged', () => {
  const request = fixture();
  request.tools.push(structuredClone(applyPatchCustom));
  const before = structuredClone(request);
  const {body, state} = prepareToolTail(request, {enabled: true});
  assert.ok(state);
  assert.deepEqual(request, before);
  assert.deepEqual(body.tools[1], applyPatchCustom);
  assert.deepEqual(body.tools[0].parameters.properties.payload, schema);
  state.process(added());
  const result = state.process(delta(envelope({path: 'test.md', optional: 'preserved'})));
  assert.equal(result.complete, true);
  assert.deepEqual(JSON.parse(result.output[0].arguments), {path: 'test.md', optional: 'preserved'});
});

test('observing custom tool disables early completion for the entire mixed response', () => {
  const request = fixture();
  request.tools.push(structuredClone(applyPatchCustom));
  const {state} = prepareToolTail(request, {enabled: true});
  const patch = '*** Begin Patch\n*** Add File: test/test.md\n+xin chào\n*** End Patch';
  const custom = {type: 'custom_tool_call', id: 'custom_1', call_id: 'patch_1', name: 'ApplyPatch', input: patch};
  const events = [
    ev('response.output_item.added', {output_index: 0, item: {...custom, input: ''}}),
    ev('response.custom_tool_call_input.delta', {output_index: 0, item_id: custom.id, delta: patch}),
    ev('response.custom_tool_call_input.done', {output_index: 0, item_id: custom.id, input: patch}),
    ev('response.output_item.done', {output_index: 0, item: custom}),
  ];
  for (const event of events) {
    const result = state.process(event);
    assert.deepEqual(result, {events: [event], complete: false});
  }
  state.process(added());
  const args = envelope({path: 'test.md'});
  assert.equal(state.process(delta(args)).complete, false, 'a closed custom call still prevents cutoff');
  state.process(ev('response.function_call_arguments.done', {output_index: 1, item_id: 'fc_1', arguments: args}));
  const usage = {input_tokens: 100, output_tokens: 50};
  const result = state.process(ev('response.completed', {response: {tools: request.tools, output: [custom, item({arguments: args})], usage}}));
  assert.equal(result.complete, false);
  assert.deepEqual(result.events[0].json.response.output[0], custom);
  assert.deepEqual(result.events[0].json.response.tools, request.tools);
  assert.deepEqual(result.events[0].json.response.usage, usage);
  assert.equal(result.events[0].json.response.output[1].arguments, '{"path":"test.md"}');
});

test('mixed ApplyPatch and dynamic discovery history remains consistent without rewriting custom input', () => {
  const request = fixture();
  request.tools = [structuredClone(applyPatchCustom), {type: 'function', name: 'GetDynamicTools',
    parameters: {type: 'object', properties: {query: {type: 'string'}}, required: ['query'], additionalProperties: false}}];
  const patch = '*** Begin Patch\n*** Add File: test/test.md\n+xin chào\n*** End Patch';
  const custom = {type: 'custom_tool_call', id: 'ct1', call_id: 'patch1', name: 'ApplyPatch', input: patch};
  const customResult = {type: 'custom_tool_call_output', call_id: 'patch1', output: 'Created.'};
  const discovery = {type: 'function_call', id: 'fc1', call_id: 'discover1', name: 'GetDynamicTools', arguments: '{"query":"Task subagent"}'};
  const discoveryResult = {type: 'function_call_output', call_id: 'discover1', output: '{"matches":["Task"]}'};
  request.input.push(custom, customResult, discovery, discoveryResult);
  const before = structuredClone(request);
  const {body, state} = prepareToolTail(request, {enabled: true});
  assert.ok(state);
  assert.deepEqual(request, before);
  assert.deepEqual(body.tools[0], applyPatchCustom);
  assert.deepEqual(body.input.at(-4), custom);
  assert.deepEqual(body.input.at(-3), customResult);
  assert.deepEqual(body.input.at(-1), discoveryResult);
  assert.deepEqual(JSON.parse(body.input.at(-2).arguments), {payload: {query: 'Task subagent'}, __relay_tail: 'end'});
  const echo = state.process(ev('response.created', {response: {tools: body.tools, input: body.input, output: []}}));
  assert.deepEqual(echo.events[0].json.response.tools, before.tools);
  assert.deepEqual(echo.events[0].json.response.input, before.input);
});

test('custom-only requests bypass and mixed duplicate names are rejected conservatively', () => {
  for (const tools of [[applyPatchCustom], [fixture().tools[0], {...applyPatchCustom, name: 'EditFile'}]]) {
    const body = {...fixture(), tools};
    const result = prepareToolTail(body, {enabled: true});
    assert.equal(result.state, null);
    assert.equal(result.body, body);
  }
});
