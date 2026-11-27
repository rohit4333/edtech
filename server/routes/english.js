/* English Communication workspace routes.
 *
 * The session id always comes from the browser but is resolved against the
 * stored session; a child can only read and write the work attached to their
 * own 1-on-1 session. No contact, payment or policy data is involved.
 */

const express = require('express');
const auth = require('../middleware/auth');
const requireTrainerAccess = require('../middleware/trainerAccess');
const db = require('../db');
const workspace = require('../services/englishWorkspaceService');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireClassAccess);
router.use(requireTrainerAccess());

async function sessionFor(req, id) {
  if (!id) return null;
  const session = await db.findSession(id);
  if (!session || !auth.canAccessSession(req.user, session)) return null;
  return session;
}

router.get('/work', async function (req, res) {
  const sessionId = String((req.query && req.query.sessionId) || '').trim();
  const session = await sessionFor(req, sessionId);
  if (!session) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not part of this session.'
    });
  }
  const record = db.getRecord('english_work', session.id);
  return res.json(Object.assign({ role: req.user.role, sessionId: session.id },
    workspace.publicView(record)));
});

router.post('/work', async function (req, res) {
  const body = req.body || {};
  const sessionId = String(body.sessionId || '').trim();
  const session = await sessionFor(req, sessionId);
  if (!session) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not part of this session.'
    });
  }
  if (['student', 'trainer', 'founder'].indexOf(req.user.role) === -1) {
    return res.status(403).json({
      error: 'READ_ONLY',
      message: 'This workspace is read-only for your role.'
    });
  }
  const current = db.getRecord('english_work', session.id);
  const updated = workspace.applyUpdate(current, body, req.user.role);
  db.putRecord('english_work', session.id, Object.assign({}, updated, {
    studentId: session.studentId
  }));
  return res.json(Object.assign({ role: req.user.role, sessionId: session.id },
    workspace.publicView(updated)));
});

module.exports = router;
