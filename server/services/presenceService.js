/* ==========================================================================
   MATHIFY — automated presence tracking.

   Nobody manually checks who joined. Three signals feed an append-only event
   log: browser heartbeats, learning interactions and verified Agora webhooks.
   A state machine replays those events into a per-session snapshot.

   Confirmed payout rule: the trainer is paid only after being actively present
   for at least 15 minutes. Student attendance is tracked separately; a student
   who does not join does not cancel the trainer's payout.
   ========================================================================== */

const db = require('../db');
const appPolicy = require('../config/policy.json');
const sessionTiming = require('./sessionTimingService');

const MINUTE_MS = 60 * 1000;

function rules() {
  const configured = appPolicy.presence || {};
  return {
    heartbeatSeconds: Number(configured.heartbeatSeconds) || 20,
    idleSeconds: Number(configured.idleSeconds) || 45,
    learningWindowSeconds: Number(configured.learningEventWindowSeconds) || 60,
    graceMinutes: Number(configured.graceMinutes) || 10,
    trainerMinPresentMinutes: Number.isFinite(Number(configured.trainerMinPresentMinutes))
      ? Number(configured.trainerMinPresentMinutes) : 15,
    trainerMinPresentWithStudentMinutes: Number.isFinite(
      Number(configured.trainerMinPresentWithStudentMinutes)
    ) ? Number(configured.trainerMinPresentWithStudentMinutes) : 50,
    studentMinPresentMinutes: Number.isFinite(Number(configured.studentMinPresentMinutes))
      ? Number(configured.studentMinPresentMinutes) : 15,
    learningEventsForPresent: Number(configured.learningEventsForPresent) || 3,
    trainerPayRequiresPresence: configured.trainerPayRequiresPresence !== false
  };
}

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  throw error;
}

function sessionStart(session) {
  const value = new Date((session && (session.scheduledAt || session.startsAt || session.startedAt)));
  return value && !Number.isNaN(value.getTime()) ? value.getTime() : null;
}

function roleForUser(session, user) {
  if (!session || !user) return null;
  if (user.role === 'trainer' && session.trainerId === user.id) return 'trainer';
  if (user.role === 'student' && session.studentId === user.id) return 'student';
  return null;
}

function configuredUid(session, role) {
  const rtc = (session && session.rtc) || {};
  const uids = rtc.uids || {};
  const value = rtc[role + 'Uid'] || uids[role] || (session && session[role + 'Uid']);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roleForUid(session, uid) {
  const number = Number(uid);
  if (!Number.isFinite(number)) return null;
  if (configuredUid(session, 'trainer') === number) return 'trainer';
  if (configuredUid(session, 'student') === number) return 'student';
  return null;
}

function eventsFor(sessionId, role) {
  return db.listPresenceEvents(sessionId).filter(function (event) {
    return !role || event.role === role;
  }).sort(function (a, b) {
    return new Date(a.at) - new Date(b.at);
  });
}

function lastHeartbeat(sessionId, role) {
  const heartbeats = eventsFor(sessionId, role).filter(function (event) {
    return event.kind === 'heartbeat';
  });
  return heartbeats.length ? heartbeats[heartbeats.length - 1] : null;
}

function heartbeat(user, session, body, now) {
  const role = roleForUser(session, user);
  if (!role) fail('FORBIDDEN', 'You are not a participant in this session.', 403);

  const input = body || {};
  const previous = lastHeartbeat(session.id, role);
  const cumulative = Number(input.learningEvents);
  const previousCumulative = previous ? Number(previous.cumulativeLearningEvents) || 0 : 0;
  const delta = Number.isFinite(cumulative)
    ? Math.max(0, cumulative - previousCumulative)
    : 0;
  const at = now ? new Date(now).toISOString() : new Date().toISOString();
  const uid = Number(input.agoraUid);
  const event = {
    sessionId: session.id,
    userId: user.id,
    role: role,
    kind: 'heartbeat',
    active: input.active !== false,
    learningEvents: delta,
    cumulativeLearningEvents: Number.isFinite(cumulative)
      ? cumulative : previousCumulative,
    agoraUid: Number.isFinite(uid) ? uid : null,
    leaving: input.leaving === true,
    at: at
  };
  return db.insertPresenceEvent(event);
}

const AGORA_KINDS = {
  'user-joined': 'join',
  'join': 'join',
  'user-left': 'leave',
  'leave': 'leave'
};

function agoraEvent(session, payload, now) {
  const input = payload || {};
  const role = roleForUid(session, input.uid);
  const kind = AGORA_KINDS[String(input.event || '').toLowerCase()];
  if (!role || !kind) return null;

  const timestamp = Number(input.timestamp);
  const at = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString()
    : (now ? new Date(now).toISOString() : new Date().toISOString());

  return db.insertPresenceEvent({
    sessionId: session.id,
    userId: role === 'trainer' ? session.trainerId : session.studentId,
    role: role,
    kind: 'agora_' + kind,
    at: at
  });
}

function toMs(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/* Teaching-time evidence is counted only inside the scheduled 55-minute
   window. Overlapping heartbeat and Agora evidence stay separate; the larger
   total wins, matching the existing active-seconds rule. */
function secondsInWindow(intervals, start, end) {
  if (start === null || start === undefined) return 0;
  let total = 0;
  intervals.forEach(function (interval) {
    const from = Math.max(interval[0], start);
    const to = Math.min(interval[1], end === null ? Infinity : end);
    if (to > from) total += (to - from) / 1000;
  });
  return total;
}

function participantState(session, role, events, asOf, config) {
  const userId = role === 'trainer' ? session.trainerId : session.studentId;
  const roleEvents = events.filter(function (event) { return event.role === role; });
  const start = sessionStart(session);
  const graceEnd = start === null ? null : start + config.graceMinutes * MINUTE_MS;
  const idleMs = config.idleSeconds * 1000;
  const capSeconds = config.heartbeatSeconds * 2;

  let joinedAt = null;
  let leftAt = null;
  let lastSeenAt = null;
  let lastActiveAt = null;
  let heartbeatSeconds = 0;
  let learningEvents = 0;
  const heartbeatIntervals = [];
  const agoraIntervals = [];
  let agoraJoinedAt = null;

  roleEvents.forEach(function (event) {
    const at = toMs(event.at);
    if (at === null) return;
    lastSeenAt = Math.max(lastSeenAt || 0, at);

    if (event.kind === 'agora_join') {
      agoraJoinedAt = agoraJoinedAt || at;
      joinedAt = joinedAt === null ? at : Math.min(joinedAt, at);
    } else if (event.kind === 'agora_leave') {
      if (agoraJoinedAt !== null) agoraIntervals.push([agoraJoinedAt, Math.max(at, agoraJoinedAt)]);
      agoraJoinedAt = null;
      leftAt = leftAt === null ? at : Math.max(leftAt, at);
      lastActiveAt = null;
    } else if (event.kind === 'heartbeat') {
      learningEvents += Number(event.learningEvents) || 0;
      if (event.active) {
        joinedAt = joinedAt === null ? at : Math.min(joinedAt, at);
        if (lastActiveAt !== null) {
          const delta = (at - lastActiveAt) / 1000;
          if (delta > 0) {
            heartbeatSeconds += Math.min(delta, capSeconds);
            heartbeatIntervals.push([lastActiveAt, at]);
          }
        }
        lastActiveAt = at;
      } else {
        lastActiveAt = null;
      }
      if (event.leaving) {
        leftAt = leftAt === null ? at : Math.max(leftAt, at);
        lastActiveAt = null;
      }
    }
  });

  if (agoraJoinedAt !== null) agoraIntervals.push([agoraJoinedAt, asOf]);

  const agoraSeconds = agoraIntervals.reduce(function (total, interval) {
    return total + Math.max(0, (interval[1] - interval[0]) / 1000);
  }, 0);
  const activeSeconds = Math.max(heartbeatSeconds, agoraSeconds);
  const activeMinutes = Math.floor(activeSeconds / 60);
  const windowEnd = sessionTiming.completionWindowEnd(session);
  const activeSecondsInWindow = Math.max(
    secondsInWindow(heartbeatIntervals, start, windowEnd),
    secondsInWindow(agoraIntervals, start, windowEnd)
  );

  const noShow = joinedAt === null && graceEnd !== null && asOf >= graceEnd;
  let state;
  if (session.status === 'leave') state = 'leave';
  else if (noShow) state = 'no_show';
  else if (joinedAt === null) state = 'invited';
  else if (leftAt !== null) state = 'left';
  else if (lastActiveAt !== null && asOf - lastActiveAt > idleMs) state = 'idle';
  else if (lastActiveAt === null) state = 'joined';
  else state = 'active';

  const requiredMinutes = role === 'trainer'
    ? config.trainerMinPresentMinutes : config.studentMinPresentMinutes;
  const meetsMinimum = activeMinutes >= requiredMinutes;
  const joinedLate = joinedAt !== null && graceEnd !== null && joinedAt > graceEnd;

  let attendance = null;
  if (session.status === 'leave') attendance = 'leave';
  else if (noShow || state === 'invited') attendance = 'absent';
  else if (meetsMinimum || (learningEvents >= config.learningEventsForPresent && activeMinutes >= 10)) attendance = 'present';
  else if (joinedLate) attendance = 'late';
  else attendance = 'absent';

  return {
    userId: userId,
    state: state,
    joinedAt: joinedAt === null ? null : new Date(joinedAt).toISOString(),
    leftAt: leftAt === null ? null : new Date(leftAt).toISOString(),
    lastSeenAt: lastSeenAt === null ? null : new Date(lastSeenAt).toISOString(),
    activeSeconds: Math.round(activeSeconds),
    activeMinutes: activeMinutes,
    activeSecondsInWindow: Math.round(activeSecondsInWindow),
    activeMinutesInWindow: Math.floor(activeSecondsInWindow / 60),
    windowEndsAt: windowEnd ? new Date(windowEnd).toISOString() : null,
    learningEvents: learningEvents,
    requiredMinutes: requiredMinutes,
    meetsMinimum: meetsMinimum,
    joinedLate: joinedLate,
    attendance: attendance
  };
}

function compute(session, now) {
  const config = rules();
  const asOf = now ? new Date(now).getTime() : Date.now();
  const events = eventsFor(session.id);
  const trainer = participantState(session, 'trainer', events, asOf, config);
  const student = participantState(session, 'student', events, asOf, config);

  const sessionOpen = ['leave', 'cancelled', 'canceled', 'no_show', 'noshow', 'no-show']
    .indexOf(String(session.status || '').toLowerCase()) === -1;
  /* A student who never joins does not block pay, but the trainer still has to
     be present. Once the student joins, the confirmed class is 50 minutes. */
  const studentJoined = student.joinedAt !== null;
  const requiredTrainerMinutes = studentJoined
    ? config.trainerMinPresentWithStudentMinutes : config.trainerMinPresentMinutes;
  const trainerMeetsPayout = studentJoined
    ? trainer.activeSecondsInWindow >= requiredTrainerMinutes * MINUTE_MS / 1000
    : trainer.activeMinutes >= requiredTrainerMinutes;
  const payoutEligible = config.trainerPayRequiresPresence
    ? sessionOpen && trainerMeetsPayout
    : sessionOpen;

  return {
    sessionId: session.id,
    computedAt: new Date(asOf).toISOString(),
    source: 'presence_events',
    participants: { trainer: trainer, student: student },
    trainerPresent: trainer.meetsMinimum,
    studentPresent: student.meetsMinimum,
    trainerJoinedAt: trainer.joinedAt,
    studentJoinedAt: student.joinedAt,
    trainerActiveSecondsInWindow: trainer.activeSecondsInWindow,
    trainerNoShow: trainer.state === 'no_show',
    studentNoShow: student.state === 'no_show',
    payoutEligible: payoutEligible,
    payoutBlocked: !payoutEligible,
    payoutRequirement: {
      studentJoined: studentJoined,
      requiredTrainerMinutes: requiredTrainerMinutes,
      satisfied: trainerMeetsPayout,
      source: 'presence_events'
    },
    attendance: { trainer: trainer.attendance, student: student.attendance },
    rule: studentJoined
      ? 'When the student joins, the trainer is paid after 50 active teaching minutes inside the first 55 minutes from the scheduled start.'
      : 'When the student does not join, the trainer is paid after at least 15 active minutes.'
  };
}

function stateFor(session, user, now) {
  const role = roleForUser(session, user);
  const snapshot = compute(session, now);
  return {
    sessionId: session.id,
    viewerRole: role,
    trainer: role === 'trainer' || role === null
      ? snapshot.participants.trainer
      : { state: snapshot.participants.trainer.state },
    student: role === 'student'
      ? snapshot.participants.student
      : { state: snapshot.participants.student.state },
    trainerPresent: snapshot.trainerPresent,
    studentPresent: snapshot.studentPresent,
    trainerJoinedAt: role === 'trainer' || role === null ? snapshot.trainerJoinedAt : undefined,
    studentJoinedAt: snapshot.studentJoinedAt,
    trainerActiveSecondsInWindow: role === 'trainer' || role === null
      ? snapshot.trainerActiveSecondsInWindow : undefined,
    payoutEligible: role === 'trainer' ? snapshot.payoutEligible : undefined,
    payoutRequirement: role === 'trainer' || role === null ? snapshot.payoutRequirement : undefined,
    rules: rules()
  };
}

function finalize(session, now) {
  const snapshot = compute(session, now);
  db.savePresenceSnapshot(snapshot);

  db.updateSession(session.id, function (current) {
    current.presence = {
      trainerPresentMinutes: snapshot.participants.trainer.activeMinutes,
      studentPresentMinutes: snapshot.participants.student.activeMinutes,
      trainerJoinedAt: snapshot.trainerJoinedAt,
      studentJoinedAt: snapshot.studentJoinedAt,
      trainerActiveSecondsInWindow: snapshot.trainerActiveSecondsInWindow,
      trainerActiveMinutesInWindow: snapshot.participants.trainer.activeMinutesInWindow,
      trainerPresent: snapshot.trainerPresent,
      studentPresent: snapshot.studentPresent,
      payoutEligible: snapshot.payoutEligible,
      payoutRequirement: snapshot.payoutRequirement,
      computedAt: snapshot.computedAt,
      source: 'presence_events'
    };
    return current;
  });

  const existing = db.listAttendanceForSession(session.id);
  if (!existing.length && session.status !== 'leave' && snapshot.attendance.student) {
    db.upsertAttendance(session.id, session.studentId, snapshot.attendance.student);
  }

  return snapshot;
}

module.exports = {
  MINUTE_MS: MINUTE_MS,
  rules: rules,
  roleForUser: roleForUser,
  roleForUid: roleForUid,
  heartbeat: heartbeat,
  agoraEvent: agoraEvent,
  compute: compute,
  stateFor: stateFor,
  finalize: finalize
};
