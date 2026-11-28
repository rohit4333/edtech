/* ==========================================================================
   MATHIFY — relationship-manager pay view

   Read-only pay ledger for the manager desk. The founder owns every pay
   decision: the current rate comes from the founder-set monthly salary on the
   account, and a one-off founder penalty may carry a required reason. Nothing
   in this module writes a rate, an amount or a penalty decision, and the view
   exposes no edit/dismiss control. All money stays INR (₹).
   ========================================================================== */

const db = require('../db');
const adminAudit = require('./adminAuditService');

const INR = 'INR';

function dateKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/* Manager support actions are the session-equivalent evidence behind a daily
   accrual row. Only this manager's own audit actions count. */
function supportSessions(user, period) {
  const entries = adminAudit.list({ role: 'relationship_manager', limit: 500 }).entries || [];
  const byDate = {};
  entries.forEach(function (entry) {
    if (!entry || String(entry.actorId) !== String(user.id)) return;
    const date = dateKey(entry.at);
    if (!date || date.slice(0, 7) !== period) return;
    byDate[date] = (byDate[date] || 0) + 1;
  });
  return byDate;
}

function penaltyViews(rows, period) {
  return (Array.isArray(rows) ? rows : [])
    .filter(function (row) {
      if (!row || row.status === 'revoked') return false;
      const role = row.targetRole || 'trainer';
      if (role !== 'relationship_manager') return false;
      const date = dateKey(row.createdAt);
      return Boolean(date && date.slice(0, 7) === period);
    })
    .map(function (row) {
      return {
        id: row.id || null,
        date: dateKey(row.createdAt),
        amount: round(row.amount),
        currency: row.currency || INR,
        reason: String(row.reason || ''),
        status: 'applied',
        kind: 'founder_penalty',
        decidedByRole: 'founder',
      };
    });
}

/* The ledger is a projection of founder-owned records. A penalty row carries
   its date, amount and reason verbatim; the manager cannot edit or dismiss it. */
async function ledgerFor(user, options) {
  const settings = options || {};
  const period = settings.period || currentPeriod();
  const salary = Number(user && user.monthlySalary);
  const rate = Number.isFinite(salary) && salary > 0 ? round(salary) : 0;
  const parts = String(period).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate() || 30;
  const dailyAccrual = round(rate / daysInMonth);
  const rawPenalties =
    settings.penalties !== undefined
      ? settings.penalties
      : db.listFounderPenalties(String((user && user.id) || ''));
  const penalties = penaltyViews(await Promise.resolve(rawPenalties), period);
  const sessionsByDate = supportSessions(user, period);

  const entries = [];
  Object.keys(sessionsByDate)
    .sort()
    .forEach(function (date) {
      entries.push({
        date: date,
        sessions: sessionsByDate[date],
        amount: dailyAccrual,
        status: 'recorded',
        kind: 'daily_pay',
        reason: null,
        currency: INR,
      });
    });
  penalties.forEach(function (penalty) {
    entries.push({
      date: penalty.date,
      sessions: 0,
      amount: penalty.amount,
      status: 'founder penalty',
      kind: 'founder_penalty',
      reason: penalty.reason,
      currency: penalty.currency,
      decidedByRole: 'founder',
    });
  });
  entries.sort(function (left, right) {
    const byDate = String(left.date).localeCompare(String(right.date));
    if (byDate) return byDate;
    /* Accrual first, then the founder decision for the same day. */
    return left.kind === right.kind ? 0 : left.kind === 'daily_pay' ? -1 : 1;
  });

  let runningTotal = 0;
  entries.forEach(function (entry) {
    runningTotal = round(
      runningTotal + (entry.kind === 'founder_penalty' ? -entry.amount : entry.amount)
    );
    entry.runningTotal = runningTotal;
  });

  return {
    person: {
      id: user.id,
      name: user.name,
      role: 'relationship_manager',
    },
    period: period,
    currency: INR,
    rate: {
      amount: rate,
      currency: INR,
      cadence: 'monthly',
      label: 'Founder-set pay rate',
      setByRole: user.salarySetByRole || 'founder',
      updatedAt: user.salaryUpdatedAt || null,
      readOnly: true,
    },
    currentPayRate: rate,
    entries: entries,
    runningTotal: runningTotal,
    penalties: penalties,
    permissions: {
      canSetRate: false,
      canSetAmount: false,
      canEditPenalty: false,
      canDismissPenalty: false,
    },
    note: 'Your pay, rate and any one-off penalty are decided and recorded by the founder only. This ledger is read-only: you cannot create, change or remove an entry, a rate or a founder decision. Amounts are in INR (₹).',
  };
}

module.exports = {
  ledgerFor: ledgerFor,
  currentPeriod: currentPeriod,
};
