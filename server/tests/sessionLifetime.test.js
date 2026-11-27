/* Regression coverage for the founder-confirmed class lifetime rules:
   demos and regular classes both warn at 50 and close at 55. The browser never
   owns either action; the in-process job publishes a trainer-only warning and
   closes through the same path as the End button. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const payout = require('../services/payoutService');
const presence = require('../services/presenceService');
const policy = require('../config/policy.json');
const sessionTiming = require('../services/sessionTimingService');
const reminders = require('../jobs/reminders');

const MINUTE = 60 * 1000;
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function at(offsetMinutes, from) {
  return new Date((from || Date.now()) + offsetMinutes * MINUTE).toISOString();
}

function sessionOf(id, classType) {
  const session = Object.assign({}, db.findSession(id));
  if (classType) session.classType = classType;
  return session;
}

async function main() {
  const config = sessionTiming.settings();
  check(config.lifetime.regular.durationMinutes === 50 &&
    config.lifetime.regular.warningAtMinutes === 50 &&
    config.lifetime.regular.closeAtMinutes === 55 &&
    config.lifetime.regular.requiredTeachingMinutes === 50,
  'regular classes are 50 minutes, warn at 50 and close at 55');
  check(config.lifetime.demo.durationMinutes === 50 &&
    config.lifetime.demo.warningAtMinutes === 50 &&
    config.lifetime.demo.closeAtMinutes === 55 &&
    config.lifetime.demo.requiredTeachingMinutes === 50 &&
    config.lifetime.demo.completionWindowMinutes === 60,
  'demos warn at 50, close at 55 and require 50 teaching minutes');
  check(config.lifetime.regular.durationMinutes === config.lifetime.demo.durationMinutes &&
    config.lifetime.regular.warningAtMinutes === config.lifetime.demo.warningAtMinutes &&
    config.lifetime.regular.closeAtMinutes === config.lifetime.demo.closeAtMinutes &&
    config.lifetime.regular.requiredTeachingMinutes === config.lifetime.demo.requiredTeachingMinutes,
  'demo and regular class durations never contradict each other');

  const fixed = '2026-12-05T10:00:00.000Z';
  const regular = sessionOf('ses_math_001');
  regular.scheduledAt = fixed;
  regular.startsAt = fixed;
  const demo = sessionOf('ses_math_001', 'demo');
  demo.scheduledAt = fixed;
  demo.startsAt = fixed;

  /* The minimum quota is read from participant counted seconds, not from the
     wall clock: 35 child + 50 trainer with a child, 15 trainer without one. */
  function quotaSnapshot(childSeconds, trainerSeconds, childPresent) {
    const childJoined = childSeconds !== null;
    return {
      sessionId: 'unit_minimum_quota',
      studentJoinedAt: childJoined ? fixed : null,
      studentStillPresent: childJoined ? childPresent === true : false,
      studentCountedSeconds: childJoined ? childSeconds : 0,
      trainerCountedSeconds: trainerSeconds,
      payoutRequirement: {
        studentJoined: childJoined,
        studentPayGateMet: childJoined ? childSeconds >= 35 * 60 : true,
        requiredTrainerMinutes: childJoined ? 50 : 15
      },
      participants: {
        trainer: { countedSeconds: trainerSeconds },
        student: { countedSeconds: childJoined ? childSeconds : 0 }
      }
    };
  }
  const quotaChildShort = sessionTiming.minimumQuota(quotaSnapshot(34 * 60, 50 * 60, true));
  check(quotaChildShort.childJoined === true && quotaChildShort.childStillPresent === true &&
    quotaChildShort.childRequiredSeconds === 35 * 60 &&
    quotaChildShort.childCountedSeconds === 34 * 60 &&
    quotaChildShort.trainerRequiredSeconds === 50 * 60 &&
    quotaChildShort.trainerCountedSeconds === 50 * 60 &&
    quotaChildShort.reached === false && quotaChildShort.cueSeconds === 300,
  'a child under 35 counted seconds never reaches the minimum quota');
  const quotaTrainerShort = sessionTiming.minimumQuota(quotaSnapshot(35 * 60, 49 * 60, true));
  check(quotaTrainerShort.reached === false && quotaTrainerShort.cueSeconds === 300,
  'a trainer under 50 counted seconds never reaches the child-present quota');
  const quotaMet = sessionTiming.minimumQuota(quotaSnapshot(35 * 60, 50 * 60, true));
  check(quotaMet.reached === true && quotaMet.childCountedSeconds === 35 * 60 &&
    quotaMet.trainerCountedSeconds === 50 * 60,
  '35 child plus 50 trainer counted seconds reach the minimum quota');
  const quotaTrainerOnly = sessionTiming.minimumQuota(quotaSnapshot(null, 15 * 60, false));
  check(quotaTrainerOnly.childJoined === false && quotaTrainerOnly.childCountedSeconds === 0 &&
    quotaTrainerOnly.childStillPresent === false &&
    quotaTrainerOnly.trainerRequiredSeconds === 15 * 60 &&
    quotaTrainerOnly.trainerCountedSeconds === 15 * 60 &&
    quotaTrainerOnly.reached === true && quotaTrainerOnly.cueSeconds === 300,
  'without a child, 15 counted trainer seconds reach the minimum quota');
  const quotaTrainerOnlyShort = sessionTiming.minimumQuota(quotaSnapshot(null, 14 * 60 + 59, false));
  check(quotaTrainerOnlyShort.reached === false && quotaTrainerOnlyShort.cueSeconds === 300,
  'under 15 counted trainer seconds never reaches the trainer-only quota');

  const regular49 = sessionTiming.clock(regular, at(49, Date.parse(fixed)), fixed);
  const regular50 = sessionTiming.clock(regular, at(50, Date.parse(fixed)), fixed);
  const regular55 = sessionTiming.clock(regular, at(55, Date.parse(fixed)), fixed);
  check(regular49.warningReached === false && regular49.closeReached === false,
    'a regular class is not warned before 50 minutes');
  check(regular50.warningReached === true && regular50.closeReached === false &&
    regular50.secondsUntilClose === 300,
  'a regular class warns with a five-minute reverse countdown at 50 minutes');
  check(regular55.closeReached === true, 'a regular class reaches its close boundary at 55 minutes');

  const demo49 = sessionTiming.clock(demo, at(49, Date.parse(fixed)), fixed);
  const demo50 = sessionTiming.clock(demo, at(50, Date.parse(fixed)), fixed);
  const demo55 = sessionTiming.clock(demo, at(55, Date.parse(fixed)), fixed);
  check(demo49.warningReached === false && demo49.closeReached === false,
    'a demo is not warned before 50 teaching minutes');
  check(demo50.warningReached === true && demo50.closeReached === false &&
    demo50.secondsUntilClose === 300,
  'a demo warns with a five-minute reverse countdown at 50 minutes');
  check(demo55.closeReached === true, 'a demo reaches its close boundary at 55 minutes');
  check(sessionTiming.evaluateCompletion(demo, 50 * 60).completed === true &&
    sessionTiming.evaluateCompletion(demo, 49 * 60).completed === false,
  'a demo qualifies for pay after 50 active teaching minutes');

  const demoWithChildForBands = Object.assign({}, demo, {
    presence: {
      studentJoinedAt: fixed,
      studentCountedSeconds: 35 * 60,
      studentStillPresent: true
    }
  });
  check(sessionTiming.lateJoin(demoWithChildForBands, at(4.9, Date.parse(fixed))).factor === 1 &&
    sessionTiming.lateJoin(demoWithChildForBands, at(4.9, Date.parse(fixed))).fine === 0,
  'with the child joined, a demo trainer under five minutes late keeps full pay with no fine');
  const demoHalf = sessionTiming.lateJoin(demoWithChildForBands, at(7, Date.parse(fixed)));
  check(demoHalf.factor === 0.5 && demoHalf.fine === 0 && demoHalf.code === 'half_pay',
    'with the child joined, five to ten minutes late gets half pay with no fine');
  const demoNoPay = sessionTiming.lateJoin(demoWithChildForBands, at(12, Date.parse(fixed)));
  check(demoNoPay.factor === 0 && demoNoPay.fine === 0 && demoNoPay.code === 'no_pay',
    'with the child joined, ten to fifteen minutes late gets no pay and no fine');
  const veryLateDemo = sessionTiming.lateJoin(demoWithChildForBands, at(18, Date.parse(fixed)));
  check(veryLateDemo.factor === 0 && veryLateDemo.fine === 0 &&
    veryLateDemo.code === 'no_pay_fine_forfeited',
  'with the child joined, demos share the 15-plus no-pay, no-fine band');
  const demoNoChildTiming = sessionTiming.evaluatePayoutTiming(Object.assign({}, demo, {
    presence: {
      trainerJoinedAt: at(7, Date.parse(fixed)),
      trainerActiveSecondsInWindow: 16 * 60,
      trainerCountedSeconds: 16 * 60,
      payoutEligible: true
    }
  }));
  check(demoNoChildTiming.factor === 1 && demoNoChildTiming.lateApplied === false,
  'late-join pay bands do not scale trainer-only minutes when the child is absent');
  check(sessionTiming.evaluateStretch(Object.assign({}, demo, {
    presence: {
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: fixed,
      studentCountedSeconds: 35 * 60,
      studentActiveSecondsInWindow: 35 * 60,
      studentStillPresent: true
    }
  })).amount === 25,
  'the demo 50-55 stretch pays the same 5 INR per minute as a regular class');
  const demoChildLeft = sessionTiming.evaluateStretch(Object.assign({}, demo, {
    presence: {
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: fixed,
      studentCountedSeconds: 35 * 60,
      studentActiveSecondsInWindow: 35 * 60,
      studentStillPresent: false
    }
  }));
  check(demoChildLeft.amount === 0 && demoChildLeft.code === 'STUDENT_NOT_PRESENT',
  'a child who left does not keep the trainer extra minutes payable');
  const demoChildUnderGate = sessionTiming.evaluateStretch(Object.assign({}, demo, {
    presence: {
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: fixed,
      studentCountedSeconds: 34 * 60,
      studentActiveSecondsInWindow: 34 * 60,
      studentStillPresent: true
    }
  }));
  check(demoChildUnderGate.amount === 0 && demoChildUnderGate.extraMinutes === 0,
  'the stretch is blocked while the child is under 35 counted minutes');

  /* Finalized demos use the same 50-minute teaching threshold as regular
     classes. A demo with the child present pays after 50 counted minutes. */
  const presenceSession = Object.assign({}, demo, {
    id: 'unit_demo_presence',
    status: 'ended',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    scheduledAt: fixed,
    startsAt: fixed,
    startedAt: fixed
  });
  for (const role of ['trainer', 'student']) {
    db.insertPresenceEvent({
      sessionId: presenceSession.id,
      userId: role === 'trainer' ? presenceSession.trainerId : presenceSession.studentId,
      role: role,
      kind: 'livekit_join',
      at: fixed
    });
    db.insertPresenceEvent({
      sessionId: presenceSession.id,
      userId: role === 'trainer' ? presenceSession.trainerId : presenceSession.studentId,
      role: role,
      kind: 'livekit_leave',
      at: at(55, Date.parse(fixed))
    });
  }
  const demoPresence = await presence.compute(presenceSession, at(56, Date.parse(fixed)));
  check(demoPresence.payoutEligible === true &&
    demoPresence.payoutRequirement.requiredTrainerMinutes === 50,
  'finalized demo presence qualifies after 50 teaching minutes');
  check(demoPresence.rule.indexOf('50 active teaching minutes') !== -1 &&
    demoPresence.rule.indexOf('60 minutes') !== -1,
  'the presence rule explains the shared 50-in-60 contract');
  check(demoPresence.studentStillPresent === false,
  'a child who left before the close is not treated as still present');
  const demoQuota = sessionTiming.minimumQuota(demoPresence);
  check(demoQuota.childJoined === true && demoQuota.childCountedSeconds === 55 * 60 &&
    demoQuota.trainerCountedSeconds === 55 * 60 && demoQuota.reached === true &&
    demoQuota.childStillPresent === false && demoQuota.cueSeconds === 300,
  'a real presence snapshot reaches its quota from counted participant seconds');

  const onTimeDemo = Object.assign({}, demo, {
    id: 'unit_demo_on_time',
    status: 'ended',
    startedAt: fixed,
    presence: {
      trainerJoinedAt: fixed,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: fixed,
      studentCountedSeconds: 35 * 60,
      studentActiveSecondsInWindow: 35 * 60,
      studentStillPresent: true,
      trainerActiveSecondsInWindow: 55 * 60,
      payoutEligible: true
    }
  });
  const demoPayout = payout.buildPayout(
    { id: 'unit_trainer', name: 'Unit Trainer', role: 'trainer', payPerSession: 350 },
    [onTimeDemo],
    '2026-12',
    policy,
    { trainers: [], allSessions: [], attendance: [] }
  );
  check(demoPayout.amount.breakdown.basePay === 350,
    'an on-time demo pays the same base rate as a regular class');
  check(demoPayout.amount.breakdown.stretchPay === 25,
    'the extra demo minutes stay a separate full-rate stretch line');
  check(demoPayout.amount.value === 2375,
    'demo pay, stretch and the protected gift are auditable in the total');

  /* A child who joined but stayed under 35 counted minutes blocks all pay and
     raises a single student-gate fine, with no duplicate late-join fine. */
  const gateUnmetDemo = Object.assign({}, demo, {
    id: 'unit_demo_child_gate_unmet',
    status: 'ended',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    scheduledAt: fixed,
    startsAt: fixed,
    startedAt: fixed,
    presence: {
      trainerJoinedAt: at(7, Date.parse(fixed)),
      trainerActiveSecondsInWindow: 55 * 60,
      trainerCountedSeconds: 55 * 60,
      studentJoinedAt: fixed,
      studentCountedSeconds: 34 * 60,
      studentActiveSecondsInWindow: 34 * 60,
      studentStillPresent: true,
      payoutEligible: false
    }
  });
  const gateUnmetTiming = sessionTiming.evaluatePayoutTiming(gateUnmetDemo);
  check(gateUnmetTiming.factor === 0 && gateUnmetTiming.fine >= 1,
  'a child under 35 counted seconds blocks pay and raises one gate fine');
  const gateUnmetPayout = payout.buildPayout(
    { id: 'usr_trainer_001', name: 'Unit Trainer', role: 'trainer', payPerSession: 350 },
    [gateUnmetDemo],
    '2026-12',
    policy,
    { trainers: [], allSessions: [], attendance: [] }
  );
  check(gateUnmetPayout.amount.breakdown.basePay === 0 &&
    gateUnmetPayout.amount.breakdown.stretchPay === 0 &&
    gateUnmetPayout.fines.entries.filter(function (entry) {
      return entry.basis === 'student_pay_gate_one_session_pay';
    }).length === 1 &&
    !gateUnmetPayout.fines.entries.some(function (entry) {
      return entry.basis === 'late_join_one_session_pay';
    }),
  'the child-gate fine is charged once and never doubled by a late-join fine');
  check(gateUnmetPayout.amount.value === 2000,
    'the protected gift floors a child-gate-blocked demo statement at 2000');

  /* HTTP proof: the job emits a warning event to staff while the child stream
     stays clean, and the close path ends the session server-side. */
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data };
  }

  try {
    async function login(email) {
      const result = await request('POST', '/api/auth/login', {
        email: email, password: 'mathify-demo'
      });
      return result.body.token;
    }
    const trainerToken = await login('trainer@mathify.app');
    const studentToken = await login('student@mathify.app');

    const warningId = 'ses_math_003';
    const warningAt = at(-51);
    db.updateSession(warningId, function (session) {
      session.status = 'live';
      session.scheduledAt = warningAt;
      session.startsAt = warningAt;
      session.startedAt = warningAt;
      return session;
    });
    /* One open LiveKit interval from -51 minutes is 50+ counted minutes inside
       the -01:00 pay window, and it anchors the trainer's class clock. A single
       heartbeat at -51 would count zero seconds and could not meet the quota. */
    db.insertPresenceEvent({
      sessionId: warningId,
      userId: 'usr_trainer_001',
      role: 'trainer',
      kind: 'livekit_join',
      at: warningAt
    });

    /* Control: same elapsed wall clock, but no usable counted presence at all. */
    const noCountId = 'ses_math_001';
    const noCountAt = at(-51);
    db.updateSession(noCountId, function (session) {
      session.status = 'live';
      session.scheduledAt = noCountAt;
      session.startsAt = noCountAt;
      session.startedAt = noCountAt;
      return session;
    });

    await reminders.checkSessionLifetime();
    const warnings = await db.listSessionEvents(warningId, 0, 200);
    check(warnings.some(function (event) { return event.event === 'session.warning'; }),
      'the lifetime job publishes a one-shot class-warning event');
    const warningEvent = warnings.find(function (event) { return event.event === 'session.warning'; });
    check(Boolean(warningEvent) && warningEvent.payload.countdownSeconds === 300 &&
      warningEvent.payload.minimumQuotaReached === true &&
      warningEvent.payload.childPresent === false,
    'the warning payload announces a reached quota, five-minute cue and child flag');
    check(!warnings.some(function (event) { return event.event === 'session.auto_closed'; }),
      'a 51-minute regular class warns but is not closed early');
    const noCountEvents = await db.listSessionEvents(noCountId, 0, 200);
    check(!noCountEvents.some(function (event) { return event.event === 'session.warning'; }) &&
      !noCountEvents.some(function (event) { return event.event === 'session.auto_closed'; }),
    'a 51-minute class with no counted trainer time does not warn or close');

    const trainerEvents = await request('GET', '/api/sessions/' + warningId + '/events?limit=200',
      undefined, trainerToken);
    const studentEvents = await request('GET', '/api/sessions/' + warningId + '/events?limit=200',
      undefined, studentToken);
    check(trainerEvents.body.events.some(function (event) { return event.event === 'session.warning'; }),
      'the trainer event stream includes the five-minute warning');
    check(!studentEvents.body.events.some(function (event) { return event.event === 'session.warning'; }),
      'the child event stream never receives the trainer-only warning ping');

    const closeId = 'ses_math_002';
    const closeAt = at(-56);
    db.updateSession(closeId, function (session) {
      session.status = 'live';
      session.scheduledAt = closeAt;
      session.startsAt = closeAt;
      session.startedAt = closeAt;
      return session;
    });
    /* An open join also gives the close path real counted presence evidence. */
    db.insertPresenceEvent({
      sessionId: closeId,
      userId: 'usr_trainer_001',
      role: 'trainer',
      kind: 'livekit_join',
      at: closeAt
    });
    await reminders.checkSessionLifetime();
    check(db.findSession(closeId).status === 'ended',
      'the server closes a regular class at the 55-minute boundary');
    const closeEvents = await db.listSessionEvents(closeId, 0, 200);
    check(closeEvents.some(function (event) { return event.event === 'session.ended' && event.payload.reason === 'auto_close'; }) &&
      closeEvents.some(function (event) { return event.event === 'session.auto_closed'; }),
    'auto-close uses the full end path and announces the reason');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('sessionLifetime: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
