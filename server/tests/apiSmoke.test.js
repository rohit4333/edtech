/* End-to-end HTTP smoke test. Boots the real Express app on an ephemeral port
   and exercises auth, RBAC, payouts, schedule, presence and mastery gating. */

const assert = require('assert');
const app = require('../app');

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(path, options) {
    const response = await fetch(base + path, options);
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch (error) { body = text; }
    return { status: response.status, body: body, text: text };
  }

  function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return call(path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  try {
    const health = await call('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);
    assert.strictEqual(health.body.service, 'mathify-server');

    const publicConfig = await call('/api/public/config');
    assert.strictEqual(publicConfig.status, 200);
    assert.strictEqual(publicConfig.body.supabase.secretKey, undefined);
    assert.strictEqual(/secretKey|SUPABASE_SECRET/.test(publicConfig.text), false);

    const anonymous = await call('/api/auth/me');
    assert.strictEqual(anonymous.status, 401);

    const badLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'wrong-password'
    });
    assert.strictEqual(badLogin.status, 401);

    const password = process.env.DEMO_PASSWORD || 'mathify-demo';
    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: password
    });
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: password
    });
    const founderLogin = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app', password: password
    });
    assert.strictEqual(trainerLogin.status, 200);
    assert.strictEqual(studentLogin.status, 200);
    assert.strictEqual(founderLogin.status, 200);

    const trainer = trainerLogin.body.token;
    const student = studentLogin.body.token;
    const founder = founderLogin.body.token;
    assert.strictEqual(trainerLogin.body.user.passwordHash, undefined);

    const me = await request('GET', '/api/auth/me', undefined, trainer);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.user.role, 'trainer');

    const studentPayout = await request('GET', '/api/trainer/payouts/2026-11', undefined, student);
    assert.strictEqual(studentPayout.status, 403);

    const payout = await request('GET', '/api/trainer/payouts/2026-11', undefined, trainer);
    assert.strictEqual(payout.status, 200);
    assert.strictEqual(typeof payout.body.payout.amount.value, 'number');
    assert.strictEqual(payout.body.payout.amount.currency, 'INR');

    const schedule = await request('GET', '/api/trainer/schedule?month=2026-11', undefined, trainer);
    assert.strictEqual(schedule.status, 200);
    assert.strictEqual(schedule.body.schedule.month, '2026-11');
    const daysWithSlots = schedule.body.schedule.days.filter(function (day) {
      return day.slots.length > 0;
    });
    assert.ok(daysWithSlots.length > 0);
    assert.strictEqual(typeof schedule.body.schedule.totals.unutilisedPay, 'number');

    const trainerLeave = await request('GET', '/api/leaves', undefined, trainer);
    assert.strictEqual(trainerLeave.status, 200);
    assert.strictEqual(trainerLeave.body.leave.balance.total, 8);

    const studentLeave = await request('GET', '/api/leaves', undefined, student);
    assert.strictEqual(studentLeave.status, 200);
    assert.strictEqual(studentLeave.body.leave.balance, null);

    const studentState = await request('GET', '/api/sessions/ses_math_000/state', undefined, student);
    assert.strictEqual(studentState.status, 200);
    assert.strictEqual(/trainer_instructions|trainerNotes|trainerInstructions/.test(studentState.text), false);

    const trainerState = await request('GET', '/api/sessions/ses_math_000/state', undefined, trainer);
    assert.strictEqual(trainerState.status, 200);

    const foreignSession = await request('GET', '/api/sessions/ses_math_002/state', undefined, student);
    assert.strictEqual(foreignSession.status, 200);

    const heartbeat = await request('POST', '/api/sessions/ses_math_002/presence', {
      active: true, learningEvents: 2
    }, trainer);
    assert.strictEqual(heartbeat.status, 200);
    assert.strictEqual(heartbeat.body.presence.viewerRole, 'trainer');
    assert.strictEqual(heartbeat.body.presence.payoutEligible, false);

    const studentEnd = await request('POST', '/api/sessions/ses_math_002/end', {
      currentQuizScore: 85
    }, student);
    assert.strictEqual(studentEnd.status, 403);

    const unlocked = await request('POST', '/api/sessions/ses_math_002/end', {
      currentQuizScore: 85
    }, trainer);
    assert.strictEqual(unlocked.status, 200);
    assert.strictEqual(unlocked.body.unlockedNext, true);
    assert.strictEqual(unlocked.body.reteachRequired, false);
    assert.strictEqual(typeof unlocked.body.recap.presence.participants.trainer.activeMinutes, 'number');
    assert.strictEqual(unlocked.body.recap.presence.payoutEligible, false);
    assert.ok(unlocked.body.presence);

    const endedAgain = await request('POST', '/api/sessions/ses_math_002/end', {
      currentQuizScore: 85
    }, trainer);
    assert.strictEqual(endedAgain.status, 409);

    const reteach = await request('POST', '/api/sessions/ses_math_003/end', {
      currentQuizScore: 62
    }, founder);
    assert.strictEqual(reteach.status, 200);
    assert.strictEqual(reteach.body.unlockedNext, false);
    assert.strictEqual(reteach.body.reteachRequired, true);

    const afterReteach = await request('GET', '/api/sessions/ses_math_003/state', undefined, trainer);
    assert.strictEqual(afterReteach.status, 200);
    assert.strictEqual(afterReteach.body.state.reteachRequired, true);

    const unknown = await call('/api/does-not-exist');
    assert.strictEqual(unknown.status, 404);

    console.log('apiSmoke: 33 assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
