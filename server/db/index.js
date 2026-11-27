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

function findUserByEmail(email, roleHint) {
  const normalized = String(email || '').trim().toLowerCase();
  const aliases = store.users.filter(function (user) {
    const names = Array.isArray(user.loginAliases) ? user.loginAliases : [];
    return names.some(function (alias) { return String(alias).toLowerCase() === normalized; });
  });
  const exact = store.users.find(function (user) {
    return String(user.email || '').toLowerCase() === normalized;
  });
  if (exact && (!roleHint || exact.role === roleHint)) return copy(exact);
  if (roleHint) {
    const preferred = aliases.find(function (user) { return user.role === roleHint; });
    if (preferred) return copy(preferred);
  }
  return exact ? copy(exact) : (aliases[0] ? copy(aliases[0]) : null);
}

function findUserById(id) {
  const found = store.users.find(function (user) { return user.id === id; });
  return found ? copy(found) : null;
}

function insertUser(user) {
  const stored = copy(user);
  const index = store.users.findIndex(function (row) { return row.id === stored.id; });
  if (index === -1) store.users.push(stored);
  else store.users[index] = stored;
  return copy(stored);
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

function listRecordings() {
  return copy(store.recordings);
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

function findRazorpayOrderByReceipt(receipt) {
  const needle = String(receipt || '');
  if (!needle) return null;
  const found = store.razorpayOrders.find(function (item) { return String(item.receipt || '') === needle; });
  return found ? copy(found) : null;
}

function findPayment(paymentId) {
  const found = store.payments.find(function (item) { return item.id === paymentId; });
  return found ? copy(found) : null;
}

/* Check-and-insert in one synchronous step. Mock mode is single-threaded, so no
   second webhook can observe a half-written claim between the read and push. */
function claimPayment(payment) {
  const record = copy(payment) || {};
  if (!record.id) return { claimed: false, payment: null, reason: 'INVALID_PAYMENT' };
  const existing = findPayment(record.id);
  if (existing) return { claimed: false, payment: existing };
  store.payments.push(copy(record));
  return { claimed: true, payment: copy(record) };
}

function releasePayment(paymentId) {
  const index = store.payments.findIndex(function (item) { return item.id === paymentId; });
  if (index === -1) return false;
  store.payments.splice(index, 1);
  return true;
}

/* Atomic compare-and-set of the order credit state: only a row still in
   'created' can become 'credited'. */
function creditOrderIfCreated(orderId, paymentId, creditedAt) {
  const index = store.razorpayOrders.findIndex(function (item) { return item.id === orderId; });
  if (index === -1) return { claimed: false, order: null };
  const current = store.razorpayOrders[index];
  if (current.status === 'credited' || current.paymentId) {
    return { claimed: false, order: copy(current) };
  }
  const next = Object.assign({}, copy(current), {
    status: 'credited',
    paymentId: paymentId,
    creditedAt: creditedAt || new Date().toISOString()
  });
  store.razorpayOrders[index] = next;
  return { claimed: true, order: copy(next) };
}

function uncreditOrderIfCredited(orderId, paymentId) {
  const index = store.razorpayOrders.findIndex(function (item) { return item.id === orderId; });
  if (index === -1) return { released: false, order: null };
  const current = store.razorpayOrders[index];
  if (current.status !== 'credited') return { released: false, order: copy(current) };
  if (paymentId && current.paymentId && String(current.paymentId) !== String(paymentId)) {
    return { released: false, order: copy(current) };
  }
  const next = Object.assign({}, copy(current), { status: 'created' });
  delete next.paymentId;
  delete next.creditedAt;
  store.razorpayOrders[index] = next;
  return { released: true, order: copy(next) };
}

function recordPayment(payment) {
  const existing = payment && payment.id ? findPayment(payment.id) : null;
  if (existing) return existing;
  store.payments.push(copy(payment));
  return copy(payment);
}

function addSessions(studentId, sessions, payment) {
  const user = store.users.find(function (item) { return item.id === studentId; });
  if (!user) return null;

  /* The payment ID is the pack's deterministic identity. A replay with the
     same payment is a no-op, so no duplicate pack credential is ever issued. */
  const paymentId = payment && payment.id ? String(payment.id) : '';
  const packId = paymentId
    ? 'pack_' + paymentId
    : 'pack_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  if (paymentId && store.packs.some(function (pack) { return pack.id === packId; })) {
    return copy(user);
  }

  user.sessionsRemaining = Number(user.sessionsRemaining || 0) + sessions;

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
  store.packs.push(pack);

  return copy(user);
}

function findWhatsappMessage(id) {
  const found = store.whatsappMessages.find(function (item) { return item.id === id; });
  return found ? copy(found) : null;
}

/* Same check-and-insert contract as the live adapter, synchronously in mock
   mode: only one delivery can claim a MessageSid. */
function claimWhatsappMessage(message) {
  const record = copy(message) || {};
  if (!record.id) return { claimed: false, message: null, reason: 'INVALID_MESSAGE' };
  const existing = findWhatsappMessage(record.id);
  if (existing) return { claimed: false, message: existing };
  store.whatsappMessages.push(copy(record));
  return { claimed: true, message: copy(record) };
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

function findFounderPenalty(id) {
  const found = (store.founderPenaltyDecisions || []).find(function (item) { return item.id === id; });
  return found ? copy(found) : null;
}

function saveFounderPenalty(record) {
  const key = String(record.id || '');
  const list = store.founderPenaltyDecisions || (store.founderPenaltyDecisions = []);
  const index = list.findIndex(function (item) { return item.id === key; });
  const stored = copy(record);
  if (index === -1) list.push(stored);
  else list[index] = stored;
  return copy(stored);
}

function listFounderPenalties(trainerId) {
  const rows = Array.isArray(store.founderPenaltyDecisions) ? store.founderPenaltyDecisions : [];
  const filtered = trainerId
    ? rows.filter(function (item) { return item.trainerId === trainerId; })
    : rows;
  return copy(filtered.slice().reverse());
}

function findPasswordReset(tokenHash) {
  const found = (store.passwordResets || []).find(function (row) {
    return row.tokenHash === tokenHash;
  });
  return found ? copy(found) : null;
}

function findPasswordResetByOtpHash(otpHash) {
  const found = (store.passwordResets || []).find(function (row) {
    return row.otpHash === otpHash;
  });
  return found ? copy(found) : null;
}

function savePasswordReset(record) {
  const key = String(record.tokenHash || '');
  const list = store.passwordResets || (store.passwordResets = []);
  const index = list.findIndex(function (row) { return row.tokenHash === key; });
  const stored = copy(record);
  if (index === -1) list.push(stored);
  else list[index] = stored;
  return copy(stored);
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

function findContactRequest(id) {
  const found = store.contactRequests.find(function (row) { return row.id === id; });
  return found ? copy(found) : null;
}

function findContactRequestForStudent(studentId) {
  const found = store.contactRequests.find(function (row) { return row.studentId === studentId; });
  return found ? copy(found) : null;
}

function listContactRequests(limit) {
  const size = Math.max(1, Math.min(200, Number(limit || 50)));
  const rows = store.contactRequests.slice().sort(function (left, right) {
    return String(right.receivedAt || '').localeCompare(String(left.receivedAt || ''));
  });
  return copy(rows.slice(0, size));
}

function updateContactRequest(id, patch) {
  const found = store.contactRequests.find(function (row) { return row.id === id; });
  if (!found) return null;
  Object.assign(found, copy(patch) || {});
  return copy(found);
}

/* Parent inbox. Every row is filtered by the server-derived child link. */
function insertParentNotification(record) {
  const stored = Object.assign({
    id: 'pn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    readAt: null
  }, copy(record) || {});
  store.parentNotifications.push(stored);
  return copy(stored);
}

function findParentNotification(id) {
  const found = store.parentNotifications.find(function (row) { return row.id === id; });
  return found ? copy(found) : null;
}

function listParentNotifications(childId) {
  const rows = store.parentNotifications.filter(function (row) { return row.childId === childId; });
  rows.sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  });
  return copy(rows);
}

function updateParentNotification(id, patch) {
  const found = store.parentNotifications.find(function (row) { return row.id === id; });
  if (!found) return null;
  Object.assign(found, copy(patch) || {});
  return copy(found);
}

/* Additional operations used by scheduling, reminders and the event outbox. */
function listAllSessions() {
  return copy(store.sessions);
}

function claimReminder(key, payload) {
  const safeKey = String(key || '');
  if (store.reminderClaims.has(safeKey)) {
    return { claimed: false, data: copy(store.reminderClaims.get(safeKey)) };
  }
  const record = copy(Object.assign({
    key: safeKey,
    claimedAt: new Date().toISOString()
  }, payload || {}));
  store.reminderClaims.set(safeKey, record);
  return { claimed: true, data: copy(record) };
}

function releaseReminderClaim(key) {
  return store.reminderClaims.delete(String(key || ''));
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

/* ------------------------------------------------- early-years planner cache
   Generated planner JSON is immutable: a key is claimed once and never
   overwritten. Only the small version pointer moves when an admin regenerates. */
function findWeeklyPlannerCache(cacheKey) {
  const found = store.weeklyPlannerCache.find(function (item) { return item.cacheKey === cacheKey; });
  return found ? copy(found) : null;
}

function insertWeeklyPlannerCache(record) {
  const found = store.weeklyPlannerCache.find(function (item) { return item.cacheKey === record.cacheKey; });
  if (found) return { claimed: false, record: copy(found) };
  const stored = copy(record);
  store.weeklyPlannerCache.push(stored);
  return { claimed: true, record: copy(stored) };
}

function archiveWeeklyPlannerCache(record) {
  const archiveKey = record.cacheKey + ':archived:' + String(record.archivedAt || new Date().toISOString());
  const found = store.weeklyPlannerArchive.find(function (item) { return item.archiveKey === archiveKey; });
  if (found) return { claimed: false, record: copy(found) };
  const stored = copy(Object.assign({}, record, { archiveKey: archiveKey }));
  store.weeklyPlannerArchive.push(stored);
  return { claimed: true, record: copy(stored) };
}

function listWeeklyPlannerArchive() {
  return copy(store.weeklyPlannerArchive);
}

function findWeeklyPlannerPointer(pointerKey) {
  const found = store.weeklyPlannerPointers.find(function (item) { return item.pointerKey === pointerKey; });
  return found ? copy(found) : null;
}

function saveWeeklyPlannerPointer(record) {
  const stored = copy(record);
  const index = store.weeklyPlannerPointers.findIndex(function (item) { return item.pointerKey === stored.pointerKey; });
  if (index === -1) store.weeklyPlannerPointers.push(stored);
  else store.weeklyPlannerPointers[index] = stored;
  return copy(stored);
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
  findContactRequest,
  findContactRequestForStudent,
  listContactRequests,
  updateContactRequest,
  insertParentNotification,
  findParentNotification,
  listParentNotifications,
  updateParentNotification,
  findUserByEmail,
  findUserById,
  insertUser,
  listUsers,
  listSessionsForUser,
  listAllSessions,
  claimReminder,
  releaseReminderClaim,
  findSession,
  updateSession,
  updateUser,
  listAttendance,
  listAttendanceForSession,
  upsertAttendance,
  saveRecording,
  findRecording,
  findActiveRecording,
  listRecordings,
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
  findPasswordResetByOtpHash,
  savePasswordReset,
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
  findWeeklyPlannerCache,
  insertWeeklyPlannerCache,
  archiveWeeklyPlannerCache,
  listWeeklyPlannerArchive,
  findWeeklyPlannerPointer,
  saveWeeklyPlannerPointer,
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
