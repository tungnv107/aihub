// Spreadsheet programs may ignore leading control characters before formulas.
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\p{Cc}]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
