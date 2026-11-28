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
const LOGIN_ROLES = new Set([
  'student', 'trainer', 'founder', 'parent', 'relationship_manager', 'planner_agent'
]);
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

    const accessToken = tokenService.sign(user);
    /* The founder admin app has a server-side static gate as well as API RBAC.
       A short-lived HttpOnly cookie carries only that verified founder session;
       browser localStorage remains the source for ordinary desk tokens. */
    if (user.role === 'founder') {
      res.cookie('mathify_founder_gate', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        path: '/',
        maxAge: tokenService.ttlSeconds * 1000
      });
    }
    return res.json({
      token: accessToken,
      /* The refresh token lets a desk silently renew its access token after a
         long break instead of dropping the family back to the sign-in page. */
      refreshToken: tokenService.signRefresh(user),
      rememberSeconds: tokenService.rememberTtlSeconds,
      user: auth.publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

/* Exchange a remembered refresh token for a fresh desk token. The role comes
   from the signed token, never from the request body, so a parent refresh can
   never mint a student token (or the other way around). */
router.post('/refresh', async function (req, res, next) {
  const presented = String((req.body || {}).refreshToken || '').trim();
  const payload = tokenService.verify(presented, 'refresh');
  if (!payload) {
    return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Sign in again to continue.' });
  }
  try {
    const user = await db.findUserById(payload.sub);
    const pendingStaff = user && user.status === 'pending' &&
      (user.role === 'trainer' || user.role === 'relationship_manager');
    if (!user || (user.status !== 'active' && !pendingStaff)) {
      return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Sign in again to continue.' });
    }
    if (Number(payload.ver || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Sign in again to continue.' });
    }
    if (user.role !== payload.role && !sharedLoginPair(user.role, payload.role)) {
      return res.status(403).json({ error: 'ROLE_DENIED', message: 'Those credentials cannot open this desk.' });
    }
    const accessToken = tokenService.sign(user);
    if (user.role === 'founder') {
      res.cookie('mathify_founder_gate', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        path: '/',
        maxAge: tokenService.ttlSeconds * 1000
      });
    }
    return res.json({
      token: accessToken,
      refreshToken: presented,
      rememberSeconds: tokenService.rememberTtlSeconds,
      user: auth.publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

/* Post-login view switch for the one shared parent/kid credential. It reuses
   the signed-in identity and the existing shared-role allowlist; it never
   broadens role escalation, mints a refresh token or changes the JWT claim
   semantics. Staff views are only ever their own verified canonical role. */
router.post('/view', auth.requireAuth, async function (req, res, next) {
  const view = String((req.body || {}).view || '');
  try {
    if (!LOGIN_ROLES.has(view)) {
      return res.status(400).json({ error: 'INVALID_VIEW', message: 'Unknown app view.' });
    }
    const canonical = await db.findUserById(req.user.id);
    if (!canonical || (canonical.status !== 'active' && canonical.status !== 'pending')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign in again to continue.' });
    }
    if (view !== canonical.role && !sharedLoginPair(canonical.role, view)) {
      return res.status(403).json({ error: 'ROLE_DENIED', message: 'That view is not available to this account.' });
    }
    /* The shared login resolves to a different underlying account per role.
       Resolve the requested view by email so the child desk sees the child's
       own sessions and the parent desk keeps the linked child record. */
    const target = view === canonical.role
      ? canonical
      : await db.findUserByEmail(canonical.email, view);
    if (!target || (target.status !== 'active' && target.status !== 'pending')) {
      return res.status(403).json({ error: 'ROLE_DENIED', message: 'That view is not available to this account.' });
    }
    return res.json({
      token: tokenService.sign(target),
      user: auth.publicUser(target)
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
      { role: 'planner_agent' },
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
