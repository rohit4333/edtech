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

/* Browser-safe session events. This is the fallback transport when Supabase
   Realtime is not configured. Payloads are scrubbed again here: correctness,
   answer keys, hints and trainer notes are never put on a shared channel. */
const SHARED_EVENTS = [
  'quiz.launched', 'quiz.answer.saved', 'quiz.answer.revealed',
  'quiz.question.changed', 'quiz.reteach.started', 'quiz.check.added',
  'quiz.completed', 'session.ended', 'page.changed'
];
const FORBIDDEN_KEY = /answer|correct|hint|why|explain|trainer|instruction|misconception|key/i;

function safePayload(value, depth) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(function (item) { return safePayload(item, (depth || 0) + 1); });
  if ((depth || 0) > 4) return undefined;
  const clean = {};
  Object.keys(value).forEach(function (key) {
    if (FORBIDDEN_KEY.test(key)) return;
    const safe = safePayload(value[key], (depth || 0) + 1);
    if (safe !== undefined) clean[key] = safe;
  });
  return clean;
}

router.get('/:sessionId/events', function (req, res) {
  const since = Number(req.query.since) || 0;
  const events = realtime.forSession(req.sessionRecord.id, since, req.query.limit)
    .filter(function (message) { return SHARED_EVENTS.indexOf(message.event) !== -1; })
    .map(function (message) {
      return {
        seq: message.seq,
        at: message.at,
        event: message.event,
        payload: safePayload(message.payload, 0) || {}
      };
    });
  return res.json({ sessionId: req.sessionRecord.id, mode: realtime.mode, events: events });
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
  /* The trainer may attach a recap and recording link. Only small, scalar
     fields are persisted; status, score and answer data stay server-owned. */
  const RECAP_KEYS = ['summary', 'highlights', 'homework', 'pagesCompleted', 'durationSeconds'];
  const safeRecap = {};
  if (body.recap && typeof body.recap === 'object' && !Array.isArray(body.recap)) {
    RECAP_KEYS.forEach(function (key) {
      const value = body.recap[key];
      if (typeof value === 'string') safeRecap[key] = value.slice(0, 2000);
      else if (typeof value === 'number' && Number.isFinite(value)) safeRecap[key] = value;
      else if (Array.isArray(value) && value.every(function (item) { return typeof item === 'string'; })) {
        safeRecap[key] = value.slice(0, 20).map(function (item) { return item.slice(0, 300); });
      }
    });
  }
  const recordingUrl = typeof body.recordingUrl === 'string' &&
    /^https?:\/\//i.test(body.recordingUrl.trim())
    ? body.recordingUrl.trim().slice(0, 500) : null;
  const scoreOverride = Object.prototype.hasOwnProperty.call(body, 'currentQuizScore')
    ? body.currentQuizScore
    : serializers.readiness(session);
  const topicId = session.topicId || session.title || 'general-mathematics';
  const currentLevel = masteryGating.levelFromSession(session);
  const pendingCheck = masteryGating.pendingParallelCheck(session);
  if (pendingCheck && body.force !== true) {
    return res.status(409).json({
      error: 'PARALLEL_CHECK_REQUIRED',
      message: 'Solve the parallel check before ending the session, or force with trainer override.',
      questionId: pendingCheck.id
    });
  }
  const unlockThreshold = masteryGating.configuredThreshold(
    appPolicy.quiz && appPolicy.quiz.unlockThreshold
  );
  const gating = masteryGating.checkMasteryGating(
    session.studentId,
    topicId,
    scoreOverride,
    unlockThreshold,
    currentLevel
  );
  const finalScore = gating.currentScore;

  const endedAt = new Date().toISOString();
  const updated = db.updateSession(session.id, function (current) {
    current.status = 'ended';
    current.endsAt = endedAt;
    current.quiz.status = current.quiz.status === 'live' ? 'ended' : current.quiz.status;
    current.masteryGating = gating;
    current.currentLevel = currentLevel;
    current.reteachRequired = gating.reteachRequired;
    current.unlockedNext = gating.unlockedNext;
    if (gating.reteachRequired) current.currentTopicId = topicId;
    if (gating.unlockedNext) current.nextTopicUnlocked = true;
    current.recording = Object.assign(current.recording || {
      url: 'https://recordings.mathify.local/' + current.id,
      durationSeconds: current.elapsedSeconds,
      readyAt: endedAt
    }, recordingUrl ? { url: recordingUrl, readyAt: endedAt } : {});
    if (Object.keys(safeRecap).length) {
      current.recap = Object.assign({}, current.recap || {}, safeRecap, { savedAt: endedAt });
    }
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
      currentLevel: currentLevel,
      requiredScore: gating.requiredScore,
      rule: gating.rule,
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
    recap: Object.assign({
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
      currentLevel: currentLevel,
      requiredScore: gating.requiredScore,
      rule: gating.rule,
      masteryGating: gating,
      presence: presence,
      trainerView: req.user.role === 'trainer' || req.user.role === 'founder'
    }, updated.recap || {}),
    presence: presence,
    unlockedNext: gating.unlockedNext,
    reteachRequired: gating.reteachRequired,
    currentScore: gating.currentScore,
    currentLevel: currentLevel
  });
});

module.exports = router;
