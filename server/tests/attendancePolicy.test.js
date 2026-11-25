const assert = require('assert');
const attendancePolicy = require('../services/attendancePolicy');
const policy = require('../config/policy.json');

const trainerLeave = {
  id: 'lv_t',
  status: 'cancelled',
  cancelledBy: 'trainer',
  scheduledAt: '2026-11-30T10:00:00.000Z',
  cancelledAt: '2026-11-27T10:00:00.000Z'
};
assert.strictEqual(attendancePolicy.isMutualLeave(trainerLeave, policy), true);
assert.strictEqual(attendancePolicy.studentSessionStatus(trainerLeave, policy), 'leave');

const studentLeave = {
  id: 'lv_s',
  status: 'cancelled',
  cancelledBy: 'student',
  scheduledAt: '2026-11-30T10:00:00.000Z',
  cancelledAt: '2026-11-27T10:00:00.000Z'
};
assert.strictEqual(attendancePolicy.isMutualLeave(studentLeave, policy), true);
assert.strictEqual(attendancePolicy.studentSessionStatus(studentLeave, policy), 'leave');

const lateTrainerCancel = {
  id: 'late_t',
  status: 'cancelled',
  cancelledBy: 'trainer',
  scheduledAt: '2026-11-30T10:00:00.000Z',
  cancelledAt: '2026-11-29T12:00:00.000Z'
};
assert.strictEqual(attendancePolicy.isLateTrainerCancellation(lateTrainerCancel, policy), true);
assert.strictEqual(attendancePolicy.studentSessionStatus(lateTrainerCancel, policy), 'unattended');
assert.strictEqual(attendancePolicy.effectiveStudentStatus(lateTrainerCancel, 'present', policy), 'unattended');

const noShow = { id: 'ns', status: 'no_show', trainerId: 't1' };
assert.strictEqual(attendancePolicy.isMutualLeave(noShow, policy), false);
assert.strictEqual(attendancePolicy.studentSessionStatus(noShow, policy), 'no_show');

const missingNotice = {
  id: 'unknown',
  status: 'cancelled',
  cancelledBy: 'trainer',
  scheduledAt: '2026-11-30T10:00:00.000Z'
};
assert.strictEqual(attendancePolicy.isLateTrainerCancellation(missingNotice, policy), false);

console.log('attendancePolicy: 10 assertions passed');
