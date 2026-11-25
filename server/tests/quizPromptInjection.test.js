/* Generator prompt contract: the student's curriculum injection and the
   trainer-only authoring demands reach the Workers AI system prompt. */

const assert = require('assert');
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

async function main() {
  providerKeys.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    providerKeys.forEach(function (key) { delete process.env[key]; });
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';

    const payload = {
      questions: [{
        question: 'A 2 : 3 ribbon is 10 cm short. How long is the long piece?',
        options: ['12 cm', '15 cm', '20 cm', '25 cm'],
        correctAnswer: '15 cm',
        hint: 'Find the value of one part first.'
      }]
    };
    let systemPrompt = '';
    global.fetch = async function (url, options) {
      const body = JSON.parse(options.body);
      systemPrompt = body.messages[0].content;
      return {
        ok: true,
        status: 200,
        text: async function () {
          return JSON.stringify({ success: true, result: { response: JSON.stringify(payload) } });
        }
      };
    };

    const questions = await generator.generateAdaptiveQuiz('Equivalent ratios', 72, {
      count: 1,
      student: {
        curriculum: 'CBSE',
        grade: 7,
        language: 'en',
        schoolChapter: 'Ratios',
        name: 'Ishaan Verma',
        email: 'ishaan@example.com'
      }
    });

    equal(questions.length, 1, 'generator keeps the requested question count');
    equal(questions[0].source, 'ai_draft', 'remote draft is marked as AI output');
    ok(systemPrompt.indexOf('CBSE') !== -1, 'system prompt renders the student curriculum');
    ok(systemPrompt.indexOf('rupees') !== -1 && systemPrompt.indexOf('cricket') !== -1,
      'system prompt injects Indian illustration context for CBSE');
    ok(systemPrompt.indexOf('Current school chapter: "Ratios"') !== -1,
      'system prompt injects the school chapter');
    ok(systemPrompt.indexOf('visual analogy') !== -1 &&
       systemPrompt.indexOf('story narration') !== -1,
    'system prompt demands a visual analogy and story narration');
    ok(systemPrompt.indexOf('sketch_space') !== -1 &&
       systemPrompt.indexOf('minHeight 220') !== -1 &&
       systemPrompt.indexOf('expandable: true') !== -1,
    'system prompt demands expandable 220px sketch_space blocks');
    ok(systemPrompt.indexOf('trainerInstructions') !== -1 &&
       systemPrompt.indexOf('misconception_watch') !== -1 &&
       systemPrompt.indexOf('For EVERY block') !== -1,
    'system prompt demands trainerInstructions and misconception_watch for every block');
    ok(systemPrompt.endsWith(
      'CRITICAL: Return ONLY valid JSON. No markdown, no explanations.'),
    'system prompt ends with the strict JSON instruction');
    ok(systemPrompt.indexOf('Ishaan Verma') === -1 &&
       systemPrompt.indexOf('ishaan@example.com') === -1,
    'system prompt excludes personal and contact details');

    console.log('quizPromptInjection: ' + checks + ' assertions passed');
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
