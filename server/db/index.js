/* Phase 1 data access. Only this file knows the store is in memory. */
const store = require('./mock');

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

module.exports = {
  findUserByEmail,
  findUserById,
  listSessionsForUser,
  findSession,
  updateSession,
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
  listSupportEscalations
};
