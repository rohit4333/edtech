const express = require('express');
const db = require('../db');
const config = require('../config');
const tokenService = require('../auth/token');
const password = require('../auth/password');
const auth = require('../middleware/auth');

const router = express.Router();

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LIMIT = 5;
const loginAttempts = new Map();

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.ip || req.socket.remoteAddress || 'unknown') + '|' +
    String((req.body || {}).email || '').trim().toLowerCase();
}

function throttled(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_LIMIT;
}

router.post('/login', function (req, res) {
  const body = req.body || {};
  const key = clientKey(req);

  if (throttled(key)) {
    return res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Too many sign-in attempts. Try again in a few minutes.'
    });
  }

  const user = db.findUserByEmail(body.email);
  const result = password.verifyPassword(body.password, user);

  if (!result.ok) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is wrong.' });
  }

  loginAttempts.delete(key);
  if (result.rehash) {
    const upgraded = password.hashPassword(body.password);
    db.updateUser(user.id, function (current) {
      current.passwordSalt = upgraded.salt;
      current.passwordHash = upgraded.hash;
      return current;
    });
  }

  return res.json({
    token: tokenService.sign(user),
    user: auth.publicUser(user)
  });
});

router.get('/demo', function (req, res) {
  if (config.isProduction && String(process.env.ENABLE_DEMO_LOGINS || '').toLowerCase() !== 'true') {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Demo accounts are disabled.' });
  }
  /* Demo roles only. Contact addresses stay in the server-side login flow. */
  return res.json({
    password: process.env.DEMO_PASSWORD || 'mathify-demo',
    accounts: [
      { role: 'founder' },
      { role: 'trainer' },
      { role: 'student' }
    ]
  });
});

router.get('/me', auth.requireAuth, function (req, res) {
  return res.json({ user: auth.publicUser(req.user) });
});

module.exports = router;
