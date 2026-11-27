const express = require('express');
const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const livekitTokens = require('../services/livekitTokenService');
const masteryGating = require('../services/masteryGating');
const presenceService = require('../services/presenceService');
const notifications = require('../services/notificationService');
const mediaPermission = require('../services/mediaPermissionService');
const networkQuality = require('../services/networkQualityService');
const sessionAccess = require('../services/sessionAccessService');
const livekitEgress = require('../services/livekitEgressService');
const badges = require('../services/badgeService');
const celebrations = require('../services/celebrationService');
const reactions = require('../services/reactionService');
const reactionPermission = require('../services/reactionPermissionService');
const appPolicy = require('../config/policy.json');
const requireTrainerAccess = require('../middleware/trainerAccess');
const demoService = require('../services/demoService');
const sessionTiming = require('../services/sessionTimingService');
const cursorRelay = require('../services/cursorRelay');

const router = express.Router();

router.use(auth.requireAuth);
/* A trainer awaiting founder approval cannot open session state, chat, board
   ink, media controls or any other classroom surface. */
router.use(requireTrainerAccess());
router.use(auth.loadSession);
/* Post-demo logins still work for payments and policies, but never for class
   content until a pack has been credited. */
router.use(auth.requireClassAccess);

router.get('/:sessionId/state', async function (req, res) {
  const state = await serializers.toSessionState(req.sessionRecord, req.user);
  return res.json({ state: state });
});

/* Camera-check room only. It never writes presence or starts the clock: the
   server-owned preview room name is ignored by the LiveKit presence webhook. */
router.post('/:sessionId/preview-token', function (req, res, next) {
  const access = sessionAccess.evaluate(req.sessionRecord, req.user, req.body || {});
  if (!access.canEnter || access.observer === true) {
    return res.status(access.status || 403).json({
      error: access.code || 'PREVIEW_ACCESS_DENIED',
      message: access.reason || 'This camera check is not available.',
      roomAccess: access
    });
  }
  return Promise.resolve(livekitTokens.issueSessionToken(req.sessionRecord, req.user, { preview: true }))
    .then(function (rtc) { return res.json({ rtc: rtc, roomAccess: access }); })
    .catch(next);
});

router.post('/:sessionId/rtc-token', async function (req, res) {
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
      const updated = await db.updateSession(req.sessionRecord.id, function (session) {
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

    const rtc = await livekitTokens.issueSessionToken(liveSession, req.user, {
      observer: access.observer === true
    });
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
  'chat.sent', 'board.shared', 'board.ink', 'rtc.media.control.changed', 'network.check.completed',
  'badge.awarded', 'shared.celebration', 'reaction.sent', 'reaction.permission.changed',
  'founder.observer.changed', 'ide.state.updated', 'challenge.published',
  'session.warning', 'session.auto_closed', 'participant.joined', 'participant.left'
];
/* The five-minute class-end ping is a staff cue only. It stays in the durable
   outbox for the trainer desk, but the browser-safe events route never releases
   it to a child. Join and leave pings are deliberately shared with both peers. */
const TRAINER_ONLY_EVENTS = ['session.warning'];
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
async function fireCelebration(session, body, triggerName) {
  const preferences = body || {};
  const student = await db.findUserById(session.studentId);
  const payload = celebrations.evaluateTrigger(triggerName, {
    sessionId: session.id,
    trigger: triggerName,
    studentName: student && student.name ? student.name : 'Student',
    quizActive: Boolean(session.quiz && (session.quiz.phase === 'answering' || session.quiz.phase === 'reteach')),
    studentPref: preferences.studentPref,
    trainerPref: preferences.trainerPref,
    now: Date.now()
  });
  if (!payload) return Promise.resolve(null);
  return realtime.publish(session.id, 'shared.celebration', payload).then(function (event) {
    return { payload: payload, seq: event && event.seq };
  });
}

router.get('/:sessionId/events', async function (req, res) {
  const since = Number(req.query.since) || 0;
  /* Live mode reads the Supabase outbox asynchronously; the allowlist and
     scrub below see the resolved events either way. */
  const events = await realtime.forSession(req.sessionRecord.id, since, req.query.limit);
  /* The desk and classroom poll this route. Conditional caching would let a
     browser keep serving an empty 304 after a new warning or join/leave ping
     is appended, so every poll must reach the server. */
  res.set('Cache-Control', 'no-store');
  const staffView = Boolean(req.user && (req.user.role === 'trainer' || req.user.role === 'founder'));
  const visible = (Array.isArray(events) ? events : [])
    .filter(function (message) {
      return SHARED_EVENTS.indexOf(message.event) !== -1 &&
        (staffView || TRAINER_ONLY_EVENTS.indexOf(message.event) === -1);
    })
    .map(function (message) {
      return {
        seq: message.seq,
        at: message.at,
        event: message.event,
        payload: safePayload(message.payload, 0) || {}
      };
    });
  return res.json({ sessionId: req.sessionRecord.id, mode: realtime.mode, events: visible });
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

/* Board sharing is a state notification only. Ink travels over this separate,
   trainer-only endpoint so the state event itself never carries drawing data. */
router.post('/:sessionId/board/share', auth.requireRole('trainer', 'founder'), function (req, res) {
  const shared = (req.body || {}).shared !== false;
  return realtime.publish(req.sessionRecord.id, 'board.shared', { shared: shared }).then(function (event) {
    return res.json({ ok: true, shared: shared, seq: event.seq });
  });
});

/* Full-board ink is session-scoped and trainer-owned. Coordinates are
   normalised 0–1, colours and tools are allowlisted, and payload sizes are
   bounded. No text, answer key or trainer note is accepted here. */
const BOARD_SHAPES = new Set([
  'square', 'rectangle', 'circle', 'triangle', 'diamond', 'pentagon',
  'hexagon', 'star', 'parallelogram', 'line', 'arrow', 'double-arrow',
  'dashed', 'dotted'
]);
const BOARD_TOOLS = new Set(['pen', 'highlighter', 'marker', 'eraser'].concat(Array.from(BOARD_SHAPES)));
const BOARD_COLORS = new Set([
  'ink', 'coral', 'teal', 'amber', 'blue', 'violet',
  'green', 'pink', 'orange', 'slate'
]);
const BOARD_WEIGHTS = new Set(['thin', 'normal', 'bold']);

function cleanInkStroke(value) {
  if (!value || typeof value !== 'object') return null;
  const points = Array.isArray(value.points) ? value.points.slice(0, 2000).map(function (point) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }).filter(Boolean) : [];
  if (!points.length) return null;
  const ink = {
    tool: BOARD_TOOLS.has(value.tool) ? value.tool : 'pen',
    color: BOARD_COLORS.has(value.color) ? value.color : 'ink',
    weight: BOARD_WEIGHTS.has(value.weight) ? value.weight : 'normal',
    points: points
  };
  /* Shape geometry is two endpoints; the shape name is allowlisted so no free
     form teaching text or hidden field can ride along with the ink. */
  if (BOARD_SHAPES.has(value.tool)) ink.shape = value.tool;
  return ink;
}

/* A trainer may paste a screenshot from the private planner. Only raster data
   URLs are accepted, sizes are bounded, and no free-form text is carried. */
const IMAGE_CAP = 1500000;

function normalised(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

function cleanImage(value) {
  if (!value || typeof value !== 'object') return null;
  const data = typeof value.data === 'string' ? value.data : '';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(data) ||
      data.length > IMAGE_CAP) {
    return null;
  }
  return {
    id: String(value.id || 'img_' + Date.now()).slice(0, 80),
    data: data,
    x: normalised(value.x, 0.2),
    y: normalised(value.y, 0.2),
    w: normalised(value.w, 0.6),
    h: normalised(value.h, 0.6)
  };
}

function cleanSnapshotItem(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'image' || value.type === 'image') {
    const image = cleanImage(value.image || value);
    return image ? { kind: 'image', image: image } : null;
  }
  const ink = cleanInkStroke(value.ink || value);
  return ink ? { kind: 'stroke', ink: ink } : null;
}

/* The trainer's pointer is a live teaching cue, not board content. It uses an
   ephemeral latest-position relay so high-frequency moves never flood the
   durable event stream that also carries the class warning and close cues. */
router.post('/:sessionId/cursor', auth.requireRole('trainer', 'founder'), function (req, res) {
  const body = req.body || {};
  const cursor = cursorRelay.publish(req.sessionRecord.id, {
    surface: body.surface,
    x: body.x,
    y: body.y,
    active: body.active
  });
  if (!cursor) {
    return res.status(422).json({
      error: 'INVALID_CURSOR',
      message: 'A normalised board or sketch pointer position is required.'
    });
  }
  return res.json({ ok: true, cursor: cursor });
});

/* Both verified participants may read the same pointer. A null cursor means
   "nothing newer than this seq", which lets a child hide a stale pointer. */
router.get('/:sessionId/cursor', function (req, res) {
  res.set('Cache-Control', 'no-store');
  const cursor = cursorRelay.latest(req.sessionRecord.id, req.query.since);
  return res.json({ sessionId: req.sessionRecord.id, cursor: cursor });
});

router.post('/:sessionId/board/ink', auth.requireRole('trainer', 'founder'), function (req, res) {
  const body = req.body || {};
  const type = String(body.type || '');
  const page = Math.min(3, Math.max(1, Number(body.page) || 1));
  let payload = null;

  if (type === 'stroke') {
    const ink = cleanInkStroke(body.ink);
    if (!ink) {
      return res.status(422).json({ error: 'INVALID_INK', message: 'A drawable stroke is required.' });
    }
    payload = { type: 'stroke', ink: ink, page: page };
  } else if (type === 'snapshot') {
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 300).map(cleanSnapshotItem).filter(Boolean)
      : (Array.isArray(body.strokes)
        ? body.strokes.slice(0, 300).map(cleanInkStroke).filter(Boolean)
          .map(function (ink) { return { kind: 'stroke', ink: ink }; })
        : []);
    payload = {
      type: 'snapshot',
      items: items,
      /* Legacy readers only understand the strokes field. */
      strokes: items.filter(function (item) { return item.kind === 'stroke'; })
        .map(function (item) { return item.ink; }),
      page: page
    };
  } else if (type === 'image') {
    const image = cleanImage(body.image);
    if (!image) {
      return res.status(422).json({
        error: 'INVALID_IMAGE',
        message: 'Use a PNG, JPEG or WEBP image under 1.5 MB.'
      });
    }
    payload = { type: 'image', image: image, page: page };
  } else if (type === 'clear') {
    payload = { type: 'clear', page: page };
  } else {
    return res.status(422).json({ error: 'INVALID_INK_TYPE', message: 'Unknown board action.' });
  }

  return realtime.publish(req.sessionRecord.id, 'board.ink', payload).then(function (event) {
    return res.json({ ok: true, seq: event.seq });
  });
});

/* Trainer-owned student media controls. The student can never set this flag;
   revoking it marks audio and camera as forced on before the client locks the
   buttons. */
router.post('/:sessionId/media-permission', auth.requireRole('trainer', 'founder'), async function (req, res, next) {
  try {
    const allowed = (req.body || {}).studentCanToggleMedia;
    if (typeof allowed !== 'boolean') {
      return res.status(400).json({
        error: 'INVALID_MEDIA_PERMISSION',
        message: 'studentCanToggleMedia must be true or false.'
      });
    }
    const permissions = mediaPermission.setPermission(req.sessionRecord.mediaPermissions, allowed);
    const updated = await db.updateSession(req.sessionRecord.id, function (session) {
      session.mediaPermissions = permissions;
      return session;
    });
    if (!updated) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }
    return realtime.publish(updated.id, 'rtc.media.control.changed', mediaPermission.eventPayload(permissions))
      .then(function (event) {
        return res.json({ ok: true, mediaPermissions: permissions, seq: event.seq });
      });
  } catch (error) {
    return next(error);
  }
});

/* Trainer-only intentional media state. This is separate from Access: a
   trainer can mute the kid or switch their camera off even while controls are
   locked. The browser reports honestly whether the track actually changed. */
router.post('/:sessionId/media-state', auth.requireRole('trainer', 'founder'), async function (req, res, next) {
  try {
    const body = req.body || {};
    const hasMic = typeof body.micOn === 'boolean';
    const hasCamera = typeof body.cameraOn === 'boolean';
    if (!hasMic && !hasCamera) {
      return res.status(400).json({
        error: 'INVALID_MEDIA_STATE',
        message: 'Send micOn or cameraOn as true or false.'
      });
    }
    const permissions = mediaPermission.setRemoteState(req.sessionRecord.mediaPermissions, {
      micOn: body.micOn,
      cameraOn: body.cameraOn
    });
    const updated = await db.updateSession(req.sessionRecord.id, function (session) {
      session.mediaPermissions = permissions;
      return session;
    });
    if (!updated) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }
    return realtime.publish(updated.id, 'rtc.media.control.changed', mediaPermission.eventPayload(permissions))
      .then(function (event) {
        return res.json({ ok: true, mediaPermissions: permissions, seq: event.seq });
      });
  } catch (error) {
    return next(error);
  }
});

/* Trainer-only applause permission. Disabling it only blocks the kid's 👏
   gesture; trainer feedback, celebrations and media controls are unaffected. */
router.post('/:sessionId/reaction-permission', auth.requireRole('trainer', 'founder'), async function (req, res, next) {
  try {
    const body = req.body || {};
    const hasReact = typeof body.studentCanReact === 'boolean';
    const hasApplaud = typeof body.studentCanApplaud === 'boolean';
    if (!hasReact && !hasApplaud) {
      return res.status(400).json({
        error: 'INVALID_REACTION_PERMISSION',
        message: 'Send studentCanReact or studentCanApplaud as true or false.'
      });
    }
    const permissions = reactionPermission.setPermission(req.sessionRecord.reactionPermissions, {
      studentCanReact: body.studentCanReact,
      studentCanApplaud: body.studentCanApplaud
    });
    const updated = await db.updateSession(req.sessionRecord.id, function (session) {
      session.reactionPermissions = permissions;
      return session;
    });
    if (!updated) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }
    return realtime.publish(updated.id, 'reaction.permission.changed', reactionPermission.eventPayload(permissions))
      .then(function (event) {
        return res.json({ ok: true, reactionPermissions: permissions, seq: event.seq });
      });
  } catch (error) {
    return next(error);
  }
});

/* Both participants report their own connection result. The role is derived
   from the JWT, so a student cannot submit a passing trainer measurement. */
router.post('/:sessionId/network-check', async function (req, res, next) {
  try {
    const validation = networkQuality.validateMeasurement(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: 'INVALID_NETWORK_CHECK', message: validation.error });
    }
    const role = networkQuality.roleFor(req.user);
    const result = networkQuality.evaluate(validation.value);
    const updated = await db.updateSession(req.sessionRecord.id, function (session) {
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
  } catch (error) {
    return next(error);
  }
});

/* Fixed-catalog reward badges. The trainer picks a badge id; label and points
   come from policy. The student record receives only safe trophy fields. */
router.post('/:sessionId/badges', auth.requireRole('trainer', 'founder'), async function (req, res, next) {
  try {
    const record = badges.award((req.body || {}).badgeId, req.sessionRecord.id, req.user.id);
    if (!record) {
      return res.status(400).json({
        error: 'UNKNOWN_BADGE',
        message: 'Choose one of the approved reward badges.'
      });
    }
    const trophy = badges.forStudent({ badges: [record] })[0];
    const updatedSession = await db.updateSession(req.sessionRecord.id, function (session) {
      session.badges = (Array.isArray(session.badges) ? session.badges : []).concat([record]);
      return session;
    });
    if (!updatedSession) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }
    await db.updateUser(req.sessionRecord.studentId, function (student) {
      student.badges = (Array.isArray(student.badges) ? student.badges : []).concat([record]);
      student.trophyPoints = badges.pointsFor(student);
      return student;
    });
    return realtime.publish(req.sessionRecord.id, 'badge.awarded', badges.eventPayload(record))
      .then(function (event) {
        return res.status(201).json({ ok: true, badge: trophy, seq: event.seq });
      });
  } catch (error) {
    return next(error);
  }
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
  return fireCelebration(req.sessionRecord, req.body, trigger).then(function (result) {
    return res.json({ fired: Boolean(result), celebration: result ? result.payload : null, seq: result && result.seq });
  });
});

/* Reaction gestures stay on their own layer. The role comes from the JWT, so
   a student cannot send a trainer-only gesture or inject celebration copy. */
router.post('/:sessionId/reactions', async function (req, res) {
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
  /* Live Supabase inserts are async. Await the stored row before building the
     event payload, otherwise the broadcast carries an unresolved Promise and
     every reaction appears as an empty emoji at minute 0. */
  const row = await reactions.record(req.sessionRecord, req.user, req.body || {});
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
router.get('/:sessionId/presence', async function (req, res) {
  return res.json({ presence: await presenceService.stateFor(req.sessionRecord, req.user) });
});

router.post('/:sessionId/presence', async function (req, res) {
  try {
    await presenceService.heartbeat(req.user, req.sessionRecord, req.body || {});
    return res.json({ presence: await presenceService.stateFor(req.sessionRecord, req.user) });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'PRESENCE_FAILED',
      message: error.message
    });
  }
});

router.post('/:sessionId/presence/finalize', auth.requireRole('trainer', 'founder'), async function (req, res) {
  return res.json({ snapshot: await presenceService.finalize(req.sessionRecord) });
});

/* A single close path is shared by the trainer's button and the server-owned
   auto-close job. Recording stop, presence finalization, demo access, mastery
   update and the end event must happen identically in both cases. */
async function closeSession(session, options) {
  const input = options || {};
  if (session.status === 'ended') {
    return { error: { status: 409, code: 'SESSION_ALREADY_ENDED', message: 'This session is already ended.' } };
  }

  const body = input.body || {};
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
        return { error: { status: 400, code: 'INVALID_SCORE', message: 'currentQuizScore must be a number from 0 to 100.' } };
      }
      if (config.isProduction && !String(body.overrideReason || '').trim()) {
        return { error: { status: 400, code: 'OVERRIDE_REASON_REQUIRED', message: 'A trainer override requires an audit reason in production.' } };
      }
    }
    const scoreOverride = hasScoreOverride ? body.currentQuizScore : serializers.readiness(session);
    const scoreSource = hasScoreOverride ? 'trainer-override' : 'recorded-attempts';
    const topicId = session.topicId || session.title || 'general-mathematics';
    const currentLevel = masteryGating.levelFromSession(session);
    const pendingCheck = masteryGating.pendingParallelCheck(session);
    if (pendingCheck && input.force !== true && body.force !== true) {
      return {
        error: {
          status: 409,
          code: 'PARALLEL_CHECK_REQUIRED',
          message: 'Solve the parallel check before ending the session, or force with trainer override.',
          questionId: pendingCheck.id
        }
      };
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
    /* Finish every side effect before the status becomes ended. If recording
       stop, mastery, presence or demo access throws, the server-owned retry can
       run again instead of being refused by an already-ended session. */
    function applyEndState(current) {
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
      if (recordingUrl) {
        current.recording = Object.assign({}, current.recording || {}, {
          url: recordingUrl,
          readyAt: endedAt
        });
      }
      if (Object.keys(safeRecap).length) {
        current.recap = Object.assign({}, current.recap || {}, safeRecap, { savedAt: endedAt });
      }
      return current;
    }
    const closing = applyEndState(JSON.parse(JSON.stringify(session || {})));

    /* A tab close or missed click must never strand an active Egress or leave
       a recording row permanently marked as recording. */
    try {
      await livekitEgress.stopSessionRecording(session.id);
    } catch (error) {
      console.error('[recording] session-end stop failed:', error.message);
    }

    await db.updateUser(session.studentId, function (student) {
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

    const presence = await presenceService.finalize(closing, endedAt);

    /* A finished demo closes demo-only class access but keeps payments and
       policies reachable. Notification failures never fail the session end. */
    try {
      await demoService.onSessionEnded(closing);
    } catch (error) {
      console.error('[demo] session completion update failed:', error.message);
    }

    /* One end-of-session celebration only. The priority is milestone → mastery
       gate → session complete, so a child never sees stacked overlays. */
    const studentSessions = await db.listSessionsForUser({ id: session.studentId, role: 'student' });
    const priorEnded = studentSessions.filter(function (item) {
      return item.status === 'ended' && item.id !== session.id;
    }).length;
    const endTrigger = priorEnded === 0
      ? 'first_session_completed'
      : (gating.unlockedNext ? 'mastery_gate_crossed' : 'session_complete');
    await fireCelebration(closing, body, endTrigger);

    /* Only now is the session durably ended. A failure above leaves it live so
       the lifetime job can retry the whole close instead of a half-written end. */
    const updated = await db.updateSession(session.id, applyEndState);

    realtime.publish(updated.id, 'session.ended', {
      endedAt: endedAt,
      unlockedNext: gating.unlockedNext,
      reteachRequired: gating.reteachRequired,
      reason: input.reason || 'manual'
    });
    if (input.reason === 'auto_close') {
      realtime.publish(updated.id, 'session.auto_closed', {
        endedAt: endedAt,
        classType: sessionTiming.isDemoSession(session) ? 'demo' : 'regular'
      });
    }

    return {
      response: {
      recap: Object.assign({
        id: updated.id,
        title: updated.title,
        status: updated.status,
        endedAt: endedAt,
        recordingUrl: (updated.recording && updated.recording.url) || null,
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
        trainerView: input.actorRole === 'trainer' || input.actorRole === 'founder'
      }, updated.recap || {}),
      presence: presence,
      unlockedNext: gating.unlockedNext,
      reteachRequired: gating.reteachRequired,
      currentScore: gating.currentScore,
      currentLevel: currentLevel
      }
    };
}

router.post('/:sessionId/end', auth.requireRole('trainer', 'founder'), async function (req, res, next) {
  try {
    const result = await closeSession(req.sessionRecord, {
      body: req.body,
      actorRole: req.user.role,
      reason: 'manual'
    });
    if (result.error) {
      return res.status(result.error.status).json({
        error: result.error.code,
        message: result.error.message,
        questionId: result.error.questionId
      });
    }
    return res.json(result.response);
  } catch (error) {
    return next(error);
  }
});

/* Exposed for the in-process session-lifetime job only. */
router.closeSession = closeSession;

module.exports = router;
