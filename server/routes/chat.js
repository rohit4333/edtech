/* Browser bridge for the AI chat Worker. Express owns the signed-in session;
 * the Worker (or the shared core locally) owns policy prompts and model calls.
 * No contact detail, session id or trainer-only field is forwarded. */

const express = require('express');
const auth = require('../middleware/auth');
const chatWorker = require('../services/chatWorkerService');

const router = express.Router();
router.use(auth.requireAuth);
/* Chat is class help, not a policy or payment surface. */
router.use(auth.requireClassAccess);

function bearer(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function handler(kind) {
  return async function (req, res) {
    const body = req.body || {};
    const payload = {
      role: req.user.role,
      actorId: req.user.id,
      question: body.question,
      image: kind === 'student-doubt' ? body.image : null
    };
    try {
      const result = await chatWorker.ask(kind, payload, bearer(req));
      return res.json({
        reply: result.reply,
        source: result.source,
        reason: result.reason || null,
        model: result.model || null,
        imageUsed: Boolean(result.imageUsed)
      });
    } catch (error) {
      return res.status(error.status || 502).json({
        error: error.code || 'CHAT_FAILED',
        message: error.status === 400
          ? (error.message || 'Check your message and try again.')
          : 'The chat service could not complete the request.'
      });
    }
  };
}

router.post('/trainer-support', auth.requireRole('trainer', 'founder'), handler('trainer-support'));
router.post('/student-doubt', auth.requireRole('student', 'founder'), handler('student-doubt'));

module.exports = router;
