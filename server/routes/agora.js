/* Agora RTC + RTM token and recording routes. The App Certificate stays on
   the server. Session identity, channel, uid and peer are server-owned. */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../middleware/auth');
const tokenService = require('../services/agoraTokenService');
const recordingService = require('../services/agoraRecordingService');
const presenceService = require('../services/presenceService');
const sessionAccess = require('../services/sessionAccessService');
const requireTrainerAccess = require('../middleware/trainerAccess');

const router = express.Router();

async function sessionFromRequest(req, res, next) {
  const query = req.query || {};
  const body = req.body || {};
  const sessionId = String(query.sessionId || body.sessionId || '').trim();
  const channelName = String(query.channelName || body.channelName || '').trim();
  const uid = String(query.uid || body.uid || '').trim();

  try {
    let session = null;
    if (sessionId) {
      /* Existing classroom contract: lookup by authenticated session id. The
         Supabase adapter is async, so await it before authorizing. */
      session = await db.findSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session does not exist.' });
      }
      if (!auth.canAccessSession(req.user, session)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
      }
      /* A caller may send both identifiers; they must still agree with the
         server-owned channel on the authorized session. */
      const ownedChannel = String((session.rtc && session.rtc.channel) || '');
      if (channelName && ownedChannel !== channelName) {
        return res.status(400).json({
          error: 'CHANNEL_MISMATCH',
          message: 'channelName does not belong to this session.'
        });
      }
    } else if (channelName) {
      /* Public contract: the browser may name a channel, but it never becomes
         the token's channel. It is only a lookup key into sessions the caller
         is already allowed to see; the session record stays authoritative. */
      if (!uid) {
        return res.status(400).json({ error: 'MISSING_UID', message: 'uid is required with channelName.' });
      }
      const expectedUid = String(tokenService.numericUid(req.user && req.user.id));
      if (uid !== expectedUid) {
        return res.status(403).json({ error: 'UID_MISMATCH', message: 'uid is not this caller\'s channel uid.' });
      }

      /* listSessionsForUser applies the same role boundary as canAccessSession:
         trainer/founder/student only see their own sessions. Awaiting it also
         prevents a live Promise from being treated as an array of sessions. */
      const sessions = await db.listSessionsForUser(req.user);
      const candidates = Array.isArray(sessions) ? sessions : [];
      const matches = candidates.filter(function (item) {
        return Boolean(item && item.rtc && String(item.rtc.channel) === channelName);
      });
      if (matches.length > 1) {
        /* Fail closed on ambiguity instead of guessing which 1:1 room is meant. */
        return res.status(409).json({
          error: 'AMBIGUOUS_CHANNEL',
          message: 'channelName matches more than one session you can access.'
        });
      }
      if (matches.length === 0) {
        return res.status(404).json({
          error: 'CHANNEL_NOT_FOUND',
          message: 'No accessible session uses that channel.'
        });
      }
      session = matches[0];
      if (!auth.canAccessSession(req.user, session)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
      }
    } else {
      return res.status(400).json({
        error: 'MISSING_SESSION',
        message: 'sessionId or channelName is required.'
      });
    }

    /* The legacy token route must honour the same explicit founder observer
       gate as POST /api/sessions/:id/rtc-token. Trainer/student access is
       unchanged; a denied caller receives no token. */
    const options = Object.assign({}, req.body || {}, req.query || {});
    const access = sessionAccess.evaluate(session, req.user, options);
    if (!access.canEnter) {
      return res.status(access.status).json({
        error: access.code,
        message: access.reason,
        roomAccess: access
      });
    }
    req.roomAccess = access;
    req.sessionRecord = session;
    return next();
  } catch (error) {
    console.error('Agora session lookup failed:', error.message);
    return res.status(500).json({
      error: 'SESSION_DB_ERROR',
      message: 'Unable to load the session for this channel.'
    });
  }
}

function requireCallOwner(req, res, next) {
  if (req.user.role !== 'trainer') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only a trainer can control this call.' });
  }
  return next();
}

router.get('/token', auth.requireAuth, requireTrainerAccess(), sessionFromRequest, function (req, res) {
  try {
    return res.json(tokenService.issueSessionToken(req.sessionRecord, req.user));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'TOKEN_GENERATION_FAILED',
      message: error.message
    });
  }
});

router.post('/recording/start', auth.requireAuth, requireTrainerAccess(), requireCallOwner, sessionFromRequest, async function (req, res) {
  try {
    const issued = tokenService.issueSessionToken(req.sessionRecord, req.user);
    const recording = await recordingService.startRecording({
      sessionId: req.sessionRecord.id,
      sessionRecord: req.sessionRecord,
      user: req.user,
      channelName: issued.channelName,
      uid: issued.uid,
      token: issued.rtcToken
    });
    return res.json({ recording: recording });
  } catch (error) {
    const status = error.code === 'INVALID_PAYLOAD' ? 400 : (error.status || 502);
    return res.status(status).json({
      error: error.code || 'RECORDING_START_FAILED',
      message: error.message
    });
  }
});

router.post('/recording/stop', auth.requireAuth, requireTrainerAccess(), requireCallOwner, sessionFromRequest, async function (req, res) {
  try {
    const recordingId = String((req.body || {}).recordingId || '').trim();
    const existing = recordingId ? await db.findRecording(recordingId) : null;
    if (!existing) {
      return res.status(404).json({ error: 'RECORDING_NOT_FOUND', message: 'Recording not found.' });
    }
    if (existing.sessionId !== req.sessionRecord.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Recording belongs to another session.' });
    }
    const recording = await recordingService.stopRecording({ recordingId: recordingId });
    return res.json({ recording: recording });
  } catch (error) {
    const status = error.code === 'RECORDING_NOT_FOUND' ? 404 : (error.status || 502);
    return res.status(status).json({
      error: error.code || 'RECORDING_STOP_FAILED',
      message: error.message
    });
  }
});

/* Verified join/leave events feed the automated presence state machine. */
router.post('/webhook', async function (req, res) {
  try {
    const secret = String(process.env.AGORA_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      return res.status(503).json({
        error: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Set AGORA_WEBHOOK_SECRET to accept presence events.'
      });
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const provided = String(req.headers['x-agora-signature'] || '').replace(/^sha256=/i, '');
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const valid = provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!valid) {
      return res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Webhook signature did not match.' });
    }

    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch (error) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Webhook body is not valid JSON.' });
    }

    const channel = String(payload.channelName || payload.channel || '').trim();
    /* Fail closed on ambiguity: a duplicated channel must never attribute a
       presence event to the wrong 1:1 session. Await the adapter so a live
       Promise is never filtered as if it were a session list. */
    const sessions = channel ? await db.listSessionsForUser({ role: 'founder' }) : [];
    const matches = channel && Array.isArray(sessions) ? sessions.filter(function (item) {
      return item && item.rtc && item.rtc.channel === channel;
    }) : [];
    if (matches.length > 1) {
      return res.json({ received: true, matched: false, ambiguous: true });
    }
    const session = matches.length === 1 ? matches[0] : null;

    if (!session) return res.json({ received: true, matched: false });

    const event = await presenceService.agoraEvent(session, payload);
    return res.json({
      received: true,
      matched: true,
      event: event ? { role: event.role, kind: event.kind, at: event.at } : null
    });
  } catch (error) {
    console.error('Agora webhook failed:', error.message);
    return res.status(500).json({ error: 'WEBHOOK_FAILED', message: 'Unable to process the presence event.' });
  }
});

module.exports = router;
