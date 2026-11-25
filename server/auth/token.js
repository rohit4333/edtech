/* Small HMAC token helper. Demo-safe; replace with a managed IdP when ready. */
const crypto = require('crypto');

const secret = process.env.AUTH_SECRET || 'mathify-dev-secret-change-me';
const ttlSeconds = Number(process.env.AUTH_TTL_SECONDS || 12 * 60 * 60);

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
  const signature = base64url(crypto.createHmac('sha256', secret).update(input).digest());
  return input + '.' + signature;
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const input = parts[0] + '.' + parts[1];
  const expected = base64url(crypto.createHmac('sha256', secret).update(input).digest());
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
