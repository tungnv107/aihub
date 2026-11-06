import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...args], {cwd: root, encoding: 'utf8', windowsHide: true});
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))];
const patterns = {
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  github_token: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  npm_token: /\bnpm_[A-Za-z0-9]{30,}\b/g,
  telegram_token: /\b\d{8,20}:[A-Za-z0-9_-]{30,100}\b/g,
  api_token: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g,
  activation_key: /\bTDH-[A-Za-z0-9_-]{32}\b/g,
  jwt_literal: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
};
const issues = [];
for (const file of files) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  if (/(?:^|\/)(?:node_modules|\.runtime|\.reference|\.data|backups|keys)(?:\/|$)/.test(file) ||
      /\.(?:pem|key|p12|pfx|dpapi|sqlite|db|zip|tgz)$/i.test(file) ||
      /(?:^|\/)(?:\.env(?:\..+)?|auth\.json|secrets\.env|\.npmrc)$/.test(file) && !file.endsWith('.env.example'))
    issues.push({file, issue: 'forbidden_file'});
  const source = fs.readFileSync(absolute, 'utf8');
  for (const [issue, pattern] of Object.entries(patterns))
    for (const match of source.matchAll(pattern))
      issues.push({file, line: source.slice(0, match.index).split('\n').length, issue});
}
console.log(JSON.stringify({result: issues.length ? 'failed' : 'passed', files: files.length, issues}, null, 2));
process.exitCode = Number(issues.length > 0);
