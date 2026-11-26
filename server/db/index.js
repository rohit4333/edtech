/* Data access facade. Mock mode keeps the in-memory store; live mode delegates
   every operation to the Supabase adapter without changing any route. */
const config = require('../config');
const store = require('./mock');

const sessionEvents = [];
let sessionEventSeq = 0;
/* Parallel rooms each keep their own recent history. A global cap alone would
   let a busy room evict a quiet room's unread events before the browser polls
   them, so retention is per session first and global only as a hard ceiling. */
const SESSION_EVENT_RETENTION = 200;
const EVENT_OUTBOX_RETENTION = 10000;
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
    /* A parent sees only the sessions of their own child. */
    if (user.role === 'parent' && user.childId) return session.studentId === user.childId;
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

/* Reaction gestures are stored with role and minute only. They never carry a
   note, contact detail or any celebration/reward payload. */
function insertReaction(record) {
  const stored = Object.assign({
    id: 'rx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.reactions.push(stored);
  return copy(stored);
}

function listReactions(sessionId) {
  const source = Array.isArray(store.reactions) ? store.reactions : [];
  const rows = sessionId
    ? source.filter(function (row) { return row.sessionId === sessionId; })
    : source;
  return copy(rows);
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
  sessionEventSeq += 1;
  const channel = 'mathify:session:' + sessionId;
  const message = {
    seq: sessionEventSeq,
    at: new Date().toISOString(),
    channel: channel,
    event: String(event),
    payload: copy(payload) || {}
  };
  sessionEvents.push(message);

  const channelSeqs = [];
  for (let index = 0; index < sessionEvents.length; index += 1) {
    if (sessionEvents[index].channel === channel) channelSeqs.push(sessionEvents[index].seq);
  }
  if (channelSeqs.length > SESSION_EVENT_RETENTION) {
    const cutoff = channelSeqs[channelSeqs.length - SESSION_EVENT_RETENTION];
    for (let index = sessionEvents.length - 1; index >= 0; index -= 1) {
      if (sessionEvents[index].channel === channel && sessionEvents[index].seq < cutoff) {
        sessionEvents.splice(index, 1);
      }
    }
  }
  if (sessionEvents.length > EVENT_OUTBOX_RETENTION) {
    sessionEvents.splice(0, sessionEvents.length - EVENT_OUTBOX_RETENTION);
  }
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

function savePracticeBatch(batch) {
  store.practiceBatches.push(copy(batch));
  return copy(batch);
}

function findPracticeBatch(batchId) {
  const found = store.practiceBatches.find(function (item) { return item.id === batchId; });
  return found ? copy(found) : null;
}

function listPracticeBatches() {
  return copy(store.practiceBatches);
}

function updatePracticeBatch(batchId, patch) {
  const found = store.practiceBatches.find(function (item) { return item.id === batchId; });
  if (!found) return null;
  Object.assign(found, copy(patch) || {});
  return copy(found);
}

/* ------------------------------------------------------- parent chat records
   All three collections live behind this service-role facade. Browser Data API
   roles are never granted access; only the server can read or write them. */
function parentChatThreadKey(threadId) {
  return String(threadId || '');
}

function parentChatReadKey(threadId, recipientId) {
  return parentChatThreadKey(threadId) + '::' + String(recipientId || '');
}

function listParentChatMessages(studentId, limit) {
  const size = Math.max(1, Math.min(100, Number(limit) || 100));
  const threadId = parentChatThreadKey(studentId);
  const rows = store.parentChatMessages.filter(function (row) {
    return parentChatThreadKey(row.threadId) === threadId || parentChatThreadKey(row.studentId) === threadId;
  });
  rows.sort(function (left, right) {
    const byTime = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    return byTime || String(left.id || '').localeCompare(String(right.id || ''));
  });
  return copy(rows.slice(-size));
}

function insertParentChatMessage(record) {
  const stored = Object.assign({
    id: 'pch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.parentChatMessages.push(stored);
  return copy(stored);
}

function listParentChatFlags(limit) {
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = store.parentChatFlags.slice().sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  });
  return copy(rows.slice(0, size));
}

function insertParentChatFlag(record) {
  const stored = Object.assign({
    id: 'pchflag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.parentChatFlags.push(stored);
  return copy(stored);
}

function findParentChatRead(threadId, recipientId) {
  const key = parentChatReadKey(threadId, recipientId);
  const found = store.parentChatReads.find(function (row) { return row.key === key; });
  return found ? copy(found) : null;
}

function saveParentChatRead(record) {
  const stored = copy(record) || {};
  stored.key = parentChatReadKey(stored.threadId, stored.recipientId);
  const index = store.parentChatReads.findIndex(function (row) { return row.key === stored.key; });
  if (index === -1) store.parentChatReads.push(stored);
  else store.parentChatReads[index] = stored;
  return copy(stored);
}

/* Enrollment batches. A batch belongs to one student and is allotted to at
   most one trainer; strictly 1-on-1, never a group cohort. */
function listBatches() {
  return copy(store.batches);
}
function findBatch(batchId) {
  const found = store.batches.find(function (row) { return row.id === batchId || row.code === batchId; });
  return found ? copy(found) : null;
}
function findBatchForStudent(studentId) {
  const found = store.batches.find(function (row) { return row.studentId === studentId; });
  return found ? copy(found) : null;
}
function saveBatch(record) {
  const stored = copy(record) || {};
  const index = store.batches.findIndex(function (row) { return row.id === stored.id; });
  if (index === -1) store.batches.push(stored);
  else store.batches[index] = stored;
  return copy(stored);
}
function findBatchByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const found = store.batches.find(function (row) { return String(row.code || '').toUpperCase() === normalized; });
  return found ? copy(found) : null;
}
function insertSession(record) {
  const stored = copy(record) || {};
  if (!stored.id) stored.id = 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  /* Match the live adapter: every session owns one Agora channel, so parallel
     rooms can never share media or webhook attribution. */
  if (!stored.rtc || !stored.rtc.channel) {
    stored.rtc = Object.assign({}, stored.rtc || {}, {
      provider: 'agora',
      channel: 'mathify_' + stored.id
    });
  }
  store.sessions.push(stored);
  return copy(stored);
}

/* Locked trainer onboarding. Only the founder correction path may write an
   existing record, and that path always appends a separate audit row. */
function listTrainerOnboarding() {
  return copy(store.trainerOnboarding);
}
function findTrainerOnboarding(trainerId) {
  const found = store.trainerOnboarding.find(function (row) { return row.trainerId === trainerId; });
  return found ? copy(found) : null;
}
function saveTrainerOnboarding(record) {
  const stored = copy(record) || {};
  const index = store.trainerOnboarding.findIndex(function (row) { return row.trainerId === stored.trainerId; });
  if (index === -1) store.trainerOnboarding.push(stored);
  else store.trainerOnboarding[index] = stored;
  return copy(stored);
}
function saveTrainerOnboardingCorrection(record) {
  const stored = Object.assign({
    id: 'tkyccorr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString()
  }, copy(record) || {});
  store.trainerOnboardingCorrections.push(stored);
  return copy(stored);
}
function listTrainerOnboardingCorrections(trainerId) {
  const rows = trainerId
    ? store.trainerOnboardingCorrections.filter(function (row) { return row.trainerId === trainerId; })
    : store.trainerOnboardingCorrections;
  return copy(rows);
}
function listTrainerOnboardingCorrectionsForAll() {
  return copy(store.trainerOnboardingCorrections);
}

function listTrainerDocuments() {
  return copy(store.trainerDocuments);
}
function findTrainerDocument(documentId) {
  const found = store.trainerDocuments.find(function (row) { return row.id === documentId; });
  return found ? copy(found) : null;
}
function saveTrainerDocument(record) {
  const stored = copy(record) || {};
  const index = store.trainerDocuments.findIndex(function (row) { return row.id === stored.id; });
  if (index === -1) store.trainerDocuments.push(stored);
  else store.trainerDocuments[index] = stored;
  return copy(stored);
}

function listAnnouncements() {
  return copy(store.announcements);
}
function saveAnnouncement(record) {
  const stored = copy(record) || {};
  const index = store.announcements.findIndex(function (row) { return row.id === stored.id; });
  if (index === -1) store.announcements.push(stored);
  else store.announcements[index] = stored;
  return copy(stored);
}
function findAnnouncementRead(announcementId, userId) {
  const key = announcementId + '|' + userId;
  const found = store.announcementReads.find(function (row) { return row.key === key; });
  return found ? copy(found) : null;
}
function saveAnnouncementRead(record) {
  const stored = Object.assign({}, copy(record) || {});
  stored.key = stored.announcementId + '|' + stored.userId;
  const index = store.announcementReads.findIndex(function (row) { return row.key === stored.key; });
  if (index === -1) store.announcementReads.push(stored);
  else store.announcementReads[index] = stored;
  return copy(stored);
}

function seedDemo() {
  return { users: store.users.length, sessions: store.sessions.length, mode: 'mock' };
}

const mockApi = {
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
  listTrainerOnboardingCorrectionsForAll,
  listTrainerDocuments,
  findTrainerDocument,
  saveTrainerDocument,
  listAnnouncements,
  saveAnnouncement,
  findAnnouncementRead,
  saveAnnouncementRead,
  insertSession,
  savePracticeBatch,
  findPracticeBatch,
  listPracticeBatches,
  updatePracticeBatch,
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
  insertReaction,
  listReactions,
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
  listParentChatMessages,
  insertParentChatMessage,
  listParentChatFlags,
  insertParentChatFlag,
  findParentChatRead,
  saveParentChatRead,
  seedDemo
};

/* Every call goes through this facade so a route never knows which store is
   active. Live mode must implement the operation; it never silently falls
   back to mock data, which could leak demo identities into production. */
const api = {};
Object.keys(mockApi).forEach(function (name) {
  api[name] = function () {
    const active = live();
    if (active) {
      const implementation = active[name];
      if (typeof implementation !== 'function') {
        const error = new Error('Live adapter does not implement ' + name + '.');
        error.code = 'LIVE_ADAPTER_METHOD_MISSING';
        throw error;
      }
      return implementation.apply(null, arguments);
    }
    return mockApi[name].apply(null, arguments);
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
