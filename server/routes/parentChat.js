/* Parent↔trainer private chat HTTP surface. All routes require a verified JWT.
 *
 * Canonical endpoints (aliases exist for dashboard clients):
 *   GET  /api/parent-chat/thread/:studentId              thread + unread count
 *   GET  /api/parent-chat/threads/:studentId/messages    alias
 *   POST /api/parent-chat/thread/:studentId/messages     send a safe message
 *   POST /api/parent-chat/threads/:studentId/messages    alias
 *   POST /api/parent-chat/thread/:studentId/read         mark read (self only)
 *   POST /api/parent-chat/threads/:studentId/mark-read   alias
 *   GET  /api/parent-chat/unread                         dashboard summary
 *   GET  /api/parent-chat/unread-summary                 alias
 *   GET  /api/parent-chat/flags                          founder-only DLP flags
 *   GET  /api/parent-chat/privacy-flags                  alias
 *
 * Parents may omit :studentId on read/send and their own child is used.
 * Founders have read-only audit access; students have no access at all.
 */

const express = require('express');
const auth = require('../middleware/auth');
const service = require('../services/parentChatService');
const requireTrainerAccess = require('../middleware/trainerAccess');

const router = express.Router();
router.use(auth.requireAuth);
router.use(auth.requireClassAccess);
router.use(requireTrainerAccess());

const PARTICIPANTS = auth.requireRole('parent', 'trainer');
const AUDITORS = auth.requireRole('parent', 'trainer', 'founder');
const FOUNDER = auth.requireRole('founder');

function handle(fn) {
  return function (req, res) {
    return Promise.resolve()
      .then(function () { return fn(req, res); })
      .catch(function (error) {
        const status = error && error.status ? error.status : 500;
        return res.status(status).json({
          error: error && error.code ? error.code : 'PARENT_CHAT_FAILED',
          message: status === 500
            ? 'The chat service could not complete the request.'
            : (error && error.message ? error.message : 'Request failed.')
        });
      });
  };
}

function studentIdFrom(req) {
  const params = req.params || {};
  const body = req.body || {};
  const query = req.query || {};
  return params.studentId || params.id || body.studentId || query.studentId || null;
}

function messageText(req) {
  const body = req.body || {};
  if (typeof body.body === 'string') return body.body;
  if (typeof body.text === 'string') return body.text;
  if (typeof body.message === 'string') return body.message;
  return null;
}

const readThread = handle(function (req, res) {
  return service.getThread(req.user, studentIdFrom(req), req.query.limit)
    .then(function (result) { return res.json(result); });
});

const sendMessage = handle(function (req, res) {
  return service.sendMessage(req.user, studentIdFrom(req), messageText(req))
    .then(function (result) { return res.json(result); });
});

const markRead = handle(function (req, res) {
  return service.markRead(req.user, studentIdFrom(req), req.body || {})
    .then(function (result) { return res.json(result); });
});

const unread = handle(function (req, res) {
  return service.unreadSummary(req.user)
    .then(function (result) { return res.json(result); });
});

const flags = handle(function (req, res) {
  return service.listFlags(req.user, req.query.limit)
    .then(function (result) { return res.json(result); });
});

router.get('/thread', AUDITORS, readThread);
router.get('/thread/:studentId', AUDITORS, readThread);
router.get('/threads/:studentId/messages', AUDITORS, readThread);
router.get('/messages', AUDITORS, readThread);

router.post('/thread/:studentId/messages', PARTICIPANTS, sendMessage);
router.post('/threads/:studentId/messages', PARTICIPANTS, sendMessage);
router.post('/messages', PARTICIPANTS, sendMessage);

router.post('/thread/:studentId/read', PARTICIPANTS, markRead);
router.post('/threads/:studentId/mark-read', PARTICIPANTS, markRead);
router.post('/read', PARTICIPANTS, markRead);

router.get('/unread', AUDITORS, unread);
router.get('/unread-summary', AUDITORS, unread);

router.get('/flags', FOUNDER, flags);
router.get('/privacy-flags', FOUNDER, flags);

module.exports = router;
