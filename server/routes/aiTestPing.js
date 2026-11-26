/* POST /api/ai/test-ping — founder-only, live-only provider smoke test.
 *
 * There is no mock response here. Gemini, Groq and Cloudflare are probed
 * individually through freelm; at least two real providers must answer or the
 * route fails closed with 503. No identity, session id or lesson content
 * crosses this boundary. */

const express = require('express');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const freeLm = require('../services/freeLmService');

const router = express.Router();
const pingThrottle = rateLimit.createLimiter({ name: 'ai-test-ping', windowMs: 60000, max: 10 });

/* Founder-only diagnostics: each request makes up to three real provider
   calls, so it must never be reachable anonymously. */
router.post('/', pingThrottle, auth.requireAuth, auth.requireRole('founder'), async function (req, res) {
  try {
    const body = req.body || {};
    const result = await freeLm.generateLivePing({ message: body.message });
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.code || 'AI_PING_UNAVAILABLE',
      message: error.status ? error.message : 'The AI provider is temporarily unavailable.'
    });
  }
});

module.exports = router;
