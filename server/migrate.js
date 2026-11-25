/* Mathify migration runner.
 *
 * `npm run migrate`                -> dry run. Prints the ordered plan and
 *                                     checksums. Never contacts a database.
 * `npm run migrate -- --apply`     -> applies every pending file in ONE
 *                                     transaction, but only when both
 *                                     DATABASE_URL and MATHIFY_MIGRATE_CONFIRM=apply
 *                                     are present.
 *
 * No Supabase project is touched until a human reviews the plan and sets the
 * confirmation variable. Missing credentials always degrade to a warning +
 * dry run; they never crash the process.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const CONFIRMATION = 'apply';
const MARKER_TABLE = 'public.mathify_migrations';

function discover() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(function (name) { return /^\d{4}_[a-z0-9_]+\.sql$/i.test(name); })
    .sort()
    .map(function (name) {
      const file = path.join(MIGRATIONS_DIR, name);
      const sql = fs.readFileSync(file, 'utf8');
      return {
        name: name,
        file: file,
        sql: sql,
        bytes: Buffer.byteLength(sql),
        checksum: crypto.createHash('sha256').update(sql).digest('hex')
      };
    });
}

function plan(migrations) {
  console.log('[migrate] Mathify SQL plan (dry run — no database was contacted)');
  if (!migrations.length) {
    console.log('[migrate] No migration files found in server/migrations.');
    return;
  }
  migrations.forEach(function (migration, index) {
    console.log(
      '[migrate] ' + String(index + 1).padStart(2, '0') + '. ' + migration.name +
      '  ' + migration.bytes + ' bytes  sha256:' + migration.checksum.slice(0, 12)
    );
  });
  console.log('[migrate] Review these files, then run: npm run migrate -- --apply');
  console.log('[migrate] Apply requires DATABASE_URL and MATHIFY_MIGRATE_CONFIRM=apply.');
}

function buildSql(migrations) {
  const parts = [
    '\\set ON_ERROR_STOP on',
    'begin;',
    'create table if not exists ' + MARKER_TABLE + ' (',
    '  filename text primary key,',
    '  checksum text not null,',
    '  applied_at timestamptz not null default now()',
    ');'
  ];
  migrations.forEach(function (migration) {
    parts.push('-- ' + migration.name + ' sha256:' + migration.checksum);
    parts.push(migration.sql);
    parts.push(
      "insert into " + MARKER_TABLE + " (filename, checksum) values ('" +
      migration.name + "', '" + migration.checksum + "') " +
      "on conflict (filename) do update set checksum = excluded.checksum;"
    );
  });
  parts.push('commit;');
  return parts.join('\n') + '\n';
}

function apply(migrations) {
  const url = String(process.env.DATABASE_URL || '').trim();
  const confirmed = String(process.env.MATHIFY_MIGRATE_CONFIRM || '').trim().toLowerCase() === CONFIRMATION;

  if (!url) {
    console.warn('[migrate] DATABASE_URL is missing; refusing to apply. Staying in dry run.');
    plan(migrations);
    return 0;
  }
  if (!confirmed) {
    console.warn('[migrate] MATHIFY_MIGRATE_CONFIRM=apply was not set; refusing to apply.');
    plan(migrations);
    return 0;
  }
  if (!migrations.length) {
    console.log('[migrate] Nothing to apply.');
    return 0;
  }

  const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: buildSql(migrations),
    encoding: 'utf8',
    env: process.env
  });
  if (result.error) {
    console.error('[migrate] psql is unavailable: ' + result.error.message);
    console.error('[migrate] Install PostgreSQL client tools or apply the reviewed SQL manually.');
    return 1;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error('[migrate] Apply failed. The single transaction was rolled back.');
    return 1;
  }
  console.log('[migrate] Applied ' + migrations.length + ' migration(s) in one transaction.');
  return 0;
}

function main() {
  const migrations = discover();
  const wantsApply = process.argv.slice(2).indexOf('--apply') !== -1;
  const code = wantsApply ? apply(migrations) : (plan(migrations), 0);
  if (code) process.exitCode = code;
}

if (require.main === module) main();

module.exports = { discover, plan, buildSql, MIGRATIONS_DIR, MARKER_TABLE };
