/* Mathify AI text service — the single server-side model call boundary.
 *
 * Provider order everywhere: freelm -> Gemini -> Groq -> Cloudflare Workers AI.
 * Workers AI stays the pinned canonical last stage and is always attempted
 * before a deterministic fallback. Every stage is only enabled in live
 * Supabase or production mode, so mock tests keep deterministic behavior.
 *
 * Credentials are read at call time so tests and env rotations do not require
 * a process restart. The caller owns Zod validation; this module guarantees a
 * provider-free JSON string (or null when a safe fallback is allowed).
 */

const config = require('../config');
const alternates = require('./aiProviders');
const freelmStage = require('./freelmStage');

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const DEFAULT_TIMEOUT_MS = 15000;
const JSON_ONLY_INSTRUCTION = 'CRITICAL: Return ONLY valid JSON. No markdown, no explanations.';
let warningShown = false;

function settings() {
  const configuredTimeout = Number(process.env.CLOUDFLARE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return {
    accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
    apiToken: String(process.env.CLOUDFLARE_API_TOKEN || '').trim(),
    model: String(process.env.CLOUDFLARE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MS
  };
}

function isConfigured() {
  const current = settings();
  return Boolean(current.accountId && current.apiToken);
}

function endpoint(current) {
  return 'https://api.cloudflare.com/client/v4/accounts/' + current.accountId +
    '/ai/run/' + current.model;
}

/** Tolerant JSON cleanup: strips fences and trailing commas, never throws. */
function safeParseJSON(raw) {
  let content = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!content) return null;

  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) content = fenced[1].trim();

  try {
    return JSON.parse(content.replace(/,(\s*[}\]])/g, '$1'));
  } catch (error) {
    return null;
  }
}

function problem(message, code, status) {
  const issue = new Error(message);
  issue.code = code;
  issue.status = status;
  return issue;
}

/** Workers AI returns result.response or a chat-compatible choices array. */
function extractGenerated(envelope) {
  const result = envelope.result || envelope;
  if (result && result.response !== undefined && result.response !== null) {
    return result.response;
  }
  const choices = (result && result.choices) || envelope.choices;
  if (Array.isArray(choices) && choices[0] && choices[0].message) {
    return choices[0].message.content;
  }
  if (typeof envelope.response === 'string') return envelope.response;
  return undefined;
}

function warnMissing() {
  if (warningShown) return;
  warningShown = true;
  console.warn('[ai] Cloudflare credentials missing; using deterministic fallback.');
}

function normalizeGenerated(generated, jsonOnly) {
  if (typeof generated === 'string') {
    if (!jsonOnly) return generated;
    const parsed = safeParseJSON(generated);
    return parsed === null ? generated : JSON.stringify(parsed);
  }
  if (generated !== null && generated !== undefined) return JSON.stringify(generated);
  throw problem('AI provider returned no text result.', 'AI_EMPTY_RESULT', 502);
}

async function callCloudflare(current, systemContent, userContent) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, current.timeoutMs);

  try {
    const response = await fetch(endpoint(current), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + current.apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ]
      }),
      signal: controller.signal
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw problem('Cloudflare Workers AI returned HTTP ' + response.status + '.',
        'CLOUDFLARE_REQUEST_FAILED', 502);
    }

    const envelope = safeParseJSON(bodyText);
    if (!envelope) {
      throw problem('Cloudflare Workers AI response was not valid JSON.',
        'CLOUDFLARE_INVALID_JSON', 502);
    }
    if (envelope.success === false) {
      const detail = envelope.errors && envelope.errors[0] && envelope.errors[0].message;
      throw problem(detail || 'Cloudflare Workers AI request failed.',
        'CLOUDFLARE_REQUEST_FAILED', 502);
    }

    const generated = extractGenerated(envelope);
    if (generated === undefined || generated === null) {
      throw problem('Cloudflare Workers AI response had no text result.',
        'CLOUDFLARE_EMPTY_RESULT', 502);
    }
    return generated;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw problem('Cloudflare Workers AI request timed out.', 'CLOUDFLARE_TIMEOUT', 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the provider chain and returns raw model text.
 * @param {string} systemPrompt curriculum/persona instructions
 * @param {string} userPrompt the concrete authoring request
 * @param {object} options { allowFallback?: boolean, jsonOnly?: boolean }
 */
async function generateAIResponse(systemPrompt, userPrompt, options) {
  const current = settings();
  const callOptions = options || {};
  /* Strict calls no longer skip real providers; they only skip the final
     deterministic null fallback. */
  const safeFallback = callOptions.allowFallback !== false && !config.isProduction;
  const jsonOnly = callOptions.jsonOnly !== false;
  const systemContent = String(systemPrompt || '') + (jsonOnly
    ? '\n\n' + JSON_ONLY_INSTRUCTION
    : '');
  const userContent = String(userPrompt || '');
  const image = callOptions.image || null;
  const live = alternates.enabled();

  if ((!current.accountId || !current.apiToken) && !live) {
    if (!safeFallback) {
      throw problem('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.',
        'CLOUDFLARE_NOT_CONFIGURED', 503);
    }
    warnMissing();
    return null;
  }

  const attempts = [];
  if (live) {
    /* Single authoritative order: freelm -> Gemini -> Groq -> Cloudflare.
       Groq and the freelm string-message stage cannot carry images. */
    if (callOptions.skipFreelm !== true && !image && freelmStage.configured()) {
      attempts.push({
        name: 'freelm',
        run: function () {
          return freelmStage.callFreelm({
            system: systemContent,
            user: userContent,
            maxOutputTokens: callOptions.maxOutputTokens || 600
          });
        }
      });
    }
    if (alternates.geminiConfigured()) {
      attempts.push({
        name: 'Gemini',
        run: function () {
          return alternates.callGemini({
            system: systemContent,
            user: userContent,
            image: image,
            maxOutputTokens: callOptions.maxOutputTokens || 2048
          });
        }
      });
    }
    if (!image && alternates.groqConfigured()) {
      attempts.push({
        name: 'Groq',
        run: function () {
          return alternates.callGroq({
            system: systemContent,
            user: userContent,
            maxOutputTokens: callOptions.maxOutputTokens || 2048
          });
        }
      });
    }
  }
  attempts.push({
    name: 'Cloudflare',
    run: function () { return callCloudflare(current, systemContent, userContent); }
  });

  let lastError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      const generated = await attempt.run();
      return normalizeGenerated(generated, jsonOnly);
    } catch (error) {
      lastError = error;
      if (attempt.name !== 'Cloudflare') {
        console.error('[ai] ' + attempt.name + ' failed:', error.message);
      }
    }
  }

  if (safeFallback) {
    console.error('[ai] All AI providers failed; using deterministic fallback.');
    return null;
  }
  throw lastError || problem('No AI provider returned text.', 'AI_EMPTY_RESULT', 502);
}

module.exports = {
  generateAIResponse: generateAIResponse,
  safeParseJSON: safeParseJSON,
  isConfigured: isConfigured,
  settings: settings,
  endpoint: endpoint,
  DEFAULT_MODEL: DEFAULT_MODEL,
  JSON_ONLY_INSTRUCTION: JSON_ONLY_INSTRUCTION
};
