/* Mathify Cloudflare Workers AI client.
 *
 * DeepSeek stays the primary provider when configured. This client is the
 * automatic fallback for curriculum authoring and the scaffolded parallel
 * check while DEEPSEEK_API_KEY is empty. Credentials are read at call time so
 * tests and env rotations do not require a process restart.
 */

require('dotenv').config();

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const DEFAULT_TIMEOUT_MS = 15000;
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

/** Same tolerance as deepseekService.safeParseJSON, kept local to avoid a cycle. */
function parseModelJSON(raw) {
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

/** Workers AI exposes either result.response or an OpenAI-style choices array. */
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

/**
 * Calls Workers AI and returns the raw model text. The caller owns Zod
 * validation; this function only guarantees a provider-free string or null.
 */
async function generateAIResponse(systemPrompt, userPrompt, options) {
  const settingsForCall = settings();
  const allowFallback = !options || options.allowFallback !== false;

  if (!settingsForCall.accountId || !settingsForCall.apiToken) {
    if (!allowFallback) {
      throw problem('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.',
        'CLOUDFLARE_NOT_CONFIGURED', 503);
    }
    warnMissing();
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, settingsForCall.timeoutMs);

  try {
    const response = await fetch(endpoint(settingsForCall), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + settingsForCall.apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: String(systemPrompt || '') +
              '\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanations.'
          },
          { role: 'user', content: String(userPrompt || '') }
        ]
      }),
      signal: controller.signal
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw problem('Cloudflare Workers AI returned HTTP ' + response.status + '.',
        'CLOUDFLARE_REQUEST_FAILED', 502);
    }

    const envelope = parseModelJSON(bodyText);
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
    if (typeof generated === 'string') {
      const parsedGenerated = parseModelJSON(generated);
      return parsedGenerated === null ? generated : JSON.stringify(parsedGenerated);
    }
    if (generated !== null && generated !== undefined) return JSON.stringify(generated);

    throw problem('Cloudflare Workers AI response had no text result.',
      'CLOUDFLARE_EMPTY_RESULT', 502);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      if (!allowFallback) {
        throw problem('Cloudflare Workers AI request timed out.', 'CLOUDFLARE_TIMEOUT', 504);
      }
      console.error('[ai] Cloudflare Workers AI timeout; using deterministic fallback.');
      return null;
    }
    if (!allowFallback) throw error;
    console.error('[ai] Cloudflare Workers AI error:', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  generateAIResponse: generateAIResponse,
  isConfigured: isConfigured,
  settings: settings,
  endpoint: endpoint,
  DEFAULT_MODEL: DEFAULT_MODEL
};
