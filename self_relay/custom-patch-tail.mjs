import {RelayError} from './security.mjs';

// Exact Cursor grammar only. A changed grammar takes the ordinary completion path.
const GRAMMAR = 'start: begin_patch hunk end_patch\nbegin_patch: "*** Begin Patch" LF\nend_patch: "*** End Patch" LF?\n\nhunk: add_hunk | update_hunk\nadd_hunk: "*** Add File: " filename LF add_line+\nupdate_hunk: "*** Update File: " filename LF change?\n\nfilename: /(.+)/\nadd_line: "+" /(.*)/ LF -> line\n\nchange: (change_context | change_line)+ eof_line?\n\nchange_context: ("@@" | "@@ " /(.+)/) LF\nchange_line: ("+" | "-" | " ") /(.*)/ LF\neof_line: "*** End of File" LF\n\n%import common.LF\n';
const TRAILER = '\n<relay_patch_tail:end>';
const fail = () => { throw new RelayError(502, 'custom_patch_tail_malformed_input'); };

// Recognition of the exact grammar above, including one hunk, LF and optional final LF.
function validPatch(text) {
  if (typeof text !== 'string') return false;
  const lines = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  if (lines.shift() !== '*** Begin Patch' || lines.pop() !== '*** End Patch') return false;
  const header = lines.shift();
  if (header?.startsWith('*** Add File: ') && header.length > 14)
    return lines.length > 0 && lines.every(line => line.startsWith('+'));
  if (!header?.startsWith('*** Update File: ') || header.length <= 17) return false;
  if (!lines.length) return true;
  if (lines.at(-1) === '*** End of File') lines.pop();
  return lines.length > 0 && lines.every(line => /^[+\- ]/.test(line) || line === '@@' || (line.startsWith('@@ ') && line.length > 3));
}

export function customPatchTail(tool) {
  if (tool?.type !== 'custom' || !/(?:^|\.)(?:ApplyPatch|apply_patch)$/.test(tool.name ?? '') ||
    tool.format?.type !== 'grammar' || tool.format.syntax !== 'lark' || tool.format.definition !== GRAMMAR) return null;
  return {
    format: {...tool.format, definition: GRAMMAR.replace('start: begin_patch hunk end_patch', 'start: begin_patch hunk end_patch relay_transport_tail') +
      '\nrelay_transport_tail: ' + JSON.stringify(TRAILER) + '\n'},
    wrap(text) { return validPatch(text) ? text + TRAILER : null; },
    unwrap(text, partial) {
      if (typeof text !== 'string' || !text.endsWith(TRAILER)) return partial ? null : fail();
      const patch = text.slice(0, -TRAILER.length);
      if (!validPatch(patch)) return partial ? null : fail();
      return patch;
    },
  };
}
