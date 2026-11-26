/* Agora RTC + RTM token and recording routes. The App Certificate stays on
   the server. Session identity, channel, uid and peer are server-owned. */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../middleware/auth');
const tokenService = require('../services/agoraTokenService');
const recordingService = require('../services/agoraRecordingService');
const presenceService = require('../services/presenceService');

const router = express.Router();

function sessionFromRequest(req, res, next) {
  const id = String((req.query && req.query.sessionId) ||
    (req.body && req.body.sessionId) || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'MISSING_SESSION', message: 'sessionId is required.' });
  }
  const session = db.findSession(id);
  if (!session) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session does not exist.' });
  }
  if (!auth.canAccessSession(req.user, session)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
  }
  req.sessionRecord = session;
  return next();
}

function requireCallOwner(req, res, next) {
  if (req.user.role !== 'trainer' && req.user.role !== 'founder') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only a trainer can control this call.' });
  }
  return next();
}

router.get('/token', auth.requireAuth, sessionFromRequest, function (req, res) {
  try {
    return res.json(tokenService.issueSessionToken(req.sessionRecord, req.user));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'TOKEN_GENERATION_FAILED',
      message: error.message
    });
  }
});

router.post('/recording/start', auth.requireAuth, requireCallOwner, sessionFromRequest, async function (req, res) {
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

router.post('/recording/stop', auth.requireAuth, requireCallOwner, sessionFromRequest, async function (req, res) {
  try {
    const recordingId = String((req.body || {}).recordingId || '').trim();
    const existing = recordingId ? db.findRecording(recordingId) : null;
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
router.post('/webhook', function (req, res) {
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
     presence event to the wrong 1:1 session. */
  const matches = channel
    ? db.listSessionsForUser({ role: 'founder' }).filter(function (item) {
      return item.rtc && item.rtc.channel === channel;
    })
    : [];
  if (matches.length > 1) {
    return res.json({ received: true, matched: false, ambiguous: true });
  }
  const session = matches.length === 1 ? matches[0] : null;

  if (!session) return res.json({ received: true, matched: false });

  const event = presenceService.agoraEvent(session, payload);
  return res.json({
    received: true,
    matched: true,
    event: event ? { role: event.role, kind: event.kind, at: event.at } : null
  });
});

module.exports = router;
