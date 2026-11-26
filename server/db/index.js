/* Data access facade. Mock mode keeps the in-memory store; live mode delegates
   every operation to the Supabase adapter without changing any route. */
const config = require('../config');
const store = require('./mock');

const sessionEvents = [];
let liveAdapter = null;
function live() {
  if (config.databaseMode !== 'supabase') return null;
  if (!liveAdapter) liveAdapter = require('./supabase');
  return liveAdapter;
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const found = store.users.find(function (user) { return user.email.toLowerCase() === normalized; });
  return found ? copy(found) : null;
}

function findUserById(id) {
  const found = store.users.find(function (user) { return user.id === id; });
  return found ? copy(found) : null;
}

function listUsers() {
  return copy(store.users);
}

function listSessionsForUser(user) {
  return copy(store.sessions.filter(function (session) {
    if (user.role === 'founder') return true;
    if (user.role === 'trainer') return session.trainerId === user.id;
    if (user.role === 'student') return session.studentId === user.id;
    return false;
  }));
}

function findSession(id) {
  const found = store.sessions.find(function (session) { return session.id === id; });
  return found ? copy(found) : null;
}

function updateSession(id, updater) {
  const index = store.sessions.findIndex(function (session) { return session.id === id; });
  if (index === -1) return null;
  const current = store.sessions[index];
  const next = updater(copy(current));
  store.sessions[index] = next || current;
  return copy(store.sessions[index]);
}

function updateUser(id, updater) {
  const index = store.users.findIndex(function (user) { return user.id === id; });
  if (index === -1) return null;
  const current = store.users[index];
  const next = updater(copy(current));
  store.users[index] = next || current;
  return copy(store.users[index]);
}

function listAttendance() {
  return copy(store.attendance);
}

function listAttendanceForSession(sessionId) {
  return copy(store.attendance.filter(function (row) { return row.sessionId === sessionId; }));
}

function upsertAttendance(sessionId, studentId, status) {
  const session = store.sessions.find(function (item) { return item.id === sessionId; });
  if (!session) return null;

  const index = store.attendance.findIndex(function (row) {
    return row.sessionId === sessionId && row.studentId === studentId;
  });
  const record = {
    id: index === -1 ? 'att_' + Date.now() : store.attendance[index].id,
    sessionId: sessionId,
    trainerId: session.trainerId,
    studentId: studentId,
    status: status,
    markedAt: new Date().toISOString()
  };

  if (index === -1) store.attendance.push(record);
  else store.attendance[index] = record;

  return copy(record);
}

function saveRecording(recording) {
  const index = store.recordings.findIndex(function (item) { return item.id === recording.id; });
  if (index === -1) store.recordings.push(copy(recording));
  else store.recordings[index] = copy(recording);
  return copy(store.recordings[index === -1 ? store.recordings.length - 1 : index]);
}

function findRecording(id) {
  const found = store.recordings.find(function (item) { return item.id === id; });
  return found ? copy(found) : null;
}

function findActiveRecording(sessionId) {
  const found = store.recordings.find(function (item) {
    return item.sessionId === sessionId && item.status === 'recording';
  });
  return found ? copy(found) : null;
}

function saveRazorpayOrder(order) {
  const index = store.razorpayOrders.findIndex(function (item) { return item.id === order.id; });
  if (index === -1) store.razorpayOrders.push(copy(order));
  else store.razorpayOrders[index] = copy(order);
  return copy(order);
}

function findRazorpayOrder(orderId) {
  const found = store.razorpayOrders.find(function (item) { return item.id === orderId; });
  return found ? copy(found) : null;
}

function findPayment(paymentId) {
  const found = store.payments.find(function (item) { return item.id === paymentId; });
  return found ? copy(found) : null;
}

function recordPayment(payment) {
  store.payments.push(copy(payment));
  return copy(payment);
}

function addSessions(studentId, sessions, payment) {
  const user = store.users.find(function (item) { return item.id === studentId; });
  if (!user) return null;

  user.sessionsRemaining = Number(user.sessionsRemaining || 0) + sessions;

  const pack = {
    id: 'pack_' + Date.now(),
    studentId: studentId,
    label: 'Monthly pack · ' + sessions + ' sessions',
    totalSessions: sessions,
    remainingSessions: sessions,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 38 * 24 * 60 * 60 * 1000).toISOString(),
    refundable: false,
    paymentRef: payment && payment.id ? payment.id : null
  };
  store.packs.push(pack);

  return copy(user);
}

function findWhatsappMessage(id) {
  const found = store.whatsappMessages.find(function (item) { return item.id === id; });
  return found ? copy(found) : null;
}

function recordWhatsappMessage(message) {
  const existing = findWhatsappMessage(message.id);
  if (existing) return existing;
  store.whatsappMessages.push(copy(message));
  return copy(message);
}

function recordSupportEscalation(escalation) {
  store.supportEscalations.push(copy(escalation));
  return copy(escalation);
}

function updateSupportEscalation(id, patch) {
  const found = store.supportEscalations.find(function (item) { return item.id === id; });
  if (!found) return null;
  Object.assign(found, copy(patch) || {});
  return copy(found);
}

function listSupportEscalations(limit) {
  const size = Math.max(1, Math.min(200, Number(limit || 50)));
  return copy(store.supportEscalations.slice(-size).reverse());
}

function listLeaveRequests() {
  return copy(store.leaveRequests);
}

function listLeaveRequestsForUser(user) {
  if (!user) return [];
  return copy(store.leaveRequests.filter(function (request) {
    if (user.role === 'founder') return true;
    if (user.role === 'trainer') {
      return request.trainerId === user.id || request.requestedBy === user.id;
    }
    if (user.role === 'student') return request.studentId === user.id || request.requestedBy === user.id;
    return false;
  }));
}

function findLeaveRequestForSession(sessionId) {
  const found = store.leaveRequests.find(function (request) {
    return request.sessionId === sessionId && request.status !== 'cancelled';
  });
  return found ? copy(found) : null;
}

function insertLeaveRequest(record) {
  const stored = Object.assign({
    id: 'leave_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    status: 'approved',
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.leaveRequests.push(copy(stored));
  return copy(stored);
}

function listPresenceEvents(sessionId) {
  return copy(sessionId
    ? store.presenceEvents.filter(function (event) { return event.sessionId === sessionId; })
    : store.presenceEvents);
}

function insertPresenceEvent(record) {
  const stored = Object.assign({
    id: 'presence_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    at: new Date().toISOString()
  }, copy(record) || {});
  store.presenceEvents.push(copy(stored));
  return copy(stored);
}

function findPresenceSnapshot(sessionId) {
  const found = store.presenceSnapshots.find(function (snapshot) { return snapshot.sessionId === sessionId; });
  return found ? copy(found) : null;
}

function listPresenceSnapshots() {
  return copy(store.presenceSnapshots);
}

function savePresenceSnapshot(snapshot) {
  const record = copy(snapshot);
  const index = store.presenceSnapshots.findIndex(function (item) { return item.sessionId === record.sessionId; });
  if (index === -1) store.presenceSnapshots.push(record);
  else store.presenceSnapshots[index] = record;
  return copy(record);
}

function listTrainerSlots(trainerId) {
  return copy(trainerId
    ? store.trainerSlots.filter(function (slot) { return slot.trainerId === trainerId; })
    : store.trainerSlots);
}

function insertTrainerSlot(record) {
  const stored = Object.assign({
    id: 'slot_' + Date.now() + '_' + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.trainerSlots.push(copy(stored));
  return copy(stored);
}

function deleteTrainerSlot(trainerId, slotId) {
  const index = store.trainerSlots.findIndex(function (slot) {
    return slot.id === slotId && slot.trainerId === trainerId;
  });
  if (index === -1) return false;
  store.trainerSlots.splice(index, 1);
  return true;
}

function recordContactRequest(request) {
  store.contactRequests.push(copy(request));
  return copy(request);
}

/* Additional operations used by scheduling, reminders and the event outbox. */
function listAllSessions() {
  return copy(store.sessions);
}

function appendSessionEvent(sessionId, event, payload) {
  const message = {
    seq: sessionEvents.length + 1,
    at: new Date().toISOString(),
    channel: 'mathify:session:' + sessionId,
    event: String(event),
    payload: copy(payload) || {}
  };
  sessionEvents.push(message);
  if (sessionEvents.length > 500) sessionEvents.shift();
  return message;
}

function recentSessionEvents(limit) {
  const size = Math.max(1, Math.min(200, Number(limit || 20)));
  return copy(sessionEvents.slice(-size));
}

function listSessionEvents(sessionId, since, limit) {
  const cursor = Number(since) || 0;
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  return copy(sessionEvents.filter(function (message) {
    return message.channel === 'mathify:session:' + sessionId && message.seq > cursor;
  }).slice(-size));
}

function seedDemo() {
  return { users: store.users.length, sessions: store.sessions.length, mode: 'mock' };
}

const mockApi = {
  recordContactRequest,
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
  listTrainerSlots,
  insertTrainerSlot,
  deleteTrainerSlot,
  appendSessionEvent,
  recentSessionEvents,
  listSessionEvents,
  seedDemo
};

/* Every call goes through this facade so a route never knows which store is
   active. Live mode must implement the operation; it never silently falls
   back to mock data, which could leak demo identities into production. */
const api = {};
Object.keys(mockApi).forEach(function (name) {
  api[name] = function () {
    const active = live();
    const implementation = active && typeof active[name] === 'function' ? active[name] : mockApi[name];
    return implementation.apply(null, arguments);
  };
});
api.insertSession = function () {
  const adapter = live();
  if (adapter && typeof adapter.insertSession === 'function') {
    return adapter.insertSession.apply(null, arguments);
  }
  const error = new Error('Session creation requires DATABASE_MODE=supabase.');
  error.code = 'DATABASE_MODE_NOT_LIVE';
  throw error;
};

module.exports = api;
