/* Trainer planner access contract.
 *
 * A trainer reads only the planner already generated for a real assigned batch.
 * Batch, board, grade and topic come from server records; the browser cannot
 * choose another child or trigger generation. Suggested edits and hint additions
 * are copied only from stored planner JSON, with an honest empty state before
 * the founder generates one.
 */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const mock = require('../db/mock');
const curriculumRepository = require('../db/curriculum');
const planner = require('../services/weeklyPlannerService');
const ai = require('../services/cloudflareAiService');

const originalGenerate = ai.generateAIResponse;
const originalAdapter = curriculumRepository.adapterName();
let checks = 0;
let generationCalls = 0;
const batch = {
  id: 'batch_guidance_001',
  code: 'MATH-G1',
  studentId: 'usr_student_001',
  trainerId: 'usr_trainer_001',
  subject: 'math'
};

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function reset() {
  mock.weeklyPlannerCache.length = 0;
  mock.weeklyPlannerArchive.length = 0;
  mock.weeklyPlannerPointers.length = 0;
  const index = mock.batches.findIndex(function (row) { return row.id === batch.id; });
  if (index !== -1) mock.batches.splice(index, 1);
  curriculumRepository.reset('memory');
  generationCalls = 0;
  ai.generateAIResponse = async function () {
    generationCalls += 1;
    const chosen = planner.resolveSelection({
      subject: 'math', curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
    });
    return planner.buildFallback(chosen, planner.allowedStandards(chosen));
  };
}

async function main() {
  reset();
  mock.batches.push(JSON.parse(JSON.stringify(batch)));
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(async function (response) {
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch (error) { payload = text; }
      return { status: response.status, body: payload, text: text };
    });
  }
  function login(email, role) {
    return request('POST', '/api/auth/login', {
      email: email,
      password: process.env.DEMO_PASSWORD || 'mathify-demo',
      role: role || undefined
    });
  }

  try {
    const founder = (await login('founder@mathify.app')).body.token;
    const trainer = (await login('trainer@mathify.app')).body.token;
    const agent = (await login('planner@mathify.app', 'planner_agent')).body.token;
    ok(founder && trainer && agent, 'all three staff desks can sign in');

    const catalog = await request('GET', '/api/lms/curriculum-catalog', undefined, trainer);
    equal(catalog.status, 200, 'the trainer can read the real server catalogue');
    ok(catalog.body.count >= 60, 'the catalogue exposes its real curriculum count');
    equal(catalog.body.subjectCount, 1, 'the trainer subject scope is server-enforced');

    const emptyAssigned = await request('GET', '/api/lms/assigned-planners', undefined, trainer);
    equal(emptyAssigned.status, 200, 'the trainer can open the assigned-planner surface');
    equal(emptyAssigned.body.count, 0, 'no planner is claimed before founder generation');
    ok(/No generated planner/.test(emptyAssigned.body.message), 'the empty state is explicit');
    equal(generationCalls, 0, 'the assigned-planner surface never generates');

    const emptyGuidance = await request('GET',
      '/api/lms/planner-guidance?studentId=usr_student_001', undefined, trainer);
    equal(emptyGuidance.status, 200, 'quiz guidance is available before generation');
    equal(emptyGuidance.body.plannerAvailable, false, 'a missing planner is not fabricated');
    equal(emptyGuidance.body.suggestedEdits.length, 0, 'suggested edits stay empty');
    equal(emptyGuidance.body.hintAdditions.length, 0, 'hint additions stay empty');
    equal(emptyGuidance.body.hasGuidance, false, 'the quiz receives one honest guidance flag');

    const trainerMiss = await request('GET',
      '/api/lms/planner?studentId=usr_student_001&subject=math', undefined, trainer);
    equal(trainerMiss.status, 409, 'a trainer GET cannot generate on a cache miss');
    equal(trainerMiss.body.error, 'PLANNER_NOT_GENERATED', 'the refusal names the missing generation');
    const inventedRoute = await request('POST', '/api/lms/planner/generate', {}, trainer);
    equal(inventedRoute.status, 404, 'no trainer generation endpoint exists');

    const founderGenerated = await request('GET',
      '/api/lms/planner?studentId=usr_student_001', undefined, founder);
    equal(founderGenerated.status, 200, 'the founder generates for the assigned child');
    equal(founderGenerated.body.cache.createdByRole, 'founder', 'generation is founder-authored');
    equal(generationCalls, 1, 'only the founder generation called the provider');

    const record = mock.weeklyPlannerCache.find(function (item) {
      return item.cacheKey === founderGenerated.body.cache.cacheKey;
    });
    ok(record, 'the generated planner was stored');
    record.planner.suggestedEdits = [
      { questionId: 'q_1', text: 'Use a shorter stem in question 1.' }
    ];
    record.planner.hintAdditions = [
      { questionId: 'q_2', text: 'Offer a number line before fraction bars.' }
    ];

    const assigned = await request('GET', '/api/lms/assigned-planners', undefined, trainer);
    equal(assigned.status, 200, 'the assigned surface returns the stored planner');
    equal(assigned.body.count, 1, 'one real batch resolves to one planner');
    const item = assigned.body.assignedPlanners[0];
    equal(item.batch.id, batch.id, 'the assignment comes from the batch record');
    equal(item.batch.code, batch.code, 'the real batch code is preserved');
    equal(item.studentId, batch.studentId, 'the assigned child comes from the batch record');
    equal(item.cache.source, 'stored', 'the trainer view is a stored read');
    equal(item.cache.createdByRole, 'founder', 'the trainer only sees founder work');
    equal(item.guidance.suggestedEdits[0].text, 'Use a shorter stem in question 1.',
      'a real suggested edit is exposed');
    equal(item.guidance.hintAdditions[0].text, 'Offer a number line before fraction bars.',
      'a real hint addition is exposed');
    equal(generationCalls, 1, 'reading the assignment did not generate anything');

    const trainerRead = await request('GET',
      '/api/lms/planner?studentId=usr_student_001', undefined, trainer);
    equal(trainerRead.status, 200, 'the trainer can view the stored planner directly');
    equal(trainerRead.body.cache.hit, true, 'the direct read is a cache hit');
    equal(generationCalls, 1, 'the direct trainer read did not generate anything');

    const byStudent = await request('GET',
      '/api/lms/planner-guidance?studentId=usr_student_001', undefined, trainer);
    equal(byStudent.status, 200, 'quiz guidance accepts a roster child');
    equal(byStudent.body.plannerAvailable, true, 'the stored planner is available to quiz');
    equal(byStudent.body.suggestedEdits[0].questionId, 'q_1', 'quiz sees the real edit target');
    equal(byStudent.body.hintAdditions[0].questionId, 'q_2', 'quiz sees the real hint target');

    const bySession = await request('GET',
      '/api/lms/planner-guidance?sessionId=ses_math_000', undefined, trainer);
    equal(bySession.status, 200, 'quiz guidance accepts a trainer session');
    equal(bySession.body.plannerAvailable, true, 'the session resolves to the assigned planner');
    equal(bySession.body.suggestedEdits.length, 1, 'session guidance reads the same stored edits');

    const stranger = await request('GET',
      '/api/lms/planner-guidance?studentId=usr_student_999', undefined, trainer);
    equal(stranger.status, 403, 'a child outside the batch roster is refused');
    equal(stranger.body.error, 'FORBIDDEN_BATCH', 'the batch-scope refusal is explicit');

    const agentAssigned = await request('GET', '/api/lms/assigned-planners', undefined, agent);
    equal(agentAssigned.status, 403, 'the planner agent has no trainer assignment surface');
    const founderGuidance = await request('GET',
      '/api/lms/planner-guidance?studentId=usr_student_001', undefined, founder);
    equal(founderGuidance.status, 403, 'only a trainer reads compact quiz guidance');

    const beforeEdits = mock.weeklyPlannerCache.length;
    const beforePointers = mock.weeklyPlannerPointers.length;
    equal(beforeEdits, 1, 'one immutable planner record exists');
    equal(beforePointers, 0, 'v1 needs no explicit pointer; no version was moved');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    reset();
    ai.generateAIResponse = originalGenerate;
    curriculumRepository.reset(originalAdapter);
  }

  console.log('lmsPlannerAccess: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error('lmsPlannerAccess: FAILED');
  console.error(error);
  process.exitCode = 1;
});
