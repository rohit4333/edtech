/* ==========================================================================
   MATHIFY — account password control

   Three honest paths:
   1. A signed-in user changes their own password from the profile section by
      proving the current password.
   2. A user who forgot it regenerates it from their email address with a
      short-lived, single-use token. When email is not configured, a local
      development token is returned only outside production and is labelled as
      such; no live delivery is ever claimed.
   3. If neither works, the founder grants a new working password from the
      trainer/student administration desk (founderAdminService.setPassword).
   ========================================================================== */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const password = require('../auth/password');
const emailService = require('./emailService');
const notifications = require('./notificationService');
const sessionVersion = require('./sessionVersionService');
const tokenService = require('../auth/token');

const RESET_TTL_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resetAttempts = new Map();

function problem(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function validateNew(value) {
  const next = String(value === undefined || value === null ? '' : value);
  if (next.length < 8 || next.length > 200 || !next.trim()) {
    throw problem('INVALID_PASSWORD', 'New password must be 8–200 characters.', 422);
  }
  return next;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/* A six-digit code has little entropy, so its stored hash is keyed with the
   same server secret that signs sessions. A leaked record alone cannot reveal
   a usable code. */
function hashOtp(otp) {
  return crypto.createHmac('sha256', tokenService.secret()).update(String(otp)).digest('hex');
}

function tooManyAttempts(email) {
  const key = email || 'unknown';
  const now = Date.now();
  const entry = resetAttempts.get(key);
  if (!entry || now - entry.startedAt >= ATTEMPT_WINDOW_MS) {
    resetAttempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > ATTEMPT_LIMIT;
}

function clearAttempts(email) {
  resetAttempts.delete(email || 'unknown');
}

async function changePassword(userId, input) {
  const body = input || {};
  const user = await db.findUserById(String(userId || ''));
  if (!user) throw problem('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  const verified = password.verifyPassword(body.currentPassword, user);
  if (!verified.ok) {
    throw problem('INVALID_CURRENT_PASSWORD', 'Current password is wrong.', 401);
  }
  const next = validateNew(body.newPassword);
  const secured = password.hashPassword(next);
  const updated = await Promise.resolve(sessionVersion.bump(user.id, {
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    passwordChangedAt: new Date().toISOString()
  }));
  if (!updated) throw problem('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  const notification = await notifyChange(user.id);
  return { changed: true, role: user.role, notification: notification };
}

/* Every successful credential change is confirmed by mail. Demo child accounts
   share the parent email as a login alias, so the notice goes to that address. */
async function notifyChange(userId) {
  const linked = await sessionVersion.linkedAccountIds(userId);
  const user = linked.user || await db.findUserById(String(userId || ''));
  if (!user) return { sent: false, reason: 'no_account' };
  const aliases = Array.isArray(user.loginAliases) ? user.loginAliases : [];
  const recipient = text(user.email || aliases[0] ||
    (linked.request && linked.request.email)).toLowerCase();
  return notifications.sendPasswordChangedEmail({
    email: recipient,
    name: user.name,
    role: user.role
  });
}

async function sendResetEmail(recipient, token, otp) {
  if (!emailService.configured()) return { sent: false, reason: 'not_configured' };

  const origin = config.resetOrigin();
  const code = /^\d{6}$/.test(String(otp || '')) ? String(otp) : '';
  const lines = [
    '<div style="font-family:Poppins,Arial,sans-serif;color:#0E1420">',
    '<h2>Reset your Mathify password</h2>',
    '<p>Use the six-digit code below within 15 minutes. You can also use the one-time link if it is available.</p>'
  ];
  if (code) {
    lines.push('<p style="font-size:24px;letter-spacing:.18em;font-weight:700">' +
      emailService.escapeHtml(code) + '</p>');
  }
  if (origin) {
    const link = origin + '/password-reset.html?token=' +
      encodeURIComponent(token) + '&email=' + encodeURIComponent(recipient);
    const safe = emailService.escapeHtml(link);
    lines.push(
      '<p><a href="' + safe + '" style="display:inline-block;background:#FF5B2E;color:#0E1420;',
      'padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Reset password</a></p>',
      '<p style="font-size:12px;color:#555">If the button does not work, copy this link into your browser: ' +
        safe + '</p>'
    );
  }
  lines.push(
    '<p style="font-size:12px;color:#555">If you did not request this, ignore the message. ' +
      'Your password has not changed.</p>',
    '</div>'
  );

  const result = await emailService.sendMail({
    to: recipient,
    subject: 'Your Mathify password reset code',
    html: lines.join('')
  });
  return result.ok
    ? { sent: true, id: result.id }
    : { sent: false, reason: result.code };
}

/* The response is identical whether or not the email exists, so the endpoint
   cannot be used to enumerate accounts. */
async function requestReset(input) {
  const email = text(input && input.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) {
    throw problem('INVALID_EMAIL', 'Enter a valid email address.', 422);
  }
  const user = await db.findUserByEmail(email);
  if (!user || user.status !== 'active') {
    return { requested: true, delivered: false, expiresInMinutes: 15 };
  }
  /* A demo child account uses the parent email as a login alias rather than a
     stored contact field; reset delivery still goes to that one address. */
  const aliases = Array.isArray(user.loginAliases) ? user.loginAliases : [];
  const recipient = text(user.email || aliases[0]).toLowerCase();

  const raw = crypto.randomBytes(24).toString('base64url');
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  await Promise.resolve(db.savePasswordReset({
    tokenHash: hashToken(raw),
    otpHash: hashOtp(otp),
    userId: user.id,
    email: recipient,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RESET_TTL_MS).toISOString(),
    used: false,
    usedAt: null
  }));
  const delivery = await sendResetEmail(recipient, raw, otp);
  const response = {
    requested: true,
    delivered: Boolean(delivery.sent),
    otpSent: Boolean(delivery.sent),
    expiresInMinutes: 15
  };
  /* Local, non-production fallback: without mail the offline demo returns a
     clearly labelled token and OTP. Production never exposes either value. */
  if (!config.isProduction && !delivery.sent) {
    response.developmentToken = raw;
    response.developmentOtp = otp;
    response.note = 'Email delivery is not configured. Local development values returned for verification only.';
  }
  return response;
}

async function confirmReset(input) {
  const body = input || {};
  const email = text(body.email).toLowerCase();
  const token = text(body.token);
  const otp = text(body.otp);
  const next = validateNew(body.password);
  if (!token && !otp) {
    throw problem('INVALID_RESET_TOKEN', 'Enter the six-digit code or reset link from your email.', 400);
  }
  if (tooManyAttempts(email)) {
    throw problem('RESET_ATTEMPT_LIMIT',
      'Too many reset attempts. Wait a few minutes and request a new code.', 429);
  }

  /* A numeric code is an OTP; everything else remains the signed link token. */
  const record = /^\d{6}$/.test(otp)
    ? await Promise.resolve(db.findPasswordResetByOtpHash(hashOtp(otp)))
    : await Promise.resolve(db.findPasswordReset(hashToken(token)));
  const expired = !record || new Date(record.expiresAt).getTime() < Date.now();
  if (!record || expired || record.used || record.email !== email) {
    throw problem('INVALID_RESET_TOKEN', 'That reset code is invalid or has expired.', 400);
  }
  /* Consume before writing the password so the same code cannot be replayed
     by a concurrent request. */
  await Promise.resolve(db.savePasswordReset(Object.assign({}, record, {
    used: true,
    usedAt: new Date().toISOString()
  })));
  const secured = password.hashPassword(next);
  const updated = await Promise.resolve(sessionVersion.bump(record.userId, {
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    passwordChangedAt: new Date().toISOString()
  }));
  if (!updated) throw problem('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  clearAttempts(email);
  const notification = await notifyChange(record.userId);
  return { reset: true, role: updated.user.role, notification: notification };
}

module.exports = {
  RESET_TTL_MS: RESET_TTL_MS,
  changePassword: changePassword,
  requestReset: requestReset,
  confirmReset: confirmReset
};
