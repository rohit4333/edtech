/* Regression coverage for the founder-confirmed class lifetime rules:
   demo warns at 40 and closes at 45, regular warns at 50 and closes at 55.
   The browser never owns either action; the in-process job publishes a
   trainer-only warning and closes through the same path as the End button. */

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
  check(config.lifetime.demo.durationMinutes === 45 &&
    config.lifetime.demo.warningAtMinutes === 40 &&
    config.lifetime.demo.closeAtMinutes === 45 &&
    config.lifetime.demo.requiredTeachingMinutes === 40 &&
    config.lifetime.demo.completionWindowMinutes === 45,
  'demos are 45 minutes, warn at 40, close at 45 and require 40 teaching minutes');

  const fixed = '2026-12-05T10:00:00.000Z';
  const regular = sessionOf('ses_math_001');
  regular.scheduledAt = fixed;
  regular.startsAt = fixed;
  const demo = sessionOf('ses_math_001', 'demo');
  demo.scheduledAt = fixed;
  demo.startsAt = fixed;

  const regular49 = sessionTiming.clock(regular, at(49, Date.parse(fixed)), fixed);
  const regular50 = sessionTiming.clock(regular, at(50, Date.parse(fixed)), fixed);
  const regular55 = sessionTiming.clock(regular, at(55, Date.parse(fixed)), fixed);
  check(regular49.warningReached === false && regular49.closeReached === false,
    'a regular class is not warned before 50 minutes');
  check(regular50.warningReached === true && regular50.closeReached === false &&
    regular50.secondsUntilClose === 300,
  'a regular class warns with a five-minute reverse countdown at 50 minutes');
  check(regular55.closeReached === true, 'a regular class reaches its close boundary at 55 minutes');

  const demo39 = sessionTiming.clock(demo, at(39, Date.parse(fixed)), fixed);
  const demo40 = sessionTiming.clock(demo, at(40, Date.parse(fixed)), fixed);
  const demo45 = sessionTiming.clock(demo, at(45, Date.parse(fixed)), fixed);
  check(demo39.warningReached === false && demo39.closeReached === false,
    'a demo is not warned before 40 teaching minutes');
  check(demo40.warningReached === true && demo40.closeReached === false &&
    demo40.secondsUntilClose === 300,
  'a demo warns with a five-minute reverse countdown at 40 minutes');
  check(demo45.closeReached === true, 'a demo reaches its close boundary at 45 minutes');
  check(sessionTiming.evaluateCompletion(demo, 40 * 60).completed === true &&
    sessionTiming.evaluateCompletion(demo, 39 * 60).completed === false,
  'a demo qualifies for pay after 40 active teaching minutes');

  check(sessionTiming.lateJoin(demo, at(4.9, Date.parse(fixed))).factor === 1 &&
    sessionTiming.lateJoin(demo, at(4.9, Date.parse(fixed))).fine === 0,
  'a demo trainer under five minutes late keeps full demo pay with no fine');
  const demoLate = sessionTiming.lateJoin(demo, at(6, Date.parse(fixed)));
  check(demoLate.factor === 0 && demoLate.fine === 1 && demoLate.code === 'no_pay_fine',
    'a demo trainer five or more minutes late gets no pay and a one-session fine');
  const veryLateDemo = sessionTiming.lateJoin(demo, at(12, Date.parse(fixed)));
  check(veryLateDemo.factor === 0 && veryLateDemo.fine === 1,
    'demo has no separate ten-minute tier; every late join has the same fine');
  check(sessionTiming.evaluateStretch(Object.assign({}, demo, {
    presence: { trainerActiveSecondsInWindow: 45 * 60 }
  })).amount === 25,
  'the demo 40-45 stretch pays the same 5 INR per minute as a regular class');

  /* Finalized presence must use the lifetime-specific teaching threshold, not
     the regular 50-minute constant. A demo is payable after 40 minutes. */
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
      at: at(45, Date.parse(fixed))
    });
  }
  const demoPresence = await presence.compute(presenceSession, at(46, Date.parse(fixed)));
  check(demoPresence.payoutEligible === true &&
    demoPresence.payoutRequirement.requiredTrainerMinutes === 40,
  'finalized demo presence qualifies after 40 teaching minutes');
  check(demoPresence.rule.indexOf('40 active teaching minutes') !== -1 &&
    demoPresence.rule.indexOf('45 minutes') !== -1,
  'the presence rule explains the demo 40/45 contract');

  const onTimeDemo = Object.assign({}, demo, {
    id: 'unit_demo_on_time',
    status: 'ended',
    startedAt: fixed,
    presence: {
      trainerJoinedAt: fixed,
      studentJoinedAt: fixed,
      trainerActiveSecondsInWindow: 45 * 60,
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
  check(demoPayout.amount.breakdown.basePay === 280,
    'an on-time demo pays 80% of the regular session rate');
  check(demoPayout.amount.breakdown.stretchPay === 25,
    'the extra demo minutes stay a separate full-rate stretch line');
  check(demoPayout.amount.value === 305, 'demo pay plus stretch is auditable in the total');

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
    db.insertPresenceEvent({
      sessionId: warningId,
      userId: 'usr_trainer_001',
      role: 'trainer',
      kind: 'heartbeat',
      active: true,
      learningEvents: 0,
      at: warningAt
    });
    await reminders.checkSessionLifetime();
    const warnings = await db.listSessionEvents(warningId, 0, 200);
    check(warnings.some(function (event) { return event.event === 'session.warning'; }),
      'the lifetime job publishes a one-shot class-warning event');
    check(!warnings.some(function (event) { return event.event === 'session.auto_closed'; }),
      'a 51-minute regular class warns but is not closed early');

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
    db.insertPresenceEvent({
      sessionId: closeId,
      userId: 'usr_trainer_001',
      role: 'trainer',
      kind: 'heartbeat',
      active: true,
      learningEvents: 0,
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
