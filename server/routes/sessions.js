const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const agora = require('../realtime/agora');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.loadSession);

router.get('/:sessionId/state', function (req, res) {
  return res.json({ state: serializers.toSessionState(req.sessionRecord, req.user) });
});

router.post('/:sessionId/rtc-token', function (req, res) {
  return res.json({ rtc: agora.issueRtcToken(req.sessionRecord, req.user) });
});

router.post('/:sessionId/end', auth.requireRole('trainer', 'founder'), function (req, res) {
  const session = req.sessionRecord;
  if (session.status === 'ended') {
    return res.status(409).json({ error: 'SESSION_ALREADY_ENDED', message: 'This session is already ended.' });
  }

  const endedAt = new Date().toISOString();
  const updated = db.updateSession(session.id, function (current) {
    current.status = 'ended';
    current.endsAt = endedAt;
    current.quiz.status = current.quiz.status === 'live' ? 'ended' : current.quiz.status;
    current.recording = current.recording || {
      url: 'https://recordings.mathify.local/' + current.id,
      durationSeconds: current.elapsedSeconds,
      readyAt: endedAt
    };
    return current;
  });

  realtime.publish(updated.id, 'session.ended', { endedAt: endedAt });

  return res.json({
    recap: {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      endedAt: endedAt,
      recordingUrl: updated.recording.url,
      pagesCompleted: updated.currentPage,
      quizAttempts: updated.quiz.attempts.length,
      readiness: serializers.readiness(updated),
      trainerView: req.user.role === 'trainer' || req.user.role === 'founder'
    }
  });
});

module.exports = router;
