/* Coding practice and the shared trainer-led IDE.
 *
 * Every route derives the child and session from the stored session record.
 * Hidden tests are read only on the server; no browser payload includes test
 * source, an expected value, an answer key or another child's code.
 */

const crypto = require('crypto');
const express = require('express');
const auth = require('../middleware/auth');
const requireTrainerAccess = require('../middleware/trainerAccess');
const rateLimit = require('../middleware/rateLimit');
const db = require('../db');
const realtime = require('../realtime');
const runner = require('../services/codeRunnerService');

const router = express.Router();
const checkThrottle = rateLimit.createLimiter({ name: 'code-check', windowMs: 60000, max: 20 });

router.use(auth.requireAuth);
router.use(auth.requireClassAccess);
router.use(requireTrainerAccess());

function isStaff(user) {
  return Boolean(user && (user.role === 'trainer' || user.role === 'founder'));
}

async function sessionFor(req, id) {
  if (!id) return null;
  const session = await db.findSession(id);
  if (!session || !auth.canAccessSession(req.user, session)) return null;
  return session;
}

function reject(res, code, message, status) {
  return res.status(status || 403).json({ error: code, message: message });
}

async function challengeFor(req, challengeId, sessionId) {
  if (challengeId && challengeId !== runner.STARTER.id) {
    const records = db.listRecords('coding_challenge');
    const found = records.find(function (item) { return item.id === challengeId; });
    if (found && found.sessionId && !auth.canAccessSession(
      req.user, await db.findSession(found.sessionId)
    )) return null;
    return found || null;
  }
  if (!sessionId) return null;
  return db.getRecord('coding_challenge', sessionId);
}

/* Trainer publishes a challenge with server-only hidden tests. The response
   mirrors the safe shape a student receives, so a trainer desk cannot start
   displaying keys by mistake. */
router.post('/challenges', async function (req, res) {
  if (!isStaff(req.user)) {
    return reject(res, 'FORBIDDEN', 'Only a trainer or founder can publish a challenge.');
  }
  const body = req.body || {};
  const sessionId = String(body.sessionId || '').trim();
  const session = await sessionFor(req, sessionId);
  if (!session) {
    return reject(res, 'SESSION_NOT_FOUND', 'Unknown session or no access.', 404);
  }
  let tests;
  try {
    tests = runner.normalizeTests(body.tests);
  } catch (error) {
    return res.status(error.status || 422).json({ error: error.code, message: error.message });
  }
  if (!tests.length) {
    return reject(res, 'TEST_REQUIRED', 'Add at least one hidden check.', 422);
  }
  const record = {
    id: 'chal_' + crypto.randomUUID(),
    sessionId: sessionId,
    title: String(body.title || '').trim().slice(0, 120) || 'Coding challenge',
    prompt: String(body.prompt || '').trim().slice(0, 2000),
    language: 'javascript',
    starterCode: String(body.starterCode || runner.STARTER.starterCode).slice(0, runner.MAX_CODE_CHARS),
    entryPoint: 'solution',
    tests: tests,
    createdByRole: req.user.role,
    createdAt: new Date().toISOString()
  };
  db.putRecord('coding_challenge', sessionId, record);
  return res.status(201).json({ challenge: runner.publicChallenge(record) });
});

router.get('/challenge', async function (req, res) {
  const sessionId = String((req.query && req.query.sessionId) || '').trim();
  if (sessionId && !(await sessionFor(req, sessionId))) {
    return reject(res, 'FORBIDDEN', 'You are not part of this session.');
  }
  const record = sessionId ? db.getRecord('coding_challenge', sessionId) : null;
  return res.json({ challenge: runner.publicChallenge(record) });
});

/* Compiler-style check: hidden tests run in a sandbox and only pass/fail
   categories are returned. Test source and expected values stay server-side. */
router.post('/check', checkThrottle, async function (req, res, next) {
  try {
    const body = req.body || {};
    const sessionId = String(body.sessionId || '').trim();
    const challengeId = String(body.challengeId || '').trim();
    if (sessionId && !(await sessionFor(req, sessionId))) {
      return reject(res, 'FORBIDDEN', 'You are not part of this session.');
    }
    const challenge = await challengeFor(req, challengeId, sessionId);
    if (challengeId && challengeId !== runner.STARTER.id && !challenge) {
      return reject(res, 'CHALLENGE_NOT_FOUND', 'Unknown challenge.', 404);
    }
    if (challenge && challenge.sessionId && !(await sessionFor(req, challenge.sessionId))) {
      return reject(res, 'FORBIDDEN', 'You are not part of this session.');
    }
    const tests = challenge && Array.isArray(challenge.tests)
      ? challenge.tests : runner.STARTER.tests;
    const result = runner.runChecks(body.code, tests);
    return res.json(Object.assign({}, result, {
      challengeId: challenge ? challenge.id : runner.STARTER.id,
      language: 'javascript'
    }));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    return next(error);
  }
});

function emptyIde(sessionId) {
  return {
    sessionId: sessionId,
    code: runner.STARTER.starterCode,
    language: 'javascript',
    ownerId: null,
    locked: false,
    version: 0,
    updatedAt: null
  };
}

/* One synchronized document per session. The lock is a teaching control, not
   an access rule: a trainer can always take it back and hand it over. */
router.get('/sessions/:sessionId/ide', async function (req, res) {
  const sessionId = String(req.params.sessionId || '').trim();
  if (!(await sessionFor(req, sessionId))) {
    return reject(res, 'FORBIDDEN', 'You are not part of this session.');
  }
  const stored = db.getRecord('coding_ide', sessionId);
  return res.json({ ide: stored || emptyIde(sessionId) });
});

router.post('/sessions/:sessionId/ide', async function (req, res) {
  const sessionId = String(req.params.sessionId || '').trim();
  if (!(await sessionFor(req, sessionId))) {
    return reject(res, 'FORBIDDEN', 'You are not part of this session.');
  }
  const staff = isStaff(req.user);
  const body = req.body || {};
  const current = db.getRecord('coding_ide', sessionId) || emptyIde(sessionId);

  if (!staff && current.locked && current.ownerId !== req.user.id) {
    return reject(res, 'IDE_LOCKED', 'Your trainer is editing. Wait for the hand-over.');
  }
  if ((body.locked !== undefined || body.ownerId !== undefined) && !staff) {
    return reject(res, 'FORBIDDEN', 'Only a trainer can lock or hand over the editor.');
  }
  if (body.code !== undefined && typeof body.code !== 'string') {
    return reject(res, 'INVALID_CODE', 'Code must be text.', 422);
  }
  if (body.code && body.code.length > runner.MAX_CODE_CHARS) {
    return reject(res, 'CODE_TOO_LONG', 'Code is too long.', 422);
  }
  if (body.ownerId !== undefined && body.ownerId !== null &&
      typeof body.ownerId !== 'string') {
    return reject(res, 'INVALID_OWNER', 'ownerId must be an id.', 422);
  }

  const locked = body.locked === undefined ? Boolean(current.locked) : Boolean(body.locked);
  let ownerId = current.ownerId;
  if (body.ownerId !== undefined) ownerId = body.ownerId || null;
  else if (locked && staff && !current.locked) ownerId = req.user.id;
  else if (!staff) ownerId = req.user.id;

  const ide = {
    sessionId: sessionId,
    code: body.code === undefined ? current.code : body.code,
    language: 'javascript',
    ownerId: ownerId,
    locked: locked,
    version: Number(current.version || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  db.putRecord('coding_ide', sessionId, ide);
  /* The event carries the synchronized document state but no identity detail
     beyond an opaque owner id. */
  await realtime.publish(sessionId, 'ide.state.updated', {
    ide: ide,
    version: ide.version,
    ownerId: ide.ownerId,
    locked: ide.locked,
    updatedAt: ide.updatedAt
  });
  return res.json({ ide: ide });
});

module.exports = router;
