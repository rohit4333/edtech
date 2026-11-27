const assert = require('assert');
const db = require('../db');
const presenceService = require('../services/presenceService');

const trainer = db.findUserById('usr_trainer_001');
const student = db.findUserById('usr_student_001');
const sessionA = db.findSession('ses_math_002');
const sessionB = db.findSession('ses_math_003');

async function run() {
/* Role comes from the signed-in user and the session, never from a body field. */
assert.strictEqual(presenceService.roleForUser(sessionA, trainer), 'trainer');
assert.strictEqual(presenceService.roleForUser(sessionA, student), 'student');
assert.strictEqual(presenceService.roleForUser(sessionA, { id: 'other', role: 'trainer' }), null);

const withUids = Object.assign({}, sessionA, {
  rtc: { provider: 'livekit', uids: { trainer: 1001, student: 2001 } }
});
assert.strictEqual(presenceService.roleForUid(withUids, 1001), 'trainer');
assert.strictEqual(presenceService.roleForUid(withUids, 2001), 'student');
assert.strictEqual(presenceService.roleForUid(withUids, 9999), null);

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
assert.strictEqual(paid.participants.trainer.activeMinutes, 16);
assert.strictEqual(paid.trainerPresent, true);
assert.strictEqual(paid.studentPresent, false);
assert.strictEqual(paid.payoutEligible, true);
assert.strictEqual(paid.payoutBlocked, false);

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
assert.strictEqual(unpaid.participants.trainer.activeMinutes, 10);
assert.strictEqual(unpaid.trainerPresent, false);
assert.strictEqual(unpaid.payoutEligible, false);
assert.strictEqual(unpaid.payoutBlocked, true);

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
assert.strictEqual(beats[0].learningEvents, 3);
assert.strictEqual(beats[1].learningEvents, 2);
assert.strictEqual(beats[1].cumulativeLearningEvents, 5);
assert.strictEqual(beats[1].role, 'trainer');

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
assert.strictEqual(withStudent.payoutRequirement.studentJoined, true);
assert.strictEqual(withStudent.payoutRequirement.requiredTrainerMinutes, 50);
assert.strictEqual(withStudent.payoutEligible, false);

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
assert.strictEqual(fullClass.trainerActiveSecondsInWindow, 55 * 60);
assert.strictEqual(fullClass.payoutRequirement.satisfied, true);
assert.strictEqual(fullClass.payoutEligible, true);

console.log('presenceService: 24 assertions passed');
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
