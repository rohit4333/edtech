/* Small HMAC token helper. The demo fallback is only available outside
   production; live deployments must set a strong AUTH_SECRET. */
const crypto = require('crypto');
const config = require('../config');

const ttlSeconds = Number(process.env.AUTH_TTL_SECONDS || 12 * 60 * 60);

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

function sign(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    role: user.role,
    name: user.name,
    iat: now,
    exp: now + ttlSeconds
  }));
  const input = header + '.' + payload;
  const signature = base64url(crypto.createHmac('sha256', secret()).update(input).digest());
  return input + '.' + signature;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
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
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = { sign, verify };
