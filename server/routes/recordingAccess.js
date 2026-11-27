/* Authorized, short-lived links to private session recordings.
 *
 * Every signed-in role can watch a recording it is entitled to: founder and
 * relationship manager review any class; trainer, student and parent are
 * scoped to their own 1:1 session. No permanent URL is ever stored or sent.
 */

const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const recordings = require('../services/recordingAccessService');

const router = express.Router();
const throttle = rateLimit.createLimiter({
  name: 'recording-access', windowMs: 60000, max: 30
});
router.use(throttle);
router.use(auth.requireAuth);
router.use(auth.requireClassAccess);

function isReady(recording) {
  return Boolean(recording && recording.objectKey && recording.status === 'stopped');
}

function readyRecording(session, rows) {
  if (isReady(session.recording)) return session.recording;
  return rows.find(function (row) {
    return row.sessionId === session.id && isReady(row);
  }) || null;
}

function safeList(session, recording) {
  return {
    sessionId: session.id,
    recordingId: recording.id || null,
    title: session.title || null,
    status: 'stopped',
    available: true,
    durationSeconds: Number(recording.durationSeconds) || 0,
    readyAt: recording.readyAt || recording.stoppedAt || null,
    /* Watch links are minted on demand after this role check. */
    url: null
  };
}

function failure(res, error) {
  const status = error && error.status >= 400 && error.status < 600 ? error.status : 502;
  return res.status(status).json({
    error: (error && error.code) || 'RECORDING_ACCESS_FAILED',
    message: status < 500 && error && error.message
      ? error.message
      : 'A private recording link could not be created.'
  });
}

router.get('/', async function (req, res) {
  try {
    const broad = req.user.role === 'founder' || req.user.role === 'relationship_manager';
    const sessions = await Promise.resolve(broad
      ? db.listAllSessions()
      : db.listSessionsForUser(req.user));
    const rows = await Promise.resolve(db.listRecordings());
    const items = sessions
      .filter(function (session) { return auth.canAccessRecording(req.user, session); })
      .map(function (session) {
        const recording = readyRecording(session, rows);
        return recording ? safeList(session, recording) : null;
      })
      .filter(Boolean);
    return res.json({ recordings: items });
  } catch (error) {
    return failure(res, error);
  }
});

router.get('/:sessionId/url', async function (req, res) {
  try {
    const session = await Promise.resolve(db.findSession(req.params.sessionId));
    if (!session) {
      return res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'Session does not exist.'
      });
    }
    if (!auth.canAccessRecording(req.user, session)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You are not allowed to watch this recording.'
      });
    }

    const rows = await Promise.resolve(db.listRecordings());
    const recording = readyRecording(session, rows);
    if (!recording) {
      return res.status(404).json({
        error: 'RECORDING_NOT_READY',
        message: 'No finished private recording is available for this session.'
      });
    }

    const link = await recordings.signedUrl(
      req.params.sessionId, recording.objectKey, req.query.expiresIn
    );
    return res.json({
      sessionId: req.params.sessionId,
      recordingId: recording.id || null,
      url: link.url,
      expiresAt: link.expiresAt,
      expiresInSeconds: link.expiresInSeconds
    });
  } catch (error) {
    return failure(res, error);
  }
});

module.exports = router;
