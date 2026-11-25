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

module.exports = {
  findUserByEmail,
  findUserById,
  listSessionsForUser,
  findSession,
  updateSession,
  listAttendance,
  listAttendanceForSession,
  upsertAttendance
};
