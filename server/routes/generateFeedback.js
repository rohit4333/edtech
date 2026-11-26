/* POST /api/generate-feedback — structured, privacy-safe AI feedback.
 *
 * Replaces the Cloudflare Workers AI call with `freelm`. Input is an
 * allowlist of lesson fields only; no identity or session data is forwarded. */

const express = require('express');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const freeLm = require('../services/freeLmService');

const router = express.Router();
const feedbackThrottle = rateLimit.createLimiter({ name: 'generate-feedback', windowMs: 60000, max: 20 });

router.post('/', auth.requireAuth, feedbackThrottle, async function (req, res) {
  try {
    const body = req.body || {};
    if (typeof body.transcript === 'string' && body.transcript.trim()) {
      const result = await freeLm.generateTranscriptFeedback(body);
      return res.json({
        text: result.text,
        provider: result.provider,
        mode: result.mode
      });
    }
    const result = await freeLm.generateFeedback(body);
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.code || 'FEEDBACK_UNAVAILABLE',
      message: error.status ? error.message : 'AI feedback is temporarily unavailable.'
    });
  }
});

module.exports = router;
