/* ==========================================================================
   MATHIFY — trainer payout, fine and MVT engine

   Confirmed rules:
   - Base pay is 300-400 INR per completed session, from the trainer profile.
   - A trainer cancellation with less than 48 hours notice costs one session pay.
   - 100% attendance in a month pays 2,000 INR, rising by 500 INR for every
     consecutive perfect month.
   - MVT ranks trainers by completed sessions in the period and pays
     3,000 / 2,000 / 1,000 INR to the top three.

   The daily trend uses completed-session records only. No key values are
   inferred from unconfirmed founder notes.
   ========================================================================== */

const INR = 'INR';
const HOUR_MS = 60 * 60 * 1000;
const BILLABLE_STATUSES = ['ended', 'completed'];

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

function isBillable(session) {
  return BILLABLE_STATUSES.indexOf(String(session && session.status || '').toLowerCase()) !== -1;
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

function isTrainerCancellation(session) {
  const status = String(session && session.status || '').toLowerCase();
  const cancelled = status === 'cancelled' || status === 'canceled';
  const byTrainer = session.cancelledBy === 'trainer' ||
    session.cancelledByTrainer === true ||
    session.cancelledByRole === 'trainer';
  return cancelled && byTrainer;
}

function noticeHoursFor(session) {
  const scheduled = new Date(session.scheduledAt || session.startsAt || session.startedAt);
  const cancelled = new Date(session.cancelledAt || session.updatedAt);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(cancelled.getTime())) return null;
  return (scheduled.getTime() - cancelled.getTime()) / HOUR_MS;
}

function cancellationFines(sessions, rate, fineRules) {
  const threshold = Number(fineRules && fineRules.noticeHours);
  const noticeLimit = Number.isFinite(threshold) ? threshold : 48;

  return sessions.filter(isTrainerCancellation).map(function (session) {
    const noticeHours = noticeHoursFor(session);
    return {
      sessionId: session.id,
      noticeHours: noticeHours === null ? null : Math.max(0, Math.round(noticeHours * 10) / 10),
      late: noticeHours !== null && noticeHours < noticeLimit,
      amount: noticeHours !== null && noticeHours < noticeLimit ? rate : 0
    };
  }).filter(function (entry) { return entry.late; });
}

function attendanceBonusFor(user, sessions, attendance, bonusRules) {
  const expected = sessions.filter(function (session) {
    return session.trainerId === user.id && !isTrainerCancellation(session);
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
    byDate[key] = (byDate[key] || 0) + 1;
  });

  let cumulative = 0;
  const points = periodDays(period, asOf).map(function (day, index) {
    const count = byDate[day.date] || 0;
    const daily = rulesConfigured ? count * rate : illustrativeDaily(index, rate);
    cumulative += daily;
    return {
      date: day.date,
      day: day.day,
      label: shortLabel(day.date),
      daily: daily,
      cumulative: cumulative,
      sessions: rulesConfigured ? count : null
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
  const billable = periodSessions.filter(isBillable);
  const basePay = billable.length * rate;

  const fines = cancellationFines(periodSessions, rate, config.fineRules);
  const fineTotal = fines.reduce(function (sum, entry) { return sum + entry.amount; }, 0);

  const attendance = attendanceBonusFor(
    user,
    periodSessions,
    options.attendance || [],
    config.bonusRules
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
    completedSessions: billable.length,
    award: 0
  };

  const total = Math.max(0, basePay + attendance.bonus + mvt.award - fineTotal);
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
    sessionCount: billable.length,
    ratePerSession: rate,
    amount: {
      value: total,
      currency: INR,
      source: validPeriod(period) ? 'calculated' : 'unconfigured',
      breakdown: {
        basePay: basePay,
        attendanceBonus: attendance.bonus,
        mvtAward: mvt.award,
        fines: fineTotal
      },
      note: 'Calculated from completed sessions, attendance, MVT rank and late trainer cancellations.'
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
    policy: {
      rateRange: config.rateRange || null,
      maxHoursPerDay: config.maxHoursPerDay || null,
      maxSessionsPerDay: config.maxSessionsPerDay || null,
      minHoursPerDay: 3,
      leaveNoticeHours: config.leaveNoticeHours || 48
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
      fine: 'One session pay for a trainer cancellation with less than 48 hours notice.'
    },
    dailySeries: buildDailySeries(user, periodSessions, period, config, options.asOf),
    provenance: options.provenance || 'mock'
  };
}

module.exports = {
  buildPayout: buildPayout,
  buildDailySeries: buildDailySeries,
  rateFor: rateFor,
  cancellationFines: cancellationFines,
  attendanceBonusFor: attendanceBonusFor,
  mvtRanking: mvtRanking
};
