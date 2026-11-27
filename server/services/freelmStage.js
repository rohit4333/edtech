/* First stage of Mathify's AI provider chain.
 *
 * Target order everywhere: freelm -> Gemini -> Groq -> Cloudflare Workers AI.
 * This module owns ONLY the freelm stage. It restricts freelm to the three
 * approved provider families, disables keyless/public endpoints, and makes one
 * deterministic attempt so the later direct stages remain meaningful.
 *
 * No key is logged or serialized. Mock/local callers never reach this module.
 */

const TARGET_ORDER = ['google', 'groq', 'cloudflare'];

let sdkLoad = null;

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function loadSdk() {
  if (!sdkLoad) {
    try {
      sdkLoad = Promise.resolve(require('freelm'));
    } catch (error) {
      sdkLoad = Promise.reject(error);
    }
  }
  return sdkLoad;
}

function targetProviders(sdk) {
  if (typeof sdk.providersFromEnv !== 'function') {
    throw problem('The freelm provider registry is unavailable.', 'FREELM_UNAVAILABLE', 503);
  }
  const providers = sdk.providersFromEnv('never');
  return TARGET_ORDER.map(function (name) {
    return providers.find(function (candidate) {
      return String(candidate && candidate.name || '').toLowerCase() === name;
    });
  }).filter(Boolean);
}

function configured() {
  try {
    const sdk = require('freelm');
    return targetProviders(sdk).length > 0;
  } catch (error) {
    return false;
  }
}

async function callFreelm(request) {
  const input = request || {};
  /* freelm's chat messages are string-content only in this version. Image
     questions deliberately fall through to the Gemini/Cloudflare vision path. */
  if (input.image && input.image.data) {
    throw problem('freelm does not accept image content.', 'FREELM_IMAGE_UNSUPPORTED', 400);
  }

  let sdk;
  try {
    sdk = await loadSdk();
  } catch (error) {
    throw problem('The freelm provider is not installed.', 'FREELM_NOT_INSTALLED', 503);
  }
  if (typeof sdk.FreeLLM !== 'function') {
    throw problem('The freelm provider is unavailable.', 'FREELM_UNAVAILABLE', 503);
  }

  const providers = targetProviders(sdk);
  if (!providers.length) {
    throw problem('No approved freelm provider is configured.', 'FREELM_NOT_CONFIGURED', 503);
  }

  const timeout = Number(envValue('FREELM_TIMEOUT_SECONDS') || 20);
  const llm = new sdk.FreeLLM(providers, {
    strategy: 'priority',
    maxAttempts: 1,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 20,
    wait: false,
    hedge: false,
    persist: false
  });

  const messages = [
    { role: 'system', content: String(input.system || '') },
    { role: 'user', content: String(input.user || '') }
  ];

  const generation = {
    model: input.model || envValue('FREELM_MODEL') || 'chat:fast',
    max_tokens: Number(input.maxOutputTokens) || 600
  };
  /* Reproducible curriculum authoring needs the same generation controls at
     every stage. Stages that ignore an option simply leave Mathify's cache to
     enforce immutability after the first successful generation. */
  if (Number.isFinite(input.temperature)) generation.temperature = input.temperature;
  if (Number.isFinite(input.seed)) generation.seed = Math.trunc(input.seed);

  try {
    const response = await llm.chat(messages, generation);
    const text = String((response && response.text) || '').trim();
    if (!text) throw problem('freelm returned no text result.', 'FREELM_EMPTY_RESULT', 502);
    return text;
  } catch (error) {
    if (error && error.code) throw error;
    throw problem('freelm did not answer this request.', 'FREELM_UNAVAILABLE', 502);
  }
}

module.exports = { callFreelm: callFreelm, configured: configured, TARGET_ORDER: TARGET_ORDER };
