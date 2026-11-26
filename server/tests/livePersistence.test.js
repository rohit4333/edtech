/* Live persistence and cross-process event outbox regression suite. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db');
const realtime = require('../realtime');
const supabase = require('../db/supabase');
const migrate = require('../migrate');

let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions += 1; }

async function rejects(promise, code) {
  try {
    await promise;
    return false;
  } catch (error) {
    check(error.code === code, 'expected ' + code + ', got ' + (error.code || error.message));
    return true;
  }
}

async function main() {
  /* Mock mode is still the safe local default. */
  check(config.databaseMode !== 'supabase', 'tests run in mock database mode');
  check(Array.isArray(db.listAllSessions()) && db.listAllSessions().length > 0,
    'facade exposes every session in mock mode');
  check(db.seedDemo().mode === 'mock', 'seed reports mock mode without touching a database');

  await rejects(Promise.resolve().then(function () {
    return db.insertSession({ trainerId: 'x', studentId: 'y' });
  }), 'DATABASE_MODE_NOT_LIVE');

  /* Event outbox is shared by realtime and the browser-safe endpoint. */
  const sessionId = 'ses_live_persistence_test';
  await realtime.publish(sessionId, 'page.changed', { page: 7 });
  await realtime.publish(sessionId, 'board.shared', { shared: true });
  const events = db.listSessionEvents(sessionId, 0, 20);
  check(events.length >= 2, 'published events land in the shared outbox');
  check(events[events.length - 1].event === 'board.shared', 'events keep their publish order');
  check(events[0].seq < events[1].seq, 'event sequence is monotonic');
  check(realtime.forSession(sessionId, events[0].seq, 20).length === 1,
    'session cursor resumes after the last handled event');
  check(realtime.recent(5).length >= 2, 'trainer log reads the same outbox');

  /* Supabase adapter fails closed without credentials and covers every facade
     operation so live mode never silently falls back to demo identities. */
  const saved = {
    url: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    secretKey: config.supabase.secretKey
  };
  config.supabase.url = '';
  config.supabase.publishableKey = '';
  config.supabase.secretKey = '';
  let rejected = false;
  try { await supabase.findUserByEmail('trainer@mathify.app'); }
  catch (error) { rejected = error.code === 'SUPABASE_NOT_CONFIGURED'; }
  check(rejected, 'supabase adapter refuses calls without credentials');
  config.supabase.url = saved.url;
  config.supabase.publishableKey = saved.publishableKey;
  config.supabase.secretKey = saved.secretKey;

  const facadeOperations = Object.keys(db).filter(function (key) {
    return typeof db[key] === 'function';
  });
  const missing = facadeOperations.filter(function (key) {
    return typeof supabase[key] !== 'function';
  });
  check(missing.length === 0, 'supabase adapter implements every facade operation' +
    (missing.length ? ': ' + missing.join(', ') : ''));

  /* Migration ships the service-only tables and safe participant policy. */
  const migrations = migrate.discover();
  check(migrations.length === 3, 'three reviewed migrations are discovered');
  const live = migrations.find(function (migration) {
    return migration.name === '0003_live_persistence.sql';
  });
  check(Boolean(live), 'live persistence migration is present');
  check(live.sql.indexOf('create table if not exists public.mathify_records') !== -1,
    'service-only record store is created');
  check(live.sql.indexOf('create table if not exists public.mathify_session_events') !== -1,
    'session event outbox is created');
  const baseline = migrations.find(function (migration) {
    return migration.name === '0001_baseline.sql';
  });
  check(baseline && baseline.sql.indexOf("app_metadata'->>'role'") !== -1,
    'role policies read app_metadata, never user_metadata');
  check(live.sql.indexOf("'user_metadata'") === -1 && live.sql.indexOf('raw_user_meta_data') === -1,
    'live migration never reads user-editable metadata');
  check(live.sql.indexOf('revoke all on public.mathify_session_events from public, anon, authenticated') !== -1 &&
    live.sql.indexOf('grant all on public.mathify_session_events to service_role') !== -1 &&
    live.sql.indexOf('grant select on public.mathify_session_events to authenticated') === -1,
    'raw event outbox is service-role-only, so clients cannot bypass event scrubbing');
  check(live.sql.indexOf('grant all on public.mathify_records to service_role') !== -1,
    'only the service role can write app records');
  check(live.sql.indexOf('revoke all on public.mathify_records from public, anon, authenticated') !== -1,
    'clients cannot read raw app records');
  const facade = fs.readFileSync(path.join(__dirname, '..', 'db', 'index.js'), 'utf8');
  check(facade.indexOf('LIVE_ADAPTER_METHOD_MISSING') !== -1 &&
    /typeof implementation !== 'function'/.test(facade),
    'a missing live adapter method throws instead of falling back to mock data');
  check(baseline && baseline.sql.indexOf('q.hint,') === -1 &&
    baseline.sql.indexOf('grant select (id, quiz_id, prompt, options, position, status, source,') !== -1,
    'safe student view and column grant withhold hints until trainer release');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'db', 'supabase.js'), 'utf8');
  check(adapter.indexOf("rtc: { channel: 'mathify_' + row.id }") !== -1,
    'live-created sessions get a unique server-owned Agora channel');
  const agoraRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'agora.js'), 'utf8');
  check(agoraRoute.indexOf('matches.length > 1') !== -1 &&
    agoraRoute.indexOf('ambiguous: true') !== -1,
    'duplicated Agora channels fail closed instead of misattributing presence');

  check(live.sql.indexOf('$mathify$') === -1,
    'migration does not collide with the runner dollar tag');
  check(live.sql.indexOf('$$') === -1,
    'migration avoids nested dollar quoting');
  check(fs.existsSync(path.join(__dirname, '..', 'db', 'schema.sql')),
    'normalized schema is committed alongside the adapter');

  const sql = migrate.buildSql(migrations);
  check((sql.match(/do \$mathify\$ begin/g) || []).length === 3,
    'all three migrations are wrapped in checked transactions');
  check((sql.match(/Migration checksum changed/g) || []).length === 3,
    'all three migrations carry checksum drift guards');

  console.log('livePersistence: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error('livePersistence: FAILED');
  console.error(error);
  process.exitCode = 1;
});
