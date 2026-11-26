/* LiveKit Egress controls. Only the verified trainer of a session may start
   or stop its recording; the room and object path are derived server-side. */

const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const requireTrainerAccess = require('../middleware/trainerAccess');
const egress = require('../services/livekitEgressService');

const router = express.Router();
const throttle = rateLimit.createLimiter({
  name: 'livekit-recording', windowMs: 60000, max: 20
});
router.use(throttle);

function safeError(res, error) {
  const status = error && error.status >= 400 && error.status < 600 ? error.status : 500;
  return res.status(status).json({
    error: (error && error.code) || 'RECORDING_FAILED',
    message: status < 500 && error && error.message
      ? error.message
      : 'Recording request could not be completed.'
  });
}

async function ownedSession(req, sessionId) {
  const session = await db.findSession(String(sessionId || ''));
  if (!session) {
    const error = new Error('Session does not exist.');
    error.code = 'SESSION_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  if (!req.user || req.user.role !== 'trainer' || !auth.canAccessSession(req.user, session)) {
    const error = new Error('You are not the trainer of this session.');
    error.code = 'FORBIDDEN';
    error.status = 403;
    throw error;
  }
  return session;
}

router.post('/start', auth.requireAuth, auth.requireRole('trainer'),
  requireTrainerAccess(), async function (req, res) {
    try {
      const sessionId = String((req.body || {}).sessionId || '').trim();
      await ownedSession(req, sessionId);
      const recording = await egress.startRecording({ sessionId: sessionId });
      return res.status(201).json({ recording: recording });
    } catch (error) {
      return safeError(res, error);
    }
  });

router.post('/stop', auth.requireAuth, auth.requireRole('trainer'),
  requireTrainerAccess(), async function (req, res) {
    try {
      const recordingId = String((req.body || {}).recordingId || '').trim();
      const existing = await db.findRecording(recordingId);
      if (!existing) {
        const error = new Error('Recording not found.');
        error.code = 'RECORDING_NOT_FOUND';
        error.status = 404;
        throw error;
      }
      await ownedSession(req, existing.sessionId);
      const recording = await egress.stopRecording({ recordingId: recordingId });
      return res.json({ recording: recording });
    } catch (error) {
      return safeError(res, error);
    }
  });

module.exports = router;
