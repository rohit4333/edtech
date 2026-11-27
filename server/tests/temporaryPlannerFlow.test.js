/* Temporary dev planner end-to-end flow.
 *
 * Boots the real Express app against the mock store, loads the checked-in local
 * fixture into ses_math_001, and verifies the full narrative/practice/retest
 * loop. Nothing here generates a real planner or exposes trainer material to
 * the student. The original session snapshot is restored on exit.
 */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const serializers = require('../serializers');
const fixture = require('../services/temporaryPlannerFixture');

let checks = 0;
function ok(value, message) {
  assert.strictEqual(Boolean(value), true, message);
  checks += 1;
}
function equal(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
  checks += 1;
}

const FORBIDDEN_GUIDE_KEYS = [
  'answerIndex', 'answerindex', 'answerKey', 'correctOptionId', 'correctAnswer',
  'hint', 'explanation', 'trainerInstructions', 'trainer_instructions', 'misconceptions'
];

function collectKeys(value, out) {
  if (!value || typeof value !== 'object') return out;
  Object.keys(value).forEach(function (key) {
    out.push(key);
    collectKeys(value[key], out);
  });
  return out;
}

function assertGuideSafe(guide) {
  const keys = collectKeys(guide || {}, []);
  const hits = keys.filter(function (key) { return FORBIDDEN_GUIDE_KEYS.indexOf(key) !== -1; });
  equal(hits.length, 0, 'student guide has no answer or trainer-only keys: ' + hits.join(', '));
}

async function main() {
  const sessionId = 'ses_math_001';
  const original = db.findSession(sessionId);
  const source = fixture.load();
  const built = fixture.build(source);
  let server;

  try {
    db.updateSession(sessionId, function (session) { return fixture.apply(session, source); });

    equal(built.questions.length, 9, 'fixture has nine practice questions');
    ok(source.concepts.every(function (concept) { return concept.practiceQuestions.length === 3; }),
      'every section has at least three practice questions');
    equal(source.completionRule.minimumCorrectPerSection, 3, 'section rule requires three correct answers');
    ok(/Mira/.test(source.story.thread) && source.concepts.every(function (concept) {
      return /Mira/.test(concept.narration);
    }), 'one Mira story runs through every section');

    const session = db.findSession(sessionId);
    const trainerView = serializers.toTrainerSession(session);
    const studentView = serializers.toStudentSession(session);
    equal(trainerView.plannerGuide.status, 'temporary_dev_fixture', 'trainer sees dev fixture marker');
    equal(trainerView.plannerGuide.concepts.length, 3, 'trainer guide lists all three sections');
    equal(studentView.plannerGuide.concepts.length, 1, 'student initially sees only the current section');
    assertGuideSafe(studentView.plannerGuide);
    equal(studentView.plannerGuide.progress.sectionRequired, 3, 'student guide shows a three-correct goal');

    server = await new Promise(function (resolve) {
      const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
    });
    const base = 'http://127.0.0.1:' + server.address().port;

    async function request(method, route, body, token) {
      const headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = 'Bearer ' + token;
      const response = await fetch(base + route, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (error) { parsed = text; }
      return { status: response.status, body: parsed, text: text };
    }

    async function login(email) {
      const response = await request('POST', '/api/auth/login', {
        email: email, password: 'mathify-demo'
      });
      equal(response.status, 200, 'login ' + email);
      return response.body.token;
    }

    async function trainerSession(token) {
      const response = await request('GET', '/api/trainer/sessions/' + sessionId, undefined, token);
      equal(response.status, 200, 'trainer session readable');
      return response.body.session;
    }

    async function currentQuestion(token) {
      const current = await trainerSession(token);
      const question = (current.quiz.questions || []).find(function (item) {
        return item.id === current.quiz.currentQuestionId;
      });
      ok(question, 'current question exists in trainer view');
      return question;
    }

    async function answerCurrent(token, studentToken, correct) {
      const question = await currentQuestion(token);
      const index = correct ? question.answerIndex : (question.answerIndex + 1) % question.options.length;
      const answer = await request('POST', '/api/student/sessions/' + sessionId + '/quiz/answers', {
        questionId: question.id, optionIndex: index
      }, studentToken);
      equal(answer.status, 200, 'answer saved for ' + question.id);
      const reveal = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/reveal', {
        questionId: question.id
      }, token);
      equal(reveal.status, 200, 'trainer reveal saved for ' + question.id);
      return question;
    }

    const trainer = await login('trainer@mathify.app');
    const student = await login('student@mathify.app');

    const beforeTotals = await request('GET', '/api/student/dashboard', undefined, student);
    equal(beforeTotals.status, 200, 'student dashboard readable');
    const before = beforeTotals.body.dashboard.questionTotals.attempted;

    const launch = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/launch', {}, trainer);
    equal(launch.status, 200, 'quiz launched from temporary fixture');

    const blockedAtStart = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/next', {}, trainer);
    equal(blockedAtStart.status, 409, 'next is blocked before a correct answer');
    equal(blockedAtStart.body.error, 'CURRENT_QUESTION_REQUIRED', 'wrong-answer gate names current question');

    const first = await answerCurrent(trainer, student, false);
    const blockedAfterWrong = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/next', {}, trainer);
    equal(blockedAfterWrong.status, 409, 'next is blocked after a wrong answer');
    equal(blockedAfterWrong.body.error, 'CURRENT_QUESTION_REQUIRED', 'wrong answer still blocks current item');

    /* Trainer explains the failed item on the board, then Retest replaces it
       with a fresh generated question on the same section. */
    const retest = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/new-check', {
      questionId: first.id, concept: first.concept, replace: true
    }, trainer);
    equal(retest.status, 201, 'retest generated a replacement question');
    ok(retest.body.questionId && retest.body.questionId !== first.id, 'retest question id is new');
    const replacement = await currentQuestion(trainer);
    equal(replacement.id, retest.body.questionId, 'retest question becomes current');
    equal(replacement.concept, first.concept, 'retest stays on the same section');

    let answeredAfterRetest = 0;
    const answeredIds = [];
    let iterations = 0;
    while (iterations < 20) {
      iterations += 1;
      const state = await trainerSession(trainer);
      if (state.quiz.status === 'ended' || state.quiz.phase === 'complete') break;
      const answered = await answerCurrent(trainer, student, true);
      answeredIds.push(answered.id);
      answeredAfterRetest += 1;
      const advance = await request('POST', '/api/trainer/sessions/' + sessionId + '/quiz/next', {}, trainer);
      equal(advance.status, 200, 'advance after a correct answer');
    }
    ok(iterations < 20, 'planner completed without looping');
    equal(answeredAfterRetest, 9, 'nine retained correct answers completed the planner: ' + answeredIds.join(', '));

    const completed = await trainerSession(trainer);
    equal(completed.plannerGuide.progress.complete, true, 'guide progress is complete');
    equal(completed.plannerGuide.progress.completedQuestionIds.length, 9, 'nine correct answers recorded');

    const finalStudent = await request('GET', '/api/student/sessions/' + sessionId, undefined, student);
    equal(finalStudent.status, 200, 'student session still readable after completion');
    assertGuideSafe(finalStudent.body.session.plannerGuide);
    equal(finalStudent.body.session.plannerGuide.concepts.length, 3, 'student sees all three completed sections');

    const afterTotals = await request('GET', '/api/student/dashboard', undefined, student);
    equal(afterTotals.status, 200, 'student dashboard readable after completion');
    equal(afterTotals.body.dashboard.questionTotals.attempted - before, 9,
      'platform totals count the nine retained correct attempts');

    console.log('temporaryPlannerFlow: ' + checks + ' assertions passed');
  } finally {
    if (server) await new Promise(function (resolve) { server.close(resolve); });
    db.updateSession(sessionId, function () { return original; });
  }
}

main().catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
