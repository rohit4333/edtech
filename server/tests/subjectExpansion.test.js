/* Multi-subject expansion contract.
 *
 * One backend, three subject views. These checks cover the exact math cache-key
 * invariant, subject isolation, the hidden-test boundary, sandbox safety,
 * trainer-led IDE locking and session-scoped English work. No live provider or
 * mail credential is used. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const catalog = require('../services/subjectCatalog');
const planner = require('../services/weeklyPlannerService');
const runner = require('../services/codeRunnerService');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

async function main() {
  /* Catalog: a missing or hostile subject never escapes to math-like guesses. */
  equal(catalog.normalize(undefined), 'math', 'a missing subject defaults to math');
  equal(catalog.normalize('MATHS'), 'math', 'maths alias resolves to math');
  equal(catalog.normalize('Programming'), 'coding', 'programming alias resolves to coding');
  equal(catalog.normalize('public speaking'), 'english', 'speaking alias resolves to English');
  equal(catalog.normalize('../../secrets'), 'math', 'hostile input falls back to math');
  equal(catalog.publicView('english').workspace, 'literacy', 'English exposes its workspace');
  ok(catalog.publicView('english').strands.indexOf('Public speaking') !== -1,
    'English includes public speaking');
  ok(catalog.publicView('english').strands.indexOf('Literature') === -1,
    'English is not framed as literature');

  /* Planner keys: the math key stays byte-for-byte unchanged; other subjects
     are namespaced and never collide on the same board and grade. */
  equal(planner.cacheKeyFor('cbse', 'class-7', 1, 'math'), 'planner:v1:cbse:class-7',
    'the exact legacy math cache key is preserved');
  equal(planner.pointerKeyFor('cbse', 'class-7', 'math'), 'planner:active:cbse:class-7',
    'the exact legacy math pointer key is preserved');
  equal(planner.cacheKeyFor('cbse', 'class-7', 1, 'coding'),
    'planner:v1:coding:cbse:class-7', 'coding planner is namespaced');
  equal(planner.cacheKeyFor('cbse', 'class-7', 1, 'english'),
    'planner:v1:english:cbse:class-7', 'English planner is namespaced');
  ok(planner.cacheKeyFor('cbse', 'class-7', 1, 'math') !==
    planner.cacheKeyFor('cbse', 'class-7', 1, 'coding'), 'subjects cannot share a cache record');
  const mathSelection = planner.resolveSelection({ curriculum: 'cbse', grade: 'class-7', topic: 'Ratios' });
  equal(mathSelection.subject, 'math', 'legacy two-field selection remains math');
  equal(mathSelection.topic, 'Ratios', 'topic still shapes generation');
  const codingSelection = planner.resolveSelection({ subject: 'coding', curriculum: 'cbse', grade: 'class-7' });
  equal(codingSelection.topic, 'General Coding', 'coding has its own safe default topic');
  const englishSelection = planner.resolveSelection({ subject: 'english', curriculum: 'cbse', grade: 'class-7' });
  equal(englishSelection.topic, 'General Communication', 'English has its own safe default topic');
  ['math', 'coding', 'english'].forEach(function (subject) {
    const selection = planner.resolveSelection({ subject: subject, curriculum: 'cbse', grade: 'class-7' });
    const allowed = planner.allowedStandards(selection);
    const checked = planner.validatePlannerOutput(planner.buildFallback(selection, allowed), selection, allowed);
    ok(checked.ok, subject + ' fallback planner validates');
  });
  ok(planner.allowedStandards('coding', 'cbse', 'class-7').every(function (item) {
    return item.code.indexOf('CCSS.MATH') === -1;
  }), 'coding standards never borrow math framework codes');
  ok(planner.allowedStandards('english', 'cbse', 'class-7').every(function (item) {
    return item.code.indexOf('CCSS.MATH') === -1;
  }), 'English standards never borrow math framework codes');

  /* Checker: correct code passes, wrong code fails generically, a runaway loop
     is stopped and no sandbox escape reaches the filesystem. */
  const correct = runner.runChecks(
    'function solution(a, b) { return a + b; }', runner.STARTER.tests
  );
  equal(correct.passed, true, 'a correct solution passes hidden checks');
  const wrong = runner.runChecks(
    'function solution(a, b) { return a - b; }', runner.STARTER.tests
  );
  equal(wrong.passed, false, 'an incorrect solution fails hidden checks');
  const wrongText = wrong.results.map(function (item) {
    return item.name + ' ' + item.message;
  }).join(' ');
  equal(wrongText.indexOf('5'), -1, 'no expected value is returned');
  ok(wrong.results.every(function (item) { return item.message.length < 30; }),
    'failure messages stay generic');
  const runaway = runner.runChecks('while (true) {}', runner.STARTER.tests);
  ok(runaway.results.some(function (item) { return item.message === 'Timed out.'; }),
    'an infinite loop is stopped by the timeout');
  const escaped = runner.runChecks(
    'function solution() { return require("fs").readFileSync("server/config/env"); }',
    runner.STARTER.tests
  );
  equal(escaped.passed, false, 'require is unavailable in the checker sandbox');
  const dynamic = runner.runChecks(
    'function solution() { return (function () {}).constructor("return process")(); }',
    runner.STARTER.tests
  );
  equal(dynamic.passed, false, 'dynamic code generation is disabled');

  /* A submission must never rewrite the grader's assertions, read hidden-test
     values through console, or keep the API alive with a microtask chain. */
  const assertOverride = runner.runChecks(
    'globalThis.assert = { strictEqual: function () {}, ok: function () {} };' +
    'function solution() { return 0; }',
    [{ name: 'Adds', code: 'assert.strictEqual(solution(2, 3), 5);', hidden: true }]
  );
  equal(assertOverride.passed, false, 'overwriting assert cannot pass hidden checks');
  const hiddenLog = runner.runChecks(
    'function solution(a, b) { return a + b; }',
    [{ name: 'Adds', code: 'console.log("SECRET", 5); assert.strictEqual(solution(2, 3), 5);' }]
  );
  equal(hiddenLog.passed, true, 'a valid solution still passes an isolated test');
  equal(hiddenLog.output, '', 'hidden-test console output never crosses the boundary');
  const microtaskStart = Date.now();
  const microtask = runner.runChecks(
    'async function loop() { while (true) { await null; } } loop();' +
    'function solution(a, b) { return a + b; }', runner.STARTER.tests
  );
  equal(typeof microtask.passed, 'boolean', 'a microtask-loop submission returns a result');
  ok(Date.now() - microtaskStart < 4000, 'a microtask loop is hard-killed, not left running');
  let truncated = false;
  try {
    runner.runChecks('function solution() { return 1; }',
      Array.from({ length: 13 }, function (_, index) {
        return { name: 'check ' + index, code: 'assert.ok(true);' };
      }));
  } catch (error) {
    truncated = error.code === 'TOO_MANY_TESTS' && error.status === 422;
  }
  ok(truncated, 'an over-limit test bank is rejected instead of silently truncated');

  const safeChallenge = JSON.stringify(runner.publicChallenge({
    id: 'chal_secret', sessionId: 'ses_math_001', title: 'Secret',
    prompt: 'Solve it', starterCode: '// start',
    tests: [{ name: 'hidden', code: 'assert.strictEqual(solution(), 42);' }]
  }));
  equal(safeChallenge.indexOf('assert.strictEqual'), -1, 'challenge payload hides test source');
  equal(safeChallenge.indexOf('42'), -1, 'challenge payload hides expected values');
  ok(safeChallenge.indexOf('testsHidden') !== -1, 'challenge payload declares hidden tests');

  /* HTTP surface: roles, subject state, hidden tests, IDE lock and English work. */
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch (error) { payload = text; }
    return { status: response.status, body: payload, text: text };
  }
  function login(email) {
    return request('POST', '/api/auth/login', {
      email: email, password: process.env.DEMO_PASSWORD || 'mathify-demo'
    });
  }

  try {
    const password = process.env.DEMO_PASSWORD || 'mathify-demo';
    const studentLogin = await login('student@mathify.app');
    const trainerLogin = await login('trainer@mathify.app');
    const founderLogin = await login('founder@mathify.app');
    const rmLogin = await login('rm@mathify.app');
    equal(studentLogin.status, 200, 'student can sign in');
    equal(trainerLogin.status, 200, 'trainer can sign in');
    equal(founderLogin.status, 200, 'founder can sign in');
    equal(rmLogin.status, 200, 'RM can sign in');
    const student = studentLogin.body.token;
    const trainer = trainerLogin.body.token;
    const founder = founderLogin.body.token;
    const rm = rmLogin.body.token;
    const sessionId = 'ses_math_001';

    const state = await request('GET', '/api/sessions/' + sessionId + '/state', undefined, student);
    equal(state.status, 200, 'student can open session state');
    equal(state.body.state.subject.subject, 'math', 'session state carries a safe subject view');
    ok(Array.isArray(state.body.state.subject.strands), 'session subject exposes safe strands');

    const dashboard = await request('GET', '/api/student/dashboard', undefined, student);
    equal(dashboard.body.dashboard.student.subject.subject, 'math',
      'student dashboard carries the subject view');
    const trainerDashboard = await request('GET', '/api/trainer/dashboard', undefined, trainer);
    equal(trainerDashboard.body.dashboard.trainer.subject.subject, 'math',
      'trainer dashboard carries the subject view');
    ok(Array.isArray(trainerDashboard.body.dashboard.subjectSummary),
      'trainer dashboard exposes a subject summary');

    const starter = await request('GET', '/api/code/challenge?sessionId=' + sessionId, undefined, student);
    equal(starter.status, 200, 'student can read the starter challenge');
    equal(starter.body.challenge.testsHidden, true, 'starter challenge declares hidden tests');
    equal(starter.body.challenge.tests, undefined, 'starter challenge has no test source');

    const published = await request('POST', '/api/code/challenges', {
      sessionId: sessionId, title: 'Add two numbers', prompt: 'Return a + b',
      starterCode: 'function solution(a, b) {}',
      tests: [{ name: 'sum', code: 'assert.strictEqual(solution(4, 5), 9);', hidden: true }]
    }, trainer);
    equal(published.status, 201, 'trainer can publish a challenge');
    equal(published.body.challenge.tests, undefined, 'publish response hides tests');
    equal(JSON.stringify(published.body).indexOf('solution(4, 5)'), -1,
      'publish response hides hidden test source');

    const visible = await request('GET', '/api/code/challenge?sessionId=' + sessionId, undefined, student);
    equal(visible.body.challenge.title, 'Add two numbers', 'student sees the challenge prompt');
    equal(visible.body.challenge.tests, undefined, 'student never receives hidden tests');

    const check = await request('POST', '/api/code/check', {
      sessionId: sessionId,
      challengeId: published.body.challenge.id,
      code: 'function solution(a, b) { return a + b; }'
    }, student);
    equal(check.status, 200, 'student can run a hidden-test check');
    equal(check.body.passed, true, 'a correct submission passes the published tests');
    equal(check.text.indexOf('solution(4, 5)'), -1, 'test source never appears in check output');

    const studentIde = await request('POST', '/api/code/sessions/' + sessionId + '/ide', {
      code: 'function solution(a, b) { return a + b; }'
    }, student);
    equal(studentIde.status, 200, 'student can write when the editor is open');
    equal(studentIde.body.ide.version, 1, 'IDE version increments');

    const locked = await request('POST', '/api/code/sessions/' + sessionId + '/ide', {
      locked: true
    }, trainer);
    equal(locked.status, 200, 'trainer can lock the editor');
    equal(locked.body.ide.locked, true, 'lock state is stored');
    const blocked = await request('POST', '/api/code/sessions/' + sessionId + '/ide', {
      code: 'student edit while locked'
    }, student);
    equal(blocked.status, 403, 'student cannot write while the trainer holds the editor');
    equal(blocked.body.error, 'IDE_LOCKED', 'lock refusal is explicit');
    const handover = await request('POST', '/api/code/sessions/' + sessionId + '/ide', {
      locked: false, ownerId: 'usr_student_001'
    }, trainer);
    equal(handover.status, 200, 'trainer can hand the editor back');
    const resumed = await request('POST', '/api/code/sessions/' + sessionId + '/ide', {
      code: 'function solution(a, b) { return a - b; }'
    }, student);
    equal(resumed.status, 200, 'student can write after hand-over');

    const englishSave = await request('POST', '/api/english/work', {
      sessionId: sessionId,
      annotations: 'New word: gently',
      writing: { draft: 'The dog came back to Maya.' },
      speaking: { responses: ['I helped a friend with a shelf.'] }
    }, student);
    equal(englishSave.status, 200, 'student can save communication work');
    equal(englishSave.body.writing.draft, 'The dog came back to Maya.', 'student draft is stored');
    const englishRead = await request('GET', '/api/english/work?sessionId=' + sessionId, undefined, trainer);
    equal(englishRead.status, 200, 'trainer can read the child work');
    equal(englishRead.body.annotations, 'New word: gently', 'annotations are session-scoped');
    const englishFeedback = await request('POST', '/api/english/work', {
      sessionId: sessionId, feedback: 'Try one more describing word.'
    }, trainer);
    equal(englishFeedback.body.feedback, 'Try one more describing word.', 'trainer can leave feedback');
    const englishStudent = await request('GET', '/api/english/work?sessionId=' + sessionId, undefined, student);
    equal(englishStudent.body.writing.draft, 'The dog came back to Maya.',
      'trainer feedback does not overwrite the child draft');
    const parentWrite = await request('POST', '/api/english/work', {
      sessionId: sessionId, writing: { draft: 'overwritten' }
    }, (await login('parent@mathify.app')).body.token);
    equal(parentWrite.status, 403, 'a parent cannot overwrite the child work');

    const rmCatalog = await request('GET', '/api/lms/curriculum-catalog', undefined, rm);
    equal(rmCatalog.status, 403, 'RM is refused at the LMS gate');
    const founderCatalog = await request('GET', '/api/lms/curriculum-catalog', undefined, founder);
    equal(founderCatalog.body.subjectCount, 3, 'founder sees all three subjects');
    const trainerCatalog = await request('GET', '/api/lms/curriculum-catalog', undefined, trainer);
    equal(trainerCatalog.body.subjectCount, 1, 'trainer sees only their own field');

    const assigned = await request('PUT', '/api/admin/trainers/usr_trainer_001/subject', {
      subject: 'coding'
    }, founder);
    equal(assigned.status, 200, 'founder can assign a trainer field');
    equal(assigned.body.subject.subject, 'coding', 'assignment returns the safe subject view');
    const codingCatalog = await request('GET', '/api/lms/curriculum-catalog', undefined, trainer);
    equal(codingCatalog.body.subjects[0].subject, 'coding', 'trainer field change is reflected in LMS');
    const crossField = await request('GET', '/api/lms/planner?studentId=usr_student_001&subject=english',
      undefined, trainer);
    equal(crossField.status, 403, 'trainer cannot open another field in the planner');
    equal(crossField.body.error, 'FORBIDDEN_SUBJECT', 'cross-field refusal is explicit');

    /* AI is role/subject-scoped on every endpoint, not only the copilots. */
    const rmFeedback = await request('POST', '/api/generate-feedback', {
      concept: 'Ratios', question: 'Explain', level: '1'
    }, rm);
    equal(rmFeedback.status, 403, 'relationship manager cannot reach AI feedback');
    const trainerFeedback = await request('POST', '/api/generate-feedback', {
      concept: 'Ratios', question: 'Explain', level: '1', subject: 'english'
    }, trainer);
    equal(trainerFeedback.status, 403, 'trainer cannot cross fields in AI feedback');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('subjectExpansion: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
