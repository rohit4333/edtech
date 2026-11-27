/* Browser bridge for the AI chat Worker. Express owns the signed-in session;
 * the Worker (or the shared core locally) owns policy prompts and model calls.
 * No contact detail, session id or trainer-only field is forwarded. */

const express = require('express');
const auth = require('../middleware/auth');
const chatWorker = require('../services/chatWorkerService');
const studentDoubtQuota = require('../services/studentDoubtQuotaService');

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
    let reservation = null;
    try {
      /* Only a signed-in student's image questions spend the daily allowance.
         Text stays unlimited, and founder diagnostics are not charged. */
      if (kind === 'student-doubt' && req.user.role === 'student' && body.image) {
        const imageCheck = studentDoubtQuota.validateImage(body.image);
        if (!imageCheck.ok) {
          const invalid = new Error(imageCheck.message);
          invalid.code = imageCheck.code;
          invalid.status = 400;
          throw invalid;
        }
        reservation = await studentDoubtQuota.reserveImage(req.user.id, {
          timezone: req.user.timezone
        });
      }

      const result = await chatWorker.ask(kind, payload, bearer(req));
      return res.json({
        reply: result.reply,
        source: result.source,
        reason: result.reason || null,
        model: result.model || null,
        imageUsed: Boolean(result.imageUsed),
        quota: reservation ? {
          used: reservation.used,
          remaining: reservation.remaining,
          limit: reservation.limit,
          date: reservation.date
        } : null
      });
    } catch (error) {
      if (reservation) {
        try {
          await studentDoubtQuota.releaseReservation(reservation);
        } catch (releaseError) {
          /* The answer already failed; a stale slot must not turn into a 500. */
        }
      }
      const publicMessage = error.code === 'IMAGE_QUOTA_EXCEEDED' || error.status === 400
        ? (error.message || 'Check your message and try again.')
        : 'The chat service could not complete the request.';
      return res.status(error.status || 502).json({
        error: error.code || 'CHAT_FAILED',
        message: publicMessage
      });
    }
  };
}

router.get('/student-doubt/quota', auth.requireRole('student'), async function (req, res) {
  try {
    const quota = await studentDoubtQuota.getUsage(req.user.id, {
      timezone: req.user.timezone
    });
    return res.json({ quota: quota });
  } catch (error) {
    return res.status(502).json({
      error: 'QUOTA_UNAVAILABLE',
      message: 'Study Buddy could not read today\'s photo allowance.'
    });
  }
});

router.post('/trainer-support', auth.requireRole('trainer', 'founder'), handler('trainer-support'));
router.post('/student-doubt', auth.requireRole('student', 'founder'), handler('student-doubt'));

module.exports = router;
