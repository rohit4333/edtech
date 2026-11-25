/* Chat assistant contract: real Workers AI prompts, academic context only,
   strict JSON output and an honest fallback. Network calls are stubbed. */

const assert = require('assert');
const chatAssistant = require('../services/chatAssistantService');
const curriculumRepository = require('../db/curriculum');

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

const student = {
  name: 'Ishaan Verma',
  email: 'ishaan@example.com',
  phone: '+91 98765 43210',
  curriculum: 'CBSE',
  grade: 7,
  language: 'English',
  schoolChapter: 'Ratios'
};

function envelope(content) {
  return JSON.stringify({ success: true, result: { response: JSON.stringify(content) } });
}

function stubFetch(responses, seen) {
  global.fetch = async function (url, options) {
    const body = JSON.parse(options.body);
    seen.push({ url: url, system: body.messages[0].content, user: body.messages[1].content });
    return {
      ok: true,
      status: 200,
      text: async function () { return responses.shift(); }
    };
  };
}

function assertPrivateDataAbsent(text, label) {
  ['Ishaan Verma', 'ishaan@example.com', '98765', 'instagram', 'wa.me']
    .forEach(function (leak) { ok(text.indexOf(leak) === -1, label + ' excludes ' + leak); });
}

async function main() {
  providerKeys.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    providerKeys.forEach(function (key) { delete process.env[key]; });
    curriculumRepository.reset('mock');

    const offline = await chatAssistant.reply('student', 'How do I start?', { student: student });
    equal(offline.source, 'fallback', 'missing credentials yield a labelled fallback');
    ok(offline.reply.indexOf('offline') !== -1, 'fallback reply is honest about being offline');

    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
    const seen = [];
    stubFetch([envelope({ reply: 'Start with one bar model.' })], seen);

    const answer = await chatAssistant.reply('student', 'How do I start?', { student: student });
    equal(answer.reply, 'Start with one bar model.', 'AI reply is returned to the student');
    equal(answer.source, 'ai', 'successful call is marked AI sourced');
    equal(seen.length, 1, 'one Workers AI request is made');
    ok(seen[0].url.indexOf('/ai/run/') !== -1, 'call goes to the Workers AI endpoint');
    ok(seen[0].system.indexOf('CBSE') !== -1, 'student prompt injects the school curriculum');
    ok(seen[0].system.indexOf('rupees') !== -1 && seen[0].system.indexOf('cricket') !== -1,
      'student prompt uses the mapped illustration context');
    ok(seen[0].system.endsWith(
      'CRITICAL: Return ONLY valid JSON. No markdown, no explanations.'),
    'strict JSON instruction is appended');
    ok(seen[0].system.indexOf('trainerInstructions') === -1 &&
       seen[0].system.indexOf('misconception_watch') === -1 &&
       seen[0].system.indexOf('answer key') !== -1,
    'student prompt forbids answer keys without leaking trainer-only notes');
    assertPrivateDataAbsent(seen[0].system + seen[0].user, 'student tutor prompt');
    ok(seen[0].user.indexOf('Ratios') !== -1, 'student prompt carries the school chapter');

    stubFetch([envelope({ reply: 'Try a fresh bar model for that plan.' })], seen);
    const trainerAnswer = await chatAssistant.reply('trainer', 'Plan the next step?', {
      student: student, studentId: 'usr_student_001', sessionId: 'ses_math_001'
    });
    equal(trainerAnswer.source, 'ai', 'trainer copilot uses Workers AI');
    const trainerPrompt = seen[1].system + seen[1].user;
    ok(trainerPrompt.indexOf('CBSE') !== -1, 'trainer copilot can use academic context');
    assertPrivateDataAbsent(trainerPrompt, 'trainer copilot prompt');

    stubFetch([envelope({ message: 'not the expected shape' })], seen);
    const invalid = await chatAssistant.reply('student', 'Again', { student: student });
    equal(invalid.source, 'fallback', 'invalid AI JSON falls back');
    equal(invalid.reason, 'INVALID_AI_JSON', 'fallback reason is explicit');

    const empty = await chatAssistant.reply('student', '   ', {});
    equal(empty.source, 'validation', 'empty questions are rejected before any API call');

    console.log('chatAssistant: ' + checks + ' assertions passed');
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
