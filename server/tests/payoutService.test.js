const assert = require('assert');
const payout = require('../services/payoutService');

const policy = require('../config/policy.json');

function session(id, trainerId, startedAt, status) {
  return { id: id, trainerId: trainerId, startedAt: startedAt, status: status };
}

assert.strictEqual(payout.rateFor({ payPerSession: 120 }, policy.payout), 300);
assert.strictEqual(payout.rateFor({ payPerSession: 900 }, policy.payout), 400);
assert.strictEqual(payout.rateFor({ payPerSession: 350 }, policy.payout), 350);

const sessions = [
  session('s1', 't1', '2026-11-02T10:00:00.000Z', 'ended'),
  session('s2', 't1', '2026-11-09T10:00:00.000Z', 'ended'),
  session('s3', 't2', '2026-11-03T10:00:00.000Z', 'ended'),
  session('s4', 't2', '2026-11-04T10:00:00.000Z', 'ended'),
  session('s5', 't2', '2026-11-05T10:00:00.000Z', 'ended'),
  session('s6', 't3', '2026-11-06T10:00:00.000Z', 'ended'),
  {
    id: 'c1',
    trainerId: 't1',
    startedAt: '2026-11-20T10:00:00.000Z',
    scheduledAt: '2026-11-20T10:00:00.000Z',
    cancelledAt: '2026-11-19T12:00:00.000Z',
    cancelledBy: 'trainer',
    status: 'cancelled'
  }
];

const fines = payout.cancellationFines(sessions, 350, policy.payout.fineRules);
assert.strictEqual(fines.length, 1);
assert.strictEqual(fines[0].amount, 350);
assert.strictEqual(fines[0].late, true);
assert.strictEqual(payout.cancellationFines(sessions, 300, policy.payout.fineRules)[0].amount, 300);

const onTime = [{
  id: 'c2',
  scheduledAt: '2026-11-28T10:00:00.000Z',
  cancelledAt: '2026-11-25T10:00:00.000Z',
  cancelledBy: 'trainer',
  status: 'cancelled'
}];
assert.strictEqual(payout.cancellationFines(onTime, 350, policy.payout.fineRules).length, 0);

const attendance = [
  { sessionId: 's1', trainerId: 't1', status: 'present' },
  { sessionId: 's2', trainerId: 't1', status: 'present' }
];
const bonus = payout.attendanceBonusFor(
  { id: 't1', attendanceBonusStreak: 0 },
  sessions.filter(function (row) { return row.trainerId === 't1'; }),
  attendance,
  policy.payout.bonusRules
);
assert.strictEqual(bonus.eligible, true);
assert.strictEqual(bonus.bonus, 2000);

const mutualLeaveSession = {
  id: 'l1',
  trainerId: 't1',
  scheduledAt: '2026-11-30T10:00:00.000Z',
  cancelledAt: '2026-11-27T10:00:00.000Z',
  cancelledBy: 'trainer',
  status: 'cancelled'
};
const leaveBonus = payout.attendanceBonusFor(
  { id: 't1', attendanceBonusStreak: 0 },
  sessions.filter(function (row) { return row.trainerId === 't1'; }).concat([mutualLeaveSession]),
  attendance,
  policy.payout.bonusRules,
  policy
);
assert.strictEqual(leaveBonus.eligible, true);
assert.strictEqual(leaveBonus.expectedCount, 2);

const ranking = payout.mvtRanking(
  [
    { id: 't1', name: 'A', role: 'trainer' },
    { id: 't2', name: 'B', role: 'trainer' },
    { id: 't3', name: 'C', role: 'trainer' }
  ],
  sessions,
  '2026-11',
  policy.payout.mvtAwards
);
assert.deepStrictEqual(ranking.map(function (row) { return row.award; }), [3000, 2000, 1000]);

const result = payout.buildPayout(
  {
    id: 't1',
    name: 'A',
    role: 'trainer',
    payPerSession: 350,
    attendanceBonusStreak: 0
  },
  sessions.filter(function (row) { return row.trainerId === 't1'; }),
  '2026-11',
  policy,
  {
    trainers: [
      { id: 't1', name: 'A', role: 'trainer' },
      { id: 't2', name: 'B', role: 'trainer' },
      { id: 't3', name: 'C', role: 'trainer' }
    ],
    allSessions: sessions,
    attendance: attendance,
    provenance: 'test'
  }
);

assert.strictEqual(result.sessionCount, 2);
assert.strictEqual(result.amount.breakdown.basePay, 700);
assert.strictEqual(result.amount.breakdown.attendanceBonus, 2000);
assert.strictEqual(result.amount.breakdown.mvtAward, 2000);
assert.strictEqual(result.amount.breakdown.fines, 350);
assert.strictEqual(result.amount.value, 4350);
assert.strictEqual(result.amount.source, 'calculated');
assert.strictEqual(result.dailySeries.isIllustrative, false);
assert.strictEqual(result.dailySeries.source, 'session_records');
assert.strictEqual(result.knownRules.applied, true);

const noShowSession = session('n1', 't4', '2026-11-10T10:00:00.000Z', 'no_show');
const noShowResult = payout.buildPayout(
  { id: 't4', name: 'D', role: 'trainer', payPerSession: 350 },
  [noShowSession],
  '2026-11',
  policy,
  {
    trainers: [{ id: 't4', name: 'D', role: 'trainer' }],
    allSessions: [noShowSession],
    attendance: [],
    provenance: 'test'
  }
);
assert.strictEqual(payout.isNoShow(noShowSession), true);
assert.strictEqual(noShowResult.sessionCount, 0);
assert.strictEqual(noShowResult.noShows.count, 1);
assert.strictEqual(noShowResult.amount.value, 0);

/* Automated presence gate: an ended session with under 15 trainer minutes is unpaid. */
const presenceBlocked = Object.assign(
  session('p1', 't5', '2026-11-11T10:00:00.000Z', 'ended'),
  { presence: { payoutEligible: false } }
);
const presenceResult = payout.buildPayout(
  { id: 't5', name: 'E', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [presenceBlocked],
  '2026-11',
  policy,
  {
    trainers: [{ id: 't5', name: 'E', role: 'trainer' }],
    allSessions: [presenceBlocked],
    attendance: [],
    provenance: 'test'
  }
);
assert.strictEqual(presenceResult.sessionCount, 0);
assert.strictEqual(presenceResult.amount.value, 0);

/* Unutilised committed-slot hours are added at 30% of the session rate. */
const slotPayResult = payout.buildPayout(
  { id: 't6', name: 'F', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [],
  '2026-11',
  policy,
  {
    trainers: [{ id: 't6', name: 'F', role: 'trainer' }],
    allSessions: [],
    attendance: [],
    slotPay: 315,
    provenance: 'test'
  }
);
assert.strictEqual(slotPayResult.amount.breakdown.slotPay, 315);
assert.strictEqual(slotPayResult.amount.value, 315);

console.log('payoutService: 31 assertions passed');
