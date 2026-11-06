import {RelayError} from './security.mjs';

const TAIL = 'zz_relay_tail';
const MAX_BYTES = 2 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ROOT_KEYS = new Set(['type','properties','required','additionalProperties','title','description','$comment','default','examples','deprecated','readOnly','writeOnly']);
const fail = () => { throw new RelayError(502, 'flat_function_tail_malformed_arguments'); };
class Incomplete extends Error {}

// Parse rather than searching for a marker: JSON.parse alone silently accepts duplicate keys.
function parse(text, onRootMember) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) return fail();
  let i = 0, budget = 65536;
  const ws = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i])) i++; };
  const available = () => { if (i >= text.length) throw new Incomplete(); };
  function string() {
    available();if (text[i] !== '"') return fail();
    const begin = i++;let escaped = false;
    while (i < text.length) {
      const c = text[i++];
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') { try { return JSON.parse(text.slice(begin, i)); } catch { return fail(); } }
      else if (c.charCodeAt(0) < 32) return fail();
    }
    throw new Incomplete();
  }
  function value(depth) {
    if (--budget < 0 || depth > 96) return fail();
    ws();available();
    if (text[i] === '"') return string();
    if (text[i] === '{') {
      i++;const result = {}, seen = new Set();ws();available();
      if (text[i] === '}') { i++;return result; }
      while (true) {
        ws();const key = string();
        if (seen.has(key)) return fail();seen.add(key);
        ws();available();if (text[i++] !== ':') return fail();ws();available();
        if (depth === 0) onRootMember?.(key, result, text[i]);
        Object.defineProperty(result, key, {value:value(depth + 1), enumerable:true, configurable:true, writable:true});
        ws();available();const separator = text[i++];
        if (separator === '}') return result;
        if (separator !== ',') return fail();
      }
    }
    if (text[i] === '[') {
      i++;const result = [];ws();available();
      if (text[i] === ']') { i++;return result; }
      while (true) {
        result.push(value(depth + 1));ws();available();const separator = text[i++];
        if (separator === ']') return result;
        if (separator !== ',') return fail();
      }
    }
    const begin = i;
    while (i < text.length && !/[\x20\t\r\n,\]}]/.test(text[i])) i++;
    const token = text.slice(begin, i);
    if (!token) return fail();
    if (i === text.length && (['true','false','null'].some(v => v.startsWith(token) && v !== token) ||
      /^-$|^-?\d+\.$|^-?\d+(?:\.\d+)?[eE][+-]?$/.test(token))) throw new Incomplete();
    try { const result = JSON.parse(token);if (result !== null && !['number','boolean'].includes(typeof result)) return fail();return result; }
    catch (error) { if (error instanceof RelayError) throw error;return fail(); }
  }
  const result = value(0);ws();if (i !== text.length) return fail();return result;
}

/** Flat transport is eligible only when every original field is mandatory.
 * The caller supplies full original-schema validation; this helper additionally enforces
 * exact field membership and unambiguous JSON. It does not estimate token usage.
 */
export function flatFunctionTail(tool, validPayload) {
  const schema = tool?.parameters;
  if (tool?.type !== 'function' || tool.strict !== true || !object(schema) || schema.type !== 'object' ||
    !object(schema.properties) || schema.additionalProperties !== false || !Array.isArray(schema.required) ||
    Object.keys(schema).some(key => !ROOT_KEYS.has(key)) || Object.hasOwn(schema.properties, TAIL)) return null;
  const keys = Object.keys(schema.properties), required = schema.required;
  if (required.length !== keys.length || new Set(required).size !== required.length || required.some(key => typeof key !== 'string' || !Object.hasOwn(schema.properties, key))) return null;
  if (typeof validPayload !== 'function') throw new TypeError('flat_function_tail_validator_required');
  const names = new Set(keys);
  const valid = payload => object(payload) && Object.keys(payload).length === keys.length &&
    Object.keys(payload).every(key => names.has(key)) && keys.every(key => Object.hasOwn(payload, key)) && validPayload(payload) === true;
  const transformed = structuredClone(tool);
  Object.defineProperty(transformed.parameters.properties, TAIL, {value:{type:'string',enum:['end'],description:'Transport trailer only. Emit this property LAST with value end, after ALL original arguments.'}, enumerable:true,configurable:true,writable:true});
  transformed.parameters.required.push(TAIL);
  transformed.description = (transformed.description ? transformed.description + '\n\n' : '') + 'Emit all original arguments first, then zz_relay_tail last with value end. The caller receives only the original arguments.';
  return {
    tool: transformed,
    wrap(text) {
      try {
        const payload = parse(text);if (!valid(payload)) return null;
        Object.defineProperty(payload, TAIL, {value:'end',enumerable:true});return JSON.stringify(payload);
      } catch (error) { if (error instanceof Incomplete || error instanceof RelayError) return null;throw error; }
    },
    unwrap(text, partial = false) {
      let candidate = null;
      try {
        const payload = parse(text, (key, before, first) => {
          if (partial && key === TAIL && first === '"' && valid(before)) candidate = JSON.stringify(before);
        });
        if (!object(payload) || !Object.hasOwn(payload, TAIL) || payload[TAIL] !== 'end') return fail();
        delete payload[TAIL];if (!valid(payload)) return fail();
        return partial ? candidate : JSON.stringify(payload);
      } catch (error) {
        if (error instanceof Incomplete) return partial ? candidate : fail();
        throw error;
      }
    },
  };
}
