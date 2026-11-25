const express = require('express');
const db = require('../db');
const realtime = require('../realtime');

const router = express.Router();

router.post('/recording', function (req, res) {
  const configuredSecret = process.env.RECORDING_WEBHOOK_SECRET;
  if (configuredSecret && req.headers['x-webhook-secret'] !== configuredSecret) {
    return res.status(401).json({ error: 'INVALID_WEBHOOK_SECRET' });
  }

  const body = req.body || {};
  if (!body.sessionId || !body.url) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'sessionId and url are required.' });
  }

  const updated = db.updateSession(body.sessionId, function (session) {
    session.recording = {
      url: String(body.url),
      durationSeconds: Number(body.durationSeconds || session.elapsedSeconds || 0),
      readyAt: new Date().toISOString()
    };
    return session;
  });

  if (!updated) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
  }

  realtime.publish(updated.id, 'recording.ready', { url: updated.recording.url });
  return res.json({ ok: true, sessionId: updated.id });
});

module.exports = router;
