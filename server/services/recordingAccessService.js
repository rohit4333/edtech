/* Private recording access. No permanent public URL is ever stored or sent.
 * The Express route owns authorization; this service only exchanges an
 * authorized session/object pair for a short-lived Supabase Storage link. */

const config = require('../config');

const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 3600;

function failure(code, message, status, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function validate(sessionId, objectKey) {
  const id = String(sessionId || '').trim();
  const key = String(objectKey || '').trim();
  if (!SESSION_PATTERN.test(id)) {
    throw failure('INVALID_SESSION_ID', 'A valid session id is required.', 400);
  }
  if (!key || key.charAt(0) === '/' || key.split('/').some(function (part) {
    return !part || part === '.' || part === '..';
  }) || key.split('/')[0] !== id) {
    throw failure('FORBIDDEN', 'That recording does not belong to this session.', 403);
  }
  return key;
}

function configured() {
  return Boolean(config.supabase.url && config.supabase.secretKey);
}

async function signedUrl(sessionId, objectKey, requestedTtl) {
  const key = validate(sessionId, objectKey);
  if (!configured()) {
    throw failure('RECORDING_ACCESS_NOT_CONFIGURED',
      'Private recording links are not configured.', 503);
  }

  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(60,
    Number(requestedTtl) || DEFAULT_TTL_SECONDS));
  const bucket = String(process.env.LIVEKIT_EGRESS_BUCKET || 'recordings').trim() || 'recordings';
  const base = config.supabase.url.replace(/\/+$/, '');
  const encodedKey = key.split('/').map(function (part) { return encodeURIComponent(part); }).join('/');
  const endpoint = base + '/storage/v1/object/sign/' + encodeURIComponent(bucket) + '/' + encodedKey;

  let response;
  let text = '';
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.supabase.secretKey,
        apikey: config.supabase.secretKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expiresIn: ttl })
    });
    text = await response.text();
  } catch (error) {
    throw failure('RECORDING_ACCESS_FAILED', 'A private link could not be created.', 502, error);
  }

  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (error) { body = null; }
  if (!response.ok || !body) {
    throw failure('RECORDING_ACCESS_FAILED', 'A private link could not be created.', 502);
  }
  const signed = String(body.signedURL || body.signedUrl || '');
  if (!signed) {
    throw failure('RECORDING_ACCESS_FAILED', 'A private link could not be created.', 502);
  }
  const url = /^https?:\/\//i.test(signed) ? signed : base + (signed.charAt(0) === '/' ? '' : '/') + signed;
  return {
    url: url,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    expiresInSeconds: ttl
  };
}

module.exports = {
  configured,
  signedUrl
};
