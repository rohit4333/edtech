/* Alternate AI provider chain contract. Every network call is stubbed: the
   test uses fake keys only and never reaches Gemini, Groq or Cloudflare. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const cloudflare = require('../services/cloudflareAiService');
const chatWorker = require('../services/chatWorkerService');

const managedEnv = [
  'DATABASE_MODE',
  'CHAT_WORKER_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_TIMEOUT_MS',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GROQ_TIMEOUT_MS',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_TIMEOUT_MS'
];
const originalEnv = {};
const originalFetch = global.fetch;
const originalMode = config.databaseMode;
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

async function main() {
  managedEnv.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    config.databaseMode = 'supabase';
    process.env.DATABASE_MODE = 'supabase';
    delete process.env.CHAT_WORKER_URL;
    process.env.GEMINI_API_KEY = 'gemini-fake-key';
    process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
    process.env.GROQ_API_KEY = 'groq-fake-key';
    process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';

    let calls = [];
    global.fetch = async function (url, options) {
      calls.push({ url: String(url), options: options });
      if (String(url).indexOf('generativelanguage.googleapis.com') !== -1) {
        return response(503, { error: { message: 'high demand' } });
      }
      if (String(url).indexOf('api.groq.com') !== -1) {
        return groqReply('{"ok":true}');
      }
      throw new Error('Cloudflare should not be reached after Groq succeeds.');
    };

    /* Strict calls still try every alternate before Cloudflare. */
    const strictText = await cloudflare.generateAIResponse('system', 'user', { allowFallback: false });
    equal(strictText, '{"ok":true}', 'Groq answers a strict JSON-only call after Gemini fails');
    equal(calls.length, 2, 'exactly two providers were called');
    ok(calls[0].url.indexOf('generativelanguage.googleapis.com') !== -1,
      'Gemini is attempted first in live mode');
    ok(calls[1].url.indexOf('api.groq.com') !== -1,
      'Groq is attempted second in live mode');
    equal(calls.some(function (call) { return call.url.indexOf('api.cloudflare.com') !== -1; }), false,
      'Cloudflare is not called after an alternate succeeds');
    equal(String(calls[0].options.headers['x-goog-api-key']), 'gemini-fake-key',
      'the fake Gemini key is sent in the provider header only');

    /* Gemini may also answer image questions; Groq is text-only. */
    calls = [];
    global.fetch = async function (url, options) {
      calls.push({ url: String(url), options: options });
      if (String(url).indexOf('generativelanguage.googleapis.com') !== -1) {
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
    global.fetch = async function (url) {
      calls.push({ url: String(url) });
      return response(500, { error: { message: 'provider unavailable' } });
    };
    await assert.rejects(
      cloudflare.generateAIResponse('system', 'user', { allowFallback: false }),
      /Cloudflare Workers AI returned HTTP 500/
    );
    checks += 1;
    equal(calls.length, 3, 'a strict call attempts Gemini, Groq and Cloudflare in order');
    ok(calls[0].url.indexOf('generativelanguage.googleapis.com') !== -1 &&
      calls[1].url.indexOf('api.groq.com') !== -1 &&
      calls[2].url.indexOf('api.cloudflare.com') !== -1,
    'the complete live chain order is Gemini -> Groq -> Cloudflare');

    /* The deployed Worker uses the same order when alternates are configured. */
    const workerSource = fs.readFileSync(path.join(__dirname, '..', '..', 'worker.js'), 'utf8');
    const start = workerSource.indexOf('async function runModel');
    const end = workerSource.indexOf('async function writeAudit');
    ok(start !== -1 && end !== -1 && start < end, 'Worker runModel section is present');
    const section = workerSource.slice(start, end);
    const geminiCall = section.indexOf('callGemini(input, env)');
    const groqCall = section.indexOf('callGroq(input, env)');
    const cloudflareCall = section.indexOf('env.AI.run');
    ok(geminiCall !== -1 && groqCall !== -1 && cloudflareCall !== -1 &&
      geminiCall < groqCall && groqCall < cloudflareCall,
    'deployed Worker also orders Gemini before Groq before Cloudflare');
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
