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

function id(prefix) {
  return prefix + '_' + crypto.randomUUID();
}

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

/* -------------------------------------------------------------------- users */

async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const users = await listRecords('users');
  const found = users.find(function (user) { return String(user.email || '').toLowerCase() === normalized; });
  return found ? copy(found) : null;
}

function findUserById(userId) {
  return getRecord('users', userId);
}

function listUsers() {
  return listRecords('users');
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

  const rows = await request('/rest/v1/sessions', {
    method: 'POST',
    body: [{
      code: input.code || crypto.randomUUID(),
      trainer_id: input.trainerId,
      student_id: input.studentId,
      title: input.title || '1-on-1 maths session',
      status: input.status || 'scheduled'
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
    rtc: { channel: 'mathify_' + row.id },
    currentPage: 1,
    scheduledAt: row.scheduled_at || null,
    startedAt: row.started_at || null,
    endsAt: row.ends_at || null,
    elapsedSeconds: 0,
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

function findPayment(paymentId) {
  return getRecord('payments', paymentId);
}

function recordPayment(payment) {
  return putRecord('payments', payment.id, payment);
}

async function addSessions(studentId, sessions, payment) {
  const user = await findUserById(studentId);
  if (!user) return null;
  user.sessionsRemaining = Number(user.sessionsRemaining || 0) + sessions;
  const updated = await putRecord('users', studentId, user);
  const pack = {
    id: id('pack'),
    studentId: studentId,
    label: 'Monthly pack · ' + sessions + ' sessions',
    totalSessions: sessions,
    remainingSessions: sessions,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 38 * 24 * 60 * 60 * 1000).toISOString(),
    refundable: false,
    paymentRef: payment && payment.id ? payment.id : null
  };
  await putRecord('packs', pack.id, pack);
  return updated;
}

/* ----------------------------------------------------------- messaging/escalations */

function findWhatsappMessage(messageId) {
  return getRecord('whatsapp_messages', messageId);
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
  findPayment,
  recordPayment,
  addSessions,
  findWhatsappMessage,
  recordWhatsappMessage,
  recordSupportEscalation,
  updateSupportEscalation,
  listSupportEscalations,
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
  recordContactRequest,
  appendSessionEvent,
  recentSessionEvents,
  listSessionEvents
};
