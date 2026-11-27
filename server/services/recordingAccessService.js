/* Private recording access.
 *
 * LiveKit Egress writes finished MP4 files to a private S3-compatible bucket
 * (normally Cloudflare R2). No permanent object URL is stored or returned.
 * The Express route owns authorization; this service only exchanges an
 * authorized session/object pair for a short-lived SigV4 presigned GET URL.
 */

const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_TTL_SECONDS = 600;
const MAX_TTL_SECONDS = 3600;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

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

function storageConfig() {
  const bucket = envValue('LIVEKIT_EGRESS_BUCKET');
  const accessKey = envValue('LIVEKIT_EGRESS_ACCESS_KEY');
  const secretKey = envValue('LIVEKIT_EGRESS_SECRET_KEY');
  const region = envValue('LIVEKIT_EGRESS_REGION');
  if (!bucket || !accessKey || !secretKey || !region) return null;
  return {
    bucket: bucket,
    accessKey: accessKey,
    secretKey: secretKey,
    region: region,
    endpoint: envValue('LIVEKIT_EGRESS_ENDPOINT'),
    sessionToken: envValue('LIVEKIT_EGRESS_SESSION_TOKEN'),
    forcePathStyle: /^(1|true|yes)$/i.test(envValue('LIVEKIT_EGRESS_FORCE_PATH_STYLE'))
  };
}

function configured() {
  return Boolean(storageConfig());
}

/* S3 SigV4 requires RFC 3986 encoding, which is stricter than encodeURIComponent. */
function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, function (char) {
    return '%' + char.charCodeAt(0).toString(16).toUpperCase();
  });
}

function sha256(value) {
  return require('crypto').createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return require('crypto').createHmac('sha256', key).update(value).digest();
}

function targetFor(storage, key) {
  let base;
  try {
    base = new URL(storage.endpoint || ('https://s3.' + storage.region + '.amazonaws.com'));
  } catch (error) {
    throw failure('RECORDING_ACCESS_NOT_CONFIGURED',
      'The recording storage endpoint is invalid.', 503, error);
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw failure('RECORDING_ACCESS_NOT_CONFIGURED',
      'The recording storage endpoint must be HTTPS or HTTP.', 503);
  }
  const prefix = base.pathname.replace(/\/+$/, '');
  const encodedKey = key.split('/').map(encodeRfc3986).join('/');
  const host = storage.forcePathStyle
    ? base.host
    : storage.bucket + '.' + base.hostname + (base.port ? ':' + base.port : '');
  const path = prefix + (storage.forcePathStyle ? '/' + encodeRfc3986(storage.bucket) : '') +
    '/' + encodedKey;
  return { protocol: base.protocol, host: host, path: path };
}

function presignGet(storage, key, ttl) {
  const target = targetFor(storage, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = dateStamp + '/' + storage.region + '/s3/aws4_request';
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': storage.accessKey + '/' + scope,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(ttl),
    'X-Amz-SignedHeaders': 'host'
  };
  if (storage.sessionToken) params['X-Amz-Security-Token'] = storage.sessionToken;

  const canonicalQuery = Object.keys(params).sort().map(function (name) {
    return encodeRfc3986(name) + '=' + encodeRfc3986(params[name]);
  }).join('&');
  const canonicalRequest = [
    'GET', target.path, canonicalQuery,
    'host:' + target.host.toLowerCase(), '', 'host', 'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)
  ].join('\n');

  const dateKey = hmac('AWS4' + storage.secretKey, dateStamp);
  const regionKey = hmac(dateKey, storage.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = require('crypto').createHmac('sha256', signingKey)
    .update(stringToSign).digest('hex');

  return {
    url: target.protocol + '//' + target.host + target.path + '?' +
      canonicalQuery + '&X-Amz-Signature=' + signature,
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    expiresInSeconds: ttl
  };
}

async function signedUrl(sessionId, objectKey, requestedTtl) {
  const key = validate(sessionId, objectKey);
  const storage = storageConfig();
  if (!storage) {
    throw failure('RECORDING_ACCESS_NOT_CONFIGURED',
      'Private recording links are not configured.', 503);
  }
  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(60,
    Number(requestedTtl) || DEFAULT_TTL_SECONDS));
  return presignGet(storage, key, ttl);
}

module.exports = {
  configured,
  signedUrl
};
