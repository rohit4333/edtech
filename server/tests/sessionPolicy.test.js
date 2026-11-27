/* Regression suite for the room window, trainer-driven clock, late-join pay
   bands, 50-in-55 rule, stretch reward and explicit founder observer access. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const sessionAccess = require('../services/sessionAccessService');
const sessionTiming = require('../services/sessionTimingService');
const payout = require('../services/payoutService');

const policy = require('../config/policy.json');
const MINUTE = 60 * 1000;
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function scheduledSession(scheduledAt, presence) {
  return {
    id: 'unit_session',
    trainerId: 'usr_trainer_001',
    studentId: 'usr_student_001',
    status: 'scheduled',
    scheduledAt: scheduledAt,
    startsAt: scheduledAt,
    presence: presence || {}
  };
}

async function main() {
  /* Policy constants are server-owned, not browser inputs. */
  check(sessionAccess.settings().earlyJoinMinutes === 10,
    'the room opens exactly ten minutes before the scheduled start');
  check(sessionAccess.settings().founderObserverRequiresOptIn === true,
    'founder observer access requires an explicit opt-in');
  check(policy.sessionTiming.clockStartOffsetMinutes === -1,
    'the class clock starts one minute before the allotted time');
  check(policy.payout.stretchReward.perMinuteInr === 5 &&
    policy.payout.stretchReward.maxMinutes === 55 &&
    policy.payout.stretchReward.requiresStudentPresent === true,
  'stretch reward is 5 INR per full minute up to 55 only while the child is present');
  check(!policy.payout.lateJoinDemoBands && !policy.payout.demoPayPercent,
  'demos share the regular pay rate and late/fine bands');
  check(policy.presence.studentMinPayGateMinutes === 35 &&
    policy.presence.trainerMinPresentMinutes === 15 &&
    policy.payout.studentPayGateFine.fineSessions === 1,
  'the child pay gate is 35 counted minutes with one gate fine');

  const near = scheduledSession(iso(8 * MINUTE));
  const trainer = db.findUserById('usr_trainer_001');
  const founder = db.findUserById('usr_founder_001');

  const insideWindow = sessionAccess.evaluate(near, trainer, {});
  const tooEarly = sessionAccess.evaluate(scheduledSession(iso(30 * MINUTE)), trainer, {});
  check(insideWindow.canEnter === true, 'participants can enter inside the ten-minute window');
  check(tooEarly.canEnter === false && tooEarly.code === 'ROOM_NOT_OPEN',
    'participants are denied before the ten-minute window');

  const implicitFounder = sessionAccess.evaluate(near, founder, {});
  const explicitFounder = sessionAccess.evaluate(near, founder, { observer: true });
  check(implicitFounder.canEnter === false && implicitFounder.code === 'FOUNDER_OBSERVER_REQUIRED',
    'a founder cannot silently use the copied session link');
  check(explicitFounder.canEnter === true && explicitFounder.observer === true,
    'an explicit founder observer request is allowed');

  /* The room opening is not the class clock. Only trainer presence starts it. */
  const waiting = sessionTiming.clock(near, iso(0), null);
  check(waiting.waitingForTrainer === true && waiting.clockStartsAt === null,
    'the timer stays stopped while the trainer is only logged in to the dashboard');

  const fixedStart = '2026-12-01T10:00:00.000Z';
  const startMs = Date.parse(fixedStart);
  const fixedSession = scheduledSession(fixedStart);
  const earlyPresenceAt = new Date(startMs - 9 * MINUTE).toISOString();
  const earlyClock = sessionTiming.clock(fixedSession,
    new Date(startMs - MINUTE).toISOString(), earlyPresenceAt);
  check(earlyClock.clockStartsAt === new Date(startMs - MINUTE).toISOString() &&
    earlyClock.display === '-01:00',
  'a trainer present early starts the clock at -01:00, not when they entered');
  check(sessionTiming.clock(fixedSession, fixedStart, earlyPresenceAt).display === '00:00',
    'the clock reaches 00:00 at the allotted start time');

  const latePresenceAt = new Date(startMs + 7 * MINUTE).toISOString();
  const lateClock = sessionTiming.clock(fixedSession,
    new Date(startMs + 8 * MINUTE).toISOString(), latePresenceAt);
  check(lateClock.clockStartsAt === latePresenceAt,
    'a late trainer starts the clock only when verified session presence begins');

  /* Late bands apply only when the child joined; no extra fine is deducted for
     very late joins. Trainer-only minutes use the separate 15-minute rule below. */
  const childBandSession = Object.assign({}, fixedSession, {
    presence: {
      studentJoinedAt: fixedStart,
      studentCountedSeconds: 35 * 60,
      studentStillPresent: true
    }
  });
  check(sessionTiming.lateJoin(childBandSession, new Date(startMs + 4 * MINUTE).toISOString()).factor === 1,
    'with the child joined, a trainer under five minutes late gets full pay');
  check(sessionTiming.lateJoin(childBandSession, new Date(startMs + 7 * MINUTE).toISOString()).factor === 0.5,
    'with the child joined, five to nine minutes late gets half pay');
  check(sessionTiming.lateJoin(childBandSession, new Date(startMs + 12 * MINUTE).toISOString()).factor === 0,
    'with the child joined, ten or more minutes late gets no pay');
  const veryLate = sessionTiming.lateJoin(childBandSession,
    new Date(startMs + 20 * MINUTE).toISOString());
  check(veryLate.factor === 0 && veryLate.fine === 0,
    'with the child joined, fifteen or more minutes late forfeits pay with no extra fine');

  check(sessionTiming.evaluateCompletion(fixedSession, 50 * 60).completed === true &&
    sessionTiming.evaluateCompletion(fixedSession, 49 * 60).completed === false,
  'fifty active minutes are required when the student joins');
  check(sessionTiming.evaluateCompletion(fixedSession, 16 * 60, 15).completed === true,
    'fifteen active minutes qualify when the student never joins');
  const trainerOnlyTiming = sessionTiming.evaluatePayoutTiming(Object.assign({}, fixedSession, {
    presence: {
      trainerJoinedAt: new Date(startMs + 7 * MINUTE).toISOString(),
      trainerActiveSecondsInWindow: 16 * 60,
      trainerCountedSeconds: 16 * 60,
      payoutEligible: true
    }
  }));
  check(trainerOnlyTiming.factor === 1 && trainerOnlyTiming.lateApplied === false,
  'late join bands do not scale the 15-minute trainer-only pay rule');
  const stretchPresence = {
    trainerActiveSecondsInWindow: 55 * 60,
    trainerCountedSeconds: 55 * 60,
    studentJoinedAt: fixedStart,
    studentCountedSeconds: 35 * 60,
    studentActiveSecondsInWindow: 35 * 60,
    studentStillPresent: true
  };
  check(sessionTiming.evaluateStretch(Object.assign({}, fixedSession, {
    presence: Object.assign({}, stretchPresence)
  })).amount === 25, 'five full extra minutes up to 55 pay 25 INR');
  check(sessionTiming.evaluateStretch(Object.assign({}, fixedSession, {
    presence: Object.assign({}, stretchPresence, { trainerActiveSecondsInWindow: 56 * 60 })
  })).amount === 25, 'stretch reward stops at the 55-minute ceiling');
  const childLeft = sessionTiming.evaluateStretch(Object.assign({}, fixedSession, {
    presence: Object.assign({}, stretchPresence, { studentStillPresent: false })
  }));
  check(childLeft.amount === 0 && childLeft.code === 'STUDENT_NOT_PRESENT',
  'extra minutes after the child leaves are not paid');
  const childUnderGate = sessionTiming.evaluateStretch(Object.assign({}, fixedSession, {
    presence: Object.assign({}, stretchPresence, {
      studentCountedSeconds: 34 * 60,
      studentActiveSecondsInWindow: 34 * 60
    })
  }));
  check(childUnderGate.amount === 0 && childUnderGate.extraMinutes === 0,
  'stretch pay is blocked while the child is under 35 counted minutes');

  function childTiming(lateMinutes, childSeconds) {
    return sessionTiming.evaluatePayoutTiming(Object.assign({}, fixedSession, {
      presence: {
        trainerJoinedAt: new Date(startMs + lateMinutes * MINUTE).toISOString(),
        trainerActiveSecondsInWindow: 50 * 60,
        trainerCountedSeconds: 50 * 60,
        studentJoinedAt: fixedStart,
        studentCountedSeconds: childSeconds,
        studentActiveSecondsInWindow: childSeconds,
        studentStillPresent: true,
        payoutEligible: true
      }
    }));
  }
  const childHalf = childTiming(7, 35 * 60);
  check(childHalf.factor === 0.5 && childHalf.fine === 0,
  'with the child joined, five to nine minutes late is half pay with no fine');
  const childNoPay = childTiming(12, 35 * 60);
  check(childNoPay.factor === 0 && childNoPay.fine === 0,
  'with the child joined, ten to fourteen minutes late is no pay with no fine');
  const childVeryLate = childTiming(18, 35 * 60);
  check(childVeryLate.factor === 0 && childVeryLate.fine === 0,
  'with the child joined, fifteen-plus minutes late is no pay with no fine');
  const childGateUnmet = childTiming(0, 34 * 60);
  check(childGateUnmet.factor === 0 && childGateUnmet.fine >= 1,
  'a child under 35 counted minutes blocks pay and raises one gate fine');

  const trainerRate = 350;
  const halfPaySession = scheduledSession(fixedStart, {
    trainerJoinedAt: new Date(startMs + 7 * MINUTE).toISOString(),
    trainerActiveSecondsInWindow: 16 * 60,
    trainerCountedSeconds: 16 * 60,
    payoutEligible: true
  });
  const stretchSession = scheduledSession(fixedStart, {
    trainerJoinedAt: fixedStart,
    studentJoinedAt: fixedStart,
    studentStillPresent: true,
    studentCountedSeconds: 35 * 60,
    studentActiveSecondsInWindow: 35 * 60,
    trainerActiveSecondsInWindow: 55 * 60,
    trainerCountedSeconds: 55 * 60,
    payoutEligible: true
  });
  [halfPaySession, stretchSession].forEach(function (session) {
    session.id = 'unit_' + session.id;
    session.status = 'ended';
    session.trainerId = 'unit_trainer';
    session.startedAt = fixedStart;
  });

  const payoutResult = payout.buildPayout(
    { id: 'unit_trainer', name: 'Unit Trainer', role: 'trainer', payPerSession: trainerRate },
    [halfPaySession, stretchSession],
    '2026-12',
    policy,
    { trainers: [], allSessions: [], attendance: [] }
  );
  check(payoutResult.amount.breakdown.basePay === 700,
    'a no-child late join and a child-present class both pay full base pay');
  check(payoutResult.amount.breakdown.stretchPay === 25,
    'stretch reward is a separate auditable payout line');
  check(payoutResult.amount.value === 2725,
    'the payout total includes the protected gift and the stretch reward');
  check(payoutResult.sessionTiming.sessions.some(function (row) {
    return row.sessionId === stretchSession.id && row.factor === 1;
  }), 'a child with 35 counted minutes unlocks full trainer pay');
  check(payoutResult.sessionTiming.sessions.some(function (row) {
    return row.sessionId === halfPaySession.id && row.studentJoined === false &&
      row.factor === 1 && row.fine === 0;
  }), 'a seven-minute late trainer pays fully after 15 counted minutes when no child joined');

  const childGateBlocked = scheduledSession(fixedStart, {
    trainerJoinedAt: new Date(startMs + 7 * MINUTE).toISOString(),
    trainerActiveSecondsInWindow: 55 * 60,
    trainerCountedSeconds: 55 * 60,
    studentJoinedAt: fixedStart,
    studentCountedSeconds: 34 * 60,
    studentActiveSecondsInWindow: 34 * 60,
    studentStillPresent: true,
    payoutEligible: false
  });
  childGateBlocked.id = 'unit_child_gate_blocked';
  childGateBlocked.status = 'ended';
  childGateBlocked.trainerId = 'unit_trainer';
  childGateBlocked.startedAt = fixedStart;
  const gatePayout = payout.buildPayout(
    { id: 'unit_trainer', name: 'Unit Trainer', role: 'trainer', payPerSession: trainerRate },
    [childGateBlocked],
    '2026-12',
    policy,
    { trainers: [], allSessions: [], attendance: [] }
  );
  check(gatePayout.amount.breakdown.basePay === 0 &&
    gatePayout.amount.breakdown.stretchPay === 0 &&
    gatePayout.amount.breakdown.fines === trainerRate &&
    gatePayout.fines.entries.filter(function (entry) {
      return entry.basis === 'student_pay_gate_one_session_pay';
    }).length === 1 &&
    !gatePayout.fines.entries.some(function (entry) {
      return entry.basis === 'late_join_one_session_pay';
    }),
  'an unmet child gate pays nothing and charges one gate fine, never a late fine');
  check(gatePayout.amount.value === 2000,
    'the protected gift floors a child-gate-blocked statement at 2000');

  /* HTTP proof: copied links, observer logging and the server-owned timer. */
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
    const founderToken = await login('founder@mathify.app');

    const sessionId = 'ses_math_002';
    db.updateSession(sessionId, function (session) {
      session.status = 'scheduled';
      session.scheduledAt = iso(30 * MINUTE);
      session.startsAt = session.scheduledAt;
      session.founderObserver = null;
      return session;
    });

    const early = await request('POST', '/api/sessions/' + sessionId + '/rtc-token',
      { observer: false }, trainerToken);
    check(early.status === 409 && early.body.error === 'ROOM_NOT_OPEN',
      'the API denies an RTC token before the room window opens');

    db.updateSession(sessionId, function (session) {
      session.scheduledAt = iso(8 * MINUTE);
      session.startsAt = session.scheduledAt;
      return session;
    });
    const silentFounder = await request('POST', '/api/sessions/' + sessionId + '/rtc-token',
      {}, founderToken);
    check(silentFounder.status === 403 && silentFounder.body.error === 'FOUNDER_OBSERVER_REQUIRED',
      'a founder cannot obtain a silent RTC token from the session link');

    await request('POST', '/api/sessions/' + sessionId + '/network-check',
      { downloadMbps: 30, uploadMbps: 20, latencyMs: 80 }, trainerToken);
    await request('POST', '/api/sessions/' + sessionId + '/network-check',
      { downloadMbps: 28, uploadMbps: 18, latencyMs: 90 }, studentToken);

    const trainerJoin = await request('POST', '/api/sessions/' + sessionId + '/rtc-token',
      {}, trainerToken);
    check(trainerJoin.status === 200 && trainerJoin.body.roomAccess.canEnter === true,
      'the API allows the real participant inside the window');

    const observerJoin = await request('POST', '/api/sessions/' + sessionId + '/rtc-token',
      { observer: true }, founderToken);
    check(observerJoin.status === 200,
      'the API allows an explicit founder observer join');
    check(observerJoin.body.rtc.role === 'subscriber' && observerJoin.body.rtc.role !== 'publisher',
      'the explicit founder observer token is subscriber, never publisher');
    check(observerJoin.body.rtc.observer === true,
      'the explicit founder observer token is marked read-only');
    check(observerJoin.body.rtc.viewerRole === 'founder',
      'the explicit founder observer token keeps the founder viewer role');

    const observerState = await request('GET', '/api/sessions/' + sessionId + '/state',
      undefined, studentToken);
    check(observerState.body.state.founderObserver &&
      observerState.body.state.founderObserver.active === true,
    'the shared room state visibly announces the observer');
    check(!/userId|mobile|email|@|http/i.test(JSON.stringify(observerState.body.state.founderObserver)),
      'observer state exposes a name only, with no private contact detail');

    const events = await request('GET', '/api/sessions/' + sessionId + '/events?limit=200',
      undefined, studentToken);
    const observerEvent = (events.body.events || []).filter(function (event) {
      return event.event === 'founder.observer.changed';
    }).pop();
    check(Boolean(observerEvent && observerEvent.payload.active === true),
      'founder entry is written to the auditable session event stream');
    check(observerEvent && observerEvent.payload.userId === undefined &&
      observerEvent.payload.name === 'Rohit Vishwakarma',
    'the observer event carries a visible name and no internal user id');

    /* Dashboard login alone leaves the timer stopped. A presence heartbeat is
       the only thing that starts it. */
    db.updateSession(sessionId, function (session) {
      session.scheduledAt = iso(5 * MINUTE);
      session.startsAt = session.scheduledAt;
      return session;
    });
    const beforePresence = await request('GET', '/api/sessions/' + sessionId + '/state',
      undefined, trainerToken);
    check(beforePresence.body.state.sessionTiming.waitingForTrainer === true,
      'an authenticated trainer in the dashboard does not start the class clock');

    const scheduledForClock = db.findSession(sessionId);
    const oneMinuteBeforeStart = new Date(
      Date.parse(scheduledForClock.scheduledAt) - MINUTE
    ).toISOString();
    db.insertPresenceEvent({
      sessionId: sessionId,
      userId: 'usr_trainer_001',
      role: 'trainer',
      kind: 'heartbeat',
      active: true,
      learningEvents: 0,
      at: oneMinuteBeforeStart
    });
    const afterPresence = await request('GET', '/api/sessions/' + sessionId + '/state',
      undefined, trainerToken);
    check(afterPresence.body.state.sessionTiming.waitingForTrainer === false &&
      afterPresence.body.state.sessionTiming.clockStartsAt ===
        afterPresence.body.state.sessionTiming.earliestClockStartsAt,
    'verified trainer presence starts an early clock at -01:00');

    const trainerState = afterPresence.body.state;
    check(trainerState.payGate && trainerState.payGate.childJoined === false &&
      trainerState.payGate.childRequiredSeconds === 35 * 60 &&
      trainerState.payGate.trainerRequiredSeconds === 15 * 60,
    'the trainer state exposes the role-scoped pay gate');
    check(trainerState.sessionTiming.minimumQuotaReached === false &&
      trainerState.sessionTiming.minimumQuota &&
      trainerState.sessionTiming.minimumQuota.childJoined === false &&
      trainerState.sessionTiming.minimumQuota.cueSeconds === 300,
    'the trainer clock exposes minimum-quota progress and the five-minute cue');

    const studentState = await request('GET', '/api/sessions/' + sessionId + '/state',
      undefined, studentToken);
    check(!studentState.body.state.payGate,
    'the child state never exposes the trainer pay gate');

    const publicConfig = await request('GET', '/api/public/config');
    check(publicConfig.body.sessionAccess.earlyJoinMinutes === 10 &&
      publicConfig.body.sessionTiming.requiredTeachingMinutes === 50,
    'the browser receives the server-owned window and teaching-time policy');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('sessionPolicy: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
