/* Early-years auto planner: registered catalogue, immutable cache versions,
   deterministic provider options, strict child-safe validation and role-scoped
   APIs. Provider calls are stubbed; no external AI request is made. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const mock = require('../db/mock');
const catalog = require('../services/curriculumCatalog');
const planner = require('../services/weeklyPlannerService');
const ai = require('../services/cloudflareAiService');

const originalGenerate = ai.generateAIResponse;
let checks = 0;

function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function resetPlannerState() {
  mock.weeklyPlannerCache.length = 0;
  mock.weeklyPlannerArchive.length = 0;
  mock.weeklyPlannerPointers.length = 0;
}
function selection(input) {
  return planner.resolveSelection(Object.assign({
    curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
  }, input || {}));
}
function validPlanner(chosen) {
  return planner.buildFallback(chosen, planner.allowedStandards(chosen));
}
function stubProvider(production) {
  const calls = [];
  ai.generateAIResponse = async function (systemPrompt, userPrompt, options) {
    calls.push({ system: systemPrompt, user: userPrompt, options: options });
    return production === null ? production : validPlanner(selection());
  };
  return calls;
}

async function routeTest() {
  resetPlannerState();
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const stubbed = stubProvider();

  async function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data, text: text };
  }

  try {
    const founder = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app', password: 'mathify-demo'
    });
    const trainer = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    });
    const parent = await request('POST', '/api/auth/login', {
      email: 'parent@mathify.app', password: 'mathify-demo', role: 'parent'
    });
    equal(founder.status, 200, 'founder signs in for planner administration');
    equal(trainer.status, 200, 'trainer signs in for planner reads');
    equal(parent.status, 200, 'parent signs in for a child-scoped planner read');

    const trainerRegenerate = await request('POST', '/api/lms/planner/regenerate', {
      curriculum: 'cbse', grade: 'class-7'
    }, trainer.body.token);
    equal(trainerRegenerate.status, 403, 'a trainer cannot regenerate a cached planner');
    const trainerEdit = await request('PATCH', '/api/lms/planner', {
      curriculum: 'cbse', grade: 'class-7', planner: validPlanner(selection())
    }, trainer.body.token);
    equal(trainerEdit.status, 403, 'a trainer cannot edit a planner');

    const regenerate = await request('POST', '/api/lms/planner/regenerate', {
      curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
    }, founder.body.token);
    equal(regenerate.status, 200, 'founder regenerates and archives a version');
    equal(regenerate.body.cache.version, 2, 'regeneration moves v1 to v2');

    const edited = await request('PATCH', '/api/lms/planner', {
      curriculum: 'cbse', grade: 'class-7', topic: 'Ratios',
      planner: validPlanner(selection())
    }, founder.body.token);
    equal(edited.status, 200, 'founder can edit a planner');
    equal(edited.body.cache.version, 3, 'an edit writes a new immutable version');

    const childRead = await request('GET',
      '/api/lms/planner?studentId=usr_student_999&curriculum=igcse&grade=grade-7',
      undefined, parent.body.token);
    equal(childRead.status, 200, 'parent reads the linked child planner');
    equal(childRead.body.selection.curriculumSlug, 'cbse',
      'client-supplied curriculum override is ignored for a parent');
    equal(childRead.body.selection.gradeSlug, 'class-7',
      'client-supplied grade override is ignored for a parent');
    equal(childRead.body.selection.topic, 'Ratios',
      'the registered child chapter is used as the generation topic');
    ok(!/ishaan@example|98765|trainerInstructions|answerKey/i.test(childRead.text),
      'planner payload carries no student contact or trainer-only fields');
    ok(stubbed.length >= 1, 'provider stub observed the generation calls');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function main() {
  try {
    const curricula = catalog.list();
    ok(curricula.length >= 60, 'catalogue registers at least sixty boards');
    ['uae-ministry', 'cbse', 'igcse', 'common-core', 'uk-national', 'singapore-moe',
      'japan-mext', 'china-national', 'saudi-national', 'dubai-private', 'other-local']
      .forEach(function (slug) {
        ok(curricula.some(function (item) { return item.slug === slug; }), slug + ' is registered');
      });
    const cbseGrades = catalog.gradesFor('cbse');
    ok(cbseGrades.some(function (item) { return item.slug === 'class-1'; }), 'CBSE starts at class 1');
    ok(cbseGrades.some(function (item) { return item.slug === 'class-12'; }), 'CBSE ends at class 12');
    ok(catalog.gradesFor('uk-national').some(function (item) { return item.slug === 'year-1'; }),
      'UK grades use the year ladder');
    equal(catalog.resolve('cbse', 'year-1').gradeSlug, null,
      'a grade from another ladder is rejected for CBSE');
    equal(catalog.resolve('cbse', 'class-7').gradeSlug, 'class-7',
      'a registered board/grade pair resolves to a stable slug');
    equal(Object.keys(catalog.profiles()).length, 7, 'only seven legacy profiles are public');

    resetPlannerState();
    const chosen = selection();
    const allowed = planner.allowedStandards(chosen);
    ok(allowed.length > 0, 'the standards registry supplies approved codes');
    let calls = stubProvider();
    const first = await planner.getOrCreate(chosen);
    equal(first.cache.hit, false, 'first read generates a planner');
    equal(first.cache.cacheKey, 'planner:v1:cbse:class-7', 'v1 cache key is board and grade only');
    equal(first.cache.temperature, 0.2, 'provider uses low temperature');
    equal(first.cache.promptVersion, planner.PROMPT_VERSION, 'prompt version is stored with the planner');
    equal(first.cache.seed, planner.seedFor('planner:v1:cbse:class-7'), 'seed is derived from the cache key');
    equal(calls[0].options.temperature, 0.2, 'temperature reaches the provider chain');
    equal(calls[0].options.seed, first.cache.seed, 'seed reaches the provider chain');
    equal(calls[0].options.jsonOnly, true, 'provider is constrained to strict JSON');
    ok(calls[0].user.indexOf('"TOPIC":"Ratios"') !== -1, 'topic is carried in the generation prompt');

    const second = await planner.getOrCreate(selection({ topic: 'Fractions' }));
    equal(second.cache.hit, true, 'second read is a cache hit');
    equal(calls.length, 1, 'cache hit never calls AI');
    equal(second.cache.cacheKey, first.cache.cacheKey, 'topic change does not create a new cache key');
    equal(second.planner.meta.topic, 'Ratios', 'cached JSON stays immutable when the chapter changes');

    resetPlannerState();
    calls = [];
    ai.generateAIResponse = async function (systemPrompt, userPrompt, options) {
      calls.push({ system: systemPrompt, user: userPrompt, options: options });
      return validPlanner(selection({ topic: '' }));
    };
    const defaultTopic = await planner.getOrCreate(selection({ topic: '' }));
    ok(calls[0].user.indexOf('"TOPIC":"General Mathematics"') !== -1,
      'an empty child chapter falls back to General Mathematics');
    equal(defaultTopic.planner.meta.topic, 'General Mathematics', 'fallback topic is stored in meta');

    const unsafe = JSON.parse(JSON.stringify(validPlanner(chosen)));
    unsafe.week.days[0].activities[0].answer = '4';
    equal(planner.validatePlannerOutput(unsafe, chosen, allowed).ok, false,
      'trainer-only answer keys are rejected before save');
    const invented = JSON.parse(JSON.stringify(validPlanner(chosen)));
    invented.standards[0].code = 'CCSS.MATH.CONTENT.K.G.A.999';
    equal(planner.validatePlannerOutput(invented, chosen, allowed).ok, false,
      'invented standard codes are rejected');
    const longLine = JSON.parse(JSON.stringify(validPlanner(chosen)));
    longLine.week.days[0].narrative = 'One tiny red ball sat on a soft mat and then another very small yellow ball rolled quietly across the clean floor.';
    equal(planner.validatePlannerOutput(longLine, chosen, allowed).ok, false,
      'long child-facing sentences are rejected');
    const emptyArray = JSON.parse(JSON.stringify(validPlanner(chosen)));
    emptyArray.materialsMasterList = [];
    equal(planner.validatePlannerOutput(emptyArray, chosen, allowed).ok, false,
      'empty arrays are rejected');

    resetPlannerState();
    let invalidAttempts = 0;
    ai.generateAIResponse = async function () {
      invalidAttempts += 1;
      return { meta: {} };
    };
    const fallback = await planner.getOrCreate(chosen);
    equal(invalidAttempts, 2, 'invalid AI JSON is retried exactly once');
    equal(fallback.cache.source, 'default', 'a stored default is used after two failures');
    equal(fallback.cache.provider, 'deterministic-default', 'the default records its provider');

    resetPlannerState();
    stubProvider();
    await planner.getOrCreate(chosen);
    const regenerated = await planner.regenerate(chosen, 'usr_founder_001');
    equal(regenerated.cache.version, 2, 'regeneration writes v2');
    equal(await planner.activeVersion(chosen), 2, 'the active pointer moves to v2');
    equal(mock.weeklyPlannerArchive.length, 1, 'the prior immutable record is archived');
    equal(mock.weeklyPlannerArchive[0].version, 1, 'the archived record is v1');
    equal(mock.weeklyPlannerCache.length, 2, 'the original and new records coexist');

    await routeTest();

    const listed = await db.listWeeklyPlannerArchive();
    ok(Array.isArray(listed), 'live and mock adapters expose the planner archive');

    console.log('autoPlanner: ' + checks + ' assertions passed');
  } finally {
    ai.generateAIResponse = originalGenerate;
    resetPlannerState();
  }
}

main().catch(function (error) {
  console.error('autoPlanner: FAILED');
  console.error(error);
  process.exitCode = 1;
});
