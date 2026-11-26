/* Lightweight engagement gestures. Deliberately separate from celebrations:
 * a reaction is a student/trainer signal, a celebration is a server-owned
 * recognition event. They can never render in the same layer at the same time. */

const db = require('../db');

/* Kids can applaud their trainer. Applause is the one gesture both roles may
   send, but it is always directed at the other participant by role — never at
   an arbitrary user id supplied by the browser. */
const ALLOWED = {
  student: ['💡', '🤔', '✅', '👏'],
  trainer: ['👏', '⭐', '🎯'],
  founder: ['👏', '⭐', '🎯']
};
const ALL = ['💡', '🤔', '✅', '👏', '⭐', '🎯'];

function allowedFor(role) {
  return (ALLOWED[role] || []).slice();
}

function minuteFor(session, at) {
  const start = Date.parse((session && (session.startedAt || session.startsAt)) || '');
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.min(180, Math.floor((Date.parse(at) - start) / 60000)));
}

function targetFor(role, emoji) {
  if (emoji === '👏') return role === 'student' ? 'trainer' : 'student';
  return 'room';
}

function record(session, user, body) {
  const emoji = String((body || {}).emoji || '');
  if (allowedFor(user.role).indexOf(emoji) < 0) return null;
  const at = new Date().toISOString();
  const fromRole = user.role === 'founder' ? 'trainer' : user.role;
  return db.insertReaction({
    sessionId: session.id,
    studentId: user.role === 'student' ? user.id : null,
    trainerId: user.role === 'trainer' || user.role === 'founder' ? user.id : null,
    fromRole: fromRole,
    toRole: targetFor(fromRole, emoji),
    emoji: emoji,
    minute: minuteFor(session, at),
    createdAt: at
  });
}

/* Flat, allowlisted keys for the shared event channel. No user ids, notes or
   celebration copy cross this boundary. */
function eventPayload(row, user) {
  const fromRole = user.role === 'founder' ? 'trainer' : user.role;
  return {
    emoji: String(row.emoji || ''),
    fromRole: fromRole,
    toRole: targetFor(fromRole, String(row.emoji || '')),
    minute: Math.max(0, Number(row.minute) || 0),
    at: String(row.createdAt || new Date().toISOString())
  };
}

function emptyCounts() {
  const counts = {};
  ALL.forEach(function (emoji) { counts[emoji] = 0; });
  return counts;
}

function summarise(rows) {
  const counts = emptyCounts();
  const confusionMinutes = [];
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const emoji = String(row.emoji || '');
    if (Object.prototype.hasOwnProperty.call(counts, emoji)) counts[emoji] += 1;
    if (emoji === '🤔') confusionMinutes.push(Math.max(0, Number(row.minute) || 0));
  });
  const total = Object.keys(counts).reduce(function (sum, key) { return sum + counts[key]; }, 0);
  const pct = function (emoji) { return total ? Math.round((counts[emoji] / total) * 100) : 0; };
  const ahaPct = pct('💡');
  const confusionPct = pct('🤔');
  const accuracyPct = pct('🎯');
  const confirmationPct = pct('✅');
  const applausePct = pct('👏');
  const engagementScore = total
    ? Math.min(10, Number((((ahaPct / 100) * 3) + ((accuracyPct / 100) * 2) +
      ((confirmationPct / 100) * 1) + ((applausePct / 100) * 1) +
      (((100 - confusionPct) / 100) * 1)) * 2.5).toFixed(1))
    : 0;
  let pacingPreference = 'balanced';
  if (total && confusionPct > 30) pacingPreference = 'slower_on_new';
  else if (total && confusionPct < 10 && ahaPct > 40) pacingPreference = 'faster_review';
  return {
    total: total,
    counts: counts,
    ahaPct: ahaPct,
    confusionPct: confusionPct,
    accuracyPct: accuracyPct,
    confirmationPct: confirmationPct,
    applausePct: applausePct,
    engagementScore: engagementScore,
    pacingPreference: pacingPreference,
    confusionSpikes: confusionMinutes
  };
}

function live(sessionId) {
  return summarise(db.listReactions(sessionId));
}

function student(studentId, sessions) {
  const ownSessionIds = (Array.isArray(sessions) ? sessions : [])
    .filter(function (session) { return session.studentId === studentId; })
    .map(function (session) { return session.id; });
  const rows = db.listReactions().filter(function (row) {
    return row.studentId === studentId || ownSessionIds.indexOf(row.sessionId) >= 0;
  });
  return summarise(rows);
}

function cohort(sessions, users) {
  return (Array.isArray(sessions) ? sessions : []).map(function (session) {
    const user = (Array.isArray(users) ? users : []).find(function (item) { return item.id === session.studentId; });
    const stats = summarise(db.listReactions(session.id));
    return {
      studentId: session.studentId,
      studentName: user ? user.name : 'Student',
      sessionId: session.id,
      total: stats.total,
      ahaPct: stats.ahaPct,
      confusionPct: stats.confusionPct,
      engagementScore: stats.engagementScore
    };
  });
}

module.exports = {
  allowedFor,
  record,
  eventPayload,
  summarise,
  live,
  student,
  cohort
};
