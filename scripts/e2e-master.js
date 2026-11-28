/* Mathify full-stack end-to-end run.
 *
 * This runner uses real HTTP calls only. It can run against the local mock
 * origin (mutation flows) and against a server booted with DATABASE_MODE=supabase
 * (read-only live verification plus real provider calls). It never prints or
 * stores passwords, tokens, secrets or refresh tokens.
 *
 *   node scripts/e2e-master.js
 *   MATHIFY_BASE=http://127.0.0.1:4014 MATHIFY_RUN_MODE=live MATHIFY_ALLOW_MUTATIONS=0 node scripts/e2e-master.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.MATHIFY_BASE || 'http://127.0.0.1:4004';
const PASSWORD = process.env.DEMO_PASSWORD || 'mathify-demo';
const MODE = process.env.MATHIFY_RUN_MODE || 'mock';
const ALLOW_MUTATIONS = String(process.env.MATHIFY_ALLOW_MUTATIONS || '1') !== '0';
const SESSION_ID = process.env.MATHIFY_SESSION_ID || 'ses_math_001';
const OUT = path.join(__dirname, 'e2e-master-log.json');
const STAMP = Date.now();
const results = [];

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const clean = {};
    Object.keys(value).forEach(function (key) {
      if (/token|secret|password|authorization|credential|otp/i.test(key)) clean[key] = '[redacted]';
      else clean[key] = redact(value[key]);
    });
    return clean;
  }
  if (typeof value === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) return '[redacted]';
  return value;
}

async function req(method, route, body, token, extra) {
  const init = {
    method: method,
    headers: Object.assign({ 'content-type': 'application/json', accept: 'application/json' },
      extra && extra.headers ? extra.headers : {}),
    signal: AbortSignal.timeout((extra && extra.timeout) || 120000)
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (token) init.headers.authorization = 'Bearer ' + token;
  const started = Date.now();
  try {
    const response = await fetch(BASE + route, init);
    const text = await response.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch (error) { parsed = text; }
    return { status: response.status, body: parsed, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, body: { error: String(error && error.message || error) }, ms: Date.now() - started };
  }
}

async function check(name, fn) {
  const entry = { scenario: name, at: new Date().toISOString(), ok: false, mode: MODE };
  try {
    const detail = await fn();
    if (detail && typeof detail === 'object' && 'ok' in detail) {
      entry.ok = !!detail.ok;
      entry.detail = redact(detail);
    } else {
      entry.ok = detail !== false;
      entry.detail = redact(detail);
    }
  } catch (error) {
    entry.detail = { error: redact(String(error && error.stack || error)) };
  }
  if (entry.detail && entry.detail.skipped === true) {
    entry.skipped = true;
    entry.ok = false;
  }
  results.push(entry);
  const mark = entry.skipped ? 'SKIP' : entry.ok ? 'PASS' : 'FAIL';
  console.log('[' + mark + '] ' + name);
  if (!entry.ok) console.log('       ' + JSON.stringify(entry.detail).slice(0, 700));
  return entry;
}

function skip(reason) { return { ok: false, skipped: true, reason: reason, ms: 0 }; }

function noCredentials(value, keyList) {
  const text = JSON.stringify(value || {});
  const hits = (keyList || ['password', 'passwordHash', 'hash', 'salt', 'refreshToken',
    'authorization', 'aadhaar', 'accountNumber']).filter(function (key) {
    return new RegExp('"' + key + '"\\s*:').test(text);
  });
  return hits;
}

/* The dev planner fixture owns nine known question ids. A previous run can
   leave a generated Retest item as the current question; the real trainer
   /quiz/next route restores a fixture item before this probe. */
async function ensureQuizQuestion(trainerToken) {
  let response = await req('GET', '/api/trainer/sessions/' + SESSION_ID, undefined, trainerToken);
  let session = response.body && response.body.session;
  let quiz = session && session.quiz;
  let launched = false;

  if (!quiz || quiz.status !== 'live' || ['answering', 'recheck'].indexOf(quiz.phase) === -1) {
    const start = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/launch', {}, trainerToken);
    if (start.status === 200) {
      response = start;
      session = start.body && start.body.session;
      quiz = session && session.quiz;
      launched = true;
    }
  }

  let question = quiz && Array.isArray(quiz.questions)
    ? quiz.questions.find(function (item) { return item && item.id === quiz.currentQuestionId; })
    : null;
  let forced = 0;
  const answered = function (id) {
    return Array.isArray(quiz && quiz.attempts) &&
      quiz.attempts.some(function (item) { return item && item.questionId === id; });
  };
  while ((!question || !question.id || String(question.id).indexOf('dev_ratio_q') !== 0 ||
      answered(question.id)) && forced <= 9) {
    const next = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/next', {
      force: true
    }, trainerToken);
    if (next.status !== 200) break;
    response = next;
    session = next.body && next.body.session;
    quiz = session && session.quiz;
    question = quiz && Array.isArray(quiz.questions)
      ? quiz.questions.find(function (item) { return item && item.id === quiz.currentQuestionId; })
      : null;
    forced += 1;
  }
  return { question: question, forced: forced, launched: launched, response: response };
}

const tokens = {};
const ids = {};
const created = {};

async function login(email, role, password) {
  const body = { email: email, password: password || PASSWORD };
  if (role) body.role = role;
  const r = await req('POST', '/api/auth/login', body);
  if (r.status === 200 && r.body && r.body.token && role) tokens[role] = r.body.token;
  return r;
}

async function main() {
  await check('health and public configuration', async function () {
    const health = await req('GET', '/api/health');
    const demo = await req('GET', '/api/auth/demo');
    const chooser = await req('GET', '/view-choice.html');
    return {
      ok: health.status === 200 && health.body.ok === true && demo.status === 200 &&
        chooser.status === 200 && typeof chooser.body === 'string' &&
        chooser.body.indexOf('id="choiceGrid"') !== -1 &&
        chooser.body.indexOf('type="password"') === -1,
      mode: MODE,
      base: BASE,
      ms: health.ms + demo.ms + chooser.ms
    };
  });

  /* The planner desk is a service role: its canonical role is planner_agent,
     but the demo sign-in label stays "planner" for the shared login page. */
  const accounts = [
    ['founder', 'founder@mathify.app', 'founder'],
    ['relationship_manager', 'rm@mathify.app', 'relationship_manager'],
    ['trainer', 'trainer@mathify.app', 'trainer'],
    ['student', 'student@mathify.app', 'student'],
    ['parent', 'parent@mathify.app', 'parent'],
    ['planner', 'planner@mathify.app', 'planner_agent']
  ];
  for (const pair of accounts) {
    await check('sign in ' + pair[0], async function () {
      const r = await login(pair[1], pair[2]);
      if (r.status === 200 && r.body && r.body.token) tokens[pair[0]] = r.body.token;
      return {
        ok: r.status === 200 && !!r.body.token && r.body.user.role === pair[2] &&
          noCredentials(r.body.user).length === 0,
        status: r.status,
        role: r.body && r.body.user && r.body.user.role,
        ms: r.ms
      };
    });
  }

  await check('post-login view chooser is server-owned', async function () {
    const toParent = await req('POST', '/api/auth/view', { view: 'parent' }, tokens.student);
    const me = toParent.body && toParent.body.token
      ? await req('GET', '/api/auth/me', undefined, toParent.body.token) : null;
    const toKid = await req('POST', '/api/auth/view', { view: 'student' }, tokens.parent);
    const staffEscalation = await req('POST', '/api/auth/view', { view: 'founder' }, tokens.trainer);
    const familyEscalation = await req('POST', '/api/auth/view', {
      view: 'relationship_manager'
    }, tokens.student);
    return {
      ok: toParent.status === 200 && toParent.body.user.role === 'parent' &&
        toParent.body.refreshToken === undefined && me && me.status === 200 &&
        me.body.user.role === 'parent' && toKid.status === 200 &&
        toKid.body.user.role === 'student' && staffEscalation.status === 403 &&
        familyEscalation.status === 403,
      parentView: toParent.status,
      kidView: toKid.status,
      denied: [staffEscalation.status, familyEscalation.status],
      ms: toParent.ms + toKid.ms + staffEscalation.ms + familyEscalation.ms
    };
  });

  /* ---------------------------------------------------------- demo booking */
  let booking = null;
  await check('demo booking creates a real shared family credential', async function () {
    const email = 'booking.' + STAMP + '@example.com';
    const body = {
      parentName: 'E2E Parent', childName: 'E2E Kid', email: email,
      phone: '9876543210', curriculum: 'cbse', grade: 'class-7',
      timezone: 'Asia/Kolkata', message: 'Automated full-stack verification.'
    };
    const r = await req('POST', '/api/contact', body);
    if (r.status === 201 && r.body && r.body.demoId) {
      booking = { id: r.body.demoId, email: r.body.credentials.email,
        password: r.body.credentials.password };
    }
    return {
      ok: r.status === 201 && !!r.body.demoId && !!r.body.reference &&
        !!booking && !!booking.email && !!booking.password &&
        r.body.delivery && typeof r.body.delivery === 'object',
      status: r.status,
      demoId: r.body && r.body.demoId,
      hasCredential: !!booking,
      ms: r.ms
    };
  });

  await check('booked family can sign in and read demo status', async function () {
    if (!booking) return skip('booking did not produce a credential');
    const signed = await login(booking.email, 'parent', booking.password);
    const status = signed.status === 200
      ? await req('GET', '/api/demo/status', undefined, tokens.parent) : null;
    const notices = signed.status === 200
      ? await req('GET', '/api/demo/notifications', undefined, tokens.parent) : null;
    return {
      ok: signed.status === 200 && status && status.status === 200 &&
        status.body.demo && status.body.demo.demoId === booking.id &&
        notices && notices.status === 200,
      loginStatus: signed.status,
      statusStatus: status && status.status,
      noticeStatus: notices && notices.status,
      ms: signed.ms + (status ? status.ms : 0) + (notices ? notices.ms : 0)
    };
  });

  await check('staff can see the demo queue but never the family password', async function () {
    if (!booking) return skip('booking did not produce a demo');
    const queue = await req('GET', '/api/admin/demos?limit=50', undefined, tokens.relationship_manager);
    const check2 = await req('POST', '/api/admin/demos/' + booking.id + '/credentials', {},
      tokens.founder);
    const listed = queue.body && Array.isArray(queue.body.demos)
      ? queue.body.demos.some(function (item) { return item.demoId === booking.id; }) : false;
    return {
      ok: queue.status === 200 && listed && check2.status === 200 &&
        check2.body.temporaryPassword === null &&
        noCredentials(check2.body).length === 0,
      queueStatus: queue.status,
      listed: listed,
      credentialCheckStatus: check2.status,
      ms: queue.ms + check2.ms
    };
  });

  /* ------------------------------------------------------------- identity */
  const studentEmail = 'e2e.student.' + STAMP + '@example.com';
  const trainerEmail = 'e2e.trainer.' + STAMP + '@example.com';
  await check('public registration creates an active student and a pending trainer', async function () {
    if (!ALLOW_MUTATIONS) return skip('live run is read-only');
    const student = await req('POST', '/api/auth/register', {
      role: 'student', name: 'E2E Student', email: studentEmail,
      password: 'MathifyE2E!2026', grade: '7'
    });
    const trainer = await req('POST', '/api/auth/register', {
      role: 'trainer', name: 'E2E Trainer', email: trainerEmail,
      password: 'MathifyE2E!2026'
    });
    const founderDenied = await req('POST', '/api/auth/register', {
      role: 'founder', name: 'E2E Founder', email: 'e2e.founder.' + STAMP + '@example.com',
      password: 'MathifyE2E!2026'
    });
    if (trainer.status === 201) ids.newTrainer = trainer.body.user.id;
    if (student.status === 201) {
      const signed = await login(studentEmail, 'e2e_student', 'MathifyE2E!2026');
      if (signed.status === 200) created.student = signed.body.token;
    }
    return {
      ok: student.status === 201 && student.body.user.status === 'active' &&
        trainer.status === 201 && trainer.body.user.status === 'pending' &&
        founderDenied.status === 422 && !!created.student,
      studentStatus: student.status,
      trainerStatus: trainer.status,
      founderDenied: founderDenied.status,
      ms: student.ms + trainer.ms + founderDenied.ms
    };
  });

  await check('new student sign-in reaches the student dashboard', async function () {
    if (!ALLOW_MUTATIONS || !created.student) return skip('no new student in this run');
    const r = await req('GET', '/api/student/dashboard', undefined, created.student);
    return { ok: r.status === 200 && !!r.body.dashboard, status: r.status, ms: r.ms };
  });

  /* -------------------------------------------------- trainer onboarding */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const uploaded = {};
  await check('trainer uploads KYC documents', async function () {
    if (!ALLOW_MUTATIONS || !ids.newTrainer) return skip('no pending trainer in this run');
    const signed = await login(trainerEmail, 'e2e_trainer', 'MathifyE2E!2026');
    if (signed.status !== 200) return { ok: false, status: signed.status, ms: signed.ms };
    created.trainer = signed.body.token;
    for (const kind of ['aadhaar', 'pan', 'signature']) {
      const copies = kind === 'signature' ? ['image'] : ['front', 'rear'];
      for (const side of copies) {
        const r = await req('POST', '/api/trainer/onboarding/documents', {
          kind: kind, fileName: 'e2e-' + kind + '-' + side + '.png',
          mimeType: 'image/png', data: png
        }, created.trainer);
        if (r.status !== 201) return { ok: false, kind: kind, side: side, status: r.status, ms: r.ms };
        uploaded[kind + '_' + side] = r.body.document;
      }
    }
    return { ok: Object.keys(uploaded).length === 5, documents: Object.keys(uploaded), ms: 0 };
  });

  await check('trainer submits KYC once and founder grants the desk', async function () {
    if (!ALLOW_MUTATIONS || !created.trainer) return skip('no pending trainer in this run');
    const submitted = await req('POST', '/api/trainer/onboarding', {
      identity: { fullName: 'E2E Trainer', dateOfBirth: '1995-05-01' },
      personal: {
        contactNumber: '9876543210', emailId: trainerEmail, fatherName: 'E2E Father',
        motherName: 'E2E Mother', spouseName: '', address: 'E2E Address'
      },
      bank: {
        accountHolderName: 'E2E Trainer', accountNumber: '12345678',
        ifscCode: 'HDFC0001234', bankName: 'HDFC', branch: 'E2E'
      },
      publicProfile: {
        fullName: 'E2E Trainer', yearsExperience: 1, degrees: [], achievements: []
      },
      documents: {
        aadhaar: { number: '123456789012', front: uploaded.aadhaar_front, rear: uploaded.aadhaar_rear },
        pan: { number: 'ABCDE1234F', front: uploaded.pan_front, rear: uploaded.pan_rear },
        signature: { image: uploaded.signature_image }
      }
    }, created.trainer);
    const relocked = await req('POST', '/api/trainer/onboarding', { identity: { fullName: 'Again' } },
      created.trainer);
    const granted = submitted.status === 201
      ? await req('POST', '/api/admin/people/' + ids.newTrainer + '/grant', {}, tokens.founder) : null;
    if (granted && granted.status === 200 && granted.body.password) {
      created.grantedTrainerPassword = granted.body.password;
      created.grantedTrainerEmail = granted.body.email;
    }
    return {
      ok: submitted.status === 201 && submitted.body.onboarding.status === 'submitted' &&
        relocked.status >= 400 && granted && granted.status === 200 &&
        granted.body.person.status === 'active' && !!granted.body.password &&
        noCredentials(granted.body.person).length === 0,
      submitted: submitted.status,
      relocked: relocked.status,
      granted: granted && granted.status,
      ms: submitted.ms + relocked.ms + (granted ? granted.ms : 0)
    };
  });

  await check('RM can issue only the generated trainer password', async function () {
    if (!ALLOW_MUTATIONS || !created.grantedTrainerEmail) return skip('no granted trainer in this run');
    const chosen = await req('PATCH', '/api/admin/people/' + ids.newTrainer + '/password', {
      password: 'RMChosen!2026'
    }, tokens.relationship_manager);
    const generated = await req('PATCH', '/api/admin/people/' + ids.newTrainer + '/password', {
      generated: true
    }, tokens.relationship_manager);
    const signed = generated.status === 200
      ? await login(created.grantedTrainerEmail, 'e2e_trainer_granted', generated.body.temporaryPassword)
      : null;
    const desk = signed && signed.status === 200 && signed.body.token
      ? await req('GET', '/api/trainer/dashboard', undefined, signed.body.token) : null;
    return {
      ok: chosen.status === 403 && chosen.body.error === 'RM_PASSWORD_CHOICE_DENIED' &&
        generated.status === 200 && !!generated.body.temporaryPassword &&
        generated.body.person.passwordIssuedByRole === 'relationship_manager' &&
        signed && signed.status === 200 && signed.body.user.role === 'trainer' &&
        desk && desk.status === 200,
      chosenDenied: chosen.status,
      generated: generated.status,
      generatedHasTemporary: Boolean(generated.body && generated.body.temporaryPassword),
      signInStatus: signed && signed.status,
      signInError: signed && signed.body && signed.body.error,
      signInRole: signed && signed.body && signed.body.user && signed.body.user.role,
      deskStatus: desk && desk.status,
      ms: chosen.ms + generated.ms + (signed ? signed.ms : 0)
    };
  });

  /* --------------------------------------------------------- founder desk */
  await check('founder people, pay and audit desks return real data', async function () {
    const trainers = await req('GET', '/api/admin/people/trainer', undefined, tokens.founder);
    const detail = await req('GET', '/api/admin/people/trainer/usr_trainer_001',
      undefined, tokens.founder);
    const audit = await req('GET', '/api/admin/audit?limit=50', undefined, tokens.founder);
    const settings = await req('GET', '/api/admin/settings', undefined, tokens.founder);
    const payouts = detail.body && detail.body.person && detail.body.payouts;
    const founderGratitude = payouts && JSON.stringify(payouts).indexOf('founderGratitude') !== -1;
    /* The founder KYC desk legitimately sees submitted identity values for
       verification. Credential material and session tokens still never appear. */
    const credentialHits = noCredentials(detail.body, [
      'password', 'passwordHash', 'hash', 'salt', 'refreshToken', 'authorization'
    ]);
    return {
      ok: trainers.status === 200 && Array.isArray(trainers.body.people) &&
        trainers.body.people.length > 0 && detail.status === 200 &&
        credentialHits.length === 0 && audit.status === 200 &&
        Array.isArray(audit.body.entries) && audit.body.entries.length > 0 &&
        settings.status === 200 && founderGratitude,
      trainers: trainers.body && trainers.body.people && trainers.body.people.length,
      auditEntries: audit.body && audit.body.entries && audit.body.entries.length,
      founderGratitudeVisible: founderGratitude,
      ms: trainers.ms + detail.ms + audit.ms + settings.ms
    };
  });

  await check('founder gratitude credit is protected from every role', async function () {
    const founderPatch = await req('PATCH', '/api/admin/settings', {
      section: 'policy', values: { 'payout.founderGratitude.amount': 1 }
    }, tokens.founder);
    const rmPatch = await req('PATCH', '/api/admin/settings', {
      section: 'quiz', values: { unlockThreshold: 85 }
    }, tokens.relationship_manager);
    const rmSalary = await req('PATCH', '/api/admin/people/usr_rm_001/monthly-salary', {
      amount: 1
    }, tokens.relationship_manager);
    const rmPenalty = await req('POST', '/api/admin/people/usr_trainer_001/penalties', {
      amount: 10, reason: 'E2E forbidden'
    }, tokens.relationship_manager);
    return {
      ok: founderPatch.status === 400 && founderPatch.body.error === 'FIELD_READ_ONLY' &&
        rmPatch.status === 403 && rmSalary.status === 403 && rmPenalty.status === 403,
      founderProtected: founderPatch.status,
      rmSettings: rmPatch.status,
      rmSalary: rmSalary.status,
      rmPenalty: rmPenalty.status,
      ms: founderPatch.ms + rmPatch.ms + rmSalary.ms + rmPenalty.ms
    };
  });

  await check('founder-only planner writes stay closed to trainer and agent', async function () {
    const trainerEdit = await req('PATCH', '/api/lms/planner', { id: 'probe' }, tokens.trainer);
    const trainerRegenerate = await req('POST', '/api/lms/planner/regenerate', {
      subject: 'mathematics', curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
    }, tokens.trainer);
    const agentMutation = await req('POST', '/api/lms/planner-suggestion', {
      subject: 'mathematics', curriculum: 'cbse', grade: 'class-7', topic: 'Ratios',
      planner: {}, note: 'E2E'
    }, tokens.planner);
    const assigned = await req('GET', '/api/lms/assigned-planners', undefined, tokens.trainer);
    return {
      ok: trainerEdit.status === 403 && trainerRegenerate.status === 403 &&
        agentMutation.status === 403 &&
        agentMutation.body.error === 'PLANNER_AGENT_MUTATIONS_DISABLED' &&
        assigned.status === 200 && Array.isArray(assigned.body.assignedPlanners),
      trainerEdit: trainerEdit.status,
      trainerRegenerate: trainerRegenerate.status,
      agentMutation: agentMutation.status,
      assigned: assigned.status,
      ms: trainerEdit.ms + trainerRegenerate.ms + agentMutation.ms + assigned.ms
    };
  });

  /* -------------------------------------------------------------- RM desk */
  await check('manager desk reads pay but cannot mutate founder-owned policy', async function () {
    const dashboard = await req('GET', '/api/rm/dashboard', undefined, tokens.relationship_manager);
    const pay = await req('GET', '/api/admin/people/trainer/usr_trainer_001',
      undefined, tokens.relationship_manager);
    const rate = await req('PATCH', '/api/admin/people/usr_trainer_001/base-rate', {
      rate: 350
    }, tokens.relationship_manager);
    const lms = await req('GET', '/api/lms/curriculum-catalog', undefined,
      tokens.relationship_manager);
    return {
      ok: dashboard.status === 200 && dashboard.body.dashboard &&
        dashboard.body.dashboard.locked === false && pay.status === 200 &&
        rate.status === 200 && rate.body.person.rateSetByRole === 'relationship_manager' &&
        lms.status === 403,
      dashboard: dashboard.status,
      dashboardLocked: dashboard.body && dashboard.body.dashboard && dashboard.body.dashboard.locked,
      pay: pay.status,
      sharedRateEdit: rate.status,
      rateSetByRole: rate.body && rate.body.person && rate.body.person.rateSetByRole,
      rateError: rate.body && rate.body.error,
      lmsDenied: lms.status,
      ms: dashboard.ms + pay.ms + rate.ms + lms.ms
    };
  });

  /* -------------------------------------------------------- session flow */
  await check('session state and event stream are role-safe', async function () {
    const student = await req('GET', '/api/sessions/' + SESSION_ID + '/state',
      undefined, tokens.student);
    const trainer = await req('GET', '/api/sessions/' + SESSION_ID + '/state',
      undefined, tokens.trainer);
    const events = await req('GET', '/api/sessions/' + SESSION_ID + '/events?limit=50',
      undefined, tokens.student);
    const studentState = student.body && student.body.state;
    return {
      ok: student.status === 200 && trainer.status === 200 && events.status === 200 &&
        Array.isArray(events.body.events) &&
        studentState && noCredentials(studentState, [
          'answerIndex', 'answer', 'hint', 'explanation', 'trainerInstructions',
          'misconceptions', 'options'
        ]).length === 0,
      studentStatus: student.status,
      trainerStatus: trainer.status,
      events: events.body && events.body.events && events.body.events.length,
      ms: student.ms + trainer.ms + events.ms
    };
  });

  await check('session clock, handoff and board actions stay trainer-owned', async function () {
    if (!ALLOW_MUTATIONS) return skip('live run is read-only');
    const heartbeat = await req('POST', '/api/sessions/' + SESSION_ID + '/presence', {
      active: true, learningEvents: 0
    }, tokens.trainer);
    const denied = await req('POST', '/api/sessions/' + SESSION_ID + '/board/open', {},
      tokens.student);
    const opened = await req('POST', '/api/sessions/' + SESSION_ID + '/board/open', {},
      tokens.trainer);
    const share = await req('POST', '/api/sessions/' + SESSION_ID + '/board/share', {
      shared: true
    }, tokens.trainer);
    const ink = await req('POST', '/api/sessions/' + SESSION_ID + '/board/ink', {
      type: 'stroke', page: 1,
      ink: { tool: 'pen', color: 'ink', weight: 'normal', points: [[0.1, 0.1], [0.2, 0.2]] }
    }, tokens.trainer);
    const studentInk = await req('POST', '/api/sessions/' + SESSION_ID + '/board/ink', {
      type: 'stroke', page: 1,
      stroke: { tool: 'pen', color: 'ink', points: [[0, 0]] }
    }, tokens.student);
    const events = await req('GET', '/api/sessions/' + SESSION_ID + '/events?limit=200',
      undefined, tokens.student);
    const names = (events.body.events || []).map(function (event) { return event.event; });
    return {
      ok: heartbeat.status === 200 && denied.status === 403 && opened.status === 200 &&
        share.status === 200 && ink.status === 200 && studentInk.status === 403 &&
        names.indexOf('board.opened') !== -1 && names.indexOf('board.shared') !== -1 &&
        names.indexOf('board.ink') !== -1,
      heartbeat: heartbeat.status,
      denied: denied.status,
      opened: opened.status,
      share: share.status,
      ink: ink.status,
      studentInk: studentInk.status,
      ms: heartbeat.ms + denied.ms + opened.ms + share.ms + ink.ms + events.ms
    };
  });

  await check('quiz selection stays correctness-free until trainer reveal', async function () {
    if (!ALLOW_MUTATIONS) return skip('live run is read-only');
    const ready = await ensureQuizQuestion(tokens.trainer);
    const question = ready.question;
    if (!question || !question.id) return skip('no current fixture question');
    const selected = await req('POST', '/api/student/sessions/' + SESSION_ID + '/quiz/selection', {
      questionId: question.id, optionIndex: 0
    }, tokens.student);
    const events = await req('GET', '/api/sessions/' + SESSION_ID + '/events?limit=200',
      undefined, tokens.trainer);
    const mirror = (events.body.events || []).filter(function (event) {
      return event.event === 'quiz.option.selected';
    }).pop();
    const safe = mirror && !/answer|correct|hint|explain|key/i.test(JSON.stringify(mirror));
    return {
      ok: selected.status === 200 && !!mirror && safe,
      questionId: question.id,
      quizLaunched: ready.launched,
      forcedAdvances: ready.forced,
      selectionStatus: selected.status,
      mirrorSeq: mirror && mirror.seq,
      safe: !!safe,
      ms: selected.ms + events.ms
    };
  });

  /* -------------------------------------------------- live provider evidence */
  await check('live AI provider chain answers through freelm', async function () {
    if (MODE !== 'live') return skip('mock database disables the live-only provider ping');
    const ping = await req('POST', '/api/ai/test-ping', { message: 'health check' }, tokens.founder);
    const body = ping.body && typeof ping.body === 'object' ? ping.body : {};
    const attempted = Array.isArray(body.results)
      ? body.results.map(function (item) { return item && item.provider; }) : [];
    const approved = attempted.length === 3 && attempted.every(function (name) {
      return ['gemini', 'groq', 'cloudflare'].indexOf(name) !== -1;
    });
    return {
      ok: ping.status === 200 && body.ok === true && body.mock === false &&
        Number(body.successes) >= 2 && approved,
      status: ping.status,
      provider: body.provider || null,
      mode: body.mode || null,
      successes: body.successes,
      attempted: attempted,
      ms: ping.ms
    };
  });

  await check('live AI probe stays founder-only', async function () {
    const anonymous = await req('POST', '/api/ai/test-ping', { message: 'health check' });
    const student = await req('POST', '/api/ai/test-ping', { message: 'health check' }, tokens.student);
    return {
      ok: anonymous.status === 401 && student.status === 403,
      anonymous: anonymous.status,
      student: student.status,
      ms: anonymous.ms + student.ms
    };
  });

  /* --------------------------------------------------- recording boundaries */
  await check('recording links stay private and bearer-free in listings', async function () {
    const trainer = await req('GET', '/api/recordings', undefined, tokens.trainer);
    const anon = await req('GET', '/api/recordings');
    const list = trainer.body && Array.isArray(trainer.body.recordings)
      ? trainer.body.recordings : [];
    const leaked = list.filter(function (item) {
      return item && item.url && /^https?:\/\//i.test(String(item.url));
    });
    return {
      ok: trainer.status === 200 && anon.status === 401 && leaked.length === 0,
      trainer: trainer.status,
      anonymous: anon.status,
      readyRecordings: list.length,
      bearerFreeUrls: leaked.length,
      ms: trainer.ms + anon.ms
    };
  });

  await check('recording controls refuse every non-trainer role', async function () {
    const student = await req('POST', '/api/livekit/recording/start', {
      sessionId: SESSION_ID
    }, tokens.student);
    const founder = await req('POST', '/api/livekit/recording/start', {
      sessionId: SESSION_ID
    }, tokens.founder);
    const rm = await req('POST', '/api/livekit/recording/start', {
      sessionId: SESSION_ID
    }, tokens.relationship_manager);
    return {
      ok: student.status === 403 && founder.status === 403 && rm.status === 403,
      student: student.status,
      founder: founder.status,
      relationshipManager: rm.status,
      ms: student.ms + founder.ms + rm.ms
    };
  });

  await check('real egress start not exercised by automated probe', function () {
    return {
      ok: false,
      skipped: true,
      reason: 'Starting LiveKit Egress creates a real recording; it is left to a trainer-controlled session, while authorization and link privacy are verified above.'
    };
  });

  await check('live database reads use Supabase without service-role disclosure', async function () {
    if (MODE !== 'live') return skip('mock mode has no live database');
    const health = await req('GET', '/api/health');
    const pub = await req('GET', '/api/public/config');
    const people = await req('GET', '/api/admin/people/trainer', undefined, tokens.founder);
    const text = JSON.stringify(pub.body || {});
    return {
      ok: health.status === 200 && health.body.database === 'supabase' &&
        health.body.supabaseConfigured === true && pub.status === 200 &&
        pub.body.supabase && pub.body.supabase.publishableKey &&
        text.indexOf('service_role') === -1 && people.status === 200 &&
        Array.isArray(people.body.people) && people.body.people.length > 0,
      database: health.body && health.body.database,
      configured: health.body && health.body.supabaseConfigured,
      publicKeyAvailable: Boolean(pub.body && pub.body.supabase && pub.body.supabase.publishableKey),
      serviceRoleDisclosed: text.indexOf('service_role') !== -1,
      trainers: people.body && people.body.people && people.body.people.length,
      ms: health.ms + pub.ms + people.ms
    };
  });

  await check('Razorpay and WhatsApp are honestly skipped', function () {
    return {
      ok: false,
      skipped: true,
      reason: 'Razorpay keys are empty and Twilio/WhatsApp are deliberately out of scope for this walkthrough; no fake success is claimed.'
    };
  });

  await check('signed native wrappers remain blocked on this Windows runner', function () {
    return {
      ok: false,
      skipped: true,
      reason: 'IPA signing and TestFlight need macOS/Xcode plus Apple signing assets; the web/PWA source is verified here.'
    };
  });

  const passed = results.filter(function (item) { return item.ok; }).length;
  const failed = results.filter(function (item) { return !item.ok && !item.skipped; }).length;
  const skipped = results.filter(function (item) { return item.skipped; }).length;
  const summary = {
    at: new Date().toISOString(), base: BASE, mode: MODE,
    mutations: ALLOW_MUTATIONS,
    total: results.length, passed: passed, failed: failed, skipped: skipped,
    scenarios: results
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('e2e-master: ' + summary.total + ' checks, ' + passed + ' passed, ' +
    skipped + ' skipped, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
}

main().catch(function (error) {
  console.error('e2e-master crashed:', error && error.stack || error);
  process.exitCode = 1;
});
