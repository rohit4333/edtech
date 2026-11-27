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
const subjectCatalog = require('../services/subjectCatalog');
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

/* The workspace follows the stored session, never a browser-supplied subject.
   A legacy session with no stored subject stays compatible with every workspace;
   only an explicitly different subject is refused. Access scoping is unchanged. */
function subjectMismatch(res, session) {
  const stored = session.subject;
  if (stored === undefined || stored === null || stored === '') return null;
  if (subjectCatalog.normalize(stored) === 'english') return null;
  return res.status(403).json({
    error: 'SUBJECT_MISMATCH',
    message: 'This session is not an English session.'
  });
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
  const mismatch = subjectMismatch(res, session);
  if (mismatch) return mismatch;
  const record = await db.getRecord('english_work', session.id);
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
  const mismatch = subjectMismatch(res, session);
  if (mismatch) return mismatch;
  if (['student', 'trainer', 'founder'].indexOf(req.user.role) === -1) {
    return res.status(403).json({
      error: 'READ_ONLY',
      message: 'This workspace is read-only for your role.'
    });
  }
  const current = await db.getRecord('english_work', session.id);
  const updated = workspace.applyUpdate(current, body, req.user.role);
  await db.putRecord('english_work', session.id, Object.assign({}, updated, {
    studentId: session.studentId
  }));
  return res.json(Object.assign({ role: req.user.role, sessionId: session.id },
    workspace.publicView(updated)));
});

module.exports = router;
