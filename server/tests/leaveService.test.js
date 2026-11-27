const assert = require('assert');
const db = require('../db');
const attendancePolicy = require('../services/attendancePolicy');
const leaveService = require('../services/leaveService');
const policy = require('../config/policy.json');

async function main() {
  const trainer = await Promise.resolve(db.findUserById('usr_trainer_001'));
  const student = await Promise.resolve(db.findUserById('usr_student_001'));

  const rules = leaveService.leaveRules();
  assert.strictEqual(rules.noticeDays, 2);
  assert.strictEqual(rules.noticeHours, 48);
  assert.strictEqual(rules.mutual, true);
  assert.strictEqual(rules.packPenalty, false);

  const initial = await leaveService.balanceFor(trainer);
  assert.strictEqual(initial.total, 8);
  assert.strictEqual(initial.used, 0);
  assert.strictEqual(initial.remaining, 8);
  assert.strictEqual(await leaveService.balanceFor(student), null);

  const before = await leaveService.list(trainer);
  assert.strictEqual(before.sessions.length, 2);
  assert.strictEqual(before.sessions[0].eligible, true);
  assert.strictEqual(before.sessions[0].date, '2026-11-30');

  const target = before.sessions[0].id;
  const applied = await leaveService.apply(trainer, { sessionId: target, reason: 'Personal time' });
  assert.strictEqual(applied.request.status, 'approved');
  assert.strictEqual(applied.request.autoApproved, true);
  assert.strictEqual(applied.request.trainerPayout, 0);
  assert.strictEqual(applied.request.packPenalty, false);
  assert.strictEqual(applied.request.studentStatus, 'leave');
  assert.strictEqual(applied.balance.remaining, 7);

  const sessionAfter = await Promise.resolve(db.findSession(target));
  assert.strictEqual(sessionAfter.status, 'leave');
  assert.strictEqual(attendancePolicy.isMutualLeave(sessionAfter, policy), true);
  assert.strictEqual((await Promise.resolve(db.listAttendanceForSession(target)))[0].status, 'leave');

  const after = await leaveService.list(trainer);
  assert.strictEqual(after.balance.used, 1);
  assert.strictEqual(after.balance.remaining, 7);
  assert.strictEqual(after.requests.length, 1);
  assert.strictEqual(after.sessions.find((row) => row.id === target).hasLeave, true);

  /* A student-initiated leave is mutual but does not consume a trainer credit. */
  let rejected = false;
  try {
    await leaveService.apply(student, { sessionId: target });
  } catch (error) {
    rejected = error.code === 'SESSION_NOT_OPEN';
  }
  assert.strictEqual(rejected, true);

  const studentTarget = before.sessions[1].id;
  const studentLeave = await leaveService.apply(student, { sessionId: studentTarget });
  assert.strictEqual(studentLeave.request.requestedByRole, 'student');
  assert.strictEqual(studentLeave.balance, null);
  assert.strictEqual((await leaveService.balanceFor(trainer)).remaining, 7);

  let founderRejected = false;
  try {
    await leaveService.apply({ id: 'usr_founder_001', role: 'founder' }, { sessionId: studentTarget });
  } catch (error) {
    founderRejected = error.code === 'FORBIDDEN';
  }
  assert.strictEqual(founderRejected, true);

  console.log('leaveService: 29 assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
