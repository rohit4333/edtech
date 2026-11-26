/* Mathify AI chat Worker.
 *
 * Routes:
 *   POST /trainer-support  trainer/founder — payout, leave and attendance desk
 *   POST /student-doubt    student/founder — text or maths-image study buddy
 *   GET  /health           non-secret model configuration
 *
 * The worker verifies the same HMAC token the Express API issues, applies
 * CORS and per-caller rate limits, calls Cloudflare Workers AI only, and writes
 * founder-auditable logs to Supabase through the service-role key. Images are
 * decoded in memory for the model and are never logged or echoed back.
 */

import {
  answer,
  extractGenerated,
  safeParseJSON,
  toProviderInput,
  TEXT_MODEL,
  VISION_MODEL,
  VISION_FALLBACK_MODEL
} from './worker-core.mjs';

const DEMO_SECRET = 'mathify-dev-secret-change-me';
const DEFAULT_ORIGINS = ['http://localhost:4000', 'http://127.0.0.1:4000'];
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};

const rateBuckets = new Map();

function jsonResponse(body, status, request, env) {
  const headers = Object.assign({}, SECURITY_HEADERS, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  });
  const origin = allowedOrigin(request.headers.get('Origin'), env);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status: status || 200, headers: headers });
}

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const configured = String((env && env.ALLOWED_ORIGINS) || '')
    .split(',')
    .map(function (value) { return value.trim(); })
    .filter(Boolean);
  const list = configured.length ? configured : DEFAULT_ORIGINS;
  if (list.includes('*')) return '*';
  return list.includes(origin) ? origin : null;
}

function preflight(request, env) {
  const headers = Object.assign({}, SECURITY_HEADERS, {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  });
  const origin = allowedOrigin(request.headers.get('Origin'), env);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(null, { status: 204, headers: headers });
}

function base64urlToBytes(value) {
  let input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function verifyToken(token, env) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let secret = String((env && env.AUTH_SECRET) || '').trim();
  if (!secret && (env && env.ALLOW_DEMO_AUTH) === 'true') secret = DEMO_SECRET;
  if (!secret) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1])
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(parts[1])));
    if (!payload.sub || !payload.role) return null;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function rateAllowed(request, claims, env) {
  const limit = Math.max(1, Number(env.RATE_LIMIT_PER_MIN || 20));
  const minute = Math.floor(Date.now() / 60000);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const key = minute + ':' + ip + ':' + claims.sub;
  const current = rateBuckets.get(key) || { count: 0 };
  if (current.count >= limit) return false;
  current.count += 1;
  rateBuckets.set(key, current);
  if (rateBuckets.size > 2000) {
    for (const bucketKey of rateBuckets.keys()) {
      if (!bucketKey.startsWith(minute + ':')) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

function models(env) {
  return {
    /* The text model is a product contract, not a tunable setting. */
    text: TEXT_MODEL,
    vision: String(env.VISION_MODEL || VISION_MODEL).trim() || VISION_MODEL,
    visionFallback: String(env.VISION_FALLBACK_MODEL || VISION_FALLBACK_MODEL).trim() || VISION_FALLBACK_MODEL
  };
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function runModel(input, env) {
  const providerInput = toProviderInput(input, input.image ? base64ToBytes(input.image.data) : null);

  if (env.AI && typeof env.AI.run === 'function') {
    return extractGenerated(await env.AI.run(input.model, providerInput));
  }

  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    const error = new Error('Cloudflare Workers AI is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  /* Workers AI slugs such as @cf/meta/llama-3.1-8b-instruct must stay literal;
     encodeURIComponent produces "No route for that URI" (HTTP 400). */
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
    const error = new Error('Cloudflare Workers AI returned HTTP ' + response.status + '.');
    error.code = 'AI_REQUEST_FAILED';
    error.status = 502;
    error.detail = text.slice(0, 300);
    throw error;
  }
  const envelope = safeParseJSON(text);
  if (!envelope || envelope.success === false) {
    const detail = envelope && envelope.errors && envelope.errors[0] && envelope.errors[0].message;
    const error = new Error(detail || 'Cloudflare Workers AI request failed.');
    error.code = 'AI_REQUEST_FAILED';
    error.status = 502;
    throw error;
  }
  const generated = extractGenerated(envelope);
  if (generated === undefined) {
    const error = new Error('Cloudflare Workers AI returned no text result.');
    error.code = 'AI_EMPTY_RESULT';
    error.status = 502;
    throw error;
  }
  return generated;
}

async function writeAudit(env, row) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) return;
  const table = row.kind === 'trainer-support' ? 'trainer_support_logs' : 'student_doubt_logs';
  const payload = {
    id: crypto.randomUUID(),
    actor_id: row.actorId,
    role: row.role,
    question: row.question,
    reply: row.reply,
    source: row.source,
    reason: row.reason,
    model: row.model,
    image_used: row.imageUsed,
    image_type: row.imageType,
    created_at: row.createdAt
  };
  await fetch(url.replace(/\/+$/, '') + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
}

function errorResponse(error, request, env) {
  const status = error && error.status ? error.status : 502;
  const code = (error && error.code) || 'CHAT_REQUEST_FAILED';
  const safeMessage = code === 'ROLE_NOT_ALLOWED'
    ? 'This chat is not available for your role.'
    : code === 'EMPTY_QUESTION'
      ? 'Type a short question first.'
      : 'The chat service could not complete the request.';
  return jsonResponse({ error: code, message: safeMessage }, status, request, env);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && path === '/health') {
      return jsonResponse({
        ok: true,
        service: 'mathify-chat-worker',
        models: models(env),
        supabaseAudit: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
      }, 200, request, env);
    }

    const kind = path === '/trainer-support' ? 'trainer-support'
      : path === '/student-doubt' ? 'student-doubt' : null;
    if (!kind) {
      return jsonResponse({ error: 'NOT_FOUND', message: 'No such endpoint.' }, 404, request, env);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405, request, env);
    }

    const token = bearer(request);
    if (!token) {
      return jsonResponse({ error: 'UNAUTHORIZED', message: 'Sign in first.' }, 401, request, env);
    }
    const claims = await verifyToken(token, env);
    if (!claims) {
      return jsonResponse({ error: 'UNAUTHORIZED', message: 'Your session is invalid or expired.' }, 401, request, env);
    }
    if (!rateAllowed(request, claims, env)) {
      return jsonResponse({ error: 'RATE_LIMITED', message: 'Too many messages. Try again shortly.' }, 429, request, env);
    }

    let payload;
    try {
      const text = await request.text();
      if (text.length > 2 * 1024 * 1024) {
        return jsonResponse({ error: 'PAYLOAD_TOO_LARGE', message: 'That message is too large.' }, 413, request, env);
      }
      payload = safeParseJSON(text);
      if (!payload || typeof payload !== 'object') {
        return jsonResponse({ error: 'INVALID_JSON', message: 'Send a JSON object.' }, 400, request, env);
      }
    } catch (error) {
      return jsonResponse({ error: 'INVALID_JSON', message: 'Send a JSON object.' }, 400, request, env);
    }

    const result = await answer(kind, {
      role: claims.role,
      actorId: String(claims.sub).slice(0, 128),
      question: payload.question,
      image: payload.image
    }, {
      run: function (input) { return runModel(input, env); },
      models: models(env)
    }).catch(function (error) { throw error; });

    const auditRow = Object.assign({}, result, { actorId: String(claims.sub).slice(0, 128) });
    const audit = writeAudit(env, auditRow).catch(function () { /* audit must not break a reply */ });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(audit);

    return jsonResponse({
      reply: result.reply,
      source: result.source,
      reason: result.reason,
      model: result.model,
      imageUsed: result.imageUsed
    }, 200, request, env);
  }
};
