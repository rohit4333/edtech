/* Per-user salted password hashing. Legacy SHA-256 hashes are accepted once,
   then rehashed on successful login so demo data upgrades itself safely. */
const crypto = require('crypto');

const KEY_LENGTH = 64;

function legacyHash(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password || ''), salt, KEY_LENGTH).toString('hex');
  return { salt, hash: derived };
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, user) {
  if (!user) return { ok: false, rehash: false };
  const value = String(password || '');
  if (user.passwordSalt && user.passwordHash) {
    const derived = crypto.scryptSync(value, user.passwordSalt, KEY_LENGTH).toString('hex');
    return { ok: safeEqual(derived, user.passwordHash), rehash: false };
  }
  const ok = safeEqual(legacyHash(value), String(user.passwordHash || ''));
  return { ok: ok, rehash: ok };
}

module.exports = { hashPassword, verifyPassword, legacyHash };
