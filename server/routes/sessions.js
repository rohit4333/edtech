const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const agora = require('../realtime/agora');
const masteryGating = require('../services/masteryGating');
const presenceService = require('../services/presenceService');
const appPolicy = require('../config/policy.json');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.loadSession);

router.get('/:sessionId/state', function (req, res) {
  return res.json({ state: serializers.toSessionState(req.sessionRecord, req.user) });
});

router.post('/:sessionId/rtc-token', function (req, res) {
  return res.json({ rtc: agora.issueRtcToken(req.sessionRecord, req.user) });
});

/* Automated presence. Role always comes from the JWT, never the request body. */
router.get('/:sessionId/presence', function (req, res) {
  return res.json({ presence: presenceService.stateFor(req.sessionRecord, req.user) });
});

router.post('/:sessionId/presence', function (req, res) {
  try {
    presenceService.heartbeat(req.user, req.sessionRecord, req.body || {});
    return res.json({ presence: presenceService.stateFor(req.sessionRecord, req.user) });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'PRESENCE_FAILED',
      message: error.message
    });
  }
});

router.post('/:sessionId/presence/finalize', auth.requireRole('trainer', 'founder'), function (req, res) {
  return res.json({ snapshot: presenceService.finalize(req.sessionRecord) });
});

router.post('/:sessionId/end', auth.requireRole('trainer', 'founder'), function (req, res) {
  const session = req.sessionRecord;
  if (session.status === 'ended') {
    return res.status(409).json({ error: 'SESSION_ALREADY_ENDED', message: 'This session is already ended.' });
  }

  const body = req.body || {};
  const scoreOverride = Object.prototype.hasOwnProperty.call(body, 'currentQuizScore')
    ? body.currentQuizScore
    : serializers.readiness(session);
  const topicId = session.topicId || session.title || 'general-mathematics';
  const unlockThreshold = masteryGating.configuredThreshold(
    appPolicy.quiz && appPolicy.quiz.unlockThreshold
  );
  const gating = masteryGating.checkMasteryGating(
    session.studentId,
    topicId,
    scoreOverride,
    unlockThreshold
  );
  const finalScore = gating.currentScore;

  const endedAt = new Date().toISOString();
  const updated = db.updateSession(session.id, function (current) {
    current.status = 'ended';
    current.endsAt = endedAt;
    current.quiz.status = current.quiz.status === 'live' ? 'ended' : current.quiz.status;
    current.masteryGating = gating;
    current.reteachRequired = gating.reteachRequired;
    current.unlockedNext = gating.unlockedNext;
    if (gating.reteachRequired) current.currentTopicId = topicId;
    if (gating.unlockedNext) current.nextTopicUnlocked = true;
    current.recording = current.recording || {
      url: 'https://recordings.mathify.local/' + current.id,
      durationSeconds: current.elapsedSeconds,
      readyAt: endedAt
    };
    return current;
  });

  db.updateUser(session.studentId, function (student) {
    student.mastery = finalScore;
    student.masteryByTopic = student.masteryByTopic || {};
    student.masteryByTopic[topicId] = {
      score: finalScore,
      reteachRequired: gating.reteachRequired,
      unlockedNext: gating.unlockedNext,
      currentTopicId: gating.reteachRequired ? topicId : (student.currentTopicId || topicId),
      updatedAt: gating.checkedAt
    };
    student.reteachRequired = gating.reteachRequired;
    student.unlockedNext = gating.unlockedNext;
    student.currentTopicId = gating.reteachRequired ? topicId : student.currentTopicId;
    if (gating.unlockedNext) student.nextTopicUnlocked = true;
    return student;
  });

  const presence = presenceService.finalize(updated, endedAt);

  realtime.publish(updated.id, 'session.ended', {
    endedAt: endedAt,
    unlockedNext: gating.unlockedNext,
    reteachRequired: gating.reteachRequired
  });

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
      score: finalScore,
      unlockedNext: gating.unlockedNext,
      reteachRequired: gating.reteachRequired,
      currentScore: gating.currentScore,
      masteryGating: gating,
      presence: presence,
      trainerView: req.user.role === 'trainer' || req.user.role === 'founder'
    },
    presence: presence,
    unlockedNext: gating.unlockedNext,
    reteachRequired: gating.reteachRequired,
    currentScore: gating.currentScore
  });
});

module.exports = router;
