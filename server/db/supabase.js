const crypto = require('crypto');
const config = require('../config');
const password = require('../auth/password');

/*
 * Supabase live data adapter.
 *
 * Identity, sessions, quizzes and privacy boundaries keep using the normalized
 * relations from server/db/schema.sql. The remaining app state (attendance,
 * recordings, payments, presence, leave requests and the session event outbox)
 * is stored in the service-only tables added by 0003_live_persistence.sql.
 *
 * Only the server-side secret key is used here. No key value is ever returned
 * to a browser, logged, or included in an API response.
 */

function assertConfigured() {
  if (!config.supabase.url || !config.supabase.publishableKey || !config.supabase.secretKey) {
    const error = new Error(
      'Supabase is not configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in server/.env.'
    );
    error.status = 503;
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function request(path, options) {
  assertConfigured();
  const settings = options || {};
  const headers = {
    /* Service-role requests use the secret key for both headers. The publishable
       key is only for browser-side Realtime and is never elevated here. */
    apikey: config.supabase.secretKey,
    Authorization: 'Bearer ' + config.supabase.secretKey,
    'Content-Type': 'application/json',
    Prefer: settings.prefer || 'return=representation'
  };
  const response = await fetch(config.supabase.url.replace(/\/$/, '') + path, {
    method: settings.method || 'GET',
    headers: headers,
    body: settings.body ? JSON.stringify(settings.body) : undefined
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (parseError) { payload = { message: text }; }
  }

  if (!response.ok) {
    const error = new Error(
      (payload && (payload.message || payload.hint || payload.details)) ||
        'Supabase request failed with status ' + response.status
    );
    error.status = 502;
    error.code = 'SUPABASE_REQUEST_FAILED';
    error.details = payload;
    throw error;
  }

  return payload;
}

/* ------------------------------------------------------------------ records */

function encode(value) {
  return encodeURIComponent(String(value || ''));
}

async function getRecord(collection, key) {
  const rows = await request('/rest/v1/mathify_records?collection=eq.' + encode(collection) +
    '&key=eq.' + encode(key) + '&select=data&limit=1');
  return rows && rows[0] && rows[0].data ? copy(rows[0].data) : null;
}

async function putRecord(collection, key, value) {
  const data = copy(value);
  await request('/rest/v1/mathify_records', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ collection: String(collection), key: String(key), data: data }]
  });
  return data;
}

async function listRecords(collection) {
  const rows = await request('/rest/v1/mathify_records?collection=eq.' + encode(collection) +
    '&select=data&order=key');
  return Array.isArray(rows) ? rows.map(function (row) { return copy(row.data); }) : [];
}

function isDuplicateRecordError(error) {
  if (!error) return false;
  if (error.status === 409) return true;
  const details = error.details || {};
  return details.code === '23505' || /duplicate key|unique violation/i.test(String(error.message || ''));
}

/* Strict insert: the mathify_records primary key (collection, key) rejects a
   second claim for the same payment ID. PostgREST returns 409/23505, which is
   a duplicate webhook rather than an operational failure. */
async function insertRecordOnce(collection, key, value) {
  const data = copy(value);
  try {
    await request('/rest/v1/mathify_records', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ collection: String(collection), key: String(key), data: data }]
    });
    return { claimed: true, data: data };
  } catch (error) {
    if (!isDuplicateRecordError(error)) throw error;
    return { claimed: false, data: await getRecord(collection, key) };
  }
}

async function deleteRecord(collection, key) {
  await request('/rest/v1/mathify_records?collection=eq.' + encode(collection) +
    '&key=eq.' + encode(key), { method: 'DELETE', prefer: 'return=minimal' });
  return true;
}

/* Reminder cron claims live in the service-only records table so a fresh CI
   runner never resends a 24h/1h reminder or daily attention digest. Releasing a
   claim lets a later run retry after a transient delivery failure. */
function claimReminder(key, payload) {
  const safeKey = String(key || '');
  return insertRecordOnce('reminder_claim', safeKey, Object.assign({
    key: safeKey,
    claimedAt: new Date().toISOString()
  }, payload || {}));
}

function releaseReminderClaim(key) {
  return deleteRecord('reminder_claim', String(key || ''));
}

/* Enrollment batches and locked trainer onboarding are service-only records.
   The Data API never receives their identity or document fields. */
function listBatches() { return listRecords('batch'); }
function findBatch(batchId) { return getRecord('batch', batchId); }
function findBatchByCode(code) {
  return listRecords('batch').then(function (rows) {
    const normalized = String(code || '').trim().toUpperCase();
    return rows.find(function (row) { return String(row.code || '').toUpperCase() === normalized; }) || null;
  });
}
function findBatchForStudent(studentId) {
  return listRecords('batch').then(function (rows) {
    return rows.find(function (row) { return row.studentId === studentId; }) || null;
  });
}
function saveBatch(record) { return putRecord('batch', record.id, record); }
function listTrainerOnboarding() { return listRecords('trainer_onboarding'); }
function findTrainerOnboarding(trainerId) { return getRecord('trainer_onboarding', trainerId); }
function saveTrainerOnboarding(record) { return putRecord('trainer_onboarding', record.trainerId, record); }
function saveTrainerOnboardingCorrection(record) {
  return putRecord('trainer_onboarding_correction', record.id, record);
}
function listTrainerOnboardingCorrections(trainerId) {
  return listRecords('trainer_onboarding_correction').then(function (rows) {
    return trainerId
      ? rows.filter(function (row) { return row.trainerId === trainerId; })
      : rows;
  });
}
function listTrainerDocuments() { return listRecords('trainer_kyc_document'); }
function findTrainerDocument(documentId) { return getRecord('trainer_kyc_document', documentId); }
function saveTrainerDocument(record) {
  return putRecord('trainer_kyc_document', record.id, record);
}
function listAnnouncements() { return listRecords('announcement'); }
function saveAnnouncement(record) { return putRecord('announcement', record.id, record); }
function findAnnouncementRead(announcementId, userId) {
  return getRecord('announcement_read', announcementId + '|' + userId);
}
function saveAnnouncementRead(record) {
  return putRecord('announcement_read', record.announcementId + '|' + record.userId, record);
}

/* Self-practice batches keep answer keys server-side in the service-only
   records table; the Data API never receives these columns. */
function savePracticeBatch(batch) {
  return putRecord('practice_batches', batch.id, batch);
}

function findPracticeBatch(batchId) {
  return getRecord('practice_batches', batchId);
}

function listPracticeBatches() {
  return listRecords('practice_batches');
}

async function updatePracticeBatch(batchId, patch) {
  const current = await getRecord('practice_batches', batchId);
  if (!current) return null;
  return putRecord('practice_batches', batchId, Object.assign({}, current, copy(patch) || {}));
}

function id(prefix) {
  return prefix + '_' + crypto.randomUUID();
}

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

/* -------------------------------------------------------------------- users */

async function findUserByEmail(email, roleHint) {
  const normalized = String(email || '').trim().toLowerCase();
  const users = await listRecords('users');
  const aliases = users.filter(function (user) {
    const names = Array.isArray(user.loginAliases) ? user.loginAliases : [];
    return names.some(function (alias) { return String(alias).toLowerCase() === normalized; });
  });
  const exact = users.find(function (user) {
    return String(user.email || '').toLowerCase() === normalized;
  });
  if (exact && (!roleHint || exact.role === roleHint)) return copy(exact);
  if (roleHint) {
    const preferred = aliases.find(function (user) { return user.role === roleHint; });
    if (preferred) return copy(preferred);
  }
  return exact ? copy(exact) : (aliases[0] ? copy(aliases[0]) : null);
}

function findUserById(userId) {
  return getRecord('users', userId);
}

function listUsers() {
  return listRecords('users');
}

function insertUser(user) {
  return putRecord('users', String(user.id || ''), user);
}

async function updateUser(userId, updater) {
  const current = await findUserById(userId);
  if (!current) return null;
  const next = updater(copy(current));
  if (!next) return null;
  return putRecord('users', userId, next);
}

/* ----------------------------------------------------------------- sessions */

function listAllSessions() {
  return listRecords('sessions');
}

function listSessionsForUser(user) {
  return listAllSessions().then(function (sessions) {
    return sessions.filter(function (session) {
      if (!user) return false;
      if (user.role === 'founder') return true;
      if (user.role === 'trainer') return session.trainerId === user.id;
      if (user.role === 'student') return session.studentId === user.id;
      if (user.role === 'parent' && user.childId) return session.studentId === user.childId;
      return false;
    });
  });
}

function findSession(sessionId) {
  return getRecord('sessions', sessionId);
}

async function updateSession(sessionId, updater) {
  const current = await findSession(sessionId);
  if (!current) return null;
  const next = updater(copy(current));
  if (!next) return null;
  return putRecord('sessions', sessionId, next);
}

/* Keep the normalized insert used by the trainer console and mirror the full
   app-shaped record into the adapter store so db.findSession() sees it too. */
async function insertSession(input) {
  if (!isUuid(input.trainerId) || !isUuid(input.studentId)) {
    const error = new Error('trainer_id and student_id must be real UUIDs from public.users.');
    error.status = 400;
    error.code = 'INVALID_PARTICIPANT_ID';
    throw error;
  }

  const scheduledAt = input.scheduledAt || input.startsAt || null;
  const rows = await request('/rest/v1/sessions', {
    method: 'POST',
    body: [{
      code: input.code || crypto.randomUUID(),
      trainer_id: input.trainerId,
      student_id: input.studentId,
      title: input.title || '1-on-1 maths session',
      status: input.status || 'scheduled',
      scheduled_at: scheduledAt,
      started_at: input.startedAt || null
    }]
  });
  const row = Array.isArray(rows) ? rows[0] : rows;

  await putRecord('sessions', row.id, {
    id: row.id,
    code: row.code,
    trainerId: row.trainer_id,
    studentId: row.student_id,
    title: row.title,
    status: row.status,
    /* Agora channels are server-derived and unique per session so live-created
       sessions can issue tokens and attribute webhooks to exactly one pair. */
    rtc: {
      provider: 'agora',
      channel: (input.rtc && input.rtc.channel) || ('mathify_' + row.id)
    },
    currentPage: 1,
    /* Mirror the booking metadata so the 7-day calendar and classroom access
       window see the same scheduled session in live and mock modes. */
    scheduledAt: scheduledAt || row.scheduled_at || null,
    startedAt: input.startedAt || row.started_at || null,
    endsAt: row.ends_at || null,
    elapsedSeconds: 0,
    durationMinutes: input.durationMinutes || 50,
    batchId: input.batchId || null,
    batchCode: input.batchCode || null,
    batchSlotKey: input.batchSlotKey || null,
    planner: [],
    pages: []
  });

  return row;
}

/* ---------------------------------------------------------------- attendance */

function listAttendance() {
  return listRecords('attendance');
}

async function listAttendanceForSession(sessionId) {
  const rows = await listAttendance();
  return rows.filter(function (row) { return sameId(row.sessionId, sessionId); });
}

async function upsertAttendance(sessionId, studentId, status) {
  const session = await findSession(sessionId);
  if (!session) return null;
  const rows = await listAttendance();
  const index = rows.findIndex(function (row) {
    return sameId(row.sessionId, sessionId) && sameId(row.studentId, studentId);
  });
  const record = index === -1
    ? { id: id('att'), sessionId: sessionId, trainerId: session.trainerId, studentId: studentId }
    : rows[index];
  record.status = status;
  record.markedAt = new Date().toISOString();
  return putRecord('attendance', record.id, record);
}

/* --------------------------------------------------------------- recordings */

function saveRecording(recording) {
  return putRecord('recordings', recording.id, recording);
}

function findRecording(recordingId) {
  return getRecord('recordings', recordingId);
}

async function findActiveRecording(sessionId) {
  const rows = await listRecords('recordings');
  return rows.find(function (row) {
    return sameId(row.sessionId, sessionId) && row.status === 'recording';
  }) || null;
}

/* ------------------------------------------------------------ packs/payment */

function saveRazorpayOrder(order) {
  return putRecord('razorpay_orders', order.id, order);
}

function findRazorpayOrder(orderId) {
  return getRecord('razorpay_orders', orderId);
}

async function findRazorpayOrderByReceipt(receipt) {
  const needle = String(receipt || '');
  if (!needle) return null;
  const rows = await listRecords('razorpay_orders');
  return rows.find(function (row) { return String(row.receipt || '') === needle; }) || null;
}

function findPayment(paymentId) {
  return getRecord('payments', paymentId);
}

function claimPayment(payment) {
  const record = copy(payment) || {};
  if (!record.id) return Promise.resolve({ claimed: false, payment: null, reason: 'INVALID_PAYMENT' });
  return insertRecordOnce('payments', record.id, record).then(function (result) {
    return { claimed: result.claimed, payment: result.data };
  });
}

function releasePayment(paymentId) {
  if (!paymentId) return Promise.resolve(false);
  return request('/rest/v1/mathify_records?collection=eq.payments&key=eq.' + encode(paymentId), {
    method: 'DELETE',
    prefer: 'return=minimal'
  }).then(function () { return true; });
}

/* Conditional PATCH is the live compare-and-set: the filter only matches a row
   still marked 'created', so two concurrent credits cannot both win. */
async function creditOrderIfCreated(orderId, paymentId, creditedAt) {
  const current = await getRecord('razorpay_orders', orderId);
  if (!current) return { claimed: false, order: null };
  if (current.status === 'credited' || current.paymentId) {
    return { claimed: false, order: current };
  }
  const next = Object.assign({}, current, {
    status: 'credited',
    paymentId: paymentId,
    creditedAt: creditedAt || new Date().toISOString()
  });
  const rows = await request('/rest/v1/mathify_records?collection=eq.razorpay_orders&key=eq.' +
    encode(orderId) + '&data->>status=eq.created', {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { data: next }
    });
  if (!Array.isArray(rows) || rows.length === 0) {
    return { claimed: false, order: await getRecord('razorpay_orders', orderId) };
  }
  return { claimed: true, order: next };
}

/* Compensating operation for a failed post-credit step. The PATCH filter only
   matches the order we credited with this payment, so a retry can safely turn
   it back into a claimable 'created' order. */
async function uncreditOrderIfCredited(orderId, paymentId) {
  const current = await getRecord('razorpay_orders', orderId);
  if (!current || current.status !== 'credited') return { released: false, order: current };
  if (paymentId && current.paymentId && String(current.paymentId) !== String(paymentId)) {
    return { released: false, order: current };
  }
  const next = Object.assign({}, current, { status: 'created' });
  delete next.paymentId;
  delete next.creditedAt;
  let path = '/rest/v1/mathify_records?collection=eq.razorpay_orders&key=eq.' +
    encode(orderId) + '&data->>status=eq.credited';
  if (paymentId) path += '&data->>paymentId=eq.' + encode(paymentId);
  const rows = await request(path, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { data: next }
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    return { released: false, order: await getRecord('razorpay_orders', orderId) };
  }
  return { released: true, order: next };
}

function recordPayment(payment) {
  if (!payment || !payment.id) return Promise.resolve(null);
  return claimPayment(payment).then(function (result) {
    return result.claimed ? result.payment : findPayment(payment.id);
  });
}

/* A credit commits in two stages: the deterministic pack claim is inserted
   atomically first, then the balance is advanced by compare-and-set. A bounded
   retry absorbs distinct payments racing on the same student. */
const SESSION_CREDIT_RETRIES = 6;

async function compareAndSetSessions(studentId, expected, next) {
  const rows = await request('/rest/v1/mathify_records?collection=eq.users&key=eq.' +
    encode(studentId) + '&data->>sessionsRemaining=eq.' + encode(expected), {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { data: next }
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return copy(rows[0].data);
}

async function addSessions(studentId, sessions, payment) {
  if (!await findUserById(studentId)) return null;

  /* Deterministic pack identity, mirrored from mock mode. The strict insert
     is the replay gate: a duplicate payment can never issue a second pack or
     touch the balance again. */
  const paymentId = payment && payment.id ? String(payment.id) : '';
  const packId = paymentId ? 'pack_' + paymentId : id('pack');
  const pack = {
    id: packId,
    studentId: studentId,
    label: 'Monthly pack · ' + sessions + ' sessions',
    totalSessions: sessions,
    remainingSessions: sessions,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 38 * 24 * 60 * 60 * 1000).toISOString(),
    refundable: false,
    paymentRef: paymentId || null
  };

  const claim = await insertRecordOnce('packs', packId, pack);
  if (!claim.claimed) return findUserById(studentId);

  const releasePackClaim = function () {
    return request('/rest/v1/mathify_records?collection=eq.packs&key=eq.' + encode(packId), {
      method: 'DELETE',
      prefer: 'return=minimal'
    });
  };

  try {
    for (let attempt = 0; attempt < SESSION_CREDIT_RETRIES; attempt += 1) {
      const user = await findUserById(studentId);
      if (!user) break;
      const expected = Number(user.sessionsRemaining || 0);
      const next = Object.assign({}, user, { sessionsRemaining: expected + Number(sessions) });
      const updated = await compareAndSetSessions(studentId, expected, next);
      if (updated) return updated;
    }
  } catch (error) {
    /* An unexpected adapter failure must not leave a claimed pack behind: a
       retry would then see the claim and skip the balance credit entirely. */
    try { await releasePackClaim(); } catch (cleanupError) { /* keep the original error */ }
    throw error;
  }

  /* No compare-and-set ever won. Release the claim so the webhook's
     compensation can roll the order back and a retry can start clean. */
  await releasePackClaim();
  const error = new Error('Session balance changed concurrently; retry the payment.');
  error.code = 'SESSION_CREDIT_CONFLICT';
  throw error;
}

/* ----------------------------------------------------------- messaging/escalations */

function findWhatsappMessage(messageId) {
  return getRecord('whatsapp_messages', messageId);
}

/* Atomic dedupe: the primary key on (collection, key) decides which webhook
   owns a MessageSid, so concurrent identical deliveries cannot both generate
   a reply or open a second escalation. */
function claimWhatsappMessage(message) {
  const record = copy(message) || {};
  if (!record.id) return Promise.resolve({ claimed: false, message: null, reason: 'INVALID_MESSAGE' });
  return insertRecordOnce('whatsapp_messages', record.id, record).then(function (result) {
    return { claimed: result.claimed, message: result.data };
  });
}

async function recordWhatsappMessage(message) {
  const existing = await findWhatsappMessage(message.id);
  if (existing) return existing;
  return putRecord('whatsapp_messages', message.id, message);
}

function recordSupportEscalation(escalation) {
  return putRecord('support_escalations', escalation.id, escalation);
}

async function updateSupportEscalation(escalationId, patch) {
  const current = await getRecord('support_escalations', escalationId);
  if (!current) return null;
  return putRecord('support_escalations', escalationId, Object.assign({}, current, copy(patch) || {}));
}

async function listSupportEscalations(limit) {
  const size = Math.max(1, Math.min(200, Number(limit || 50)));
  const rows = await listRecords('support_escalations');
  return rows.slice(-size).reverse();
}

function findFounderPenalty(id) {
  return getRecord('founder_penalty_decisions', String(id || ''));
}

function saveFounderPenalty(record) {
  return putRecord('founder_penalty_decisions', String(record.id || ''), record);
}

async function listFounderPenalties(trainerId) {
  const rows = await listRecords('founder_penalty_decisions');
  const filtered = trainerId
    ? rows.filter(function (item) { return item.trainerId === trainerId; })
    : rows;
  return filtered.slice().reverse();
}

function findPasswordReset(tokenHash) {
  return getRecord('password_resets', String(tokenHash || ''));
}

function savePasswordReset(record) {
  return putRecord('password_resets', String(record.tokenHash || ''), record);
}

/* -------------------------------------------------------------------- leaves */

function listLeaveRequests() {
  return listRecords('leave_requests');
}

async function listLeaveRequestsForUser(user) {
  const rows = await listLeaveRequests();
  if (!user) return [];
  return rows.filter(function (request) {
    if (user.role === 'founder') return true;
    if (user.role === 'trainer') {
      return sameId(request.trainerId, user.id) || sameId(request.requestedBy, user.id);
    }
    if (user.role === 'student') {
      return sameId(request.studentId, user.id) || sameId(request.requestedBy, user.id);
    }
    return false;
  });
}

async function findLeaveRequestForSession(sessionId) {
  const rows = await listLeaveRequests();
  return rows.find(function (request) {
    return sameId(request.sessionId, sessionId) && request.status !== 'cancelled';
  }) || null;
}

function insertLeaveRequest(record) {
  const stored = Object.assign({
    id: id('leave'),
    status: 'approved',
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('leave_requests', stored.id, stored);
}

/* ------------------------------------------------------------------ presence */

async function listPresenceEvents(sessionId) {
  const rows = await listRecords('presence_events');
  return sessionId ? rows.filter(function (event) { return sameId(event.sessionId, sessionId); }) : rows;
}

function insertPresenceEvent(record) {
  const stored = Object.assign({
    id: id('presence'),
    at: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('presence_events', stored.id, stored);
}

function findPresenceSnapshot(sessionId) {
  return getRecord('presence_snapshots', sessionId);
}

function listPresenceSnapshots() {
  return listRecords('presence_snapshots');
}

function savePresenceSnapshot(snapshot) {
  const record = copy(snapshot);
  return putRecord('presence_snapshots', record.sessionId, record);
}

/* ----------------------------------------------------------------- reactions */

async function listReactions(sessionId) {
  const rows = await listRecords('reactions');
  return sessionId ? rows.filter(function (row) { return sameId(row.sessionId, sessionId); }) : rows;
}

function insertReaction(record) {
  const stored = Object.assign({
    id: id('rx'),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('reactions', stored.id, stored);
}

/* -------------------------------------------------------------------- slots */

async function listTrainerSlots(trainerId) {
  const rows = await listRecords('trainer_slots');
  return trainerId ? rows.filter(function (slot) { return sameId(slot.trainerId, trainerId); }) : rows;
}

function insertTrainerSlot(record) {
  const stored = Object.assign({
    id: id('slot'),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('trainer_slots', stored.id, stored);
}

async function deleteTrainerSlot(trainerId, slotId) {
  const slot = await getRecord('trainer_slots', slotId);
  if (!slot || !sameId(slot.trainerId, trainerId)) return false;
  await request('/rest/v1/mathify_records?collection=eq.trainer_slots&key=eq.' + encode(slotId), {
    method: 'DELETE',
    prefer: 'return=minimal'
  });
  return true;
}

function recordContactRequest(requestRecord) {
  const stored = Object.assign({ id: id('contact') }, copy(requestRecord) || {});
  return putRecord('contact_requests', stored.id, stored);
}

/* ------------------------------------------------------------ event outbox */

function channelName(sessionId) {
  return 'mathify:session:' + sessionId;
}

function fromRow(row) {
  return {
    seq: Number(row.seq),
    at: row.created_at,
    channel: channelName(row.session_id),
    event: row.event,
    payload: row.payload || {}
  };
}

async function appendSessionEvent(sessionId, event, payload) {
  const rows = await request('/rest/v1/mathify_session_events', {
    method: 'POST',
    body: [{
      session_id: String(sessionId),
      event: String(event),
      payload: copy(payload) || {},
      created_at: new Date().toISOString()
    }]
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromRow(row) : null;
}

async function recentSessionEvents(limit) {
  const size = Math.max(1, Math.min(200, Number(limit || 20)));
  const rows = await request('/rest/v1/mathify_session_events?select=seq,session_id,event,payload,created_at' +
    '&order=seq.desc&limit=' + size);
  return (Array.isArray(rows) ? rows : []).reverse().map(fromRow);
}

async function listSessionEvents(sessionId, since, limit) {
  const cursor = Number(since) || 0;
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = await request('/rest/v1/mathify_session_events?select=seq,session_id,event,payload,created_at' +
    '&session_id=eq.' + encode(sessionId) + '&seq=gt.' + cursor +
    '&order=seq.desc&limit=' + size);
  return (Array.isArray(rows) ? rows : []).reverse().map(fromRow);
}

/* ------------------------------------------------------- parent chat records
   Uses the same service-only mathify_records JSONB store as practice batches
   and support escalations. No new table or SQL migration is required, and no
   browser role is granted read access to these collections. */
function parentChatReadKey(threadId, recipientId) {
  return String(threadId || '') + '::' + String(recipientId || '');
}

async function listParentChatMessages(studentId, limit) {
  const size = Math.max(1, Math.min(100, Number(limit) || 100));
  const threadId = String(studentId || '');
  const rows = await listRecords('parent_chat_message');
  return rows.filter(function (row) {
    return String(row.threadId || '') === threadId || String(row.studentId || '') === threadId;
  }).sort(function (left, right) {
    const byTime = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    return byTime || String(left.id || '').localeCompare(String(right.id || ''));
  }).slice(-size);
}

function insertParentChatMessage(record) {
  const stored = Object.assign({
    id: id('pch'),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('parent_chat_message', stored.id, stored);
}

async function listParentChatFlags(limit) {
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = await listRecords('parent_chat_flag');
  return rows.sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  }).slice(0, size);
}

function insertParentChatFlag(record) {
  const stored = Object.assign({
    id: id('pchflag'),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  return putRecord('parent_chat_flag', stored.id, stored);
}

function findParentChatRead(threadId, recipientId) {
  return getRecord('parent_chat_read', parentChatReadKey(threadId, recipientId));
}

function saveParentChatRead(record) {
  const stored = copy(record) || {};
  return putRecord('parent_chat_read', parentChatReadKey(stored.threadId, stored.recipientId), stored);
}

/* --------------------------------------------------------------------- seed */

async function seedDemo() {
  assertConfigured();
  const mock = require('./mock');
  let users = 0;
  for (const user of mock.users) {
    const secured = password.hashPassword(process.env.DEMO_PASSWORD || 'mathify-demo');
    await putRecord('users', user.id, Object.assign({}, copy(user), secured));
    users += 1;
  }
  let sessions = 0;
  for (const session of mock.sessions) {
    await putRecord('sessions', session.id, copy(session));
    sessions += 1;
  }
  return { users: users, sessions: sessions, mode: 'supabase' };
}

module.exports = {
  assertConfigured,
  isUuid,
  insertSession,
  seedDemo,
  findUserByEmail,
  findUserById,
  listUsers,
  insertUser,
  listSessionsForUser,
  listAllSessions,
  findSession,
  updateSession,
  updateUser,
  listAttendance,
  listAttendanceForSession,
  upsertAttendance,
  saveRecording,
  findRecording,
  findActiveRecording,
  saveRazorpayOrder,
  findRazorpayOrder,
  findRazorpayOrderByReceipt,
  findPayment,
  claimPayment,
  releasePayment,
  creditOrderIfCreated,
  uncreditOrderIfCredited,
  recordPayment,
  addSessions,
  findWhatsappMessage,
  claimWhatsappMessage,
  recordWhatsappMessage,
  recordSupportEscalation,
  updateSupportEscalation,
  listSupportEscalations,
  findFounderPenalty,
  saveFounderPenalty,
  listFounderPenalties,
  findPasswordReset,
  savePasswordReset,
  listLeaveRequests,
  listLeaveRequestsForUser,
  findLeaveRequestForSession,
  insertLeaveRequest,
  listPresenceEvents,
  insertPresenceEvent,
  findPresenceSnapshot,
  listPresenceSnapshots,
  savePresenceSnapshot,
  listReactions,
  insertReaction,
  listTrainerSlots,
  insertTrainerSlot,
  deleteTrainerSlot,
  listBatches,
  findBatch,
  findBatchByCode,
  findBatchForStudent,
  saveBatch,
  listTrainerOnboarding,
  findTrainerOnboarding,
  saveTrainerOnboarding,
  saveTrainerOnboardingCorrection,
  listTrainerOnboardingCorrections,
  listTrainerOnboardingCorrectionsForAll: listTrainerOnboardingCorrections,
  listTrainerDocuments,
  findTrainerDocument,
  saveTrainerDocument,
  listAnnouncements,
  saveAnnouncement,
  findAnnouncementRead,
  saveAnnouncementRead,
  savePracticeBatch,
  findPracticeBatch,
  listPracticeBatches,
  updatePracticeBatch,
  recordContactRequest,
  appendSessionEvent,
  recentSessionEvents,
  listSessionEvents,
  listParentChatMessages,
  insertParentChatMessage,
  listParentChatFlags,
  insertParentChatFlag,
  findParentChatRead,
  saveParentChatRead,
  claimReminder,
  releaseReminderClaim
};
