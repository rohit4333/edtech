const express = require('express');
const db = require('../db');
const config = require('../config');
const tokenService = require('../auth/token');
const password = require('../auth/password');
const auth = require('../middleware/auth');
const batchService = require('../services/batchService');
const passwordService = require('../services/passwordService');
const registrationService = require('../services/registrationService');

const router = express.Router();

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LIMIT = 5;
const LOGIN_ROLES = new Set(['student', 'trainer', 'founder', 'parent', 'relationship_manager']);
const loginAttempts = new Map();
const registrationAttempts = new Map();

/* One family credential may open either the student desk or the parent app.
   The opened desk is the role hint; no other role cross-over is allowed. */
function sharedLoginPair(actual, requested) {
  return (actual === 'student' && requested === 'parent') ||
    (actual === 'parent' && requested === 'student');
}

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

router.get('/batch', function (req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    const error = new Error('Students only.');
    error.code = 'ROLE_DENIED';
    error.status = 403;
    return next(error);
  }
  batchService.ensureForStudent(req.user.id)
    .then(function (batch) { return res.json({ batch: batch }); })
    .catch(next);
});

/* Public self-registration is throttled separately from sign-in. It can only
   create student, trainer and relationship-manager accounts; staff access
   still requires KYC submission and an explicit founder/manager grant. */
router.post('/register', function (req, res) {
  const key = clientKey(req);
  const now = Date.now();
  const entry = registrationAttempts.get(key);
  if (entry && now - entry.startedAt < LOGIN_WINDOW_MS && entry.count >= LOGIN_LIMIT) {
    return res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Too many registration attempts. Try again in a few minutes.'
    });
  }
  if (!entry || now - entry.startedAt >= LOGIN_WINDOW_MS) {
    registrationAttempts.set(key, { startedAt: now, count: 1 });
  } else {
    entry.count += 1;
  }

  registrationService.register(req.body || {})
    .then(function (result) {
      registrationAttempts.delete(key);
      return res.status(201).json(result);
    })
    .catch(function (error) {
      return res.status(error.status || 422).json({
        error: error.code || 'REGISTRATION_FAILED',
        message: error.message || 'Account could not be created.'
      });
    });
});

router.post('/login', async function (req, res, next) {
  const body = req.body || {};
  const key = clientKey(req);

  if (throttled(key)) {
    return res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Too many sign-in attempts. Try again in a few minutes.'
    });
  }

  const requestedRole = LOGIN_ROLES.has(body.role) ? body.role : null;
  try {
    /* The Supabase adapter reads identities asynchronously. Awaiting here keeps
       credential verification on the real user record in both database modes. */
    const user = await db.findUserByEmail(body.email, requestedRole);
    const result = password.verifyPassword(body.password, user);

    if (!result.ok) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is wrong.' });
    }
    if (user.status === 'suspended') {
      return res.status(401).json({
        error: 'ACCESS_REVOKED',
        message: 'This account has been suspended by the founder.'
      });
    }
    if (requestedRole && user.role !== requestedRole && !sharedLoginPair(user.role, requestedRole)) {
      return res.status(403).json({ error: 'ROLE_DENIED', message: 'Those credentials cannot open this desk.' });
    }

    loginAttempts.delete(key);
    if (result.rehash) {
      const upgraded = password.hashPassword(body.password);
      await db.updateUser(user.id, function (current) {
        current.passwordSalt = upgraded.salt;
        current.passwordHash = upgraded.hash;
        return current;
      });
    }

    return res.json({
      token: tokenService.sign(user),
      user: auth.publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
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
      { role: 'relationship_manager' },
      { role: 'trainer' },
      { role: 'student' },
      /* Parent demo sign-in uses the same password; no contact detail is
         included in this public list. */
      { role: 'parent' }
    ]
  });
});

router.get('/me', auth.requireAuth, function (req, res) {
  return res.json({ user: auth.publicUser(req.user) });
});

/* Signed-in password change from the user's own profile section. */
router.post(
  '/password/change',
  auth.requireAuth,
  function (req, res) {
    passwordService.changePassword(req.user.id, req.body || {})
      .then(function (result) { return res.json(result); })
      .catch(function (error) {
        return res.status(error.status || 422).json({
          error: error.code || 'PASSWORD_CHANGE_FAILED',
          message: error.message
        });
      });
  }
);

/* Forgot-password path. The request is intentionally role-agnostic: the email
   is the account identity, and the opened desk still decides the destination. */
router.post(
  '/password-reset/request',
  function (req, res) {
    passwordService.requestReset(req.body || {})
      .then(function (result) { return res.json(result); })
      .catch(function (error) {
        return res.status(error.status || 422).json({
          error: error.code || 'RESET_REQUEST_FAILED',
          message: error.message
        });
      });
  }
);

router.post(
  '/password-reset/confirm',
  function (req, res) {
    passwordService.confirmReset(req.body || {})
      .then(function (result) { return res.json(result); })
      .catch(function (error) {
        return res.status(error.status || 400).json({
          error: error.code || 'RESET_FAILED',
          message: error.message
        });
      });
  }
);

module.exports = router;
