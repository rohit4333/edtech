/* Scheduled-time rules for trainer pay and the classroom clock.
 *
 * Confirmed by the founder on 2026-11-26:
 *  - the room opens 10 minutes early, but opening the room does not start the
 *    class clock;
 *  - the clock starts only when the trainer is present in the session. An
 *    early trainer starts it at one minute before the allotted time (-01:00);
 *    a later trainer starts it at their verified join time;
 *  - 5-9 minutes late = half session pay;
 *  - 10+ minutes late = no session pay;
 *  - 15+ minutes late = no session pay and no extra fine (pay forfeited);
 *  - the trainer must deliver 50 teaching minutes inside the first 55 minutes
 *    from the scheduled start.
 *
 * Dashboard login and RTC token requests are not presence. Only verified
 * LiveKit webhooks and active heartbeats can supply `trainerJoinedAt` here.
 * Legacy sessions without timing evidence keep a neutral factor of 1 so old
 * payout statements are not rewritten silently. */
const appPolicy = require('../config/policy.json');

const MINUTE_MS = 60 * 1000;
const DEFAULTS = {
  clockStartOffsetMinutes: -1,
  requiredTeachingMinutes: 50,
  completionWindowMinutes: 55
};
/* Session lifetime is separate from pay timing. The regular 50/55 pay contract
   stays untouched; demo gets its own 45-minute class with a five-minute warning
   window. The close is enforced by the server, never by a browser timer. */
const DEFAULT_LIFETIME = {
  regular: {
    durationMinutes: 50,
    warningAtMinutes: 50,
    closeAtMinutes: 55,
    requiredTeachingMinutes: 50,
    completionWindowMinutes: 55
  },
  demo: {
    durationMinutes: 45,
    warningAtMinutes: 40,
    closeAtMinutes: 45,
    requiredTeachingMinutes: 40,
    completionWindowMinutes: 45
  }
};
const DEFAULT_BANDS = [
  { fromMinutes: 0, toMinutes: 5, payFactor: 1, code: 'on_time', label: 'Full pay', fineSessions: 0 },
  { fromMinutes: 5, toMinutes: 10, payFactor: 0.5, code: 'half_pay', label: 'Half pay', fineSessions: 0 },
  { fromMinutes: 10, toMinutes: 15, payFactor: 0, code: 'no_pay', label: 'No pay', fineSessions: 0 },
  { fromMinutes: 15, toMinutes: null, payFactor: 0, code: 'no_pay_fine_forfeited', label: 'No pay', fineSessions: 0 }
];
/* Demo has no 5-9 half-pay or 10+ tier. Five minutes late is the single unpaid
   and fined band; on time keeps the normal 80% demo session pay. */
const DEFAULT_DEMO_BANDS = [
  { fromMinutes: 0, toMinutes: 5, payFactor: 1, code: 'on_time', label: 'Full pay', fineSessions: 0 },
  { fromMinutes: 5, toMinutes: null, payFactor: 0, code: 'no_pay_fine', label: 'No pay and one-session fine', fineSessions: 1 }
];

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function lifetimeValues(values, defaults) {
  const configured = values && typeof values === 'object' ? values : {};
  return {
    durationMinutes: positiveNumber(configured.durationMinutes, defaults.durationMinutes),
    warningAtMinutes: positiveNumber(configured.warningAtMinutes, defaults.warningAtMinutes),
    closeAtMinutes: positiveNumber(configured.closeAtMinutes, defaults.closeAtMinutes),
    requiredTeachingMinutes: positiveNumber(
      configured.requiredTeachingMinutes, defaults.requiredTeachingMinutes
    ),
    completionWindowMinutes: positiveNumber(
      configured.completionWindowMinutes, defaults.completionWindowMinutes
    )
  };
}

function settings() {
  const configured = appPolicy.sessionTiming && typeof appPolicy.sessionTiming === 'object'
    ? appPolicy.sessionTiming : {};
  const offset = Number(configured.clockStartOffsetMinutes);
  const required = Number(configured.requiredTeachingMinutes);
  const window = Number(configured.completionWindowMinutes);
  const configuredBands = appPolicy.payout && Array.isArray(appPolicy.payout.lateJoinBands)
    ? appPolicy.payout.lateJoinBands : DEFAULT_BANDS;
  const configuredDemoBands = appPolicy.payout && Array.isArray(appPolicy.payout.lateJoinDemoBands)
    ? appPolicy.payout.lateJoinDemoBands : DEFAULT_DEMO_BANDS;
  return {
    clockStartOffsetMinutes: Number.isFinite(offset) ? offset : DEFAULTS.clockStartOffsetMinutes,
    requiredTeachingMinutes: Number.isFinite(required) && required > 0
      ? required : DEFAULTS.requiredTeachingMinutes,
    completionWindowMinutes: Number.isFinite(window) && window > 0
      ? window : DEFAULTS.completionWindowMinutes,
    lifetime: {
      regular: lifetimeValues(configured.lifetime && configured.lifetime.regular, DEFAULT_LIFETIME.regular),
      demo: lifetimeValues(configured.lifetime && configured.lifetime.demo, DEFAULT_LIFETIME.demo)
    },
    bands: configuredBands.length ? configuredBands : DEFAULT_BANDS,
    demoBands: configuredDemoBands.length ? configuredDemoBands : DEFAULT_DEMO_BANDS
  };
}

function isDemoSession(session) {
  if (!session) return false;
  if (session.classType === 'demo' || session.isDemo === true) return true;
  return Boolean(session.demoId);
}

function lifetimeFor(session) {
  const config = settings();
  return isDemoSession(session) ? config.lifetime.demo : config.lifetime.regular;
}

function parseTime(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scheduledStart(session) {
  if (!session) return null;
  return parseTime(session.scheduledAt || session.startsAt || session.startedAt || session.date);
}

function signedClock(seconds) {
  const negative = seconds < 0;
  const absolute = Math.abs(Math.floor(seconds));
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return (negative ? '-' : '') + String(minutes).padStart(2, '0') + ':' +
    String(remainder).padStart(2, '0');
}

/* The clock is trainer-gated. A trainer who is present before the -01:00 mark
 * still waits at -01:00; a trainer who arrives after it starts the clock when
 * their verified session presence begins. */
function clock(session, now, trainerJoinedAt) {
  const config = settings();
  const lifetime = lifetimeFor(session);
  const classType = isDemoSession(session) ? 'demo' : 'regular';
  const start = scheduledStart(session);
  if (start === null) {
    return {
      scheduledStartsAt: null,
      clockStartsAt: null,
      clockStartOffsetMinutes: config.clockStartOffsetMinutes,
      classType: classType,
      lifetime: lifetime,
      durationSeconds: lifetime.durationMinutes * 60,
      warningAtSeconds: lifetime.warningAtMinutes * 60,
      closeAtSeconds: lifetime.closeAtMinutes * 60,
      lifetimeElapsedSeconds: null,
      secondsUntilWarning: null,
      secondsUntilClose: null,
      warningReached: false,
      closeReached: false,
      countdownDisplay: signedClock(lifetime.closeAtMinutes * 60),
      waitingForTrainer: true,
      offsetSeconds: null,
      elapsedSeconds: null,
      display: '-00:00',
      windowEndsAt: null,
      requiredTeachingMinutes: lifetime.requiredTeachingMinutes
    };
  }

  const threshold = start + config.clockStartOffsetMinutes * MINUTE_MS;
  const joined = parseTime(trainerJoinedAt);
  const asOf = parseTime(now) || (Number.isFinite(Number(now)) ? Number(now) : Date.now());
  const clockStart = joined === null ? null : Math.max(threshold, joined);
  /* An early trainer sees -01:00 at the one-minute mark and 00:00 at the
     allotted start. A trainer who arrives later starts at 00:00 on join. */
  const earlyAnchor = clockStart !== null && clockStart === threshold;
  const displayAnchor = clockStart === null ? null : (earlyAnchor ? start : clockStart);
  const offsetSeconds = displayAnchor === null
    ? null : Math.floor((asOf - displayAnchor) / 1000);
  const elapsedSeconds = clockStart === null
    ? null : Math.floor((asOf - clockStart) / 1000);
  /* The class clock shown to the room starts at the scheduled time for an early
     trainer and at the verified join time for a late one. Warning and close are
     measured on that same clock so the five-minute countdown is honest. */
  const lifetimeElapsed = displayAnchor === null
    ? null : Math.max(0, Math.floor((asOf - displayAnchor) / 1000));
  const warningAtSeconds = lifetime.warningAtMinutes * 60;
  const closeAtSeconds = lifetime.closeAtMinutes * 60;

  return {
    scheduledStartsAt: new Date(start).toISOString(),
    /* For a recorded join, the earliest possible start is -01:00. */
    clockStartsAt: clockStart === null ? null : new Date(clockStart).toISOString(),
    earliestClockStartsAt: new Date(threshold).toISOString(),
    clockStartOffsetMinutes: config.clockStartOffsetMinutes,
    classType: classType,
    lifetime: lifetime,
    durationSeconds: lifetime.durationMinutes * 60,
    warningAtSeconds: warningAtSeconds,
    closeAtSeconds: closeAtSeconds,
    lifetimeElapsedSeconds: lifetimeElapsed,
    secondsUntilWarning: lifetimeElapsed === null ? null : warningAtSeconds - lifetimeElapsed,
    secondsUntilClose: lifetimeElapsed === null ? null : closeAtSeconds - lifetimeElapsed,
    warningReached: lifetimeElapsed !== null && lifetimeElapsed >= warningAtSeconds,
    closeReached: lifetimeElapsed !== null && lifetimeElapsed >= closeAtSeconds,
    countdownDisplay: signedClock(Math.max(0, closeAtSeconds - (lifetimeElapsed || 0))),
    waitingForTrainer: clockStart === null,
    startedByTrainerPresence: clockStart !== null,
    offsetSeconds: offsetSeconds,
    elapsedSeconds: elapsedSeconds === null ? null : Math.max(0, elapsedSeconds),
    display: offsetSeconds === null ? '-00:00' : signedClock(offsetSeconds),
    windowEndsAt: new Date(start + lifetime.completionWindowMinutes * MINUTE_MS).toISOString(),
    requiredTeachingMinutes: lifetime.requiredTeachingMinutes
  };
}

function lateJoin(session, joinedAt) {
  const config = settings();
  const start = scheduledStart(session);
  const joined = parseTime(joinedAt);
  if (start === null || joined === null) {
    return {
      lateMinutes: null,
      factor: 1,
      band: 'NO_JOIN_TIME',
      label: 'No join time recorded',
      fine: 0,
      code: 'NO_JOIN_TIME'
    };
  }
  const lateMinutes = Math.max(0, (joined - start) / MINUTE_MS);
  const bands = isDemoSession(session) ? config.demoBands : config.bands;
  const band = bands.find(function (entry) {
    const from = Number(entry.fromMinutes) || 0;
    const to = entry.toMinutes === null || entry.toMinutes === undefined
      ? Infinity : Number(entry.toMinutes);
    return lateMinutes >= from && lateMinutes < to;
  }) || bands[bands.length - 1];
  const fineSessions = Number.isFinite(Number(band.fineSessions)) ? Number(band.fineSessions) : 0;
  return {
    lateMinutes: Math.floor(lateMinutes * 100) / 100,
    factor: Number.isFinite(Number(band.payFactor)) ? Number(band.payFactor) : 1,
    band: band.code,
    label: band.label,
    fine: fineSessions,
    fineSessions: fineSessions,
    code: band.code
  };
}

function completionWindowEnd(session) {
  const start = scheduledStart(session);
  if (start === null) return null;
  return start + lifetimeFor(session).completionWindowMinutes * MINUTE_MS;
}

function evaluateCompletion(session, activeSeconds, requiredOverride) {
  const lifetime = lifetimeFor(session);
  const requiredMinutes = Number.isFinite(Number(requiredOverride))
    && Number(requiredOverride) > 0 ? Number(requiredOverride) : lifetime.requiredTeachingMinutes;
  const seconds = Number.isFinite(Number(activeSeconds)) ? Math.max(0, Number(activeSeconds)) : null;
  const end = completionWindowEnd(session);
  if (seconds === null) {
    return {
      activeSeconds: null,
      activeMinutes: null,
      requiredMinutes: requiredMinutes,
      windowMinutes: lifetime.completionWindowMinutes,
      windowEndsAt: end ? new Date(end).toISOString() : null,
      completed: null,
      factor: 1,
      code: 'NO_WINDOW_DATA'
    };
  }
  const completed = seconds >= requiredMinutes * 60;
  return {
    activeSeconds: Math.floor(seconds),
    activeMinutes: Math.floor(seconds / 60),
    requiredMinutes: requiredMinutes,
    windowMinutes: lifetime.completionWindowMinutes,
    windowEndsAt: end ? new Date(end).toISOString() : null,
    completed: completed,
    factor: completed ? 1 : 0,
    code: completed ? 'COMPLETED_IN_WINDOW' : 'REQUIRED_MINUTES_NOT_MET'
  };
}

/* Stretch reward: full active minutes taught after the required baseline and
   before the class closes, at the same 5 INR per minute. Regular classes use
   50-55; demos use the confirmed 40-45 window at the same per-minute rate. */
function evaluateStretch(session) {
  const configured = (appPolicy.payout && appPolicy.payout.stretchReward) || {};
  const lifetime = lifetimeFor(session);
  const demo = isDemoSession(session);
  const startAfter = demo
    ? lifetime.warningAtMinutes
    : (Number.isFinite(Number(configured.startAfterMinutes))
      ? Number(configured.startAfterMinutes) : 50);
  const maxMinutes = demo
    ? lifetime.closeAtMinutes
    : (Number.isFinite(Number(configured.maxMinutes))
      ? Number(configured.maxMinutes) : 55);
  const perMinute = Number.isFinite(Number(configured.perMinuteInr))
    ? Number(configured.perMinuteInr) : 5;
  const activeSeconds = Number((session && session.presence &&
    session.presence.trainerActiveSecondsInWindow));
  if (!Number.isFinite(activeSeconds) || activeSeconds < 0) {
    return {
      extraMinutes: 0,
      amount: 0,
      currency: configured.currency || 'INR',
      perMinuteInr: perMinute,
      code: 'NO_STRETCH_DATA'
    };
  }
  const extraMinutes = Math.min(
    Math.max(0, Math.floor(activeSeconds / 60) - startAfter),
    Math.max(0, maxMinutes - startAfter)
  );
  return {
    extraMinutes: extraMinutes,
    amount: Math.round(extraMinutes * perMinute * 100) / 100,
    currency: configured.currency || 'INR',
    perMinuteInr: perMinute,
    code: extraMinutes > 0 ? 'STRETCH_REWARD_EARNED' : 'NO_STRETCH_REWARD'
  };
}

function evaluatePayoutTiming(session) {
  const presence = (session && session.presence) || {};
  const joinedAt = presence.trainerJoinedAt || (session && session.trainerJoinedAt) || null;
  const activeSeconds = presence.trainerActiveSecondsInWindow;
  const hasTiming = Boolean(joinedAt) || Number.isFinite(Number(activeSeconds));
  if (!hasTiming) {
    return {
      factor: 1,
      fine: 0,
      code: 'LEGACY_NO_TIMING_DATA',
      late: lateJoin(session, null),
      completion: evaluateCompletion(session, null)
    };
  }
  const studentJoined = Boolean(presence.studentJoinedAt || (session && session.studentJoinedAt));
  const lifetime = lifetimeFor(session);
  const requiredMinutes = presence.payoutRequirement && presence.payoutRequirement.requiredTrainerMinutes
    ? Number(presence.payoutRequirement.requiredTrainerMinutes)
    : (studentJoined ? lifetime.requiredTeachingMinutes
      : (appPolicy.presence && Number(appPolicy.presence.trainerMinPresentMinutes)) || 15);
  const late = lateJoin(session, joinedAt);
  const completion = evaluateCompletion(session, activeSeconds, requiredMinutes);
  const code = completion.code === 'REQUIRED_MINUTES_NOT_MET'
    ? 'REQUIRED_MINUTES_NOT_MET' : late.code;
  return {
    factor: late.factor * completion.factor,
    fine: late.fine,
    fineSessions: late.fineSessions,
    joinedAt: joinedAt,
    studentJoined: studentJoined,
    code: code,
    late: late,
    completion: completion
  };
}

module.exports = {
  MINUTE_MS,
  settings,
  scheduledStart,
  signedClock,
  clock,
  isDemoSession,
  lifetimeFor,
  lateJoin,
  completionWindowEnd,
  evaluateCompletion,
  evaluateStretch,
  evaluatePayoutTiming
};
