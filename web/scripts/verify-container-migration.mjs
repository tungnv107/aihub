import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
import { restrictSecretFile } from '../../scripts/secret-file.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const source = parse(fs.readFileSync(path.join(root, 'web/.env')));
const database = 'aihub_container_verify_' + randomBytes(6).toString('hex');
const url = new URL(source.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Local container validation only');
url.hostname = 'host.docker.internal';
source.NODE_ENV = 'production'; source.PAYMENT_PROVIDER = 'disabled'; source.BETTER_AUTH_URL = 'https://aihub.local';
url.pathname = '/' + database; source.DATABASE_URL = url.toString();
const file = path.join(root, '.runtime/' + database + '.env');
const run = args => execFileSync('docker', args, { windowsHide: true, encoding: 'utf8', timeout: 300000 }).trim();
const sql = (name, query) => run(['exec', 'aihub-platform-local-postgres-1', 'psql', '-U', 'aihub', '-d', name, '-v', 'ON_ERROR_STOP=1', '-Atc', query]);
let created = false;
try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Object.entries(source).map(([key,value]) => key + '=' + value).join('\n'), { flag: 'wx', mode: 0o600 });
  restrictSecretFile(file);
  sql('postgres', 'CREATE DATABASE ' + database); created = true;
  for (const command of [ ['node_modules/.bin/prisma', 'migrate', 'deploy'], ['node_modules/.bin/tsx', 'prisma/seed.ts'], ['node_modules/.bin/tsx', 'scripts/seed-policies.ts'] ]) {
    run(['run', '--rm', '--env-file', file, 'aihub-worker:test', ...command]);
    console.log('Container command passed: ' + command.slice(1).join(' '));
  }
  const counts = sql(database, 'SELECT (SELECT count(*) FROM "User"),(SELECT count(*) FROM "Plan"),(SELECT count(*) FROM "Document")').split('|').map(Number);
  if (counts[0] !== 1 || counts[1] !== 0 || counts[2] < 1) throw Error('Production seed invariants failed');
  console.log('Fresh production database migrated; one admin, no sample sale plans, published documents available.');
} finally {
  if (created) sql('postgres', 'DROP DATABASE ' + database + ' WITH (FORCE)');
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
