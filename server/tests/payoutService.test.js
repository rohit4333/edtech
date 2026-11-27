const assert = require('assert');
const payout = require('../services/payoutService');
const sessionTiming = require('../services/sessionTimingService');

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
assert.strictEqual(result.amount.value, 6350);
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
assert.strictEqual(noShowResult.amount.value, 2000);

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
assert.strictEqual(presenceResult.amount.value, 2000);

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
assert.strictEqual(slotPayResult.amount.value, 2315);

/* Late bands apply only when the child joined. Without a child, a trainer who
   reaches 15 counted minutes earns full pay even after a seven-minute join;
   full active minutes between 50 and 55 add 5 INR each while the child is present. */
const timingStart = '2026-11-14T10:00:00.000Z';
const timedSessions = [
  {
    id: 'no_child_late_full',
    trainerId: 't7',
    scheduledAt: timingStart,
    startedAt: timingStart,
    status: 'ended',
    presence: {
      trainerJoinedAt: '2026-11-14T10:07:00.000Z',
      trainerActiveSecondsInWindow: 16 * 60,
      trainerCountedSeconds: 16 * 60,
      payoutEligible: true
    }
  },
  {
    id: 'stretch_full',
    trainerId: 't7',
    scheduledAt: timingStart,
    startedAt: timingStart,
    status: 'ended',
    presence: {
      trainerJoinedAt: timingStart,
      studentJoinedAt: timingStart,
      studentStillPresent: true,
      studentCountedSeconds: 35 * 60,
      studentActiveSecondsInWindow: 35 * 60,
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      payoutEligible: true
    }
  }
];
const timedResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  timedSessions,
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(timedResult.amount.breakdown.basePay, 700);
assert.strictEqual(timedResult.amount.breakdown.stretchPay, 25);
assert.strictEqual(timedResult.amount.value, 2725);
const noChildLateRow = timedResult.sessionTiming.sessions.find(function (row) {
  return row.sessionId === 'no_child_late_full';
});
assert.strictEqual(noChildLateRow.studentJoined, false);
assert.strictEqual(noChildLateRow.factor, 1);
assert.strictEqual(noChildLateRow.fine, 0);

/* The same 55 minutes do not pay the stretch once the child has left. */
const childLeftSession = Object.assign({}, timedSessions[1], {
  id: 'stretch_child_left',
  presence: Object.assign({}, timedSessions[1].presence, { studentStillPresent: false })
});
const childLeftResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [childLeftSession],
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(childLeftResult.amount.breakdown.stretchPay, 0);
assert.strictEqual(childLeftResult.amount.breakdown.basePay, 350);
assert.strictEqual(childLeftResult.sessionTiming.sessions[0].stretchPay, 0);

/* Child pay gate: 34 counted child minutes block all pay, pay no stretch and
   charge exactly one student-gate fine. A 7-minute late join must not add a
   second late-join fine on top of it. */
const gateUnmetStart = '2026-11-16T10:00:00.000Z';
const gateUnmetSession = Object.assign(
  session('gate_unmet', 't7', gateUnmetStart, 'ended'),
  {
    scheduledAt: gateUnmetStart,
    presence: {
      trainerJoinedAt: '2026-11-16T10:07:00.000Z',
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: gateUnmetStart,
      studentCountedSeconds: 34 * 60,
      studentActiveSecondsInWindow: 34 * 60,
      studentStillPresent: true,
      payoutEligible: false
    }
  }
);
const gateUnmetTiming = sessionTiming.evaluatePayoutTiming(gateUnmetSession);
assert.strictEqual(gateUnmetTiming.factor, 0);
assert.ok(gateUnmetTiming.fine >= 1);
const gateUnmetResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [gateUnmetSession],
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(gateUnmetResult.amount.breakdown.basePay, 0);
assert.strictEqual(gateUnmetResult.amount.breakdown.stretchPay, 0);
assert.strictEqual(gateUnmetResult.amount.breakdown.fines, 350);
assert.strictEqual(gateUnmetResult.amount.value, 2000);
assert.strictEqual(gateUnmetResult.fines.entries.filter(function (entry) {
  return entry.basis === 'student_pay_gate_one_session_pay';
}).length, 1);
assert.strictEqual(gateUnmetResult.fines.entries.some(function (entry) {
  return entry.basis === 'late_join_one_session_pay';
}), false);

/* The same session pays in full, including the stretch, once the child has 35
   counted minutes; leaving then blocks only the stretch, not the base pay. */
const gateMetSession = Object.assign({}, gateUnmetSession, {
  id: 'gate_met',
  presence: Object.assign({}, gateUnmetSession.presence, {
    trainerJoinedAt: gateUnmetStart,
    studentCountedSeconds: 35 * 60,
    studentActiveSecondsInWindow: 35 * 60,
    payoutEligible: true
  })
});
const gateMetResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [gateMetSession],
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(gateMetResult.amount.breakdown.basePay, 350);
assert.strictEqual(gateMetResult.amount.breakdown.stretchPay, 25);
assert.strictEqual(gateMetResult.amount.value, 2375);
assert.strictEqual(gateMetResult.fines.entries.length, 0);

const gateMetLeftSession = Object.assign({}, gateMetSession, {
  id: 'gate_met_left',
  presence: Object.assign({}, gateMetSession.presence, { studentStillPresent: false })
});
const gateMetLeftResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [gateMetLeftSession],
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(gateMetLeftResult.amount.breakdown.basePay, 350);
assert.strictEqual(gateMetLeftResult.amount.breakdown.stretchPay, 0);
assert.strictEqual(gateMetLeftResult.amount.value, 2350);

/* Without a child, the trainer still needs 15 counted minutes. Under that,
   pay is blocked and one session-pay is charged for both class types. */
const shortPresenceSession = Object.assign(
  session('short', 't7', '2026-11-15T10:00:00.000Z', 'ended'),
  {
    presence: {
      trainerJoinedAt: '2026-11-15T10:00:00.000Z',
      trainerActiveSecondsInWindow: 10 * 60,
      trainerCountedSeconds: 10 * 60,
      payoutEligible: false
    }
  }
);
const shortResult = payout.buildPayout(
  { id: 't7', name: 'G', role: 'trainer', payPerSession: 350, attendanceBonusStreak: 0 },
  [shortPresenceSession],
  '2026-11',
  policy,
  { trainers: [], allSessions: [], attendance: [] }
);
assert.strictEqual(shortResult.amount.breakdown.basePay, 0);
assert.strictEqual(shortResult.amount.breakdown.fines, 350);
assert.strictEqual(shortResult.amount.value, 2000);
assert.strictEqual(shortResult.fines.entries[0].basis, 'trainer_short_presence_one_session_pay');

/* Founder's Gratitude Gift: a protected, statement-level credit that is not
   prorated, not per-session and never revoked by session outcomes. */
const gratitude = policy.payout.founderGratitude;
assert.strictEqual(gratitude.amount, 2000);
assert.strictEqual(gratitude.currency, 'INR');
assert.strictEqual(gratitude.creditDay, 1);
assert.strictEqual(gratitude.label, 'Founder’s Gratitude Gift');
assert.strictEqual(gratitude.note,
  'Founder’s Gratitude Gift: ₹2,000 is credited to every trainer’s balance sheet on the first day of each month as a standing, non-revocable acknowledgement of faithful service, steady reliability, and the hard work they bring to every child’s learning. This credit is protected from deductions, cancellations and reversals, and may be adjusted only by the founder.');

const gratitudeUser = {
  id: 'tg', name: 'Gratitude Trainer', role: 'trainer',
  payPerSession: 350, attendanceBonusStreak: 0
};
const gratitudeContext = { trainers: [], allSessions: [], attendance: [], provenance: 'test' };
const gratitudeSession = Object.assign(
  session('g1', 'tg', '2026-11-03T10:00:00.000Z', 'ended'),
  { scheduledAt: '2026-11-03T10:00:00.000Z' }
);
const gratitudeSecond = Object.assign({}, gratitudeSession, {
  id: 'g2',
  startedAt: '2026-11-04T10:00:00.000Z',
  scheduledAt: '2026-11-04T10:00:00.000Z'
});
const withoutFounderCreditPolicy = Object.assign({}, policy, {
  payout: Object.assign({}, policy.payout)
});
delete withoutFounderCreditPolicy.payout.founderGratitude;

const creditStatement = payout.buildPayout(
  gratitudeUser, [gratitudeSession], '2026-11', policy, gratitudeContext
);
const plainStatement = payout.buildPayout(
  gratitudeUser, [gratitudeSession], '2026-11', withoutFounderCreditPolicy, gratitudeContext
);
assert.strictEqual(creditStatement.amount.breakdown.founderGratitude, 2000);
assert.strictEqual(plainStatement.amount.breakdown.founderGratitude, 0);
assert.strictEqual(creditStatement.amount.value, plainStatement.amount.value + 2000);
assert.strictEqual(creditStatement.amount.breakdown.basePay, plainStatement.amount.breakdown.basePay);
assert.strictEqual(creditStatement.amount.breakdown.fines, plainStatement.amount.breakdown.fines);
assert.deepStrictEqual(creditStatement.sessionTiming.sessions, plainStatement.sessionTiming.sessions);

const noSessionStatement = payout.buildPayout(
  gratitudeUser, [], '2026-11', policy, gratitudeContext
);
const twoSessionStatement = payout.buildPayout(
  gratitudeUser, [gratitudeSession, gratitudeSecond], '2026-11', policy, gratitudeContext
);
assert.strictEqual(noSessionStatement.amount.breakdown.founderGratitude, 2000);
assert.strictEqual(twoSessionStatement.amount.breakdown.founderGratitude, 2000);
assert.strictEqual(twoSessionStatement.amount.value,
  twoSessionStatement.amount.breakdown.basePay + 2000);
assert.ok(!creditStatement.sessionTiming.sessions.some(function (row) {
  return 'founderGratitude' in row;
}));

const invalidPeriodStatement = payout.buildPayout(
  gratitudeUser, [gratitudeSession], 'not-a-period', policy, gratitudeContext
);
assert.strictEqual(invalidPeriodStatement.amount.breakdown.founderGratitude, 0);
const missingAmountPolicy = Object.assign({}, policy, {
  payout: Object.assign({}, policy.payout, { founderGratitude: { currency: 'INR' } })
});
assert.strictEqual(payout.buildPayout(
  gratitudeUser, [gratitudeSession], '2026-11', missingAmountPolicy, gratitudeContext
).amount.breakdown.founderGratitude, 0);

/* Even when fines exceed every other earning, the protected credit stays at
   2,000 and the total is floored at the credit amount. */
const cancelledWithFine = [];
for (let index = 0; index < 10; index += 1) {
  cancelledWithFine.push({
    id: 'gf_' + index,
    trainerId: 'tg',
    status: 'cancelled',
    cancelledBy: 'trainer',
    scheduledAt: '2026-11-20T10:00:00.000Z',
    startsAt: '2026-11-20T10:00:00.000Z',
    cancelledAt: '2026-11-19T10:00:00.000Z',
    startedAt: '2026-11-20T10:00:00.000Z'
  });
}
const finedStatement = payout.buildPayout(
  gratitudeUser, cancelledWithFine, '2026-11', policy,
  { trainers: [], allSessions: cancelledWithFine, attendance: [], provenance: 'test' }
);
assert.ok(finedStatement.amount.breakdown.fines > finedStatement.amount.breakdown.basePay + 2000);
assert.strictEqual(finedStatement.amount.breakdown.founderGratitude, 2000);
assert.ok(finedStatement.amount.value >= 2000);
assert.strictEqual(finedStatement.amount.value, 2000);

function keysMatching(value, pattern, found) {
  if (!value || typeof value !== 'object') return found;
  Object.keys(value).forEach(function (key) {
    if (pattern.test(key)) found.push(key);
    keysMatching(value[key], pattern, found);
  });
  return found;
}
assert.deepStrictEqual(keysMatching(finedStatement, /revoke|revocation/i, []), []);

console.log('payoutService: all assertions passed');
