/* ==========================================================================
   MATHIFY — trainer payout, fine and MVT engine

   Confirmed rules:
   - Base pay is 300-400 INR per completed session, from the trainer profile.
   - 2+ days notice by either side is mutual leave: no payout, no fine, no pack or attendance penalty.
    - A trainer cancellation with less than 2 days notice costs exactly one session's pay; the student session is marked "unattended". A no-show earns no payout and marks the student session used.
   - 100% attendance in a month pays 2,000 INR, rising by 500 INR for every
     consecutive perfect month.
   - MVT ranks trainers by completed sessions in the period and pays
     3,000 / 2,000 / 1,000 INR to the top three.
   - Daily work is capped at 6 hours (and 6 sessions); days under 3 hours are
     flagged for payroll review instead of being silently paid as full days.

   The daily trend uses payable completed-session records only. No key values are
   inferred from unconfirmed founder notes.
   ========================================================================== */

const INR = 'INR';
const HOUR_MS = 60 * 60 * 1000;
const BILLABLE_STATUSES = ['ended', 'completed'];
const NO_SHOW_STATUSES = ['no_show', 'noshow', 'no-show'];
const attendancePolicy = require('./attendancePolicy');
const sessionTiming = require('./sessionTimingService');

function pad(value) {
  return String(value).padStart(2, '0');
}

function toYmd(date) {
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
}

function periodParts(period) {
  const parts = String(period).split('-').map(Number);
  return { year: parts[0], month: parts[1] };
}

function validPeriod(period) {
  const parts = periodParts(period);
  return Number.isInteger(parts.year) && Number.isInteger(parts.month) &&
    parts.month >= 1 && parts.month <= 12;
}

function periodDays(period, asOf) {
  if (!validPeriod(period)) return [];
  const parts = periodParts(period);
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const today = asOf ? new Date(asOf) : new Date();
  let end = lastDay;
  if (today.getUTCFullYear() === parts.year && today.getUTCMonth() + 1 === parts.month) {
    end = Math.min(lastDay, today.getUTCDate());
  }

  const days = [];
  for (let day = 1; day <= end; day += 1) {
    days.push({ date: toYmd(new Date(Date.UTC(parts.year, parts.month - 1, day))), day: day });
  }
  return days;
}

function shortLabel(date) {
  const parts = String(date).split('-').map(Number);
  const month = new Date(Date.UTC(parts[0], parts[1] - 1, 1))
    .toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
  return parts[2] + ' ' + month;
}

function sessionDate(session) {
  const value = session && (session.startedAt || session.startsAt || session.scheduledAt);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function inPeriod(session, period) {
  const date = sessionDate(session);
  return Boolean(date && date.toISOString().slice(0, 7) === period);
}

function isNoShow(session) {
  if (!session) return false;
  if (session.noShow === true || session.no_show === true) return true;
  const status = String(session.status || '').toLowerCase();
  return NO_SHOW_STATUSES.indexOf(status) !== -1;
}

function isBillable(session) {
  if (isNoShow(session)) return false;
  /* Automated presence gate: a trainer present under 15 minutes earns no pay,
     even if the session record was closed as "ended". */
  if (session && session.presence && session.presence.payoutEligible === false) return false;
  return BILLABLE_STATUSES.indexOf(String(session && session.status || '').toLowerCase()) !== -1;
}

/* Late-join and 50-in-55 completion bands scale, but never increase, the
   session rate. Sessions with no recorded presence timing keep full pay. */
function sessionPayout(session, rate) {
  const timing = sessionTiming.evaluatePayoutTiming(session);
  const stretch = sessionTiming.evaluateStretch(session);
  const factor = Math.max(0, Math.min(1, Number(timing.factor)));
  const baseAmount = Math.round(rate * factor * 100) / 100;
  return {
    sessionId: session.id,
    factor: factor,
    baseAmount: baseAmount,
    stretchPay: stretch.amount,
    stretch: stretch,
    amount: Math.round((baseAmount + stretch.amount) * 100) / 100,
    timing: timing
  };
}

function rateFor(user, config) {
  const range = Array.isArray(config.rateRange) && config.rateRange.length === 2
    ? config.rateRange.map(Number)
    : [300, 400];
  const minimum = Number.isFinite(range[0]) ? range[0] : 300;
  const maximum = Number.isFinite(range[1]) ? range[1] : 400;
  const configured = Number(user && user.payPerSession);
  const rate = Number.isFinite(configured) && configured > 0 ? configured : 350;
  return Math.min(maximum, Math.max(minimum, rate));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sessionHours(session, config) {
  const explicitHours = Number(session && session.durationHours);
  if (Number.isFinite(explicitHours) && explicitHours > 0) return explicitHours;

  const explicitMinutes = Number(session && session.durationMinutes);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) return explicitMinutes / 60;

  const elapsedSeconds = Number(session && session.elapsedSeconds);
  if (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) return elapsedSeconds / 3600;

  const started = session && session.startedAt ? new Date(session.startedAt).getTime() : NaN;
  const endedValue = session && (session.endsAt || session.completedAt);
  const ended = endedValue ? new Date(endedValue).getTime() : NaN;
  if (Number.isFinite(started) && Number.isFinite(ended) && ended > started) {
    return (ended - started) / HOUR_MS;
  }

  const maxHours = positiveNumber(config && config.maxHoursPerDay, 6);
  const maxSessions = positiveNumber(config && config.maxSessionsPerDay, 6);
  return maxHours / maxSessions;
}

function sessionDay(session) {
  const date = sessionDate(session);
  return date ? toYmd(date) : null;
}

function enforceDailyCaps(sessions, config) {
  const settings = {
    maxHoursPerDay: positiveNumber(config && config.maxHoursPerDay, 6),
    minHoursPerDay: positiveNumber(config && config.minHoursPerDay, 3),
    maxSessionsPerDay: positiveNumber(config && config.maxSessionsPerDay, 6)
  };
  const groups = {};

  (sessions || []).forEach(function (session) {
    if (!isBillable(session)) return;
    const day = sessionDay(session);
    if (!day) return;
    if (!groups[day]) groups[day] = [];
    groups[day].push({ session: session, hours: sessionHours(session, config) });
  });

  const eligibleSessions = [];
  const cappedSessions = [];
  const violations = [];
  const totalsByDay = [];

  Object.keys(groups).sort().forEach(function (day) {
    const entries = groups[day].slice().sort(function (a, b) {
      return new Date(sessionDate(a.session)) - new Date(sessionDate(b.session));
    });
    const totalHours = entries.reduce(function (sum, entry) { return sum + entry.hours; }, 0);
    let payableHours = 0;
    let payableSessions = 0;

    entries.forEach(function (entry) {
      const remaining = Math.max(0, settings.maxHoursPerDay - payableHours);
      const withinSessionCap = payableSessions < settings.maxSessionsPerDay;
      const payable = withinSessionCap && remaining > 0;

      if (payable) {
        eligibleSessions.push(entry.session);
        payableHours += Math.min(entry.hours, remaining);
        payableSessions += 1;
        return;
      }

      cappedSessions.push({
        sessionId: entry.session.id,
        trainerId: entry.session.trainerId,
        date: day,
        hours: roundHours(entry.hours),
        reason: withinSessionCap ? 'max_hours_per_day' : 'max_sessions_per_day'
      });
    });

    const shortfallHours = Math.max(0, settings.minHoursPerDay - totalHours);
    const overHours = Math.max(0, totalHours - settings.maxHoursPerDay);

    if (shortfallHours > 0 || overHours > 0) {
      violations.push({
        date: day,
        trainerId: entries[0].session.trainerId,
        kind: shortfallHours > 0 ? 'below_min_hours' : 'above_max_hours',
        totalHours: roundHours(totalHours),
        payableHours: roundHours(payableHours),
        shortfallHours: roundHours(shortfallHours),
        overHours: roundHours(overHours),
        sessionCount: entries.length,
        payableSessionCount: payableSessions
      });
    }

    totalsByDay.push({
      date: day,
      trainerId: entries[0].session.trainerId,
      sessionCount: entries.length,
      totalHours: roundHours(totalHours),
      payableSessionCount: payableSessions,
      payableHours: roundHours(payableHours),
      cappedSessionCount: entries.length - payableSessions,
      shortfallHours: roundHours(shortfallHours),
      overHours: roundHours(overHours)
    });
  });

  return {
    settings: settings,
    eligibleSessions: eligibleSessions,
    cappedSessions: cappedSessions,
    violations: violations,
    totalsByDay: totalsByDay,
    source: 'session_records',
    note: 'Payable sessions are clamped to max hours/sessions per day; short days are flagged for payroll review.'
  };
}

function isTrainerCancellation(session) {
  return attendancePolicy.isTrainerCancellation(session);
}

function noticeHoursFor(session) {
  return attendancePolicy.noticeHoursFor(session);
}

function cancellationFines(sessions, rate, fineRules) {
  const threshold = Number(fineRules && fineRules.noticeHours);
  const noticeLimit = Number.isFinite(threshold) ? threshold : 48;
  return sessions.filter(isTrainerCancellation).map(function (session) {
    const noticeHours = noticeHoursFor(session);
    const late = noticeHours !== null && noticeHours < noticeLimit;
    return {
      sessionId: session.id,
      noticeHours: noticeHours === null ? null : Math.max(0, Math.round(noticeHours * 10) / 10),
      late: late,
      amount: late ? rate : 0,
      basis: 'trainer_pay_per_session',
      noticeDays: fineRules && fineRules.noticeDays ? Number(fineRules.noticeDays) : 2,
      currency: (fineRules && fineRules.currency) || INR
    };
  }).filter(function (entry) { return entry.late; });
}

function attendanceBonusFor(user, sessions, attendance, bonusRules, policy) {
  const expected = sessions.filter(function (session) {
    return session.trainerId === user.id &&
      !isTrainerCancellation(session) &&
      !attendancePolicy.isMutualLeave(session, policy);
  });
  const ids = expected.map(function (session) { return session.id; });
  const rows = (attendance || []).filter(function (row) {
    return row.trainerId === user.id && ids.indexOf(row.sessionId) !== -1;
  });

  const presentCount = rows.filter(function (row) {
    return String(row.status).toLowerCase() === 'present';
  }).length;
  const eligible = expected.length > 0 && presentCount === expected.length;
  const priorStreak = Math.max(0, Number(
    user.attendanceBonusStreak || user.perfectAttendanceStreak || 0
  ) || 0);
  const initial = Number(bonusRules && bonusRules.perfectAttendanceBonus);
  const increment = Number(bonusRules && bonusRules.incrementPerConsecutiveMonth);
  const initialBonus = Number.isFinite(initial) ? initial : 2000;
  const incrementBonus = Number.isFinite(increment) ? increment : 500;

  return {
    eligible: eligible,
    bonus: eligible ? initialBonus + (incrementBonus * priorStreak) : 0,
    consecutiveMonth: priorStreak + 1,
    presentCount: presentCount,
    expectedCount: expected.length,
    source: 'attendance_records'
  };
}

function mvtRanking(trainers, sessions, period, awards) {
  const roster = (trainers && trainers.length ? trainers : []).slice();
  const amounts = Array.isArray(awards) && awards.length ? awards : [3000, 2000, 1000];

  return roster.filter(function (trainer) { return trainer.role === 'trainer'; })
    .map(function (trainer) {
      return {
        trainerId: trainer.id,
        name: trainer.name,
        completedSessions: sessions.filter(function (session) {
          return session.trainerId === trainer.id && inPeriod(session, period) && isBillable(session);
        }).length
      };
    })
    .filter(function (row) { return row.completedSessions > 0; })
    .sort(function (a, b) {
      if (b.completedSessions !== a.completedSessions) return b.completedSessions - a.completedSessions;
      return String(a.name).localeCompare(String(b.name));
    })
    .map(function (row, index) {
      return Object.assign({}, row, {
        rank: index + 1,
        award: Number(amounts[index]) || 0
      });
    });
}

/* Deterministic preview so the trend shape is stable across reloads. */
function illustrativeDaily(index, rate) {
  if (index > 0 && index % 7 === 0) return 0;
  const wave = Math.sin(index * 1.35) * 1.5 + Math.cos(index * 0.52) * 1.15;
  const sessions = Math.max(1, Math.min(5, Math.round(3 + wave)));
  return sessions * rate;
}

function buildDailySeries(user, sessions, period, config, asOf) {
  const rate = rateFor(user, config);
  const rulesConfigured = Boolean(config.bonusRules && config.fineRules);
  const byDate = {};

  sessions.filter(function (session) { return isBillable(session); }).forEach(function (session) {
    const date = sessionDate(session);
    if (!date) return;
    const key = toYmd(date);
    if (!byDate[key]) byDate[key] = { count: 0, factor: 0 };
    byDate[key].count += 1;
    byDate[key].factor += Math.max(0, Math.min(1,
      Number(sessionTiming.evaluatePayoutTiming(session).factor)));
  });

  let cumulative = 0;
  const points = periodDays(period, asOf).map(function (day, index) {
    const summary = byDate[day.date] || { count: 0, factor: 0 };
    const daily = rulesConfigured ? Math.round(summary.factor * rate * 100) / 100
      : illustrativeDaily(index, rate);
    cumulative += daily;
    return {
      date: day.date,
      day: day.day,
      label: shortLabel(day.date),
      daily: daily,
      cumulative: cumulative,
      sessions: rulesConfigured ? summary.count : null
    };
  });

  return {
    period: period,
    currency: INR,
    source: rulesConfigured ? 'session_records' : 'illustrative',
    isIllustrative: !rulesConfigured,
    points: points,
    note: rulesConfigured
      ? 'Base pay from completed sessions. Bonuses, fines and MVT awards are excluded from daily points.'
      : 'Illustrative trend preview. Final amounts unlock when payout rules are confirmed.'
  };
}

function buildPayout(user, sessions, period, policy, context) {
  const config = (policy && policy.payout) || {};
  const options = context || {};
  const rate = rateFor(user, config);
  const periodSessions = (sessions || []).filter(function (session) { return inPeriod(session, period); });
  const completedSessions = periodSessions.filter(isBillable);
  const noShowSessions = periodSessions.filter(isNoShow);
  const mutualLeaveSessions = periodSessions.filter(function (session) {
    return attendancePolicy.isMutualLeave(session, policy);
  });
  const lateCancellations = periodSessions.filter(function (session) {
    return attendancePolicy.isLateTrainerCancellation(session, policy);
  });
  const noShowConfig = config.noShow || {};
  const noShowPayout = Number.isFinite(Number(noShowConfig.payout)) ? Number(noShowConfig.payout) : 0;
  const capReport = enforceDailyCaps(completedSessions, config);
  const payableSessions = capReport.eligibleSessions;
  const sessionPayouts = payableSessions.map(function (session) {
    return sessionPayout(session, rate);
  });
  const basePay = Math.round(sessionPayouts.reduce(function (sum, row) {
    return sum + row.baseAmount;
  }, 0) * 100) / 100;
  const stretchPay = Math.round(sessionPayouts.reduce(function (sum, row) {
    return sum + row.stretchPay;
  }, 0) * 100) / 100;
  const effectiveSessionCount = Math.round(sessionPayouts.reduce(function (sum, row) {
    return sum + row.factor;
  }, 0) * 100) / 100;

  const fines = cancellationFines(periodSessions, rate, config.fineRules);
  const fineTotal = fines.reduce(function (sum, entry) { return sum + entry.amount; }, 0);

  const attendance = attendanceBonusFor(
    user,
    periodSessions,
    options.attendance || [],
    config.bonusRules,
    policy
  );

  const ranking = mvtRanking(
    options.trainers || [user],
    options.allSessions || sessions || [],
    period,
    config.mvtAwards
  );
  const mvt = ranking.find(function (row) { return row.trainerId === user.id; }) || {
    trainerId: user.id,
    rank: null,
    completedSessions: completedSessions.length,
    award: 0
  };

  const slotPay = Number.isFinite(Number(options.slotPay)) ? Math.max(0, Number(options.slotPay)) : 0;
  const total = Math.max(0, basePay + stretchPay + attendance.bonus + mvt.award + slotPay - fineTotal);
  const parts = periodParts(period);
  const statementDate = validPeriod(period)
    ? new Date(Date.UTC(parts.year, parts.month, 1)).toISOString().slice(0, 10)
    : null;

  return {
    trainer: {
      id: user.id,
      name: user.name,
      role: user.role
    },
    period: period,
    statementDate: statementDate,
    sessionCount: payableSessions.length,
    effectiveSessionCount: effectiveSessionCount,
    completedSessionCount: completedSessions.length,
    cappedSessionCount: capReport.cappedSessions.length,
    ratePerSession: rate,
    amount: {
      value: total,
      currency: INR,
      source: validPeriod(period) ? 'calculated' : 'unconfigured',
      breakdown: {
        basePay: basePay,
        stretchPay: stretchPay,
        attendanceBonus: attendance.bonus,
        mvtAward: mvt.award,
        slotPay: slotPay,
        fines: fineTotal
      },
      note: 'Calculated from completed sessions, late-join pay bands, 50 minutes within 55, 5 INR per full extra minute up to 55, attendance, MVT rank, 30% pay for unutilised committed slot hours and one session-pay per late trainer cancellation. Mutual leave and no-shows are unpaid.'
    },
    bonuses: {
      value: attendance.bonus,
      currency: INR,
      rules: config.bonusRules,
      source: 'calculated',
      detail: attendance
    },
    fines: {
      value: fineTotal,
      currency: INR,
      rules: config.fineRules,
      source: 'calculated',
      entries: fines
    },
    mvtAward: {
      value: mvt.award,
      currency: INR,
      rank: mvt.rank,
      basis: 'completed_sessions_in_period',
      source: 'calculated',
      ranking: ranking
    },
    slotPay: {
      value: slotPay,
      currency: INR,
      source: 'committed_slots',
      percentOfSessionRate: 30,
      rule: 'Unutilised hours inside a declared trainer slot are paid at 30% of the session rate; classes inside the slot are paid at 100% through session pay.'
    },
    sessionTiming: {
      source: 'presence_events',
      clockStartOffsetMinutes: sessionTiming.settings().clockStartOffsetMinutes,
      requiredTeachingMinutes: sessionTiming.settings().requiredTeachingMinutes,
      completionWindowMinutes: sessionTiming.settings().completionWindowMinutes,
      stretchReward: config.stretchReward || null,
      sessions: sessionPayouts.map(function (row) {
        return {
          sessionId: row.sessionId,
          factor: row.factor,
          baseAmount: row.baseAmount,
          stretchPay: row.stretchPay,
          lateBand: row.timing.late.band,
          lateMinutes: row.timing.late.lateMinutes,
          completionCode: row.timing.completion.code
        };
      })
    },
    leaves: {
      count: mutualLeaveSessions.length,
      payout: 0,
      fine: 0,
      packPenalty: false,
      source: 'calculated',
      rule: 'Notice of 2+ days by either side is mutual leave: no payout, no fine and no pack or attendance penalty.'
    },
    lateTrainerCancellations: {
      count: lateCancellations.length,
      finePerSession: rate,
      currency: INR,
      studentStatus: (config.studentAttendance && config.studentAttendance.lateTrainerCancellationStatus) || 'unattended',
      source: 'calculated',
      rule: 'Under 2 days notice costs the trainer exactly one session pay; the student session is marked unattended.'
    },
    noShows: {
      count: noShowSessions.length,
      payoutPerSession: noShowPayout,
      currency: (noShowConfig.currency) || INR,
      marksSessionUsed: noShowConfig.marksSessionUsed !== false,
      source: 'calculated',
      rule: 'A no-show earns no payout; the student session is marked as used.'
    },
    caps: {
      maxHoursPerDay: capReport.settings.maxHoursPerDay,
      minHoursPerDay: capReport.settings.minHoursPerDay,
      maxSessionsPerDay: capReport.settings.maxSessionsPerDay,
      completedSessionCount: completedSessions.length,
      payableSessionCount: payableSessions.length,
      cappedSessions: capReport.cappedSessions,
      violations: capReport.violations,
      totalsByDay: capReport.totalsByDay,
      source: capReport.source,
      note: capReport.note
    },
    policy: {
      rateRange: config.rateRange || null,
      maxHoursPerDay: config.maxHoursPerDay || null,
      maxSessionsPerDay: config.maxSessionsPerDay || null,
      minHoursPerDay: capReport.settings.minHoursPerDay,
      leaveNoticeHours: config.leaveNoticeHours ||
        (policy && policy.attendance && policy.attendance.leaveNoticeHours) || 48,
      leaveRules: config.leaveRules || null
    },
    knownRules: {
      applied: true,
      source: 'founder_brief',
      attendanceBonus: {
        initial: 2000,
        incrementPerConsecutiveMonth: 500,
        currency: INR
      },
      mvtAwards: [3000, 2000, 1000],
      fine: 'A trainer cancellation with less than 2 days notice costs that trainer exactly one session pay.',
      mutualLeave: 'Notice of 2+ days by either side is mutual leave with no payout, fine, pack or attendance penalty.',
      studentStatus: 'A late trainer cancellation marks the student session unattended; no-shows mark it used.',
      noShow: 'No payout for a no-show; the session is marked as used for the student.',
      caps: 'Max 6 hours/day and min 3 hours/day, with a 6-session/day ceiling in policy.'
    },
    dailySeries: buildDailySeries(user, payableSessions, period, config, options.asOf),
    provenance: options.provenance || 'mock'
  };
}

module.exports = {
  buildPayout: buildPayout,
  buildDailySeries: buildDailySeries,
  rateFor: rateFor,
  sessionHours: sessionHours,
  isNoShow: isNoShow,
  isMutualLeave: attendancePolicy.isMutualLeave,
  enforceDailyCaps: enforceDailyCaps,
  cancellationFines: cancellationFines,
  attendanceBonusFor: attendanceBonusFor,
  mvtRanking: mvtRanking
};
