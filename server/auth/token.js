/* Small HMAC token helper. The demo fallback is only available outside
   production; live deployments must set a strong AUTH_SECRET.
 *
   A signed access token is short-lived by default, but the desks remember a
   sign-in through a long-lived refresh token kept in browser localStorage.
   Refresh tokens carry the same tokenVersion as the user record, so an
   operator's credential replacement invalidates every outstanding session. */
const crypto = require('crypto');
const config = require('../config');

const ttlSeconds = Number(process.env.AUTH_TTL_SECONDS || 12 * 60 * 60);
const rememberTtlSeconds = Math.max(
  ttlSeconds,
  Number(process.env.AUTH_REMEMBER_TTL_SECONDS || 30 * 24 * 60 * 60)
);

const DEMO_SECRET = 'mathify-dev-secret-change-me';

function secret() {
  const value = String(process.env.AUTH_SECRET || '').trim();
  if (value.length >= 32) return value;
  if (config.isProduction) {
    throw new Error('AUTH_SECRET must be set to at least 32 characters in production.');
  }
  return value || DEMO_SECRET;
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function issue(user, kind, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    role: user.role,
    name: user.name,
    kind: kind,
    ver: Number(user.tokenVersion || 0),
    iat: now,
    exp: now + ttl
  }));
  const input = header + '.' + payload;
  const signature = base64url(crypto.createHmac('sha256', secret()).update(input).digest());
  return input + '.' + signature;
}

/* Access tokens stay short-lived; the separate refresh token is what lets a
   browser reload, a new tab or a closed laptop silently return to the desk. */
function sign(user, options) {
  const requested = options && Number(options.ttl);
  return issue(user, 'access', requested > 0 ? requested : ttlSeconds);
}

function signRefresh(user) {
  return issue(user, 'refresh', rememberTtlSeconds);
}

function verify(tokenValue, kind) {
  if (typeof tokenValue !== 'string') return null;
  const parts = tokenValue.split('.');
  if (parts.length !== 3) return null;

  let key;
  try { key = secret(); } catch (error) { return null; }

  const input = parts[0] + '.' + parts[1];
  const expected = base64url(crypto.createHmac('sha256', key).update(input).digest());
  if (!safeEqual(parts[2], expected)) return null;

  try {
    const payload = JSON.parse(fromBase64url(parts[1]));
    if (!payload.sub || !payload.role) return null;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    /* Tokens minted before the remember-me change have no kind and count as
       access tokens; refresh tokens are always explicit. */
    const expectedKind = kind || 'access';
    if (payload.kind && payload.kind !== expectedKind) return null;
    if (expectedKind === 'refresh' && payload.kind !== 'refresh') return null;
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = { sign, signRefresh, verify, ttlSeconds, rememberTtlSeconds, secret: secret };
