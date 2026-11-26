/* Alternate AI providers for the Mathify server.
 *
 * The provider order is Gemini -> Groq -> Cloudflare Workers AI. Workers AI
 * remains the canonical pinned model path; the alternates are only reached
 * through the central call boundary. Mock/local test mode never calls these
 * paid endpoints: it keeps the existing deterministic behavior.
 *
 * Secrets are read at call time and never logged or serialized to a browser.
 */

const config = require('../config');

const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
const DEFAULT_TIMEOUT_MS = 20000;

function enabled() {
  const mode = String(config.databaseMode || '').toLowerCase();
  return mode === 'supabase' || config.isProduction === true;
}

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 502;
  return error;
}

function timeoutMs(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return value > 0 ? value : fallback;
}

function geminiSettings() {
  return {
    apiKey: String(process.env.GEMINI_API_KEY || '').trim(),
    model: String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL,
    timeoutMs: timeoutMs('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  };
}

function groqSettings() {
  return {
    apiKey: String(process.env.GROQ_API_KEY || '').trim(),
    model: String(process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL,
    timeoutMs: timeoutMs('GROQ_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  };
}

function geminiConfigured() {
  return Boolean(geminiSettings().apiKey);
}

function groqConfigured() {
  return Boolean(groqSettings().apiKey);
}

function fetchWithTimeout(url, options, ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, ms);
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .finally(function () { clearTimeout(timer); })
    .catch(function (error) {
      if (error && error.name === 'AbortError') {
        throw problem(label + ' request timed out.', label.toUpperCase() + '_TIMEOUT', 504);
      }
      throw error;
    });
}

function responseText(response, label) {
  return response.text().then(function (text) {
    if (!response.ok) {
      throw problem(label + ' returned HTTP ' + response.status + '.',
        label.toUpperCase() + '_REQUEST_FAILED', response.status || 502);
    }
    return text;
  });
}

function parseBody(text, label) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (error) { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    throw problem(label + ' response was not valid JSON.', label.toUpperCase() + '_INVALID_JSON', 502);
  }
  const issue = parsed.error || (parsed.errors && parsed.errors[0]);
  if (issue) {
    const detail = String(issue.message || issue.code || label + ' request failed.');
    throw problem(detail, label.toUpperCase() + '_REQUEST_FAILED', 502);
  }
  return parsed;
}

/* Gemini 3.x uses the Interactions API, not the older generateContent route. */
async function callGemini(request) {
  const current = geminiSettings();
  if (!current.apiKey) throw problem('GEMINI_API_KEY is required.', 'GEMINI_NOT_CONFIGURED', 503);

  const input = request || {};
  const content = [{ type: 'text', text: String(input.user || '') }];
  if (input.image && input.image.data) {
    content.push({
      type: 'image',
      data: String(input.image.data),
      mime_type: String(input.image.mime || input.image.mimeType || 'image/png')
    });
  }

  const body = {
    model: current.model,
    input: content,
    generation_config: { max_output_tokens: Number(input.maxOutputTokens) || 2048 }
  };
  if (input.system) body.system_instruction = String(input.system);

  const response = await fetchWithTimeout(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': current.apiKey },
      body: JSON.stringify(body)
    },
    current.timeoutMs,
    'Gemini'
  );
  const parsed = parseBody(await responseText(response, 'Gemini'), 'Gemini');
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const output = steps.map(function (step) {
    return ((step && step.content) || []).map(function (part) {
      return part && typeof part.text === 'string' ? part.text : '';
    }).join('');
  }).join('').trim();
  if (!output) throw problem('Gemini returned no text result.', 'GEMINI_EMPTY_RESULT', 502);
  return output;
}

/* Groq exposes an OpenAI-compatible chat-completions route. */
async function callGroq(request) {
  const current = groqSettings();
  if (!current.apiKey) throw problem('GROQ_API_KEY is required.', 'GROQ_NOT_CONFIGURED', 503);

  const input = request || {};
  if (input.image && input.image.data) {
    throw problem('Groq does not accept images.', 'GROQ_IMAGE_UNSUPPORTED', 400);
  }
  const messages = [];
  if (input.system) messages.push({ role: 'system', content: String(input.system) });
  messages.push({ role: 'user', content: String(input.user || '') });

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + current.apiKey },
    body: JSON.stringify({
      model: current.model,
      messages: messages,
      temperature: 0.2,
      max_tokens: Number(input.maxOutputTokens) || 2048
    })
  }, current.timeoutMs, 'Groq');
  const parsed = parseBody(await responseText(response, 'Groq'), 'Groq');
  const choice = parsed.choices && parsed.choices[0];
  const output = choice && choice.message && choice.message.content;
  if (typeof output !== 'string' || !output.trim()) {
    throw problem('Groq returned no text result.', 'GROQ_EMPTY_RESULT', 502);
  }
  return output;
}

/* Chat Worker core supplies neutral messages; translate them for text providers. */
function messagesToParts(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const systemParts = list.filter(function (message) {
    return message && message.role === 'system';
  }).map(function (message) { return String(message.content || ''); });
  const userParts = list.filter(function (message) {
    return message && message.role === 'user';
  }).map(function (message) {
    const value = message && message.content;
    return typeof value === 'string' ? value : JSON.stringify(value || '');
  });
  return {
    system: systemParts.join('\n'),
    user: userParts.join('\n')
  };
}

module.exports = {
  enabled: enabled,
  geminiConfigured: geminiConfigured,
  groqConfigured: groqConfigured,
  geminiSettings: geminiSettings,
  groqSettings: groqSettings,
  callGemini: callGemini,
  callGroq: callGroq,
  messagesToParts: messagesToParts,
  DEFAULT_GEMINI_MODEL: DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL: DEFAULT_GROQ_MODEL
};
