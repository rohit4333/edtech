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
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

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
  check(
    Array.isArray(db.listAllSessions()) && db.listAllSessions().length > 0,
    'facade exposes every session in mock mode'
  );
  check(db.seedDemo().mode === 'mock', 'seed reports mock mode without touching a database');

  await rejects(
    Promise.resolve().then(function () {
      return db.insertSession({ trainerId: 'x', studentId: 'y' });
    }),
    'DATABASE_MODE_NOT_LIVE'
  );

  /* Event outbox is shared by realtime and the browser-safe endpoint. */
  const sessionId = 'ses_live_persistence_test';
  await realtime.publish(sessionId, 'page.changed', { page: 7 });
  await realtime.publish(sessionId, 'board.shared', { shared: true });
  const events = db.listSessionEvents(sessionId, 0, 20);
  check(events.length >= 2, 'published events land in the shared outbox');
  check(events[events.length - 1].event === 'board.shared', 'events keep their publish order');
  check(events[0].seq < events[1].seq, 'event sequence is monotonic');
  /* Bridge reads are awaitable: the live adapter resolves asynchronously. */
  const resumed = await realtime.forSession(sessionId, events[0].seq, 20);
  check(resumed.length === 1, 'session cursor resumes after the last handled event');
  const listed = await db.listSessionEvents(sessionId, 0, 20);
  check(listed.length >= 2, 'listSessionEvents is awaitable through the facade');
  check(realtime.recent(5).length >= 2, 'trainer log reads the same outbox');

  /* Supabase adapter fails closed without credentials and covers every facade
     operation so live mode never silently falls back to demo identities. */
  const saved = {
    url: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    secretKey: config.supabase.secretKey,
  };
  config.supabase.url = '';
  config.supabase.publishableKey = '';
  config.supabase.secretKey = '';
  let rejected = false;
  try {
    await supabase.findUserByEmail('trainer@mathify.app');
  } catch (error) {
    rejected = error.code === 'SUPABASE_NOT_CONFIGURED';
  }
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
  check(
    missing.length === 0,
    'supabase adapter implements every facade operation' +
      (missing.length ? ': ' + missing.join(', ') : '')
  );
  ['addSessions', 'uncreditOrderIfCredited', 'claimWhatsappMessage'].forEach(function (name) {
    check(
      typeof db[name] === 'function' && typeof supabase[name] === 'function',
      name + ' exists in both the facade and the live adapter'
    );
  });

  /* Migration ships the service-only tables and safe participant policy. */
  const migrations = migrate.discover();
  check(migrations.length === 11, 'eleven reviewed migrations are discovered');
  const live = migrations.find(function (migration) {
    return migration.name === '0003_live_persistence.sql';
  });
  check(Boolean(live), 'live persistence migration is present');
  check(
    live.sql.indexOf('create table if not exists public.mathify_records') !== -1,
    'service-only record store is created'
  );
  check(
    live.sql.indexOf('create table if not exists public.mathify_session_events') !== -1,
    'session event outbox is created'
  );
  const baseline = migrations.find(function (migration) {
    return migration.name === '0001_baseline.sql';
  });
  check(
    baseline && baseline.sql.indexOf("app_metadata'->>'role'") !== -1,
    'role policies read app_metadata, never user_metadata'
  );
  check(
    live.sql.indexOf("'user_metadata'") === -1 && live.sql.indexOf('raw_user_meta_data') === -1,
    'live migration never reads user-editable metadata'
  );
  check(
    live.sql.indexOf(
      'revoke all on public.mathify_session_events from public, anon, authenticated'
    ) !== -1 &&
      live.sql.indexOf('grant all on public.mathify_session_events to service_role') !== -1 &&
      live.sql.indexOf('grant select on public.mathify_session_events to authenticated') === -1,
    'raw event outbox is service-role-only, so clients cannot bypass event scrubbing'
  );
  check(
    live.sql.indexOf('grant all on public.mathify_records to service_role') !== -1,
    'only the service role can write app records'
  );
  check(
    live.sql.indexOf('revoke all on public.mathify_records from public, anon, authenticated') !==
      -1,
    'clients cannot read raw app records'
  );
  const aiLogs = migrations.find(function (migration) {
    return migration.name === '0004_ai_chat_logs.sql';
  });
  check(Boolean(aiLogs), 'AI chat audit migration is present');
  check(
    aiLogs &&
      aiLogs.sql.indexOf('create table if not exists public.trainer_support_logs') !== -1 &&
      aiLogs.sql.indexOf('create table if not exists public.student_doubt_logs') !== -1,
    'both founder audit tables are created'
  );
  const policyStart = aiLogs
    ? aiLogs.sql.indexOf('drop policy if exists p_trainer_support_logs_founder_read')
    : -1;
  const policySection = policyStart === -1 ? '' : aiLogs.sql.slice(policyStart);
  check(
    policySection.indexOf("auth.jwt())->'app_metadata'->>'role') = 'founder") !== -1 &&
      policySection.indexOf('user_metadata') === -1,
    'audit RLS reads app_metadata, never user-editable metadata'
  );
  check(
    aiLogs &&
      aiLogs.sql.indexOf('enable row level security') !== -1 &&
      aiLogs.sql.indexOf('revoke all on public.trainer_support_logs from anon, authenticated') !==
        -1 &&
      aiLogs.sql.indexOf('revoke all on public.student_doubt_logs from anon, authenticated') !== -1,
    'audit tables enable RLS and stay out of browser Data API roles'
  );
  const storage = migrations.find(function (migration) {
    return migration.name === '0009_recordings_storage.sql';
  });
  check(Boolean(storage), 'private recordings storage migration is present');
  check(
    storage &&
      storage.sql.indexOf("('recordings', 'recordings', false)") !== -1 &&
      storage.sql.indexOf("bucket_id = 'recordings'") !== -1,
    'recordings bucket is private and the policy is bucket-scoped'
  );
  const storagePolicyStart = storage
    ? storage.sql.indexOf('create policy p_recordings_session_read')
    : -1;
  const storagePolicy = storagePolicyStart === -1 ? '' : storage.sql.slice(storagePolicyStart);
  check(
    storage &&
      storage.sql.indexOf('to authenticated') !== -1 &&
      storagePolicy.indexOf('to anon') === -1 &&
      storage.sql.indexOf("auth.jwt()->'app_metadata'->>'role'") !== -1 &&
      storage.sql.indexOf('user_metadata') === -1,
    'only authenticated session participants and app_metadata founders can read recordings'
  );
  check(
    storage &&
      storage.sql.indexOf('security definer') !== -1 &&
      storage.sql.indexOf(
        'revoke all on function public.can_read_recording(text) from public, anon'
      ) !== -1 &&
      storage.sql.indexOf(
        'grant execute on function public.can_read_recording(text) to authenticated'
      ) !== -1,
    'session lookup is a security-definer boolean helper with no Data API table grant'
  );
  check(
    storagePolicy.indexOf('public.can_read_recording(objects.name)') !== -1 &&
      storagePolicy.indexOf('public.sessions') === -1,
    'the storage policy calls the helper instead of exposing sessions to authenticated'
  );
  check(
    storage &&
      storage.sql.indexOf('s.student_id = auth.uid()') !== -1 &&
      storage.sql.indexOf('s.trainer_id = auth.uid()') !== -1 &&
      storage.sql.indexOf("split_part(object_name, '/', 1)") !== -1,
    'recording object paths are scoped to their session id'
  );
  const facade = fs.readFileSync(path.join(__dirname, '..', 'db', 'index.js'), 'utf8');
  check(
    facade.indexOf('LIVE_ADAPTER_METHOD_MISSING') !== -1 &&
      /typeof implementation !== 'function'/.test(facade),
    'a missing live adapter method throws instead of falling back to mock data'
  );
  check(
    baseline &&
      baseline.sql.indexOf('q.hint,') === -1 &&
      baseline.sql.indexOf(
        'grant select (id, quiz_id, prompt, options, position, status, source,'
      ) !== -1,
    'safe student view and column grant withhold hints until trainer release'
  );
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'db', 'supabase.js'), 'utf8');
  check(
    adapter.indexOf("roomName: (input.rtc && input.rtc.roomName) || ('mathify-' + row.id)") !== -1,
    'live-created sessions get a unique server-owned LiveKit room'
  );
  const livekitService = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'livekitTokenService.js'),
    'utf8'
  );
  check(
    livekitService.indexOf("return 'mathify-' + id") !== -1 &&
      livekitService.indexOf('SESSION_ROOM_MISSING') !== -1,
    'missing rooms fail closed instead of misattributing presence'
  );
  const relabel = migrations.find(function (migration) {
    return migration.name === '0012_livekit_only_presence.sql';
  });
  check(Boolean(relabel), 'LiveKit-only presence relabel migration is present');
  check(
    relabel &&
      relabel.sql.indexOf('drop constraint if exists presence_events_kind_check') <
        relabel.sql.indexOf("set kind = 'livekit_join'"),
    'the legacy presence check is dropped before rows are relabelled'
  );
  check(
    relabel &&
      relabel.sql.indexOf("column_name = 'agora_uid'") !== -1 &&
      relabel.sql.indexOf('rename column agora_uid to participant_uid') !== -1,
    'the legacy uid column is renamed only when present'
  );

  check(
    adapter.indexOf("insertRecordOnce('packs'") !== -1 &&
      adapter.indexOf('data->>sessionsRemaining=eq.') !== -1 &&
      adapter.indexOf('SESSION_CREDIT_RETRIES') !== -1,
    'live pack credits claim atomically and retry the optimistic balance CAS'
  );
  check(
    adapter.indexOf('async function uncreditOrderIfCredited') !== -1 &&
      adapter.indexOf('data->>status=eq.credited') !== -1,
    'order compensation is a conditional live PATCH'
  );
  check(
    adapter.indexOf('function claimWhatsappMessage') !== -1 &&
      adapter.indexOf("insertRecordOnce('whatsapp_messages'") !== -1,
    'WhatsApp dedupe is an atomic live claim'
  );
  check(
    adapter.indexOf("insertRecordOnce('reminder_claim'") !== -1 &&
      adapter.indexOf('function releaseReminderClaim') !== -1,
    'cron reminders use atomic, releasable live claims'
  );

  const webhookRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'webhooks.js'), 'utf8');
  check(
    /router\.post\('\/recording', async function/.test(webhookRoute) &&
      webhookRoute.indexOf('await db.updateSession(') !== -1 &&
      webhookRoute.indexOf('await realtime.publish(') !== -1,
    'recording webhook awaits the live session write and publish'
  );
  check(
    webhookRoute.indexOf('await db.claimWhatsappMessage(') !== -1 &&
      webhookRoute.indexOf("'sup_' + crypto.randomUUID()") !== -1,
    'WhatsApp webhook claims dedupe atomically and uses unique escalation ids'
  );

  const sessionsRoute = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'sessions.js'),
    'utf8'
  );
  check(
    /router\.get\('\/:sessionId\/events', async function[\s\S]{0,400}await realtime\.forSession\(/.test(
      sessionsRoute
    ),
    'session event bridge awaits the asynchronous live outbox'
  );
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  check(
    /app\.get\(\s*['"]\/api\/realtime\/log['"][\s\S]{0,300}async\s+function/.test(appSource) &&
      /await\s+Promise\.all\(\s*\[/.test(appSource) &&
      appSource.indexOf('REALTIME_CHANNEL_PREFIX') !== -1 &&
      appSource.indexOf('EVENT_FORBIDDEN_KEY') !== -1,
    'app-level realtime log resolves live reads, filters by session and scrubs payloads'
  );

  check(
    live.sql.indexOf('$mathify$') === -1,
    'migration does not collide with the runner dollar tag'
  );
  check(live.sql.indexOf('$$') === -1, 'migration avoids nested dollar quoting');
  check(
    fs.existsSync(path.join(__dirname, '..', 'db', 'schema.sql')),
    'normalized schema is committed alongside the adapter'
  );

  const sql = migrate.buildSql(migrations);
  check(
    (sql.match(/do \$mathify\$ begin/g) || []).length === 11,
    'all eleven migrations are wrapped in checked transactions'
  );
  check(
    (sql.match(/Migration checksum changed/g) || []).length === 11,
    'all eleven migrations carry checksum drift guards'
  );
  const kycMigration = migrations.find(function (migration) {
    return migration.name === '0006_trainer_onboarding_batches.sql';
  });
  check(Boolean(kycMigration), 'trainer onboarding and batch migration is present');
  check(
    kycMigration &&
      kycMigration.sql.indexOf("auth.jwt())->'app_metadata'->>'role'") === -1 &&
      kycMigration.sql.indexOf('user_metadata') === -1,
    'the new migration never reads user-editable role metadata'
  );
  check(
    kycMigration &&
      kycMigration.sql.indexOf(
        'revoke all on public.mathify_records from public, anon, authenticated'
      ) !== -1 &&
      kycMigration.sql.indexOf('grant all on public.mathify_records to service_role') !== -1 &&
      kycMigration.sql.indexOf('grant select on public.mathify_records to authenticated') === -1,
    'KYC and batch records stay service-role-only'
  );
  const hintLockdown = migrations.find(function (migration) {
    return migration.name === '0007_student_hint_lockdown.sql';
  });
  check(Boolean(hintLockdown), 'student hint lockdown migration is present');
  check(
    hintLockdown &&
      hintLockdown.sql.indexOf(
        'revoke select (hint) on public.quiz_questions from authenticated'
      ) !== -1 &&
      hintLockdown.sql.indexOf('q.hint') === -1,
    'the hint column is revoked and absent from the student view'
  );
  check(
    hintLockdown &&
      hintLockdown.sql.indexOf("app_metadata'->>'role'") !== -1 &&
      hintLockdown.sql.indexOf('user_metadata') === -1,
    'hint lockdown role policy reads app_metadata, never user-editable metadata'
  );
  const paymentIdempotency = migrations.find(function (migration) {
    return migration.name === '0008_payment_idempotency.sql';
  });
  check(Boolean(paymentIdempotency), 'payment idempotency migration is present');
  check(
    paymentIdempotency &&
      paymentIdempotency.sql.indexOf(
        'create table if not exists public.mathify_razorpay_payments'
      ) !== -1 &&
      paymentIdempotency.sql.indexOf(
        'create table if not exists public.mathify_razorpay_order_credits'
      ) !== -1,
    'payment and order-credit identity relations are created'
  );
  check(
    paymentIdempotency &&
      paymentIdempotency.sql.indexOf('mathify_records_payment_identity_uidx') !== -1 &&
      paymentIdempotency.sql.indexOf('mathify_records_credited_payment_uidx') !== -1,
    'payment identity and credited-payment uniqueness are enforced'
  );
  check(
    paymentIdempotency &&
      paymentIdempotency.sql.indexOf(
        'revoke all on public.mathify_razorpay_payments from public, anon, authenticated'
      ) !== -1 &&
      paymentIdempotency.sql.indexOf(
        'revoke all on public.mathify_razorpay_order_credits from public, anon, authenticated'
      ) !== -1 &&
      paymentIdempotency.sql.indexOf(
        'grant all on public.mathify_razorpay_payments to service_role'
      ) !== -1 &&
      paymentIdempotency.sql.indexOf(
        'grant all on public.mathify_razorpay_order_credits to service_role'
      ) !== -1,
    'payment idempotency tables stay service-role-only'
  );
  const plannerAgent = migrations.find(function (migration) {
    return migration.name === '0011_planner_agent.sql';
  });
  check(Boolean(plannerAgent), 'planner agent migration is present');
  check(
    plannerAgent &&
      plannerAgent.sql.indexOf(
        "check (role in ('founder', 'trainer', 'student', 'relationship_manager', 'planner_agent'))"
      ) !== -1,
    'planner_agent is allowed by the normalized users role check'
  );
  check(
    plannerAgent &&
      plannerAgent.sql.indexOf('planner_agent_suggestion') !== -1 &&
      plannerAgent.sql.indexOf('public.mathify_records') !== -1,
    'planner suggestions are documented as service-only mathify records'
  );

  console.log('livePersistence: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error('livePersistence: FAILED');
  console.error(error);
  process.exitCode = 1;
});
