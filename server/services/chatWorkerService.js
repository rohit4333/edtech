/* Bridge to the Mathify AI chat Worker.
 *
 * Production uses the deployed Worker when CHAT_WORKER_URL is set. Local and
 * CI runs use the same worker-core.mjs logic through the existing Workers AI
 * REST credential, so the browser flow stays smooth without a deploy. The
 * browser never sees the Worker URL token or any Cloudflare/Supabase secret.
 *
 * Live local runner order: Gemini -> Groq -> Cloudflare Workers AI. Groq is
 * text-only; Gemini may also answer study-buddy image questions. Mock test
 * mode keeps the original Workers-AI-only runner and deterministic behavior.
 */

const config = require('../config');
const alternates = require('./aiProviders');

let corePromise = null;
function core() {
  if (!corePromise) corePromise = import('../../worker-core.mjs');
  return corePromise;
}

function models(machine) {
  return {
    /* Chat text is pinned by the product contract; only vision may fall back. */
    text: machine.TEXT_MODEL,
    vision: String(process.env.CLOUDFLARE_VISION_MODEL || machine.VISION_MODEL).trim() || machine.VISION_MODEL,
    visionFallback: String(process.env.CLOUDFLARE_VISION_FALLBACK_MODEL || machine.VISION_FALLBACK_MODEL).trim() ||
      machine.VISION_FALLBACK_MODEL
  };
}

async function callWorker(path, payload, token) {
  const base = String(process.env.CHAT_WORKER_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;

  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  if (!response.ok) {
    const error = new Error((data && data.message) || 'The chat Worker rejected the request.');
    error.code = (data && data.error) || 'CHAT_WORKER_FAILED';
    error.status = response.status;
    throw error;
  }
  return data;
}

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function cloudflareRunner(machine) {
  return async function run(input) {
    const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
    if (!accountId || !apiToken) {
      throw problem('Cloudflare Workers AI is not configured.', 'AI_NOT_CONFIGURED', 503);
    }

    const providerInput = machine.toProviderInput(
      input,
      input.image ? Buffer.from(input.image.data, 'base64') : null
    );
    /* Workers AI model slugs (e.g. @cf/meta/llama-3.1-8b-instruct) must stay
       literal in the path. encodeURIComponent breaks the route with 400. */
    const modelPath = String(input.model || '').replace(/^\/+/, '');
    const response = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) +
        '/ai/run/' + modelPath,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerInput)
      }
    );
    const text = await response.text();
    if (!response.ok) {
      throw problem('Workers AI returned HTTP ' + response.status + '. ' + text.slice(0, 240),
        'AI_REQUEST_FAILED', 502);
    }
    const envelope = machine.safeParseJSON(text) || {};
    if (envelope.success === false) {
      const detail = envelope.errors && envelope.errors[0] && envelope.errors[0].message;
      throw problem(detail || 'Workers AI request failed.', 'AI_REQUEST_FAILED', 502);
    }
    const generated = machine.extractGenerated(envelope);
    if (generated === undefined) {
      throw problem('Workers AI returned no text result.', 'AI_EMPTY_RESULT', 502);
    }
    return generated;
  };
}

function alternateParts(input) {
  if (!input || input.mode === 'vision') {
    return { system: '', user: String((input && input.prompt) || ''), image: input && input.image };
  }
  const parts = alternates.messagesToParts(input && input.messages);
  return { system: parts.system, user: parts.user, image: null };
}

function localRunner(machine) {
  const cloudflare = cloudflareRunner(machine);
  return async function run(input) {
    if (!alternates.enabled()) return cloudflare(input);

    const parts = alternateParts(input);
    const attempts = [];
    attempts.push({
      name: 'Gemini',
      run: function () {
        return alternates.callGemini({
          system: parts.system,
          user: parts.user,
          image: parts.image,
          maxOutputTokens: 320
        });
      }
    });
    if (!parts.image) {
      attempts.push({
        name: 'Groq',
        run: function () {
          return alternates.callGroq({
            system: parts.system,
            user: parts.user,
            maxOutputTokens: 320
          });
        }
      });
    }
    attempts.push({ name: 'Cloudflare', run: function () { return cloudflare(input); } });

    let lastError = null;
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const generated = await attempt.run();
        if (index < attempts.length - 1) {
          console.error('[chat] ' + attempt.name + ' answered this request.');
        }
        return generated;
      } catch (error) {
        lastError = error;
        console.error('[chat] ' + attempt.name + ' failed:', error.message);
      }
    }
    throw lastError || problem('No AI provider answered the chat request.', 'AI_ERROR', 502);
  };
}

/** @param {'trainer-support'|'student-doubt'} kind */
async function ask(kind, payload, token) {
  const path = kind === 'trainer-support' ? '/trainer-support' : '/student-doubt';
  const deployed = await callWorker(path, payload, token);
  if (deployed) {
    return {
      reply: deployed.reply || '',
      source: deployed.source || 'fallback',
      reason: deployed.reason || null,
      model: deployed.model || null,
      imageUsed: Boolean(deployed.imageUsed)
    };
  }

  const machine = await core();
  return machine.answer(kind, payload, {
    run: localRunner(machine),
    models: models(machine)
  });
}

module.exports = { ask: ask };
