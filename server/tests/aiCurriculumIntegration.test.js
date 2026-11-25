/* End-to-end wiring: student profile -> curriculum injection -> Workers AI
   system prompt. All network calls are stubbed. */

const assert = require('assert');
const aiCurriculum = require('../services/aiCurriculumService');
const generator = require('../quiz/generator');

const providerKeys = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_MODEL',
  'CLOUDFLARE_TIMEOUT_MS'
];
const originalEnv = {};
const originalFetch = global.fetch;
let checks = 0;

function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function envelope(content) {
  return JSON.stringify({
    success: true,
    result: { response: JSON.stringify(content) }
  });
}

const student = {
  name: 'Ishaan Verma',
  email: 'ishaan@example.com',
  phone: '+91 98765 43210',
  board: 'IB',
  grade: 7,
  language: 'English'
};
const context = {
  topic: 'Equivalent ratios',
  mode: 'school_curriculum',
  school_chapter_context: 'Ratios unit, Grade 7',
  mastery_pct: 72,
  current_level: 2,
  previously_asked_questions: [],
  learning_objectives: ['Identify equivalent ratios'],
  estimated_minutes: 45
};

const parallelFixture = {
  id: 'pq_1',
  stem: 'A 2 : 3 ribbon is 10 cm short. How long is the long piece?',
  options: [
    { id: 'a', text: '12 cm' }, { id: 'b', text: '15 cm' },
    { id: 'c', text: '20 cm' }, { id: 'd', text: '25 cm' }
  ],
  correctOptionId: 'b',
  explanation: 'One part is 5 cm, so three parts are 15 cm.',
  hint: 'Find the value of one part first.'
};

function assertNoPrivateData(text, label) {
  ['Ishaan Verma', 'ishaan@example.com', '98765', 'wa.me', 'instagram']
    .forEach(function (leak) {
      ok(text.indexOf(leak) === -1, label + ' excludes ' + leak);
    });
}

async function main() {
  providerKeys.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    providerKeys.forEach(function (key) { delete process.env[key]; });

    /* Deterministic fallback still works through the integrated layer. */
    const fallbackPlanner = await aiCurriculum.generatePlannerAndCurriculum(student, context);
    equal(fallbackPlanner.planner.version, 1,
      'integrated planner falls back cleanly without credentials');
    const fallbackQuiz = await aiCurriculum.generateQuizTiers(student, context, fallbackPlanner);
    equal(Object.keys(fallbackQuiz.quiz).length, 3,
      'integrated quiz keeps its three tiers without credentials');

    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
    process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct';

    const responses = [
      envelope(fallbackPlanner),
      envelope(fallbackQuiz),
      envelope(parallelFixture)
    ];
    const systemPrompts = [];
    global.fetch = async function (url, options) {
      const body = JSON.parse(options.body);
      systemPrompts.push(body.messages[0].content);
      return {
        ok: true,
        status: 200,
        text: async function () { return responses.shift(); }
      };
    };

    const planner = await aiCurriculum.generatePlannerAndCurriculum(student, context);
    equal(planner.planner.version, 1, 'remote planner uses the integrated layer');
    const plannerPrompt = systemPrompts[0];
    ok(plannerPrompt.indexOf('IB') !== -1, 'planner prompt renders the student board');
    ok(plannerPrompt.indexOf('UN SDGs') !== -1,
      'planner prompt injects the IB global curriculum context');
    ok(plannerPrompt.indexOf('VISUAL ANALOGY') !== -1,
      'planner prompt demands a visual analogy');
    ok(plannerPrompt.indexOf('STORY NARRATION') !== -1,
      'planner prompt demands story narration');
    ok(plannerPrompt.indexOf('sketch_space') !== -1 &&
       plannerPrompt.indexOf('minHeight: 220') !== -1 &&
       plannerPrompt.indexOf('expandable: true') !== -1,
    'planner prompt demands 220px expandable sketch_space blocks');
    ok(plannerPrompt.indexOf('For EVERY block write trainerInstructions') !== -1,
      'planner prompt demands trainerInstructions on every block');
    assertNoPrivateData(plannerPrompt, 'planner prompt');

    const quiz = await aiCurriculum.generateQuizTiers(student, context, planner);
    equal(Object.keys(quiz.quiz).length, 3, 'remote quiz uses the integrated layer');
    const quizPrompt = systemPrompts[1];
    ok(quizPrompt.indexOf('UN SDGs') !== -1,
      'quiz prompt injects the same curriculum context');
    ok(quizPrompt.indexOf('trainerInstructions') === -1,
      'quiz prompt does not leak trainer-only notes to the model');
    assertNoPrivateData(quizPrompt, 'quiz prompt');

    const parallel = await aiCurriculum.generateParallelQuestion(
      student, 'Equivalent ratios', 2, { usedPrompts: [] }
    );
    equal(parallel.source, 'ai', 'remote parallel question is AI sourced');
    equal(parallel.correctOptionId, 'b', 'parallel answer stays intact');
    const parallelPrompt = systemPrompts[2];
    ok(parallelPrompt.indexOf('UN SDGs') !== -1,
      'parallel prompt injects the same curriculum context');
    ok(parallelPrompt.indexOf('Equivalent ratios') !== -1,
      'parallel prompt still renders the failed concept');
    ok(parallelPrompt.endsWith(
      'CRITICAL: Return ONLY valid JSON. No markdown, no explanations.'),
    'JSON-only instruction is appended to the system prompt');
    assertNoPrivateData(parallelPrompt, 'parallel prompt');

    /* Mastery maths is untouched by the new AI wiring. */
    equal(aiCurriculum.calculateNextDifficulty('medium', 85), 'hard',
      'label-based adaptive step still promotes at >=80');
    equal(aiCurriculum.difficultyForMastery(85), 3,
      'mastery difficulty mapping is unchanged');
    equal(generator.calculateNextDifficulty(2, 85), 3,
      'numeric calculateNextDifficulty is unchanged');
    assert.deepStrictEqual(aiCurriculum.safeParseJSON('```json\n{"a":1,}\n```'), { a: 1 });
    checks += 1;

    console.log('aiCurriculumIntegration: ' + checks + ' assertions passed');
  } finally {
    global.fetch = originalFetch;
    providerKeys.forEach(function (key) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
