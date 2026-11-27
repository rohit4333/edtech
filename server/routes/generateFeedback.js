/* POST /api/generate-feedback — structured, privacy-safe AI feedback.
 *
 * Replaces the Cloudflare Workers AI call with `freelm`. Input is an
 * allowlist of lesson fields only; no identity or session data is forwarded. */

const express = require('express');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const freeLm = require('../services/freeLmService');
const subjectPrompts = require('../services/subjectPromptService');

const router = express.Router();
const feedbackThrottle = rateLimit.createLimiter({ name: 'generate-feedback', windowMs: 60000, max: 20 });

/* AI is founder, trainer and student only. The subject is resolved from the
   signed-in role, so a relationship manager cannot reach a provider and a
   trainer cannot ask the feedback prompt to teach another field. */
router.post('/', auth.requireAuth, auth.requireRole('student', 'trainer', 'founder'),
  auth.requireClassAccess, feedbackThrottle, async function (req, res) {
  try {
    const body = req.body || {};
    const subject = subjectPrompts.assertAllowed(
      req.user, body.subject || req.user.subject || 'math'
    );
    if (typeof body.transcript === 'string' && body.transcript.trim()) {
      const result = await freeLm.generateTranscriptFeedback(body, subject);
      return res.json({
        text: result.text,
        provider: result.provider,
        mode: result.mode
      });
    }
    const result = await freeLm.generateFeedback(body, subject);
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.code || 'FEEDBACK_UNAVAILABLE',
      message: error.status ? error.message : 'AI feedback is temporarily unavailable.'
    });
  }
});

module.exports = router;
