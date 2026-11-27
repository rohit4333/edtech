const assert = require('assert');
const db = require('../db');
const presenceService = require('../services/presenceService');
const sessionTiming = require('../services/sessionTimingService');

const trainer = db.findUserById('usr_trainer_001');
const student = db.findUserById('usr_student_001');
const sessionA = db.findSession('ses_math_002');
const sessionB = db.findSession('ses_math_003');

let assertions = 0;
function check(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
  assertions += 1;
}

async function run() {
/* Role comes from the signed-in user and the session, never from a body field. */
check(presenceService.roleForUser(sessionA, trainer), 'trainer');
check(presenceService.roleForUser(sessionA, student), 'student');
check(presenceService.roleForUser(sessionA, { id: 'other', role: 'trainer' }), null);

const withUids = Object.assign({}, sessionA, {
  rtc: { provider: 'livekit', uids: { trainer: 1001, student: 2001 } }
});
check(presenceService.roleForUid(withUids, 1001), 'trainer');
check(presenceService.roleForUid(withUids, 2001), 'student');
check(presenceService.roleForUid(withUids, 9999), null);

/* 16 verified trainer minutes pay even when the student never joins. */
db.insertPresenceEvent({
  sessionId: sessionA.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_join',
  at: '2026-11-30T12:30:00.000Z'
});
db.insertPresenceEvent({
  sessionId: sessionA.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_leave',
  at: '2026-11-30T12:46:00.000Z'
});

const paid = await presenceService.compute(sessionA, '2026-11-30T12:46:00.000Z');
check(paid.participants.trainer.activeMinutes, 16);
check(paid.trainerPresent, true);
check(paid.studentPresent, false);
check(paid.studentStillPresent, false);
check(paid.studentCountedSeconds, 0);
check(paid.payoutEligible, true);
check(paid.payoutBlocked, false);

/* Under 15 minutes blocks pay and is reported as a blocker. */
db.insertPresenceEvent({
  sessionId: sessionB.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_join',
  at: '2026-12-03T12:30:00.000Z'
});
db.insertPresenceEvent({
  sessionId: sessionB.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_leave',
  at: '2026-12-03T12:40:00.000Z'
});

const unpaid = await presenceService.compute(sessionB, '2026-12-03T12:40:00.000Z');
check(unpaid.participants.trainer.activeMinutes, 10);
check(unpaid.participants.trainer.countedSeconds, 10 * 60);
check(unpaid.trainerPresent, false);
check(unpaid.payoutEligible, false);
check(unpaid.payoutBlocked, true);

/* Heartbeats report cumulative learning events; the service stores only deltas. */
await presenceService.heartbeat(trainer, sessionA, {
  active: true,
  learningEvents: 3
}, '2026-11-30T12:47:00.000Z');
await presenceService.heartbeat(trainer, sessionA, {
  active: true,
  learningEvents: 5
}, '2026-11-30T12:47:20.000Z');

const beats = (await db.listPresenceEvents(sessionA.id)).slice(-2);
check(beats[0].learningEvents, 3);
check(beats[1].learningEvents, 2);
check(beats[1].cumulativeLearningEvents, 5);
check(beats[1].role, 'trainer');

/* Once the student joins, 15 trainer minutes are no longer enough: the
   confirmed class length is 50 minutes. */
db.insertPresenceEvent({
  sessionId: sessionA.id,
  userId: student.id,
  role: 'student',
  kind: 'livekit_join',
  at: '2026-11-30T12:31:00.000Z'
});
const withStudent = await presenceService.compute(sessionA, '2026-11-30T12:46:00.000Z');
check(withStudent.payoutRequirement.studentJoined, true);
check(withStudent.payoutRequirement.requiredTrainerMinutes, 50);
check(withStudent.studentCountedSeconds, 15 * 60);
check(withStudent.studentStillPresent, true);
check(withStudent.payoutEligible, false);

db.insertPresenceEvent({
  sessionId: sessionA.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_join',
  at: '2026-11-30T12:46:00.000Z'
});
db.insertPresenceEvent({
  sessionId: sessionA.id,
  userId: trainer.id,
  role: 'trainer',
  kind: 'livekit_leave',
  at: '2026-11-30T13:25:00.000Z'
});
const fullClass = await presenceService.compute(sessionA, '2026-11-30T13:25:00.000Z');
check(fullClass.trainerActiveSecondsInWindow, 55 * 60);
check(fullClass.payoutRequirement.satisfied, true);
check(fullClass.studentCountedSeconds, 54 * 60);
check(fullClass.studentStillPresent, true);
check(fullClass.payoutEligible, true);

/* The child gate needs 35 counted child minutes as well as 50 trainer minutes. */
function gateSession(id) {
  return Object.assign({}, sessionA, {
    id: id,
    scheduledAt: '2026-12-06T10:00:00.000Z',
    startsAt: '2026-12-06T10:00:00.000Z',
    status: 'ended'
  });
}
function insertGateEvents(sessionId, rows) {
  rows.forEach(function (row) {
    db.insertPresenceEvent({
      sessionId: sessionId,
      userId: row.role === 'trainer' ? trainer.id : student.id,
      role: row.role,
      kind: row.kind,
      at: row.at
    });
  });
}
const gateUnderSession = gateSession('unit_presence_gate_under');
insertGateEvents(gateUnderSession.id, [
  { role: 'trainer', kind: 'livekit_join', at: '2026-12-06T10:00:00.000Z' },
  { role: 'trainer', kind: 'livekit_leave', at: '2026-12-06T10:55:00.000Z' },
  { role: 'student', kind: 'livekit_join', at: '2026-12-06T10:00:00.000Z' },
  { role: 'student', kind: 'livekit_leave', at: '2026-12-06T10:34:00.000Z' }
]);
const gateUnder = await presenceService.compute(gateUnderSession, '2026-12-06T10:56:00.000Z');
check(gateUnder.studentCountedSeconds, 34 * 60);
check(gateUnder.studentStillPresent, false);
check(gateUnder.studentPayGateMet, false);
check(gateUnder.payoutEligible, false);
check(sessionTiming.minimumQuota(gateUnder).reached, false);

const gateMetSession = gateSession('unit_presence_gate_met');
insertGateEvents(gateMetSession.id, [
  { role: 'trainer', kind: 'livekit_join', at: '2026-12-06T10:00:00.000Z' },
  { role: 'trainer', kind: 'livekit_leave', at: '2026-12-06T10:55:00.000Z' },
  { role: 'student', kind: 'livekit_join', at: '2026-12-06T10:00:00.000Z' }
]);
const gateMet = await presenceService.compute(gateMetSession, '2026-12-06T10:56:00.000Z');
check(gateMet.studentCountedSeconds, 56 * 60);
check(gateMet.studentStillPresent, true);
check(gateMet.studentPayGateMet, true);
check(gateMet.payoutEligible, true);
check(sessionTiming.minimumQuota(gateMet).reached, true);

/* A drop must pause the clock without erasing it; a verified rejoin must show
   the trainer as live again and resume from the summed interval total. */
const reconnectSession = Object.assign({}, sessionB, {
  id: 'unit_presence_reconnect',
  scheduledAt: '2026-12-06T10:00:00.000Z',
  startsAt: '2026-12-06T10:00:00.000Z',
  status: 'live'
});
[
  { kind: 'livekit_join', at: '2026-12-06T10:00:00.000Z' },
  { kind: 'livekit_leave', at: '2026-12-06T10:10:00.000Z' },
  { kind: 'livekit_join', at: '2026-12-06T10:20:00.000Z' }
].forEach(function (event) {
  db.insertPresenceEvent({
    sessionId: reconnectSession.id,
    userId: trainer.id,
    role: 'trainer',
    kind: event.kind,
    at: event.at
  });
});
const reconnect = await presenceService.compute(reconnectSession, '2026-12-06T10:25:00.000Z');
check(reconnect.participants.trainer.countedSeconds, 15 * 60);
check(reconnect.participants.trainer.state, 'joined');
check(reconnect.trainerTimerRunning, true);

console.log('presenceService: ' + assertions + ' assertions passed');
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
