const assert = require('assert');
const db = require('../db');
const presenceService = require('../services/presenceService');

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
check(fullClass.payoutEligible, true);

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
