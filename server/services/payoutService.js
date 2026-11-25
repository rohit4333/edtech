/* ==========================================================================
   MATHIFY — payout engine
   Base session pay is known from the trainer profile. Bonus, fine and MVT
   rules stay explicitly unresolved until the founder confirms the exact math.
   The daily series feeds the trainer dashboard trend chart; when totals are
   unconfigured it is an ILLUSTRATIVE preview and is labelled as such.
   ========================================================================== */

const INR = 'INR';

function pad(value) {
  return String(value).padStart(2, '0');
}

function toYmd(date) {
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
}

function periodDays(period, asOf) {
  const parts = String(period).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = asOf ? new Date(asOf) : new Date();
  let end = lastDay;
  if (today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month) {
    end = Math.min(lastDay, today.getUTCDate());
  }
  const days = [];
  for (let day = 1; day <= end; day += 1) {
    days.push({ date: toYmd(new Date(Date.UTC(year, month - 1, day))), day: day });
  }
  return days;
}

function shortLabel(date) {
  const parts = String(date).split('-').map(Number);
  const month = new Date(Date.UTC(parts[0], parts[1] - 1, 1))
    .toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
  return parts[2] + ' ' + month;
}

/* Deterministic preview so the trend shape is stable across reloads. */
function illustrativeDaily(index, rate) {
  if (index > 0 && index % 7 === 0) return 0;
  const wave = Math.sin(index * 1.35) * 1.5 + Math.cos(index * 0.52) * 1.15;
  const sessions = Math.max(1, Math.min(5, Math.round(3 + wave)));
  return sessions * rate;
}

function buildDailySeries(user, sessions, period, config) {
  const rate = user.payPerSession || 350;
  const rulesConfigured = Boolean(config.bonusRules && config.fineRules);
  const byDate = {};
  sessions.forEach(function (session) {
    if (!session.startedAt) return;
    const date = String(session.startedAt).slice(0, 10);
    byDate[date] = (byDate[date] || 0) + 1;
  });

  let cumulative = 0;
  const points = periodDays(period).map(function (day, index) {
    const daily = rulesConfigured
      ? (byDate[day.date] || 0) * rate
      : illustrativeDaily(index, rate);
    cumulative += daily;
    return {
      date: day.date,
      day: day.day,
      label: shortLabel(day.date),
      daily: daily,
      cumulative: cumulative,
      sessions: rulesConfigured ? (byDate[day.date] || 0) : null
    };
  });

  return {
    period: period,
    currency: INR,
    source: rulesConfigured ? 'session_records' : 'illustrative',
    isIllustrative: !rulesConfigured,
    points: points,
    note: rulesConfigured
      ? 'Base pay from recorded sessions. Bonuses and fines are not included.'
      : 'Illustrative trend preview. Final amounts unlock when payout rules are confirmed.'
  };
}

function buildPayout(user, sessions, period, policy) {
  const config = (policy && policy.payout) || {};
  const inPeriod = sessions.filter(function (session) {
    return session.startedAt && String(session.startedAt).slice(0, 7) === period;
  });
  const parts = String(period).split('-').map(Number);
  const statementDate = new Date(Date.UTC(parts[0], parts[1], 1)).toISOString().slice(0, 10);

  return {
    trainer: {
      id: user.id,
      name: user.name,
      role: user.role
    },
    period: period,
    statementDate: statementDate,
    sessionCount: inPeriod.length,
    ratePerSession: user.payPerSession || null,
    amount: {
      value: null,
      currency: INR,
      source: 'unconfigured',
      note: 'Payout totals are not calculated until bonus and fine rules are confirmed.'
    },
    bonuses: {
      value: null,
      rules: config.bonusRules || null,
      source: 'unconfigured'
    },
    fines: {
      value: null,
      rules: config.fineRules || null,
      source: 'unconfigured'
    },
    mvtAward: {
      value: null,
      source: 'unconfigured',
      note: 'MVT ranks and eligibility are not published yet.'
    },
    policy: {
      rateRange: config.rateRange || null,
      maxHoursPerDay: config.maxHoursPerDay || null,
      maxSessionsPerDay: config.maxSessionsPerDay || null,
      minHoursPerDay: 3
    },
    /* Stated in the founder brief, recorded but deliberately NOT applied. */
    knownRules: {
      applied: false,
      source: 'founder_brief',
      attendanceBonus: {
        initial: 2000,
        incrementPerConsecutiveMonth: 500,
        currency: INR
      },
      mvtAwards: [3000, 2000, 1000],
      lateNoticeHours: 48,
      caps: { minHoursPerDay: 3, maxHoursPerDay: 6 },
      note: 'Recorded for the payout engine. Exact fine math, ranking period and eligibility still need sign-off.'
    },
    dailySeries: buildDailySeries(user, inPeriod, period, config),
    provenance: 'mock'
  };
}

module.exports = { buildPayout: buildPayout, buildDailySeries: buildDailySeries };
