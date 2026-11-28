/* Founder-confirmed pay boundary over HTTP.
 *
 * The manager reads every trainer pay statement and may update the single
 * shared demo/regular session rate, including for an active trainer. Salary,
 * penalties/fines, founder settings and the gratitude credit are founder-only.
 * The founder keeps the same read view and every editing power. No live
 * database is used. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const db = require('../db');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

/* Static assertions use whitespace-tolerant regexes so prettier formatting
   never turns a contract check into a false failure. */
function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');
}
function present(source, pattern, label) {
  assert.strictEqual(pattern.test(source), true, label);
  checks += 1;
}
function absent(source, pattern, label) {
  assert.strictEqual(pattern.test(source), false, label);
  checks += 1;
}

function unique(seed) {
  return seed + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () {
      resolve(instance);
    });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
    return { status: response.status, body: data, text: text };
  }

  try {
    const founderLogin = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app',
      password: 'mathify-demo',
    });
    const rmLogin = await request('POST', '/api/auth/login', {
      email: 'rm@mathify.app',
      password: 'mathify-demo',
    });
    equal(founderLogin.status, 200, 'founder can sign in');
    equal(rmLogin.status, 200, 'manager can sign in');
    const founderToken = founderLogin.body.token;
    const rmToken = rmLogin.body.token;

    const trainerId = unique('usr_payaccess_trainer');
    await db.insertUser({
      id: trainerId,
      name: 'Pay Access Trainer',
      email: unique('payaccess') + '@mathify.test',
      role: 'trainer',
      status: 'active',
      createdAt: new Date().toISOString(),
      payPerSession: 350,
      accessGrantedAt: new Date().toISOString(),
      accessGrantedByRole: 'founder',
      rateLockedAt: new Date().toISOString(),
      rateSetByRole: 'founder',
    });
    const currentPeriod = new Date().toISOString().slice(0, 7);
    /* Read an existing trainer with session history so the statement periods
       are genuinely derived from records rather than hardcoded in the test. */
    const allSessions = await Promise.resolve(db.listSessionsForUser({ role: 'founder' }));
    const historical = (allSessions || []).find(function (session) {
      return session && session.trainerId && session.trainerId !== trainerId;
    });
    const readTrainerId = historical ? historical.trainerId : trainerId;
    const expectedPeriods = {};
    (allSessions || []).forEach(function (session) {
      if (!session || session.trainerId !== readTrainerId) return;
      const value = session.startedAt || session.startsAt || session.scheduledAt;
      const date = value ? new Date(value) : null;
      if (date && !Number.isNaN(date.getTime()))
        expectedPeriods[date.toISOString().slice(0, 7)] = true;
    });
    expectedPeriods[currentPeriod] = true;

    const detailRoute = '/api/admin/people/trainer/' + encodeURIComponent(readTrainerId);
    const rmDetail = await request('GET', detailRoute, undefined, rmToken);
    equal(rmDetail.status, 200, 'manager can open any trainer detail');
    const rmPayouts = (rmDetail.body && rmDetail.body.payouts) || [];
    ok(
      Array.isArray(rmPayouts) && rmPayouts.length >= Object.keys(expectedPeriods).length,
      'manager detail carries every derived period plus the current period'
    );
    const rmPeriods = rmPayouts.map(function (row) {
      return row.period;
    });
    Object.keys(expectedPeriods).forEach(function (period) {
      ok(rmPeriods.indexOf(period) !== -1, 'manager statement covers period ' + period);
    });
    const currentStatement = rmPayouts.find(function (row) {
      return row.period === currentPeriod;
    });
    ok(
      Boolean(currentStatement && currentStatement.amount && currentStatement.amount.breakdown),
      'manager receives a complete current-pay statement'
    );
    [
      'basePay',
      'stretchPay',
      'attendanceBonus',
      'mvtAward',
      'slotPay',
      'founderGratitude',
      'fines',
    ].forEach(function (key) {
      ok(
        Object.prototype.hasOwnProperty.call(currentStatement.amount.breakdown, key),
        'manager statement includes ' + key
      );
    });
    ok(
      Boolean(
        currentStatement.sessionTiming &&
        currentStatement.sessionTiming.sessions &&
        currentStatement.caps &&
        currentStatement.amount.note
      ),
      'manager statement includes session timing, caps and notes without redaction'
    );
    ok(
      !/passwordHash|passwordSalt/.test(rmDetail.text),
      'full pay visibility still excludes credential fields'
    );

    const founderDetail = await request('GET', detailRoute, undefined, founderToken);
    equal(founderDetail.status, 200, 'founder keeps full trainer detail access');
    ok(
      Array.isArray(founderDetail.body.payouts) && founderDetail.body.payouts.length >= 2,
      'founder receives the same full pay statement history'
    );

    const rateRoute = '/api/admin/people/' + encodeURIComponent(trainerId) + '/base-rate';
    const rmRate = await request('PATCH', rateRoute, { rate: 372.5 }, rmToken);
    equal(rmRate.status, 200, 'manager can update an active trainer session rate');
    equal(rmRate.body.person.payPerSession, 372.5, 'manager rate is stored exactly');
    equal(
      rmRate.body.person.rateSetByRole,
      'relationship_manager',
      'manager rate records its author role'
    );
    const founderRate = await request('PATCH', rateRoute, { rate: 365 }, founderToken);
    equal(founderRate.status, 200, 'founder can still update the same rate');
    equal(founderRate.body.person.rateSetByRole, 'founder', 'founder rate records its author role');

    const salaryRoute = '/api/admin/people/usr_rm_001/monthly-salary';
    const rmSalary = await request('PATCH', salaryRoute, { amount: 99000 }, rmToken);
    equal(rmSalary.status, 403, 'manager cannot set a salary');
    equal(rmSalary.body.error, 'FORBIDDEN', 'salary denial is a role gate');
    const founderSalary = await request('PATCH', salaryRoute, { amount: 99000 }, founderToken);
    equal(founderSalary.status, 200, 'founder can set a salary');
    equal(founderSalary.body.person.monthlySalary, 99000, 'founder salary change is stored');
    await request('PATCH', salaryRoute, { amount: 35000 }, founderToken);

    /* The manager's own pay is a founder-owned read-only ledger. A manager can
       read only their own row and can never add, change or dismiss a decision. */
    const rmPayRoute = '/api/admin/rm-payment/usr_rm_001';
    const ownPay = await request('GET', rmPayRoute, undefined, rmToken);
    equal(ownPay.status, 200, 'manager can open their own payment ledger');
    equal(ownPay.body.rate.amount, 35000, 'ledger shows the founder-set monthly rate');
    equal(ownPay.body.rate.readOnly, true, 'the shown rate is explicitly read only');
    equal(ownPay.body.permissions.canSetRate, false, 'manager cannot set a rate');
    equal(ownPay.body.permissions.canSetAmount, false, 'manager cannot set an amount');
    equal(ownPay.body.permissions.canEditPenalty, false, 'manager cannot edit a penalty');
    equal(ownPay.body.permissions.canDismissPenalty, false, 'manager cannot dismiss a penalty');
    equal(ownPay.body.currency, 'INR', 'manager pay stays in INR');

    const otherRmId = unique('usr_other_rm');
    await db.insertUser({
      id: otherRmId,
      name: 'Other Manager',
      email: unique('other-rm') + '@mathify.test',
      role: 'relationship_manager',
      status: 'active',
      monthlySalary: 42000,
      createdAt: new Date().toISOString(),
    });
    const otherPay = await request(
      'GET',
      '/api/admin/rm-payment/' + encodeURIComponent(otherRmId),
      undefined,
      rmToken
    );
    equal(otherPay.status, 403, 'manager cannot open another manager’s ledger');
    const otherDetail = await request(
      'GET',
      '/api/admin/people/relationship_manager/' + encodeURIComponent(otherRmId),
      undefined,
      rmToken
    );
    equal(otherDetail.status, 403, 'manager cannot open another manager’s pay detail');

    const rmPenaltyRoute = '/api/admin/people/usr_rm_001/penalties';
    const selfPenalty = await request(
      'POST',
      rmPenaltyRoute,
      { amount: 100, reason: 'Manager self penalty attempt' },
      rmToken
    );
    equal(selfPenalty.status, 403, 'manager cannot record a penalty on their own pay');
    const missingReason = await request('POST', rmPenaltyRoute, { amount: 100 }, founderToken);
    equal(missingReason.status, 422, 'a manager penalty without a reason is rejected');
    equal(missingReason.body.error, 'INVALID_REASON', 'the required reason has its own error code');
    const founderRmPenalty = await request(
      'POST',
      rmPenaltyRoute,
      { amount: 125, reason: 'Founder recorded RM penalty' },
      founderToken
    );
    equal(founderRmPenalty.status, 200, 'founder can record a one-off manager penalty');
    equal(
      founderRmPenalty.body.penalty.targetRole,
      'relationship_manager',
      'the manager penalty is tagged to the manager role'
    );
    const withPenalty = await request('GET', rmPayRoute, undefined, rmToken);
    ok(
      withPenalty.body.penalties.some(function (row) {
        return (
          row.amount === 125 && row.reason === 'Founder recorded RM penalty' && Boolean(row.date)
        );
      }),
      'manager ledger shows the dated penalty amount and required reason'
    );
    ok(
      withPenalty.body.entries.some(function (row) {
        return (
          row.kind === 'founder_penalty' &&
          row.status === 'founder penalty' &&
          row.reason === 'Founder recorded RM penalty' &&
          Boolean(row.runningTotal !== undefined)
        );
      }),
      'manager ledger includes the penalty as a read-only dated entry'
    );
    const rmPenaltyRevoke = await request(
      'PATCH',
      '/api/admin/penalties/' + encodeURIComponent(founderRmPenalty.body.penalty.id) + '/revoke',
      {},
      rmToken
    );
    equal(rmPenaltyRevoke.status, 403, 'manager cannot revoke their founder-recorded penalty');

    const penaltyRoute = '/api/admin/people/' + encodeURIComponent(trainerId) + '/penalties';
    const rmPenalty = await request(
      'POST',
      penaltyRoute,
      {
        amount: 250,
        reason: 'Manager penalty attempt',
      },
      rmToken
    );
    equal(rmPenalty.status, 403, 'manager cannot record a penalty or fine');
    const founderPenalty = await request(
      'POST',
      penaltyRoute,
      {
        amount: 250,
        reason: 'Founder penalty decision',
      },
      founderToken
    );
    equal(founderPenalty.status, 200, 'founder can record a penalty');
    const penaltyId = founderPenalty.body.penalty.id;
    const revokeRoute = '/api/admin/penalties/' + encodeURIComponent(penaltyId) + '/revoke';
    const rmRevoke = await request('PATCH', revokeRoute, {}, rmToken);
    equal(rmRevoke.status, 403, 'manager cannot revoke a penalty or fine');
    const founderRevoke = await request('PATCH', revokeRoute, {}, founderToken);
    equal(founderRevoke.status, 200, 'founder can revoke a penalty');
    equal(founderRevoke.body.penalty.status, 'revoked', 'founder revocation is recorded');

    const settingsRoute = '/api/admin/settings';
    const rmSettings = await request('GET', settingsRoute, undefined, rmToken);
    equal(rmSettings.status, 403, 'manager cannot read founder settings');
    const policyPatch = { section: 'policy', values: { 'quiz.unlockThreshold': 85 } };
    const rmPolicy = await request('PATCH', settingsRoute, policyPatch, rmToken);
    equal(rmPolicy.status, 403, 'manager cannot edit founder policy settings');
    const founderPolicy = await request('PATCH', settingsRoute, policyPatch, founderToken);
    equal(founderPolicy.status, 200, 'founder can edit policy settings');
    equal(founderPolicy.body.policy.quiz.unlockThreshold, 85, 'founder policy edit is applied');

    const gratitudePatch = {
      section: 'policy',
      values: { 'payout.founderGratitude.amount': 5000 },
    };
    const rmGratitude = await request('PATCH', settingsRoute, gratitudePatch, rmToken);
    equal(rmGratitude.status, 403, 'manager cannot reach the gratitude-credit edit route');
    const founderGratitude = await request('PATCH', settingsRoute, gratitudePatch, founderToken);
    equal(founderGratitude.status, 400, 'the gratitude amount stays locked even for the founder');
    equal(
      founderGratitude.body.error,
      'FIELD_READ_ONLY',
      'gratitude money is not an editable setting'
    );
    await request('DELETE', settingsRoute, undefined, founderToken);

    const rmHtml = read('rm/index.html');
    const rmClient = read('rm/app.js');
    present(
      rmHtml,
      /href\s*=\s*["']\/rm\/payment["']/,
      'the manager rail links to the payment page'
    );
    present(rmHtml, /id\s*=\s*["']rm-payment["']/, 'the payment page has its own section');
    present(rmHtml, /id\s*=\s*["']rmPayRate["']/, 'the current founder-set rate is displayed');
    present(rmHtml, /id\s*=\s*["']rmPayLedger["']/, 'the daily ledger is present');
    present(
      rmHtml,
      /id\s*=\s*["']rmPayPenalties["']/,
      'founder penalties with reasons are visible'
    );
    const paymentSection = (rmHtml.match(
      /<section[^>]*id\s*=\s*["']rm-payment["'][\s\S]*?<\/section>/i
    ) || [''])[0];
    absent(paymentSection, /<\s*form\b/i, 'the manager payment section has no editing form');
    absent(
      paymentSection,
      /penalty-policy|automated\s+penalt/i,
      'the manager payment section has no penalty policy or automated rules'
    );
    present(
      rmClient,
      /\/admin\/rm-payment\//,
      'the manager client reads the dedicated ledger route'
    );
    present(
      rmClient,
      /penalty\.reason|entry\.reason/,
      'the manager client renders founder reasons'
    );
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }

  console.log('rmPayAccess: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
