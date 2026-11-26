const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const agoraTokens = require('../services/agoraTokenService');
const masteryGating = require('../services/masteryGating');
const presenceService = require('../services/presenceService');
const notifications = require('../services/notificationService');
const mediaPermission = require('../services/mediaPermissionService');
const networkQuality = require('../services/networkQualityService');
const sessionAccess = require('../services/sessionAccessService');
const badges = require('../services/badgeService');
const celebrations = require('../services/celebrationService');
const reactions = require('../services/reactionService');
const reactionPermission = require('../services/reactionPermissionService');
const appPolicy = require('../config/policy.json');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.loadSession);

router.get('/:sessionId/state', function (req, res) {
  const state = serializers.toSessionState(req.sessionRecord, req.user);
  return res.json({ state: state });
});

router.post('/:sessionId/rtc-token', function (req, res) {
  try {
    /* The room opens ten minutes early for the two real participants. Founder
       entry is never implicit: it needs an explicit observer request and is
       announced to both participants. */
    const options = Object.assign({}, req.body || {}, req.query || {});
    const access = sessionAccess.evaluate(req.sessionRecord, req.user, options);
    if (!access.canEnter) {
      return res.status(access.status).json({
        error: access.code,
        message: access.reason,
        roomAccess: access
      });
    }

    let liveSession = req.sessionRecord;
    let observerChanged = false;
    if (access.observer) {
      observerChanged = sessionAccess.setObserver(req.sessionRecord, req.user,
        new Date().toISOString()).changed;
      const updated = db.updateSession(req.sessionRecord.id, function (session) {
        return sessionAccess.setObserver(session, req.user, new Date().toISOString()).session;
      });
      if (updated) liveSession = updated;
    }

    /* Both verified participants must pass a fresh connection check. A browser
       cannot opt out, downgrade the threshold or start a call for its peer. */
    if (!networkQuality.bothReady(liveSession)) {
      throw Object.assign(new Error(
        'Both people must pass the connection speed check before the class can start.'
      ), { code: 'NETWORK_BELOW_MINIMUM', status: 409 });
    }

    const rtc = agoraTokens.issueSessionToken(liveSession, req.user);
    const respond = function () {
      return res.json({ rtc: rtc, roomAccess: access });
    };
    if (observerChanged) {
      return realtime.publish(liveSession.id, 'founder.observer.changed',
        sessionAccess.eventPayload(liveSession)).then(respond);
    }
    return respond();
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'RTC_TOKEN_FAILED',
      message: error.message
    });
  }
});

/* Browser-safe session events. This is the fallback transport when Supabase
   Realtime is not configured. Payloads are scrubbed again here: correctness,
   answer keys, hints and trainer notes are never put on a shared channel. */
const SHARED_EVENTS = [
  'quiz.launched', 'quiz.answer.saved', 'quiz.answer.revealed',
  'quiz.question.changed', 'quiz.reteach.started', 'quiz.check.added',
  'quiz.assistance.granted', 'quiz.completed', 'session.ended', 'page.changed',
  'chat.sent', 'board.shared', 'rtc.media.control.changed', 'network.check.completed',
  'badge.awarded', 'shared.celebration', 'reaction.sent', 'reaction.permission.changed',
  'founder.observer.changed'
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

/* A celebration is a server-owned recognition event, never a client-written
   message. The client may only offer a preference id, which the service
   validates against the config allowlist. */
function fireCelebration(req, triggerName) {
  const session = req.sessionRecord;
  const body = req.body || {};
  const student = db.findUserById(session.studentId);
  const payload = celebrations.evaluateTrigger(triggerName, {
    sessionId: session.id,
    trigger: triggerName,
    studentName: student && student.name ? student.name : 'Student',
    quizActive: Boolean(session.quiz && (session.quiz.phase === 'answering' || session.quiz.phase === 'reteach')),
    studentPref: body.studentPref,
    trainerPref: body.trainerPref,
    now: Date.now()
  });
  if (!payload) return Promise.resolve(null);
  return realtime.publish(session.id, 'shared.celebration', payload).then(function (event) {
    return { payload: payload, seq: event && event.seq };
  });
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

/* Session chat. Only the two verified participants can reach this route, and
   the sender identity is derived from the JWT. No trainer-only fields travel
   through the event stream. */
router.post('/:sessionId/chat', function (req, res) {
  const text = String((req.body || {}).text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  if (!text) {
    return res.status(400).json({ error: 'EMPTY_MESSAGE', message: 'Enter a message before sending.' });
  }

  const message = {
    id: 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    from: req.user.role === 'student' ? 'student' : 'trainer',
    text: text,
    at: new Date().toISOString()
  };
  return realtime.publish(req.sessionRecord.id, 'chat.sent', message).then(function (event) {
    return res.status(201).json({ message: message, seq: event.seq });
  });
});

/* Board sharing is a state notification only. Ink data stays on the trusted
   canvas/realtime path; this event carries no drawing content. */
router.post('/:sessionId/board/share', auth.requireRole('trainer', 'founder'), function (req, res) {
  const shared = (req.body || {}).shared !== false;
  return realtime.publish(req.sessionRecord.id, 'board.shared', { shared: shared }).then(function (event) {
    return res.json({ ok: true, shared: shared, seq: event.seq });
  });
});

/* Trainer-owned student media controls. The student can never set this flag;
   revoking it marks audio and camera as forced on before the client locks the
   buttons. */
router.post('/:sessionId/media-permission', auth.requireRole('trainer', 'founder'), function (req, res) {
  const allowed = (req.body || {}).studentCanToggleMedia;
  if (typeof allowed !== 'boolean') {
    return res.status(400).json({
      error: 'INVALID_MEDIA_PERMISSION',
      message: 'studentCanToggleMedia must be true or false.'
    });
  }
  const next = mediaPermission.setPermission(req.sessionRecord.mediaPermissions, allowed);
  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.mediaPermissions = next;
    return session;
  });
  if (!updated) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  return realtime.publish(updated.id, 'rtc.media.control.changed', mediaPermission.eventPayload(next))
    .then(function (event) {
      return res.json({ ok: true, mediaPermissions: next, seq: event.seq });
    });
});

/* Trainer-only intentional media state. This is separate from Access: a
   trainer can mute the kid or switch their camera off even while controls are
   locked. The browser reports honestly whether the track actually changed. */
router.post('/:sessionId/media-state', auth.requireRole('trainer', 'founder'), function (req, res) {
  const body = req.body || {};
  const hasMic = typeof body.micOn === 'boolean';
  const hasCamera = typeof body.cameraOn === 'boolean';
  if (!hasMic && !hasCamera) {
    return res.status(400).json({
      error: 'INVALID_MEDIA_STATE',
      message: 'Send micOn or cameraOn as true or false.'
    });
  }
  const next = mediaPermission.setRemoteState(req.sessionRecord.mediaPermissions, {
    micOn: body.micOn,
    cameraOn: body.cameraOn
  });
  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.mediaPermissions = next;
    return session;
  });
  if (!updated) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  return realtime.publish(updated.id, 'rtc.media.control.changed', mediaPermission.eventPayload(next))
    .then(function (event) {
      return res.json({ ok: true, mediaPermissions: next, seq: event.seq });
    });
});

/* Trainer-only applause permission. Disabling it only blocks the kid's 👏
   gesture; trainer feedback, celebrations and media controls are unaffected. */
router.post('/:sessionId/reaction-permission', auth.requireRole('trainer', 'founder'), function (req, res) {
  const body = req.body || {};
  const hasReact = typeof body.studentCanReact === 'boolean';
  const hasApplaud = typeof body.studentCanApplaud === 'boolean';
  if (!hasReact && !hasApplaud) {
    return res.status(400).json({
      error: 'INVALID_REACTION_PERMISSION',
      message: 'Send studentCanReact or studentCanApplaud as true or false.'
    });
  }
  const next = reactionPermission.setPermission(req.sessionRecord.reactionPermissions, {
    studentCanReact: body.studentCanReact,
    studentCanApplaud: body.studentCanApplaud
  });
  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.reactionPermissions = next;
    return session;
  });
  if (!updated) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  return realtime.publish(updated.id, 'reaction.permission.changed', reactionPermission.eventPayload(next))
    .then(function (event) {
      return res.json({ ok: true, reactionPermissions: next, seq: event.seq });
    });
});

/* Both participants report their own connection result. The role is derived
   from the JWT, so a student cannot submit a passing trainer measurement. */
router.post('/:sessionId/network-check', function (req, res) {
  const validation = networkQuality.validateMeasurement(req.body || {});
  if (!validation.ok) {
    return res.status(400).json({ error: 'INVALID_NETWORK_CHECK', message: validation.error });
  }
  const role = networkQuality.roleFor(req.user);
  const result = networkQuality.evaluate(validation.value);
  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.networkChecks = Object.assign({}, session.networkChecks || {});
    session.networkChecks[role] = result;
    return session;
  });
  if (!updated) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  return realtime.publish(
    updated.id,
    'network.check.completed',
    networkQuality.eventPayload(updated, role, result)
  ).then(function (event) {
    return res.json({
      ok: result.ok,
      network: networkQuality.stateFor(updated, req.user),
      seq: event.seq
    });
  });
});

/* Fixed-catalog reward badges. The trainer picks a badge id; label and points
   come from policy. The student record receives only safe trophy fields. */
router.post('/:sessionId/badges', auth.requireRole('trainer', 'founder'), function (req, res) {
  const record = badges.award((req.body || {}).badgeId, req.sessionRecord.id, req.user.id);
  if (!record) {
    return res.status(400).json({
      error: 'UNKNOWN_BADGE',
      message: 'Choose one of the approved reward badges.'
    });
  }
  const trophy = badges.forStudent({ badges: [record] })[0];
  const updatedSession = db.updateSession(req.sessionRecord.id, function (session) {
    session.badges = (Array.isArray(session.badges) ? session.badges : []).concat([record]);
    return session;
  });
  if (!updatedSession) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  db.updateUser(req.sessionRecord.studentId, function (student) {
    student.badges = (Array.isArray(student.badges) ? student.badges : []).concat([record]);
    student.trophyPoints = badges.pointsFor(student);
    return student;
  });
  return realtime.publish(req.sessionRecord.id, 'badge.awarded', badges.eventPayload(record))
    .then(function (event) {
      return res.status(201).json({ ok: true, badge: trophy, seq: event.seq });
    });
});

/* Trainer kudos uses the shared celebration system. The request cannot write
   copy, colors, sound, correctness or a trainer note — only a trigger id. */
router.post('/:sessionId/celebrate', auth.requireRole('trainer', 'founder'), function (req, res) {
  const trigger = String((req.body || {}).trigger || '');
  if (trigger !== 'trainer_kudos') {
    return res.status(400).json({
      error: 'UNKNOWN_TRIGGER',
      message: 'Only trainer kudos can be started from the classroom.'
    });
  }
  return fireCelebration(req, trigger).then(function (result) {
    return res.json({ fired: Boolean(result), celebration: result ? result.payload : null, seq: result && result.seq });
  });
});

/* Reaction gestures stay on their own layer. The role comes from the JWT, so
   a student cannot send a trainer-only gesture or inject celebration copy. */
router.post('/:sessionId/reactions', function (req, res) {
  const emoji = String((req.body || {}).emoji || '');
  const permission = reactionPermission.normalize(req.sessionRecord.reactionPermissions);
  if (req.user.role === 'student' &&
      ((emoji === '👏' && !permission.studentCanApplaud) ||
       (emoji !== '👏' && !permission.studentCanReact))) {
    return res.status(403).json({
      error: 'REACTION_NOT_PERMITTED',
      message: emoji === '👏'
        ? 'Your trainer has paused applause for this session.'
        : 'Your trainer has paused emoji reactions for this session.'
    });
  }
  const row = reactions.record(req.sessionRecord, req.user, req.body || {});
  if (!row) {
    return res.status(400).json({
      error: 'INVALID_REACTION',
      message: 'Choose a reaction allowed for your role.'
    });
  }
  return realtime.publish(req.sessionRecord.id, 'reaction.sent', reactions.eventPayload(row, req.user))
    .then(function (event) {
      return res.status(201).json({ ok: true, seq: event && event.seq });
    });
});

/* Parent recap handoff. Delivery channels are optional; the always-safe reply
   tells the trainer whether a configured channel actually accepted the note. */
router.post('/:sessionId/notify-parent', auth.requireRole('trainer', 'founder'), async function (req, res) {
  const body = req.body || {};
  const note = String(body.note || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const result = await notifications.notifyParentRecap({
    sessionId: req.sessionRecord.id,
    studentName: req.sessionRecord.studentName || 'the student',
    trainerName: req.user.name || 'your trainer',
    note: note
  });
  return res.json({ ok: true, delivery: result });
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
  const hasScoreOverride = Object.prototype.hasOwnProperty.call(body, 'currentQuizScore');
  if (hasScoreOverride) {
    if (typeof body.currentQuizScore !== 'number' || !Number.isFinite(body.currentQuizScore) ||
        body.currentQuizScore < 0 || body.currentQuizScore > 100) {
      return res.status(400).json({
        error: 'INVALID_SCORE',
        message: 'currentQuizScore must be a number from 0 to 100.'
      });
    }
    if (config.isProduction && !String(body.overrideReason || '').trim()) {
      return res.status(400).json({
        error: 'OVERRIDE_REASON_REQUIRED',
        message: 'A trainer override requires an audit reason in production.'
      });
    }
  }
  const scoreOverride = hasScoreOverride ? body.currentQuizScore : serializers.readiness(session);
  const scoreSource = hasScoreOverride ? 'trainer-override' : 'recorded-attempts';
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
  const observerWasActive = Boolean(session.founderObserver && session.founderObserver.active);
  const updated = db.updateSession(session.id, function (current) {
    current.status = 'ended';
    current.founderObserver = sessionAccess.clearObserver(current, endedAt).session.founderObserver;
    current.endsAt = endedAt;
    current.quiz.status = current.quiz.status === 'live' ? 'ended' : current.quiz.status;
    current.masteryGating = gating;
    current.scoreSource = scoreSource;
    if (hasScoreOverride) current.overrideReason = String(body.overrideReason || '').slice(0, 500);
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

  /* One end-of-session celebration only. The priority is milestone → mastery
     gate → session complete, so a child never sees stacked overlays. */
  const studentSessions = db.listSessionsForUser({ id: session.studentId, role: 'student' });
  const priorEnded = studentSessions.filter(function (item) {
    return item.status === 'ended' && item.id !== session.id;
  }).length;
  const endTrigger = priorEnded === 0
    ? 'first_session_completed'
    : (gating.unlockedNext ? 'mastery_gate_crossed' : 'session_complete');
  fireCelebration(req, endTrigger);

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
