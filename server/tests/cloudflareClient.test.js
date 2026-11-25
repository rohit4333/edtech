/* Cloudflare Workers AI client contract. All network calls are stubbed. */

const assert = require('assert');
const service = require('../services/cloudflareClient');

const envKeys = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_MODEL',
  'CLOUDFLARE_TIMEOUT_MS'
];
const originalEnv = {};
const originalFetch = global.fetch;
let checks = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

function ok(value, label) {
  assert.ok(value, label);
  checks += 1;
}

async function main() {
  envKeys.forEach(function (key) { originalEnv[key] = process.env[key]; });
  try {
    envKeys.forEach(function (key) { delete process.env[key]; });

    equal(service.isConfigured(), false, 'unconfigured client reports false');
    equal(await service.generateAIResponse('system', 'user'), null,
      'unconfigured client falls back to null');
    await assert.rejects(
      service.generateAIResponse('system', 'user', { allowFallback: false }),
      /CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required/
    );
    checks += 1;

    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
    process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
    process.env.CLOUDFLARE_TIMEOUT_MS = '5000';
    equal(service.isConfigured(), true, 'configured client reports true');

    let seenUrl = '';
    let seenOptions = null;
    global.fetch = async function (url, options) {
      seenUrl = url;
      seenOptions = options;
      return {
        ok: true,
        text: async function () {
          return JSON.stringify({
            success: true,
            result: { response: '```json\n{"ok":true,}\n```' }
          });
        }
      };
    };

    const text = await service.generateAIResponse('System prompt', 'User prompt');
    equal(text, '{"ok":true}', 'model fences and trailing commas are stripped');
    equal(seenUrl,
      'https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/meta/llama-3.1-8b-instruct',
      'endpoint uses account id and model');
    equal(seenOptions.headers.Authorization, 'Bearer test-token',
      'API token is sent as a bearer token');
    equal(seenOptions.method, 'POST', 'Workers AI uses POST');

    const body = JSON.parse(seenOptions.body);
    equal(body.messages.length, 2, 'two chat messages are sent');
    ok(body.messages[0].content.indexOf('System prompt') === 0,
      'system prompt is preserved');
    ok(body.messages[0].content.indexOf('CRITICAL: Return ONLY valid JSON.') !== -1,
      'JSON-only instruction is appended');
    equal(body.messages[1].content, 'User prompt', 'user prompt is passed through');

    /* Live Workers AI currently returns an OpenAI-style choices envelope. */
    global.fetch = async function () {
      return {
        ok: true,
        text: async function () {
          return JSON.stringify({
            success: true,
            result: {
              choices: [{ message: { content: '{"choice":true}' } }]
            }
          });
        }
      };
    };
    equal(await service.generateAIResponse('s', 'u'), '{"choice":true}',
      'OpenAI-style choices envelope is supported');

    global.fetch = async function () {
      return {
        ok: true,
        text: async function () {
          return JSON.stringify({ success: false, errors: [{ message: 'Unknown model' }] });
        }
      };
    };
    equal(await service.generateAIResponse('s', 'u'), null,
      'failed provider envelope falls back to null');
    await assert.rejects(
      service.generateAIResponse('s', 'u', { allowFallback: false }),
      /Unknown model/
    );
    checks += 1;

    console.log('cloudflareClient: ' + checks + ' assertions passed');
  } finally {
    global.fetch = originalFetch;
    envKeys.forEach(function (key) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
