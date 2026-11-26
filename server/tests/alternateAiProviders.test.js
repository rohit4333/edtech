/* AI provider chain contract. Every network call is stubbed: the test uses
   fake keys only and never reaches Gemini, Groq or Cloudflare.

   Authoritative order: freelm -> Gemini -> Groq -> Cloudflare Workers AI. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const cloudflare = require('../services/cloudflareAiService');
const chatWorker = require('../services/chatWorkerService');

const managedEnv = [
  'DATABASE_MODE', 'CHAT_WORKER_URL',
  'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_TIMEOUT_MS',
  'GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_TIMEOUT_MS',
  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_TIMEOUT_MS',
  'FREELM_MODEL', 'FREELM_TIMEOUT_SECONDS', 'FREELM_KEYLESS'
];
const originalEnv = {};
const originalFetch = global.fetch;
const originalMode = config.databaseMode;
const CHAIN_ENV = {
  GEMINI_API_KEY: 'gemini-fake-key',
  GEMINI_MODEL: 'gemini-flash-lite-latest',
  GROQ_API_KEY: 'groq-fake-key',
  GROQ_MODEL: 'qwen/qwen3.8-27b',
  CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CLOUDFLARE_API_TOKEN: 'test-token',
  FREELM_MODEL: 'chat:fast',
  FREELM_TIMEOUT_SECONDS: '5'
};
let checks = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

function ok(value, label) {
  assert.ok(value, label);
  checks += 1;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async function () { return JSON.stringify(body); }
  };
}

function geminiReply(text) {
  return response(200, {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: text }] }]
  });
}

function groqReply(text) {
  return response(200, { choices: [{ message: { role: 'assistant', content: text } }] });
}

function indexMatching(calls, needle) {
  return calls.findIndex(function (call) { return call.url.indexOf(needle) !== -1; });
}

async function main() {
  managedEnv.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    config.databaseMode = 'supabase';
    process.env.DATABASE_MODE = 'supabase';
    delete process.env.CHAT_WORKER_URL;
    process.env.FREELM_KEYLESS = '';
    Object.keys(CHAIN_ENV).forEach(function (key) { process.env[key] = CHAIN_ENV[key]; });

    let calls = [];
    global.fetch = async function (url, options) {
      calls.push({ url: String(url), options: options });
      const target = String(url);
      if (target.indexOf('api.groq.com/openai/v1/models') !== -1) {
        return response(200, { data: [] });
      }
      if (target.indexOf('generativelanguage.googleapis.com/v1beta/openai/chat/completions') !== -1) {
        return response(503, { error: { message: 'freelm upstream busy' } });
      }
      if (target.indexOf('generativelanguage.googleapis.com/v1beta/interactions') !== -1) {
        return response(503, { error: { message: 'high demand' } });
      }
      if (target.indexOf('api.groq.com/openai/v1/chat/completions') !== -1) {
        return groqReply('{"ok":true}');
      }
      throw new Error('Cloudflare should not be reached after Groq succeeds.');
    };

    /* Strict calls still try every stage before Cloudflare. */
    const strictText = await cloudflare.generateAIResponse('system', 'user', { allowFallback: false });
    equal(strictText, '{"ok":true}', 'Groq answers after freelm and Gemini fail');

    const freelmIndex = indexMatching(calls, '/v1beta/openai/chat/completions');
    const geminiIndex = indexMatching(calls, '/v1beta/interactions');
    const groqIndex = indexMatching(calls, '/v1/chat/completions');
    ok(freelmIndex !== -1, 'freelm stage is attempted in live mode');
    ok(geminiIndex !== -1, 'direct Gemini stage is attempted after freelm');
    ok(groqIndex !== -1, 'direct Groq stage is attempted after Gemini');
    ok(freelmIndex < geminiIndex && geminiIndex < groqIndex,
      'the live chain order is freelm -> Gemini -> Groq');
    equal(indexMatching(calls, 'api.cloudflare.com'), -1,
      'Cloudflare is not called after an earlier stage succeeds');
    equal(String(calls[geminiIndex].options.headers['x-goog-api-key']), CHAIN_ENV.GEMINI_API_KEY,
      'the fake Gemini key is sent in the provider header only');

    /* Gemini may also answer image questions; freelm and Groq are text-only. */
    calls = [];
    global.fetch = async function (url, options) {
      calls.push({ url: String(url), options: options });
      if (String(url).indexOf('generativelanguage.googleapis.com/v1beta/interactions') !== -1) {
        return geminiReply('{"reply":"I can see three equal bars. What would each bar represent?"}');
      }
      throw new Error('Text-only or final provider must not be used for an image.');
    };
    const vision = await chatWorker.ask('student-doubt', {
      role: 'student',
      question: 'What should I try first?',
      image: { data: Buffer.alloc(64, 7).toString('base64'), mime: 'image/png', name: 'working.png' }
    });
    equal(vision.source, 'ai', 'Gemini vision reply is accepted by the study buddy');
    equal(vision.imageUsed, true, 'image use is recorded as metadata only');
    equal(calls.length, 1, 'vision uses only the Gemini attempt when it succeeds');
    const geminiBody = JSON.parse(calls[0].options.body);
    ok(Array.isArray(geminiBody.input) && geminiBody.input.some(function (part) {
      return part && part.type === 'image' && part.mime_type === 'image/png';
    }), 'Gemini receives the inline image with its MIME type');
    equal(geminiBody.input.some(function (part) { return part && part.type === 'text'; }), true,
      'Gemini also receives the sanitized maths prompt');

    /* Strict mode never substitutes a deterministic result when all fail. */
    calls = [];
    global.fetch = async function (url, options) {
      calls.push({ url: String(url), options: options });
      if (String(url).indexOf('api.groq.com/openai/v1/models') !== -1) {
        return response(200, { data: [] });
      }
      return response(500, { error: { message: 'provider unavailable' } });
    };
    await assert.rejects(
      cloudflare.generateAIResponse('system', 'user', { allowFallback: false }),
      /Cloudflare Workers AI returned HTTP 500/
    );
    checks += 1;
    const failFreelm = indexMatching(calls, '/v1beta/openai/chat/completions');
    const failGemini = indexMatching(calls, '/v1beta/interactions');
    const failGroq = indexMatching(calls, '/v1/chat/completions');
    const failCloudflare = indexMatching(calls, 'api.cloudflare.com');
    ok(failFreelm !== -1 && failGemini !== -1 && failGroq !== -1 && failCloudflare !== -1,
      'a strict call attempts all four stages before failing');
    ok(failFreelm < failGemini && failGemini < failGroq && failGroq < failCloudflare,
      'the complete chain order is freelm -> Gemini -> Groq -> Cloudflare');

    /* The deployed Worker uses the same order when bindings are configured. */
    const workerSource = fs.readFileSync(path.join(__dirname, '..', '..', 'worker.js'), 'utf8');
    const start = workerSource.indexOf('async function callFreelm');
    const end = workerSource.indexOf('async function writeAudit');
    ok(start !== -1 && end !== -1 && start < end, 'Worker chain section is present');
    const section = workerSource.slice(start, end);
    const freelmCall = section.indexOf('callFreelm(input, env)');
    const geminiCall = section.indexOf('callGemini(input, env)');
    const groqCall = section.indexOf('callGroq(input, env)');
    const cloudflareCall = section.indexOf('env.AI.run');
    ok(freelmCall !== -1 && geminiCall !== -1 && groqCall !== -1 && cloudflareCall !== -1 &&
      freelmCall < geminiCall && geminiCall < groqCall && groqCall < cloudflareCall,
    'deployed Worker orders freelm before Gemini before Groq before Cloudflare');
    equal(/\b(deepseek|gpt-)\b/i.test(workerSource), false,
      'no unsupported AI provider is named in the Worker');

    console.log('alternateAiProviders: ' + checks + ' assertions passed');
  } finally {
    global.fetch = originalFetch;
    config.databaseMode = originalMode;
    managedEnv.forEach(function (key) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
