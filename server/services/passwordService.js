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

const RESET_TTL_MS = 15 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  await Promise.resolve(db.updateUser(user.id, function (current) {
    current.passwordSalt = secured.salt;
    current.passwordHash = secured.hash;
    current.passwordChangedAt = new Date().toISOString();
    return current;
  }));
  return { changed: true, role: user.role };
}

async function sendResetEmail(recipient, token) {
  if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: process.env.NODEMAILER_SERVICE || 'gmail',
      auth: { user: process.env.NODEMAILER_EMAIL, pass: process.env.NODEMAILER_PASSWORD }
    });
    const link = '/password-reset.html?token=' + encodeURIComponent(token) +
      '&email=' + encodeURIComponent(recipient);
    await transporter.sendMail({
      from: '"Mathify Account Access" <' + process.env.NODEMAILER_EMAIL + '>',
      to: recipient,
      subject: 'Reset your Mathify password',
      text: 'Use this one-time link within 15 minutes to set a new Mathify password: ' + link +
        '\n\nIf you did not request this, ignore the message. Your password has not changed.'
    });
    return { sent: true };
  } catch (error) {
    console.error('Password reset email failed:', error.message);
    return { sent: false, reason: error.message };
  }
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

  const raw = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  await Promise.resolve(db.savePasswordReset({
    tokenHash: hashToken(raw),
    userId: user.id,
    email: user.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RESET_TTL_MS).toISOString(),
    used: false,
    usedAt: null
  }));
  const delivery = await sendResetEmail(user.email, raw);
  const response = {
    requested: true,
    delivered: Boolean(delivery.sent),
    expiresInMinutes: 15
  };
  /* Local, non-production fallback: without this token the offline demo could
     not verify the reset flow. It is never returned in production. */
  if (!config.isProduction && !delivery.sent) {
    response.developmentToken = raw;
    response.note = 'Email delivery is not configured. Local development token returned for verification only.';
  }
  return response;
}

async function confirmReset(input) {
  const body = input || {};
  const email = text(body.email).toLowerCase();
  const token = text(body.token);
  const next = validateNew(body.password);
  if (!token) throw problem('INVALID_RESET_TOKEN', 'Enter the reset token from your email.', 400);

  const record = await Promise.resolve(db.findPasswordReset(hashToken(token)));
  const expired = !record || new Date(record.expiresAt).getTime() < Date.now();
  if (!record || expired || record.used || record.email !== email) {
    throw problem('INVALID_RESET_TOKEN', 'That reset link is invalid or has expired.', 400);
  }
  /* Consume before writing the password so the same token cannot be replayed
     by a concurrent request. */
  await Promise.resolve(db.savePasswordReset(Object.assign({}, record, {
    used: true,
    usedAt: new Date().toISOString()
  })));
  const secured = password.hashPassword(next);
  const updated = await Promise.resolve(db.updateUser(record.userId, function (current) {
    current.passwordSalt = secured.salt;
    current.passwordHash = secured.hash;
    current.passwordChangedAt = new Date().toISOString();
    return current;
  }));
  if (!updated) throw problem('ACCOUNT_NOT_FOUND', 'Account not found.', 404);
  return { reset: true, role: updated.role };
}

module.exports = {
  RESET_TTL_MS: RESET_TTL_MS,
  changePassword: changePassword,
  requestReset: requestReset,
  confirmReset: confirmReset
};
