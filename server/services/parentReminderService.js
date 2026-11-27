/* In-app class reminders for the parent space.
 *
 * These are computed from the parent's own child sessions on every request, so
 * the parent app shows a reminder even when outbound email is not configured.
 * Nothing is persisted here and nothing crosses the 1:1 boundary: the caller
 * supplies an authorized childId and no other student's session is returned. */

const config = require('../config');
const db = require('../db');
const policy = require('../config/policy.json');
const timezoneService = require('./timezoneService');

const LOOKAHEAD_MS = 20 * 60 * 1000;
const PAST_MS = 10 * 60 * 1000;
const CLOSED = ['ended', 'cancelled', 'canceled', 'leave', 'no_show', 'noshow'];

function startMs(session) {
  const raw = session && (session.startsAt || session.scheduledAt || session.date);
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

function joinUrl(session) {
  const origin = config.resetOrigin();
  if (!origin || !session || !session.id) return null;
  return origin + '/classroom/preflight.html?sessionId=' +
    encodeURIComponent(String(session.id)) + '&role=student&view=student&state=live';
}

function describe(minutesUntil, earlyJoinMinutes) {
  if (minutesUntil <= 0) {
    return {
      phase: 'starting',
      message: 'Your child’s class is starting now. Join the classroom to be on time.'
    };
  }
  if (minutesUntil <= earlyJoinMinutes) {
    return {
      phase: 'open',
      message: 'The classroom is open. Join now so your child starts on time.'
    };
  }
  return {
    phase: 'upcoming',
    message: 'Your child’s class starts in ' + minutesUntil + ' minutes. The room opens ' +
      earlyJoinMinutes + ' minutes before the start.'
  };
}

async function forStudent(studentId, now, viewer) {
  const childId = String(studentId || '').trim();
  const earlyJoinMinutes = Number(
    policy.sessionAccess && policy.sessionAccess.earlyJoinMinutes
  ) || 10;
  if (!childId) {
    return { reminders: [], earlyJoinMinutes: earlyJoinMinutes, timezone: timezoneService.forUser(viewer) };
  }

  const sessions = await db.listAllSessions();
  const batch = typeof db.findBatchForStudent === 'function'
    ? await db.findBatchForStudent(childId)
    : null;
  if (!Array.isArray(sessions)) {
    return { reminders: [], earlyJoinMinutes: earlyJoinMinutes, timezone: timezoneService.forUser(viewer) };
  }

  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const reminders = [];

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (!session || !session.id || session.studentId !== childId) continue;
    if (CLOSED.indexOf(String(session.status || '').toLowerCase()) !== -1) continue;

    const start = startMs(session);
    if (start === null) continue;
    const until = start - current;
    if (until > LOOKAHEAD_MS || until < -PAST_MS) continue;

    const minutesUntil = Math.max(0, Math.ceil(until / 60000));
    const copy = describe(minutesUntil, earlyJoinMinutes);
    const zone = timezoneService.forUser(viewer, session.studentTimezone || session.timezone);
    const local = timezoneService.format(session.startsAt || session.scheduledAt || session.date, zone);
    reminders.push({
      id: session.id + ':reminder',
      sessionId: session.id,
      title: String(session.title || 'Mathify 1:1').slice(0, 160),
      batchId: session.batchCode || (batch && batch.code) || session.batchId || null,
      startsAt: session.startsAt || session.scheduledAt || session.date,
      localStart: local ? local.text : null,
      timezone: zone,
      minutesUntil: minutesUntil,
      phase: copy.phase,
      message: copy.message,
      joinUrl: joinUrl(session)
    });
  }

  reminders.sort(function (left, right) {
    return left.minutesUntil - right.minutesUntil;
  });
  return {
    reminders: reminders,
    earlyJoinMinutes: earlyJoinMinutes,
    timezone: timezoneService.forUser(viewer)
  };
}

module.exports = { forStudent, joinUrl };
