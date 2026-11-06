import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
// Only known local containers; a disposable database is created and dropped.
const fixtures = [
  { container: 'aihub-platform-local-postgres-1', user: 'aihub', database: 'aihub', tables: ['User', 'Order', 'License', 'Document'] },
  { container: 'tn-ch-relay-postgres-1', user: 'sub2api', database: 'sub2api', tables: ['users', 'api_keys'] },
];
for (const fixture of fixtures) {
  const suffix = randomBytes(6).toString('hex'), restore = 'aihub_restore_verify_' + suffix, dump = '/tmp/aihub-restore-' + suffix + '.dump';
  const run = (...args) => execFileSync('docker', ['exec', fixture.container, ...args], { encoding: 'utf8', windowsHide: true, timeout: 600000 }).trim();
  const sql = (database, statement) => run('psql', '-U', fixture.user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atc', statement);
  const counts = fixture.tables.map(table => `(SELECT count(*) FROM "${table}")`).join(" || ',' || ");
  let created = false;
  try {
    const before = sql(fixture.database, 'SELECT ' + counts);
    run('pg_dump', '-U', fixture.user, '-d', fixture.database, '-Fc', '-f', dump);
    sql('postgres', 'CREATE DATABASE ' + restore); created = true;
    run('pg_restore', '-U', fixture.user, '--no-owner', '--no-privileges', '-d', restore, dump);
    const after = sql(restore, 'SELECT ' + counts);
    if (before !== after) throw Error('Row counts differ; run while fixture writers are idle');
    console.log(fixture.database + ': dump + restore verified (' + fixture.tables.length + ' table counts matched)');
  } finally {
    if (created) sql('postgres', 'DROP DATABASE ' + restore + ' WITH (FORCE)');
    run('rm', '-f', dump);
  }
}
