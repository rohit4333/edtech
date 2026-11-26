/* LiveKit call token endpoints.
 *
 * POST /api/livekit/token  — canonical route; reads `roomName` and
 *                            `participantName` from req.body.
 * GET  /api/livekit/token  — query-compatible alias; accepts the same hints
 *                            from req.query.
 * POST/GET /api/get-token  — same handlers, mounted as aliases.
 *
 * Room/identity/grants stay server-owned. A browser can only confirm the
 * room derived from a session it is authorized to enter. */

const express = require('express');
const config = require('../config');
const db = require('../db');
const auth = require('../middleware/auth');
const realtime = require('../realtime');
const rateLimit = require('../middleware/rateLimit');
const requireTrainerAccess = require('../middleware/trainerAccess');
const networkQuality = require('../services/networkQualityService');
const sessionAccess = require('../services/sessionAccessService');
const livekitTokens = require('../services/livekitTokenService');

const router = express.Router();

const tokenThrottle = rateLimit.createLimiter({ name: 'livekit-token', windowMs: 60000, max: 30 });
router.use(tokenThrottle);

/* Development escape hatch for the standalone demo page. It is never active
   in production or against the live database, so Mathify's 1:1 privacy rules
   cannot be bypassed by a browser-supplied room name. */
const directAllowed = !config.isProduction && config.databaseMode !== 'supabase' &&
  String(process.env.ALLOW_DIRECT_ROOM_TOKENS || '').toLowerCase() === 'true';

async function handleDirectToken(req, res) {
  try {
    const body = req.body || {};
    const rtc = await livekitTokens.issueDirectToken(body);
    const agent = await livekitTokens.dispatchAgent(
      { id: rtc.roomName.replace(/^mathify-/, '') }, rtc, { actor: { role: 'trainer' } }
    );
    return res.json({
      token: rtc.token,
      url: rtc.url,
      livekitUrl: rtc.livekitUrl,
      roomName: rtc.roomName,
      identity: rtc.identity,
      expiresInSeconds: rtc.expiresInSeconds,
      agent: agent,
      rtc: rtc
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'LIVEKIT_TOKEN_FAILED',
      message: error.status ? error.message : 'Could not issue a call token.'
    });
  }
}

function directFirst(req, res, next) {
  const body = req.body || {};
  if (directAllowed && body.roomName && !body.sessionId) return handleDirectToken(req, res);
  return next();
}

async function issueToken(req, res) {
  try {
    const body = req.body || {};
    const options = Object.assign({}, body, req.query || {});
    const sessionId = String(options.sessionId || '').trim();

    if (!sessionId) {
      return res.status(400).json({
        error: 'SESSION_REQUIRED',
        message: 'sessionId is required before a call token can be issued.'
      });
    }

    const session = await db.findSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session does not exist.' });
    }
    if (!auth.canAccessSession(req.user, session)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You are not part of this session.'
      });
    }

    /* Explicit founder observer opt-in is checked here, never inferred from
       the browser's role claim or from a body flag alone. */
    const access = sessionAccess.evaluate(session, req.user, options);
    if (!access.canEnter) {
      return res.status(access.status).json({
        error: access.code,
        message: access.reason,
        roomAccess: access
      });
    }

    let liveSession = session;
    let observerChanged = false;
    if (access.observer) {
      observerChanged = sessionAccess.setObserver(session, req.user, new Date().toISOString()).changed;
      const updated = await db.updateSession(session.id, function (current) {
        return sessionAccess.setObserver(current, req.user, new Date().toISOString()).session;
      });
      if (updated) liveSession = updated;
    }

    if (!networkQuality.bothReady(liveSession)) {
      return res.status(409).json({
        error: 'NETWORK_BELOW_MINIMUM',
        message: 'Both people must pass the connection speed check before the class can start.'
      });
    }

    const rtc = await livekitTokens.issueSessionToken(liveSession, req.user, {
      roomName: options.roomName,
      participantName: options.participantName,
      observer: access.observer
    });

    const agent = await livekitTokens.dispatchAgent(liveSession, rtc, { actor: req.user });

    const payload = {
      token: rtc.token,
      url: rtc.url,
      livekitUrl: rtc.livekitUrl,
      roomName: rtc.roomName,
      identity: rtc.identity,
      peerIdentity: rtc.peerIdentity,
      expiresInSeconds: rtc.expiresInSeconds,
      agent: agent,
      rtc: rtc,
      roomAccess: access
    };

    const respond = function () { return res.json(payload); };
    if (observerChanged) {
      await realtime.publish(liveSession.id, 'founder.observer.changed',
        sessionAccess.eventPayload(liveSession));
    }
    return respond();
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'LIVEKIT_TOKEN_FAILED',
      message: error.status ? error.message : 'Could not issue a call token.'
    });
  }
}

router.post('/token', directFirst, auth.requireAuth, requireTrainerAccess(), issueToken);
router.get('/token', auth.requireAuth, requireTrainerAccess(), issueToken);
router.post('/', directFirst, auth.requireAuth, requireTrainerAccess(), issueToken);
router.get('/', auth.requireAuth, requireTrainerAccess(), issueToken);

module.exports = router;
