/* End-to-end HTTP smoke test. Boots the real Express app on an ephemeral port
   and exercises auth, RBAC, payouts, schedule, presence and mastery gating. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const realtime = require('../realtime');
const whatsappAi = require('../services/whatsappAiService');
const notifications = require('../services/notificationService');
const razorpay = require('../services/razorpayService');

/* Keep the smoke test on deterministic AI output even when .env has Cloudflare. */
const cloudflareKeys = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_MODEL',
  'CLOUDFLARE_TIMEOUT_MS',
];
const originalCloudflare = {};
cloudflareKeys.forEach(function (key) {
  originalCloudflare[key] = process.env[key];
});

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () {
      resolve(instance);
    });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(path, options) {
    const response = await fetch(base + path, options);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = text;
    }
    return {
      status: response.status,
      body: body,
      text: text,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return call(path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  function collectKeys(value, out) {
    if (!value || typeof value !== 'object') return out;
    Object.keys(value).forEach(function (key) {
      out.push(key);
      collectKeys(value[key], out);
    });
    return out;
  }

  try {
    cloudflareKeys.forEach(function (key) {
      delete process.env[key];
    });

    const health = await call('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);
    assert.strictEqual(health.body.service, 'mathify-server');

    const publicConfig = await call('/api/public/config');
    assert.strictEqual(publicConfig.status, 200);
    assert.strictEqual(publicConfig.body.supabase.secretKey, undefined);
    assert.strictEqual(/secretKey|SUPABASE_SECRET/.test(publicConfig.text), false);

    /* One origin serves the reviewed UI while hiding server and git files. */
    const homePage = await call('/');
    assert.strictEqual(homePage.status, 200);
    assert.ok(/text\/html/.test(homePage.headers['content-type'] || ''));
    assert.ok(homePage.text.indexOf('Mathify') !== -1);
    const pricingPage = await call('/pricing.html');
    assert.strictEqual(pricingPage.status, 200);
    const studentPage = await call('/student/index.html');
    assert.strictEqual(studentPage.status, 200);
    const founderPage = await call('/founder/index.html');
    assert.strictEqual(founderPage.status, 200);
    assert.ok(founderPage.text.indexOf('Founder settings') !== -1);
    const studentClient = await call('/student/api.js');
    assert.strictEqual(studentClient.status, 200);
    assert.ok(studentClient.text.indexOf("window.MATHIFY_API_BASE || '/api'") !== -1);
    assert.strictEqual(studentClient.text.indexOf('http://localhost:4000'), -1);
    const serverSource = await call('/server/app.js');
    assert.strictEqual(serverSource.status, 404);
    const gitConfig = await call('/.git/config');
    assert.strictEqual(gitConfig.status, 404);

    const anonymous = await call('/api/auth/me');
    assert.strictEqual(anonymous.status, 401);

    const badLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app',
      password: 'wrong-password',
    });
    assert.strictEqual(badLogin.status, 401);

    const password = process.env.DEMO_PASSWORD || 'mathify-demo';
    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app',
      password: password,
    });
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app',
      password: password,
    });
    const founderLogin = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app',
      password: password,
    });
    const parentLogin = await request('POST', '/api/auth/login', {
      email: 'parent@mathify.app',
      password: password,
    });
    assert.strictEqual(trainerLogin.status, 200);
    assert.strictEqual(studentLogin.status, 200);
    assert.strictEqual(founderLogin.status, 200);
    assert.strictEqual(parentLogin.status, 200);

    const trainer = trainerLogin.body.token;
    const student = studentLogin.body.token;
    const founder = founderLogin.body.token;
    const parent = parentLogin.body.token;
    assert.strictEqual(trainerLogin.body.user.passwordHash, undefined);

    /* Privacy boundary: auth and demo endpoints carry no contact data. */
    const demoInfo = await call('/api/auth/demo');
    assert.strictEqual(demoInfo.status, 200);
    assert.strictEqual(/@/.test(demoInfo.text), false);
    assert.strictEqual(
      demoInfo.body.accounts.some(function (account) {
        return account.role === 'parent';
      }),
      true
    );
    [trainerLogin, studentLogin, founderLogin, parentLogin].forEach(function (login) {
      assert.deepStrictEqual(Object.keys(login.body.user).sort(), ['id', 'name', 'role']);
      assert.strictEqual(login.body.user.email, undefined);
      assert.strictEqual(login.body.user.phone, undefined);
    });

    const me = await request('GET', '/api/auth/me', undefined, trainer);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.user.role, 'trainer');

    /* Parent session packs: SAR-only server pricing, mock checkout, immediate
       child balance credit, and hard rejection of client-supplied money. */
    const packBefore = await request('GET', '/api/parent/wallet', undefined, parent);
    assert.strictEqual(packBefore.status, 200);
    assert.strictEqual(packBefore.body.currency, 'SAR');
    assert.strictEqual(packBefore.body.pricing.pricePerSessionSAR, 90);
    assert.strictEqual(packBefore.body.pricing.discountPercent, 5);
    assert.strictEqual(packBefore.body.sessionsRemaining, 8);
    const anonymousWallet = await request('GET', '/api/parent/wallet');
    assert.strictEqual(anonymousWallet.status, 401);
    const studentWallet = await request('GET', '/api/parent/wallet', undefined, student);
    assert.strictEqual(studentWallet.status, 403);

    const quote40 = await request('GET', '/api/parent/pack/quote?count=40', undefined, parent);
    assert.strictEqual(quote40.status, 200);
    assert.strictEqual(quote40.body.quote.deck, 'bulk');
    assert.strictEqual(quote40.body.quote.subtotalSAR, 3600);
    assert.strictEqual(quote40.body.quote.discountSAR, 0);
    assert.strictEqual(quote40.body.quote.totalSAR, 3600);
    const quote41 = await request('GET', '/api/parent/pack/quote?count=41', undefined, parent);
    assert.strictEqual(quote41.body.quote.subtotalSAR, 3690);
    assert.strictEqual(quote41.body.quote.discountSAR, 184.5);
    assert.strictEqual(quote41.body.quote.totalSAR, 3505.5);
    const quote100 = await request('GET', '/api/parent/pack/quote?count=100', undefined, parent);
    assert.strictEqual(quote100.body.quote.subtotalSAR, 9000);
    assert.strictEqual(quote100.body.quote.totalSAR, 8550);
    const badQuote = await request('GET', '/api/parent/pack/quote?count=3', undefined, parent);
    assert.strictEqual(badQuote.status, 400);

    for (const count of [3, 101, 4.5, '4', null]) {
      const rejected = await request('POST', '/api/parent/pack/checkout', { count: count }, parent);
      assert.strictEqual(rejected.status, 400, 'count ' + String(count) + ' is rejected');
      assert.strictEqual(rejected.body.error, 'INVALID_SESSION_COUNT');
    }
    const clientMoney = await request(
      'POST',
      '/api/parent/pack/checkout',
      {
        count: 4,
        amount: 1,
        currency: 'INR',
      },
      parent
    );
    assert.strictEqual(clientMoney.status, 400);
    assert.strictEqual(clientMoney.body.error, 'CLIENT_AMOUNT_REJECTED');
    const checkoutAsStudent = await request(
      'POST',
      '/api/parent/pack/checkout',
      {
        count: 4,
      },
      student
    );
    assert.strictEqual(checkoutAsStudent.status, 403);

    let providerCalls = 0;
    const savedCreateOrder = razorpay.createMonthlyPackOrder;
    razorpay.createMonthlyPackOrder = function () {
      providerCalls += 1;
      throw new Error('mock checkout must never call Razorpay');
    };
    try {
      const credit40 = await request('POST', '/api/parent/pack/checkout', { count: 40 }, parent);
      assert.strictEqual(credit40.status, 201);
      assert.strictEqual(credit40.body.quote.totalSAR, 3600);
      assert.strictEqual(credit40.body.quote.discountApplied, false);
      assert.strictEqual(credit40.body.receipt, '40 sessions credited · SAR 3600');
      assert.strictEqual(credit40.body.balance, 48);
      assert.strictEqual(credit40.body.payment.provider, 'mock');
      assert.strictEqual(credit40.body.payment.currency, 'SAR');
      assert.strictEqual(credit40.body.pack.studentId, 'usr_student_001');
      assert.strictEqual(/razorpay/i.test(credit40.text), false);

      const credit41 = await request('POST', '/api/parent/pack/checkout', { count: 41 }, parent);
      assert.strictEqual(credit41.status, 201);
      assert.strictEqual(credit41.body.quote.discountPercent, 5);
      assert.strictEqual(credit41.body.quote.totalSAR, 3505.5);
      assert.strictEqual(credit41.body.balance, 89);

      const credit100 = await request('POST', '/api/parent/pack/checkout', { count: 100 }, parent);
      assert.strictEqual(credit100.status, 201);
      assert.strictEqual(credit100.body.quote.discountPercent, 5);
      assert.strictEqual(credit100.body.quote.totalSAR, 8550);
      assert.strictEqual(credit100.body.balance, 189);
      assert.strictEqual(providerCalls, 0, 'no checkout reached an external payment provider');

      const packAfter = await request('GET', '/api/parent/wallet', undefined, parent);
      assert.strictEqual(packAfter.body.sessionsRemaining, 189);
      assert.strictEqual(db.findUserById('usr_student_001').sessionsRemaining, 189);
    } finally {
      razorpay.createMonthlyPackOrder = savedCreateOrder;
    }

    /* Parent ↔ trainer chat is human-only, role-scoped and DLP-guarded. */
    const parentThread = await request(
      'GET',
      '/api/parent-chat/thread/usr_student_001',
      undefined,
      parent
    );
    assert.strictEqual(parentThread.status, 200);
    assert.strictEqual(parentThread.body.threadId, 'usr_student_001');
    assert.strictEqual(parentThread.body.studentId, 'usr_student_001');
    const trainerThread = await request(
      'GET',
      '/api/parent-chat/thread/usr_student_001',
      undefined,
      trainer
    );
    assert.strictEqual(trainerThread.status, 200);
    const studentThread = await request(
      'GET',
      '/api/parent-chat/thread/usr_student_001',
      undefined,
      student
    );
    assert.strictEqual(studentThread.status, 403);
    const foreignThread = await request(
      'GET',
      '/api/parent-chat/thread/usr_student_002',
      undefined,
      parent
    );
    assert.strictEqual(foreignThread.status, 403);
    const unassignedThread = await request(
      'GET',
      '/api/parent-chat/thread/usr_student_002',
      undefined,
      trainer
    );
    assert.strictEqual(unassignedThread.status, 403);
    const parentFlags = await request('GET', '/api/parent-chat/flags', undefined, parent);
    assert.strictEqual(parentFlags.status, 403);
    const founderFlags = await request('GET', '/api/parent-chat/flags', undefined, founder);
    assert.strictEqual(founderFlags.status, 200);
    const blockedParentMessage = await request(
      'POST',
      '/api/parent-chat/thread/usr_student_001/messages',
      {
        body: 'Call me at +91 98765 43210',
      },
      parent
    );
    assert.strictEqual(blockedParentMessage.status, 422);
    assert.strictEqual(blockedParentMessage.body.error, 'CONTENT_BLOCKED');
    assert.strictEqual(blockedParentMessage.text.indexOf('9876543210'), -1);
    const safeParentMessage = await request(
      'POST',
      '/api/parent-chat/thread/usr_student_001/messages',
      {
        body: 'Could we review ratios in class?',
      },
      parent
    );
    assert.strictEqual(safeParentMessage.status, 200);
    assert.strictEqual(safeParentMessage.body.message.senderRole, 'parent');
    ['answerKey', 'trainerNotes', 'rawBody', 'passwordHash'].forEach(function (key) {
      assert.strictEqual(JSON.stringify(safeParentMessage.body).indexOf('"' + key + '"'), -1);
    });

    /* Founder settings drafts are founder-only; money and network contracts
       cannot be promoted into editable fields by a crafted request. */
    const founderSettings = await request('GET', '/api/admin/settings', undefined, founder);
    assert.strictEqual(founderSettings.status, 200);
    assert.strictEqual(founderSettings.body.storage, 'runtime');
    assert.strictEqual(
      founderSettings.body.readOnlyMoney.every(function (item) {
        return item.readOnly === true;
      }),
      true
    );
    const settingsAsStudent = await request('GET', '/api/admin/settings', undefined, student);
    assert.strictEqual(settingsAsStudent.status, 403);
    const moneyPatch = await request(
      'PATCH',
      '/api/admin/settings',
      {
        section: 'policy',
        values: { 'payout.rateRange': [1, 1] },
      },
      founder
    );
    assert.strictEqual(moneyPatch.status, 400);
    assert.strictEqual(moneyPatch.body.error, 'FIELD_READ_ONLY');
    const networkPatch = await request(
      'PATCH',
      '/api/admin/settings',
      {
        section: 'trainerPolicy',
        values: { 'networkCheck.minDownloadMbps': 1 },
      },
      founder
    );
    assert.strictEqual(networkPatch.status, 400);
    const masteryPatch = await request(
      'PATCH',
      '/api/admin/settings',
      {
        section: 'mastery',
        values: { 'masteryGating.unlockThreshold': 85 },
      },
      founder
    );
    assert.strictEqual(masteryPatch.status, 200);
    assert.strictEqual(masteryPatch.body.policy.masteryGating.unlockThreshold, 85);
    const settingsReset = await request('DELETE', '/api/admin/settings', undefined, founder);
    assert.strictEqual(settingsReset.status, 200);
    assert.strictEqual(settingsReset.body.policy.masteryGating.unlockThreshold, 80);

    /* AI chat endpoints are role-scoped and fall back honestly without creds. */
    const tutorReply = await request(
      'POST',
      '/api/student/tutor/query',
      {
        question: 'How do I start the ratios problem?',
        sessionId: 'ses_math_001',
      },
      student
    );
    assert.strictEqual(tutorReply.status, 200);
    assert.strictEqual(tutorReply.body.source, 'fallback');
    assert.strictEqual(typeof tutorReply.body.reply, 'string');
    const tutorAsTrainer = await request(
      'POST',
      '/api/student/tutor/query',
      {
        question: 'Hello',
      },
      trainer
    );
    assert.strictEqual(tutorAsTrainer.status, 403);
    const tutorOtherStudent = await request(
      'POST',
      '/api/student/tutor/query',
      {
        question: 'Hello',
        studentId: 'usr_trainer_001',
      },
      student
    );
    assert.strictEqual(tutorOtherStudent.status, 403);

    const copilotReply = await request(
      'POST',
      '/api/trainer/copilot/query',
      {
        question: 'Plan the next 1-on-1 step?',
        sessionId: 'ses_math_001',
      },
      trainer
    );
    assert.strictEqual(copilotReply.status, 200);
    assert.strictEqual(copilotReply.body.source, 'fallback');
    const copilotAsStudent = await request(
      'POST',
      '/api/trainer/copilot/query',
      {
        question: 'Hello',
      },
      student
    );
    assert.strictEqual(copilotAsStudent.status, 403);

    /* New Worker bridges stay role-scoped and honest without credentials. */
    const buddyReply = await request(
      'POST',
      '/api/chat/student-doubt',
      {
        question: 'How do I start this ratio?',
      },
      student
    );
    assert.strictEqual(buddyReply.status, 200);
    assert.strictEqual(typeof buddyReply.body.reply, 'string');
    assert.strictEqual(buddyReply.body.reply.indexOf('Study Buddy') !== -1, true);
    const buddyAsTrainer = await request(
      'POST',
      '/api/chat/student-doubt',
      {
        question: 'Hello',
      },
      trainer
    );
    assert.strictEqual(buddyAsTrainer.status, 403);
    const deskReply = await request(
      'POST',
      '/api/chat/trainer-support',
      {
        question: 'What is the payout range?',
      },
      trainer
    );
    assert.strictEqual(deskReply.status, 200);
    assert.strictEqual(deskReply.body.reply.indexOf('Trainer Desk') !== -1, true);
    const deskAsStudent = await request(
      'POST',
      '/api/chat/trainer-support',
      {
        question: 'Hello',
      },
      student
    );
    assert.strictEqual(deskAsStudent.status, 403);

    /* Mastery self-practice batches ten questions, ramps difficulty 15% per
       batch and caps a topic at 80. Answer keys stay server-side. */
    const batchOne = await request(
      'POST',
      '/api/student/practice/batch',
      { topic: 'Ratios' },
      student
    );
    assert.strictEqual(batchOne.status, 200);
    assert.strictEqual(batchOne.body.unlimitedTopics, true);
    assert.strictEqual(batchOne.body.topicLimit, 80);
    assert.strictEqual(batchOne.body.topicRemaining, 70);
    assert.strictEqual(batchOne.body.batch.questions.length, 10);
    assert.strictEqual(batchOne.body.batch.topicLimit, 80);
    assert.strictEqual(batchOne.body.batch.topicTotal, 10);
    assert.strictEqual(batchOne.body.batch.difficultyPercent, 0);
    batchOne.body.batch.questions.forEach(function (question) {
      assert.strictEqual(question.answerIndex, undefined);
      assert.strictEqual(question.correctAnswer, undefined);
      assert.strictEqual(question.hint, undefined);
      assert.strictEqual(question.explanation, undefined);
      assert.strictEqual(question.trainerInstructions, undefined);
      assert.strictEqual(question.misconception_watch, undefined);
    });
    const practiceAnswer = await request(
      'POST',
      '/api/student/practice/batch/' + batchOne.body.batch.id + '/answer',
      {
        questionId: batchOne.body.batch.questions[0].id,
        optionIndex: 0,
      },
      student
    );
    assert.strictEqual(practiceAnswer.status, 200);
    assert.strictEqual(typeof practiceAnswer.body.result.correct, 'boolean');
    assert.strictEqual(practiceAnswer.body.result.correctOptionIndex, undefined);
    assert.strictEqual(practiceAnswer.body.result.answerIndex, undefined);
    assert.strictEqual(practiceAnswer.body.result.correctAnswer, undefined);
    const batchTwo = await request(
      'POST',
      '/api/student/practice/batch',
      {
        topic: 'Ratios',
        previousBatchId: batchOne.body.batch.id,
      },
      student
    );
    assert.strictEqual(batchTwo.status, 200);
    assert.strictEqual(batchTwo.body.batch.questions.length, 10);
    assert.strictEqual(batchTwo.body.batch.iteration, 1);
    assert.strictEqual(batchTwo.body.batch.difficultyPercent, 15);
    assert.strictEqual(batchTwo.body.batch.topicTotal, 20);
    [
      'answerIndex',
      'correctAnswer',
      'hint',
      'explanation',
      'trainerInstructions',
      'misconception_watch',
      'answers',
      'answerKey',
    ].forEach(function (key) {
      assert.strictEqual(JSON.stringify(batchTwo.body.batch).indexOf('"' + key + '"'), -1);
    });
    assert.notStrictEqual(batchTwo.body.batch.id, batchOne.body.batch.id);
    assert.notStrictEqual(batchTwo.body.batch.questions[0].id, batchOne.body.batch.questions[0].id);
    const batchAsTrainer = await request('POST', '/api/student/practice/batch', {}, trainer);
    assert.strictEqual(batchAsTrainer.status, 403);

    /* Persisted curriculum is academic-only and role-scoped. */
    const ownCurriculum = await request('GET', '/api/student/me/curriculum', undefined, student);
    assert.strictEqual(ownCurriculum.status, 200);
    assert.strictEqual(ownCurriculum.body.curriculum.curriculum, 'CBSE');
    assert.strictEqual(ownCurriculum.body.curriculum.email, undefined);
    const curriculumAsTrainer = await request(
      'GET',
      '/api/student/me/curriculum',
      undefined,
      trainer
    );
    assert.strictEqual(curriculumAsTrainer.status, 403);

    const curriculumUpdate = await request(
      'PUT',
      '/api/trainer/students/usr_student_001/curriculum',
      {
        curriculum: 'ICSE',
        grade: '8',
        schoolChapter: 'Ratio and proportion',
      },
      trainer
    );
    assert.strictEqual(curriculumUpdate.status, 200);
    assert.strictEqual(curriculumUpdate.body.curriculum.curriculum, 'ICSE');
    const curriculumPii = await request(
      'PUT',
      '/api/trainer/students/usr_student_001/curriculum',
      {
        email: 'leak@example.com',
      },
      trainer
    );
    assert.strictEqual(curriculumPii.status, 400);
    const curriculumAsStudent = await request(
      'PUT',
      '/api/trainer/students/usr_student_001/curriculum',
      {
        curriculum: 'CBSE',
      },
      student
    );
    assert.strictEqual(curriculumAsStudent.status, 403);
    await request(
      'PUT',
      '/api/trainer/students/usr_student_001/curriculum',
      {
        curriculum: 'CBSE',
        grade: '7',
        schoolChapter: 'Ratios',
      },
      trainer
    );

    /* Hints stay server-owned until a trainer explicitly grants one. */
    const beforeHint = await request(
      'GET',
      '/api/student/sessions/ses_math_001',
      undefined,
      student
    );
    assert.strictEqual(beforeHint.status, 200);
    assert.strictEqual(beforeHint.body.session.quiz.questions[0].hint, undefined);
    const hintAsStudent = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/hints',
      {
        questionId: 'q_1',
      },
      student
    );
    assert.strictEqual(hintAsStudent.status, 403);
    const hintGrant = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/hints',
      {
        questionId: 'q_1',
      },
      trainer
    );
    assert.strictEqual(hintGrant.status, 200);
    assert.strictEqual(typeof hintGrant.body.hint, 'string');
    const afterHint = await request(
      'GET',
      '/api/student/sessions/ses_math_001',
      undefined,
      student
    );
    const grantedQuestion = afterHint.body.session.quiz.questions.find(function (question) {
      return question.id === 'q_1';
    });
    assert.strictEqual(grantedQuestion.hint, hintGrant.body.hint);
    assert.strictEqual(grantedQuestion.answerIndex, undefined);
    assert.strictEqual(grantedQuestion.explanation, undefined);
    const safeEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?since=0',
      undefined,
      student
    );
    assert.strictEqual(JSON.stringify(safeEvents.body.events).indexOf(hintGrant.body.hint), -1);

    const studentPayout = await request('GET', '/api/trainer/payouts/2026-11', undefined, student);
    assert.strictEqual(studentPayout.status, 403);

    const payout = await request('GET', '/api/trainer/payouts/2026-11', undefined, trainer);
    assert.strictEqual(payout.status, 200);
    assert.strictEqual(typeof payout.body.payout.amount.value, 'number');
    assert.strictEqual(payout.body.payout.amount.currency, 'INR');

    const schedule = await request(
      'GET',
      '/api/trainer/schedule?month=2026-11',
      undefined,
      trainer
    );
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

    const studentState = await request(
      'GET',
      '/api/sessions/ses_math_000/state',
      undefined,
      student
    );
    assert.strictEqual(studentState.status, 200);
    assert.strictEqual(
      /trainer_instructions|trainerNotes|trainerInstructions/.test(studentState.text),
      false
    );

    const trainerState = await request(
      'GET',
      '/api/sessions/ses_math_000/state',
      undefined,
      trainer
    );
    assert.strictEqual(trainerState.status, 200);

    /* Participants are name-only in both directions. */
    const studentParticipants = studentState.body.state.participants;
    const trainerParticipants = trainerState.body.state.participants;
    ['trainer', 'student'].forEach(function (role) {
      assert.deepStrictEqual(Object.keys(studentParticipants[role]).sort(), ['name']);
      assert.deepStrictEqual(Object.keys(trainerParticipants[role]).sort(), ['name']);
    });
    assert.strictEqual(
      /@|wa\.me|instagram|facebook|twitter|linkedin|tel:|mailto:/i.test(studentState.text),
      false
    );

    const studentDashboard = await request('GET', '/api/student/dashboard', undefined, student);
    assert.strictEqual(studentDashboard.status, 200);
    assert.deepStrictEqual(
      Object.keys(studentDashboard.body.dashboard.nextSession.trainer).sort(),
      ['name']
    );

    const trainerAttention = await request('GET', '/api/trainer/attention', undefined, trainer);
    assert.strictEqual(trainerAttention.status, 200);
    trainerAttention.body.attention.items
      .filter(function (item) {
        return item.student;
      })
      .forEach(function (item) {
        assert.deepStrictEqual(Object.keys(item.student).sort(), ['name']);
      });

    const foreignSession = await request(
      'GET',
      '/api/sessions/ses_math_002/state',
      undefined,
      student
    );
    assert.strictEqual(foreignSession.status, 200);

    /* Scaffolded mastery: a failed item becomes a required parallel check. */
    const launch = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/launch',
      {},
      trainer
    );
    assert.strictEqual(launch.status, 200);

    const newCheck = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/new-check',
      {
        concept: 'Equivalent ratios',
        difficulty: 2,
      },
      trainer
    );
    assert.strictEqual(newCheck.status, 201);
    const firstCheck = (newCheck.body.session.quiz.questions || []).find(function (question) {
      return question.id === newCheck.body.questionId;
    });
    assert.strictEqual(firstCheck.requiresCorrectAnswer, true);

    const realtimeLog = await request('GET', '/api/realtime/log?limit=20', undefined, trainer);
    assert.strictEqual(realtimeLog.status, 200);
    assert.strictEqual(
      realtimeLog.body.events.some(function (event) {
        return (
          event.event === 'quiz.check.added' &&
          event.payload.questionId === firstCheck.id &&
          event.payload.correct === undefined
        );
      }),
      true
    );

    /* The app-level log is session-scoped and uses the same scrub as the
       browser event bridge even in live (Promise-returning) mode. */
    const trainerSessionIds = db
      .listSessionsForUser({
        id: trainerLogin.body.user.id,
        role: 'trainer',
      })
      .map(function (session) {
        return session.id;
      });
    assert.ok(trainerSessionIds.length > 0);
    const channelPrefix = 'mathify:session:';
    assert.ok(realtimeLog.body.events.length <= 20, 'realtime log respects the requested limit');
    assert.strictEqual(
      realtimeLog.body.events.every(function (event) {
        const channel = String(event.channel || '');
        return (
          channel.indexOf(channelPrefix) === 0 &&
          trainerSessionIds.indexOf(channel.slice(channelPrefix.length)) !== -1
        );
      }),
      true,
      'realtime log only exposes the caller sessions'
    );
    const realtimeKeys = [];
    realtimeLog.body.events.forEach(function (event) {
      collectKeys(event.payload || {}, realtimeKeys);
    });
    assert.strictEqual(
      realtimeKeys.some(function (key) {
        return /answer|correct|hint|why|explain|trainer|instruction|misconception|key/i.test(key);
      }),
      false,
      'realtime log payloads contain no forbidden keys'
    );

    const studentCheckState = await request(
      'GET',
      '/api/student/sessions/ses_math_001',
      undefined,
      student
    );
    assert.strictEqual(studentCheckState.status, 200);
    assert.strictEqual(/correctOptionId/.test(studentCheckState.text), false);
    assert.strictEqual(/"answerKey"/.test(studentCheckState.text), false);
    assert.strictEqual(/"explanation"/.test(studentCheckState.text), false);
    const studentQuestion = studentCheckState.body.session.quiz.questions.find(function (question) {
      return question.id === firstCheck.id;
    });
    assert.strictEqual(studentQuestion.requiresCorrectAnswer, true);

    const blockedNext = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/next',
      {},
      trainer
    );
    assert.strictEqual(blockedNext.status, 409);
    assert.strictEqual(blockedNext.body.error, 'PARALLEL_CHECK_REQUIRED');

    const wrongAnswer = await request(
      'POST',
      '/api/student/sessions/ses_math_001/quiz/answers',
      {
        questionId: firstCheck.id,
        optionIndex: (firstCheck.answerIndex + 1) % 4,
      },
      student
    );
    assert.strictEqual(wrongAnswer.status, 200);
    const attemptBefore = await request(
      'GET',
      '/api/student/sessions/ses_math_001/quiz/attempts/' + wrongAnswer.body.attemptId,
      undefined,
      student
    );
    assert.strictEqual(/correct/.test(attemptBefore.text), false);
    const revealCheck = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/reveal',
      {
        questionId: firstCheck.id,
      },
      trainer
    );
    assert.strictEqual(revealCheck.status, 200);
    const attemptWrong = await request(
      'GET',
      '/api/student/sessions/ses_math_001/quiz/attempts/' + wrongAnswer.body.attemptId,
      undefined,
      student
    );
    assert.strictEqual(attemptWrong.body.correct, false);
    const blockedAfterWrong = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/next',
      {},
      trainer
    );
    assert.strictEqual(blockedAfterWrong.status, 409);

    const replaceCheck = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/new-check',
      {
        questionId: firstCheck.id,
        concept: 'Equivalent ratios',
        replace: true,
      },
      trainer
    );
    assert.strictEqual(replaceCheck.status, 201);
    const secondCheck = (replaceCheck.body.session.quiz.questions || []).find(function (question) {
      return question.id === replaceCheck.body.questionId;
    });
    assert.strictEqual(secondCheck.requiresCorrectAnswer, true);
    const correctAnswer = await request(
      'POST',
      '/api/student/sessions/ses_math_001/quiz/answers',
      {
        questionId: secondCheck.id,
        optionIndex: secondCheck.answerIndex,
      },
      student
    );
    assert.strictEqual(correctAnswer.status, 200);
    const revealCorrect = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/reveal',
      {
        questionId: secondCheck.id,
      },
      trainer
    );
    assert.strictEqual(revealCorrect.status, 200);
    const attemptCorrect = await request(
      'GET',
      '/api/student/sessions/ses_math_001/quiz/attempts/' + correctAnswer.body.attemptId,
      undefined,
      student
    );
    assert.strictEqual(attemptCorrect.body.correct, true);
    const allowedNext = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/next',
      {},
      trainer
    );
    assert.strictEqual(allowedNext.status, 200);
    assert.strictEqual(allowedNext.body.session.quiz.currentQuestionId, secondCheck.id);

    /* Browser-safe event stream: the student receives state transitions, never
       correctness, answer keys, hints or hidden trainer notes. */
    const sharedEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?since=0&limit=50',
      undefined,
      student
    );
    assert.strictEqual(sharedEvents.status, 200);
    assert.strictEqual(
      sharedEvents.body.events.some(function (event) {
        return event.event === 'quiz.answer.revealed';
      }),
      true
    );
    assert.ok(
      sharedEvents.body.events.every(function (event) {
        return typeof event.seq === 'number';
      })
    );
    assert.strictEqual(
      /correct|answerIndex|hint|trainerInstructions|misconception_watch/i.test(sharedEvents.text),
      false
    );
    const anonymousEvents = await request('GET', '/api/sessions/ses_math_001/events');
    assert.strictEqual(anonymousEvents.status, 401);
    const unknownEvents = await request(
      'GET',
      '/api/sessions/ses_unknown/events',
      undefined,
      student
    );
    assert.strictEqual(unknownEvents.status, 404);

    const heartbeat = await request(
      'POST',
      '/api/sessions/ses_math_002/presence',
      {
        active: true,
        learningEvents: 2,
      },
      trainer
    );
    assert.strictEqual(heartbeat.status, 200);
    assert.strictEqual(heartbeat.body.presence.viewerRole, 'trainer');
    assert.strictEqual(heartbeat.body.presence.payoutEligible, false);

    const studentEnd = await request(
      'POST',
      '/api/sessions/ses_math_002/end',
      {
        currentQuizScore: 85,
      },
      student
    );
    assert.strictEqual(studentEnd.status, 403);

    const unlocked = await request(
      'POST',
      '/api/sessions/ses_math_002/end',
      {
        currentQuizScore: 85,
      },
      trainer
    );
    assert.strictEqual(unlocked.status, 200);
    assert.strictEqual(unlocked.body.unlockedNext, true);
    assert.strictEqual(unlocked.body.reteachRequired, false);
    assert.strictEqual(unlocked.body.recap.score, 85);
    const persistedStudent = db.findUserById('usr_student_001');
    assert.strictEqual(persistedStudent.mastery, 85);
    assert.strictEqual(persistedStudent.reteachRequired, false);
    assert.strictEqual(persistedStudent.masteryByTopic['Ratios · Lesson 16'].unlockedNext, true);
    assert.strictEqual(
      typeof unlocked.body.recap.presence.participants.trainer.activeMinutes,
      'number'
    );
    assert.strictEqual(unlocked.body.recap.presence.payoutEligible, false);
    assert.ok(unlocked.body.presence);

    const endedAgain = await request(
      'POST',
      '/api/sessions/ses_math_002/end',
      {
        currentQuizScore: 85,
      },
      trainer
    );
    assert.strictEqual(endedAgain.status, 409);

    const reteach = await request(
      'POST',
      '/api/sessions/ses_math_003/end',
      {
        currentQuizScore: 62,
        recordingUrl: 'https://recordings.mathify.test/ses_math_003',
        recap: {
          summary: 'Ratios recap',
          highlights: ['Bar models'],
          homework: 'Practice sheet 3',
          status: 'hacked',
          score: 100,
        },
      },
      founder
    );
    assert.strictEqual(reteach.status, 200);
    assert.strictEqual(reteach.body.unlockedNext, false);
    assert.strictEqual(reteach.body.reteachRequired, true);
    assert.strictEqual(reteach.body.recap.summary, 'Ratios recap');
    assert.strictEqual(
      reteach.body.recap.recordingUrl,
      'https://recordings.mathify.test/ses_math_003'
    );
    assert.strictEqual(reteach.body.recap.score, 62);
    assert.strictEqual(reteach.body.recap.status, 'ended');
    const endedSession = db.findSession('ses_math_003');
    assert.strictEqual(endedSession.status, 'ended');
    assert.strictEqual(endedSession.recap.homework, 'Practice sheet 3');
    assert.strictEqual(endedSession.recording.url, 'https://recordings.mathify.test/ses_math_003');

    const afterReteach = await request(
      'GET',
      '/api/sessions/ses_math_003/state',
      undefined,
      trainer
    );
    assert.strictEqual(afterReteach.status, 200);
    assert.strictEqual(afterReteach.body.state.reteachRequired, true);

    /* A-04: the recording webhook awaits a Promise-returning session write
       before it reads updated.recording.url. */
    const savedUpdateSession = db.updateSession;
    const savedRecordingPublish = realtime.publish;
    try {
      let published = null;
      db.updateSession = function (id, updater) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            const current = db.findSession(id);
            resolve(current ? updater(current) : null);
          }, 5);
        });
      };
      realtime.publish = function (id, event, payload) {
        published = { id: id, event: event, payload: payload };
        return Promise.resolve({ seq: 1 });
      };
      const recording = await request('POST', '/api/webhooks/recording', {
        sessionId: 'ses_math_001',
        url: 'https://recordings.mathify.test/async.mp4',
        durationSeconds: 42,
      });
      assert.strictEqual(recording.status, 200, 'async recording write succeeds');
      assert.strictEqual(
        recording.body.sessionId,
        'ses_math_001',
        'recording echoes the session id'
      );
      assert.strictEqual(published.event, 'recording.ready', 'recording.ready is published');
      assert.strictEqual(
        published.payload.url,
        'https://recordings.mathify.test/async.mp4',
        'the resolved recording url is published'
      );
      const missingRecording = await request('POST', '/api/webhooks/recording', {
        sessionId: 'ses_unknown',
        url: 'https://recordings.mathify.test/missing.mp4',
      });
      assert.strictEqual(missingRecording.status, 404, 'unknown session still returns 404');
    } finally {
      db.updateSession = savedUpdateSession;
      realtime.publish = savedRecordingPublish;
    }

    /* A-07/A-08: concurrent identical MessageSids produce exactly one reply
       and one escalation; distinct messages get unique escalation ids. */
    const savedGenerate = whatsappAi.generateAiResponse;
    const savedClaim = db.claimWhatsappMessage;
    const savedEscalation = db.recordSupportEscalation;
    const savedNotify = notifications.notifyHumanHandoff;
    const savedPublish = realtime.publish;
    const savedTwilioToken = process.env.TWILIO_AUTH_TOKEN;
    const savedTwilioUrl = process.env.TWILIO_WEBHOOK_URL;
    try {
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_WEBHOOK_URL;
      whatsappAi.resumeBotForParent('whatsapp:+15005550006');
      let generations = 0;
      const escalations = [];
      whatsappAi.generateAiResponse = async function () {
        generations += 1;
        return {
          reply: 'A coordinator will take it from here.',
          handoff: { required: true, summary: 'Refund request needs a human.' },
          student: null,
        };
      };
      notifications.notifyHumanHandoff = async function () {
        return { email: 'queued', slack: 'queued' };
      };
      /* Async wrapper around the real mock claim: both deliveries enter the
         route before either claims the MessageSid. */
      db.claimWhatsappMessage = async function (message) {
        await new Promise(function (resolve) {
          setTimeout(resolve, 5);
        });
        const existing = db.findWhatsappMessage(message.id);
        if (existing) return { claimed: false, message: existing };
        db.recordWhatsappMessage(message);
        return { claimed: true, message: message };
      };
      db.recordSupportEscalation = function (escalation) {
        escalations.push(escalation);
        return escalation;
      };
      realtime.publish = function () {
        return Promise.resolve({ seq: 0 });
      };

      const duplicateBody = {
        From: 'whatsapp:+15005550006',
        Body: 'I need a refund',
        MessageSid: 'SM_concurrent_duplicate',
      };
      const replies = await Promise.all([
        request('POST', '/api/webhooks/whatsapp', duplicateBody),
        request('POST', '/api/webhooks/whatsapp', duplicateBody),
      ]);
      assert.strictEqual(generations, 1, 'a duplicate MessageSid generates one reply');
      assert.strictEqual(escalations.length, 1, 'a duplicate MessageSid opens one escalation');
      assert.strictEqual(
        replies.filter(function (reply) {
          return reply.text === '<Response/>';
        }).length,
        1,
        'the losing duplicate receives an empty TwiML response'
      );

      whatsappAi.resumeBotForParent('whatsapp:+15005550006');
      await request('POST', '/api/webhooks/whatsapp', {
        From: 'whatsapp:+15005550006',
        Body: 'I need a refund',
        MessageSid: 'SM_unique_1',
      });
      whatsappAi.resumeBotForParent('whatsapp:+15005550006');
      await request('POST', '/api/webhooks/whatsapp', {
        From: 'whatsapp:+15005550006',
        Body: 'I need a refund',
        MessageSid: 'SM_unique_2',
      });
      assert.strictEqual(escalations.length, 3, 'distinct MessageSids each escalate once');
      assert.strictEqual(
        new Set(
          escalations.map(function (item) {
            return item.id;
          })
        ).size,
        3,
        'escalation ids are unique within the same millisecond'
      );
      assert.strictEqual(
        escalations.every(function (item) {
          return item.id.indexOf('sup_') === 0;
        }),
        true,
        'escalation ids keep the sup_ prefix'
      );
    } finally {
      whatsappAi.generateAiResponse = savedGenerate;
      db.claimWhatsappMessage = savedClaim;
      db.recordSupportEscalation = savedEscalation;
      notifications.notifyHumanHandoff = savedNotify;
      realtime.publish = savedPublish;
      if (savedTwilioToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
      else process.env.TWILIO_AUTH_TOKEN = savedTwilioToken;
      if (savedTwilioUrl === undefined) delete process.env.TWILIO_WEBHOOK_URL;
      else process.env.TWILIO_WEBHOOK_URL = savedTwilioUrl;
      whatsappAi.resumeBotForParent('whatsapp:+15005550006');
    }

    const unknown = await call('/api/does-not-exist');
    assert.strictEqual(unknown.status, 404);

    console.log('apiSmoke: passed');
  } finally {
    cloudflareKeys.forEach(function (key) {
      if (originalCloudflare[key] === undefined) delete process.env[key];
      else process.env[key] = originalCloudflare[key];
    });
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
