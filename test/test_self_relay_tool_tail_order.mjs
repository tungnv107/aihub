import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareToolTail} from '../self_relay/tool-tail.mjs';

const payload = {path: 'test/quota_fixture.txt', optional: 'keep all arguments'};
const schema = {type: 'object', properties: {path: {type: 'string', enum: ['test/quota_fixture.txt']}, optional: {type: 'string'}}, required: ['path'], additionalProperties: false};
const prepare = () => prepareToolTail({tools: [{type: 'function', name: 'ReadFixture', strict: true, parameters: schema}]}, {enabled: true}).state;
const ev = (type, fields = {}) => ({type, json: {type, ...fields}});
const item = argumentsText => ({type: 'function_call', id: 'fc_order', call_id: 'call_order', name: 'ReadFixture', arguments: argumentsText});
const added = () => ev('response.output_item.added', {output_index: 0, item: item('')});
const delta = text => ev('response.function_call_arguments.delta', {output_index: 0, item_id: 'fc_order', delta: text});
const natural = argumentsText => ev('response.completed', {response: {id: 'resp_order', status: 'completed', output: [item(argumentsText)], usage: {input_tokens: 180000, output_tokens: 40}}});
const reversed = JSON.stringify({__relay_tail: 'end', payload});

test('natural terminal restores a valid strict envelope with the trailer first', () => {
  const input = natural(reversed);
  const result = prepare().process(input);
  assert.equal(result.complete, false);
  assert.deepEqual(result.events[0].json.response.output[0], item(JSON.stringify(payload)));
  assert.deepEqual(result.events[0].json.response.usage, {input_tokens: 180000, output_tokens: 40});
  assert.equal(input.json.response.output[0].arguments, reversed);
  assert.equal(JSON.stringify(result).includes('__relay_tail'), false);
});

const validEnvelopes = [
  reversed,
  ' \n { "__relay_tail" : "end", "payload" : { "path" : "test/quota_fixture.txt", "optional" : "keep all arguments" } } \t',
  '{"\\u005f_relay_tail":"end","pay\\u006coad":{"path":"test/quota_fixture.txt","optional":"keep all arguments"}}',
  '{"pay\\u006coad":{"path":"test/quota_fixture.txt","optional":"keep all arguments"},"\\u005f_relay_tail":"end"}',
];

for (const [index, text] of validEnvelopes.entries()) {
  for (const terminal of ['response.function_call_arguments.done', 'response.output_item.done', 'response.completed', 'response.incomplete', 'response.failed']) {
    test(`natural ${terminal} accepts unordered/escaped envelope ${index}`, () => {
      const state = prepare();
      state.process(added());
      const chunk = state.process(delta(text));
      assert.deepEqual(chunk, {events: [], complete: false}, 'noncanonical ordering/spelling must wait for a natural terminal');
      const event = terminal === 'response.function_call_arguments.done'
        ? ev(terminal, {output_index: 0, item_id: 'fc_order', arguments: text})
        : terminal === 'response.output_item.done'
          ? ev(terminal, {output_index: 0, item: item(text)})
          : ev(terminal, {response: {status: terminal.slice('response.'.length), output: [item(text)]}});
      const result = state.process(event);
      assert.equal(result.complete, false);
      const restored = terminal.startsWith('response.function_call_arguments.')
        ? result.events.find(e => e.type === 'response.function_call_arguments.done').json.arguments
        : terminal === 'response.output_item.done'
          ? result.events.find(e => e.type === 'response.output_item.done').json.item.arguments
          : result.events[0].json.response.output[0].arguments;
      assert.deepEqual(JSON.parse(restored), payload);
      assert.equal(JSON.stringify(result).includes('__relay_tail'), false);
    });
  }
}

test('every reversed-envelope chunk boundary waits for the natural terminal', () => {
  for (let boundary = 1; boundary < reversed.length; boundary++) {
    const state = prepare();
    state.process(added());
    assert.deepEqual(state.process(delta(reversed.slice(0, boundary))), {events: [], complete: false}, `first chunk ${boundary}`);
    assert.deepEqual(state.process(delta(reversed.slice(boundary))), {events: [], complete: false}, `second chunk ${boundary}`);
    const result = state.process(natural(reversed));
    assert.deepEqual(JSON.parse(result.events[0].json.response.output[0].arguments), payload);
    assert.deepEqual(result.events[0].json.response.usage, {input_tokens: 180000, output_tokens: 40});
  }
});

test('natural unordered envelopes still enforce the complete original strict schema', () => {
  for (const badPayload of [null, [], 7, 'bad', {}, {path: 'wrong-path'}, {path: 12}, {path: 'test/quota_fixture.txt', optional: 3}, {path: 'test/quota_fixture.txt', extra: true}]) {
    const text = JSON.stringify({__relay_tail: 'end', payload: badPayload});
    assert.throws(() => prepare().process(natural(text)), {code: 'tool_tail_invalid_payload'}, text);
  }
});

test('natural envelope validation rejects extra/missing keys, duplicate decoded keys and nonstring trailers', () => {
  const p = JSON.stringify(payload);
  for (const text of [
    JSON.stringify(payload),
    `{"payload":${p}}`,
    '{"__relay_tail":"end"}',
    `{"__relay_tail":"end","payload":${p},"extra":1}`,
    `{"extra":1,"payload":${p},"__relay_tail":"end"}`,
    `{"payload":${p},"__relay_tail":"end","payload":${p}}`,
    `{"__relay_tail":"end","payload":${p},"__relay_tail":"end"}`,
    `{"__relay_tail":"end","payload":${p},"pay\\u006coad":${p}}`,
    `{"\\u005f_relay_tail":"end","payload":${p},"__relay_tail":"end"}`,
    `{"payload":${p},"payload":${p}}`,
    `{"payload":${p},"__relay_tail":"end"} trailing`,
    `[{"payload":${p},"__relay_tail":"end"}]`,
    ...[null, 2, {}, []].map(tail => JSON.stringify({__relay_tail: tail, payload})),
  ]) {
    assert.throws(() => prepare().process(natural(text)), {code: 'tool_tail_malformed_arguments'}, text);
  }
});

test('canonical payload-first early finish still waits for the complete optional payload and trailer string', () => {
  const state = prepare();
  state.process(added());
  assert.deepEqual(state.process(delta('{"payload":{"path":"test/quota_fixture.txt"')), {events: [], complete: false});
  assert.deepEqual(state.process(delta(',"optional":"keep all arguments"},"__relay_tail":')), {events: [], complete: false});
  const result = state.process(delta('"'));
  assert.equal(result.complete, true);
  assert.deepEqual(result.output[0], {...item(JSON.stringify(payload)), status: 'completed'});
});

test('ambiguous duplicate payload before the trailer cannot trigger early finish', () => {
  const p = JSON.stringify(payload);
  for (const key of ['payload', 'pay\\u006coad']) {
    const state = prepare();
    state.process(added());
    const text = `{"payload":${p},"${key}":${p},"__relay_tail":"end"}`;
    assert.deepEqual(state.process(delta(text)), {events: [], complete: false});
    assert.throws(() => state.process(natural(text)), {code: 'tool_tail_malformed_arguments'});
  }
});

test('nested punctuation and envelope-like strings are preserved at natural completion', () => {
  const value = {path: 'test/quota_fixture.txt', optional: '}, "payload": {, "__relay_tail": "end" \\ 😀'};
  const state = prepare();
  const result = state.process(natural(JSON.stringify({__relay_tail: 'end', payload: value})));
  assert.deepEqual(JSON.parse(result.events[0].json.response.output[0].arguments), value);
});
