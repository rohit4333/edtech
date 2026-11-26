const express = require('express');
const db = require('../db');
const config = require('../config');
const supabaseDb = require('../db/supabase');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const payoutService = require('../services/payoutService');
const quizGenerator = require('../quiz/generator');
const quizTemplates = require('../quiz/templates');
const moderation = require('../quiz/moderation');
const cloudflareService = require('../services/cloudflareService');
const aiCurriculumService = require('../services/aiCurriculumService');
const masteryGating = require('../services/masteryGating');
const policy = require('../config/policy.json');
const slotService = require('../services/slotService');
const chatAssistant = require('../services/chatAssistantService');
const curriculumRepository = require('../db/curriculum');
const sessionParty = require('../services/sessionPartyService');
const celebrations = require('../services/celebrationService');
const reactions = require('../services/reactionService');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('trainer', 'founder'));

const ATTENDANCE_STATES = ['present', 'absent', 'late', 'leave', 'unattended'];

function sessionsFor(user) {
  return db.listSessionsForUser(user).filter(function (session) {
    return session.trainerId === user.id || user.role === 'founder';
  });
}

/* Server-owned celebration trigger. No correctness or trainer text is written
   by the request; the service resolves copy and palette from config. */
function celebrate(req, trigger) {
  const session = req.sessionRecord;
  if (!session) return Promise.resolve(null);
  const student = db.findUserById(session.studentId);
  const body = req.body || {};
  const payload = celebrations.evaluateTrigger(trigger, {
    sessionId: session.id,
    studentName: student && student.name ? student.name : 'Student',
    quizActive: Boolean(session.quiz && (session.quiz.phase === 'answering' || session.quiz.phase === 'reteach')),
    studentPref: body.studentPref,
    trainerPref: body.trainerPref,
    now: Date.now()
  });
  if (!payload) return Promise.resolve(null);
  return realtime.publish(session.id, 'shared.celebration', payload);
}

function readStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function validPeriod(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function payoutContext() {
  return {
    trainers: db.listUsers(),
    allSessions: db.listSessionsForUser({ role: 'founder' }),
    attendance: db.listAttendance(),
    provenance: config.databaseMode
  };
}

function sendPayout(req, res, period) {
  if (!validPeriod(period)) {
    return res.status(400).json({
      error: 'INVALID_PERIOD',
      message: 'Period must use YYYY-MM.'
    });
  }
  const context = payoutContext();
  const sessions = sessionsFor(req.user);
  context.slotPay = slotService.unutilisedPayForPeriod(req.user, sessions, period);

  return res.json({
    payout: payoutService.buildPayout(
      req.user,
      sessions,
      period,
      policy,
      context
    )
  });
}

router.get('/quiz/templates', function (req, res) {
  return res.json({
    templates: quizTemplates.listTemplates(),
    difficultyLevels: quizTemplates.listDifficultyLevels()
  });
});

router.get('/attention', function (req, res) {
  const sessions = sessionsFor(req.user);
  const ids = sessions.map(function (session) { return session.id; });
  const attendance = db.listAttendance().filter(function (row) { return ids.indexOf(row.sessionId) !== -1; });
  return res.json({ attention: serializers.toTrainerAttention(sessions, attendance) });
});

/* Engagement pulse is trainer/founder only. It is computed from role-tagged
   reaction gestures and contains no contact details or celebration content. */
router.get('/engagement/live/:sessionId', function (req, res) {
  const sessions = sessionsFor(req.user);
  const session = sessions.find(function (item) { return item.id === req.params.sessionId; });
  if (!session) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  const student = db.findUserById(session.studentId);
  return res.json({
    engagement: Object.assign({
      sessionId: session.id,
      studentName: student && student.name ? student.name : 'Student'
    }, reactions.live(session.id))
  });
});

router.get('/engagement/student/:studentId', function (req, res) {
  const sessions = sessionsFor(req.user);
  const owns = sessions.some(function (item) { return item.studentId === req.params.studentId; });
  if (!owns) {
    return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student not found.' });
  }
  const student = db.findUserById(req.params.studentId);
  return res.json({
    engagement: Object.assign({
      studentId: req.params.studentId,
      studentName: student && student.name ? student.name : 'Student'
    }, reactions.student(req.params.studentId, sessions))
  });
});

router.get('/engagement/cohort', function (req, res) {
  const sessions = sessionsFor(req.user);
  return res.json({ cohort: reactions.cohort(sessions, db.listUsers()) });
});

router.get('/payouts', function (req, res) {
  return sendPayout(req, res, currentPeriod());
});

router.get('/payouts/:period', function (req, res) {
  return sendPayout(req, res, req.params.period);
});

router.get('/score', function (req, res) {
  return res.json({ score: serializers.toTrainerScore(req.user, policy) });
});

router.get('/dashboard', function (req, res) {
  const sessions = sessionsFor(req.user);
  const attendance = [];

  sessions.forEach(function (session) {
    db.listAttendanceForSession(session.id).forEach(function (row) { attendance.push(row); });
  });

  return res.json({
    dashboard: serializers.toTrainerDashboard(req.user, sessions, attendance)
  });
});

router.get('/attendance', function (req, res) {
  const sessions = sessionsFor(req.user);
  const ids = sessions.map(function (session) { return session.id; });
  const attendance = db.listAttendance().filter(function (row) { return ids.indexOf(row.sessionId) !== -1; });
  return res.json({ register: serializers.toAttendanceRegister(sessions, attendance) });
});

router.patch('/attendance/:sessionId', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  const status = readStatus(body.status);

  if (ATTENDANCE_STATES.indexOf(status) === -1) {
    return res.status(400).json({
      error: 'INVALID_STATUS',
      message: 'Status must be present, absent, late, leave or unattended.'
    });
  }
  if (!body.studentId || body.studentId !== session.studentId) {
    return res.status(400).json({
      error: 'NOT_SESSION_STUDENT',
      message: 'This session has a different student.'
    });
  }

  const record = db.upsertAttendance(session.id, session.studentId, status);
  realtime.publish(session.id, 'attendance.changed', {
    studentId: session.studentId,
    status: status,
    at: record.markedAt
  });

  return res.json({ record: record });
});

router.post('/attendance/:sessionId/save', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  const records = Array.isArray(body.records) ? body.records : [{
    studentId: session.studentId,
    status: body.status
  }];

  const saved = [];
  for (let i = 0; i < records.length; i += 1) {
    const item = records[i] || {};
    const status = readStatus(item.status);
    const studentId = item.studentId || session.studentId;

    if (ATTENDANCE_STATES.indexOf(status) === -1 || studentId !== session.studentId) {
      return res.status(400).json({
        error: 'INVALID_ATTENDANCE_RECORD',
        message: 'Each record needs the session student and a present/absent/late status.'
      });
    }
    saved.push(db.upsertAttendance(session.id, studentId, status));
  }

  const sessions = sessionsFor(req.user);
  const ids = sessions.map(function (item) { return item.id; });
  const attendance = db.listAttendance().filter(function (row) { return ids.indexOf(row.sessionId) !== -1; });
  const savedAt = new Date().toISOString();

  realtime.publish(session.id, 'attendance.saved', { savedAt: savedAt, count: saved.length });

  return res.json({
    ok: true,
    savedAt: savedAt,
    saved: saved,
    register: serializers.toAttendanceRegister(sessions, attendance)
  });
});

router.get('/sessions', function (req, res) {
  const sessions = db.listSessionsForUser(req.user);
  return res.json({
    sessions: sessions
      .filter(function (session) { return session.trainerId === req.user.id || req.user.role === 'founder'; })
      .map(serializers.toTrainerSummary)
  });
});

/* POST: Create a new session in Supabase. Live mode only. */
router.post('/sessions', async function (req, res) {
  if (config.databaseMode !== 'supabase') {
    return res.status(503).json({
      error: 'DATABASE_MODE_NOT_LIVE',
      message: 'Set DATABASE_MODE=supabase in server/.env to write sessions to Supabase.'
    });
  }

  const body = req.body || {};
  const trainerId = req.user.role === 'founder'
    ? (body.trainer_id || body.trainerId || req.user.id)
    : req.user.id;
  const studentId = body.student_id || body.studentId;
  const title = body.title || '1-on-1 maths session';

  const parties = sessionParty.validate(trainerId, studentId);
  if (parties.error) {
    return res.status(parties.status).json({ error: parties.error, message: parties.message });
  }

  try {
    const row = await supabaseDb.insertSession({
      trainerId: trainerId,
      studentId: studentId,
      title: title,
      status: 'scheduled'
    });
    return res.status(201).json({
      success: true,
      message: 'Session created!',
      data: row
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'SESSION_CREATE_FAILED',
      message: error.message
    });
  }
});

router.get('/sessions/:sessionId', auth.loadSession, function (req, res) {
  return res.json({ session: serializers.toTrainerSession(req.sessionRecord) });
});

router.patch('/sessions/:sessionId/planner', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const current = req.sessionRecord;

  if (Array.isArray(body.items)) {
    current.planner = body.items.map(function (item, index) {
      return {
        id: item && item.id ? String(item.id) : 'plan_' + (index + 1),
        label: item && item.label ? String(item.label) : 'Untitled step',
        done: Boolean(item && item.done)
      };
    });
  } else if (body.id && typeof body.done === 'boolean') {
    current.planner = current.planner.map(function (item) {
      return item.id === body.id ? Object.assign({}, item, { done: body.done }) : item;
    });
  } else {
    return res.status(400).json({
      error: 'INVALID_PAYLOAD',
      message: 'Send { items: [...] } or { id, done }.'
    });
  }

  const updated = db.updateSession(current.id, function () { return current; });
  realtime.publish(current.id, 'planner.updated', { planner: updated.planner });
  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.patch('/sessions/:sessionId/page', auth.loadSession, function (req, res) {
  const page = Number((req.body || {}).page);
  if (!Number.isInteger(page) || page < 1 || page > req.sessionRecord.pages.length) {
    return res.status(400).json({ error: 'INVALID_PAGE', message: 'Page must be between 1 and 3.' });
  }

  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.currentPage = page;
    return session;
  });

  realtime.publish(updated.id, 'page.changed', { page: page });
  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.post('/sessions/:sessionId/quiz/launch', auth.loadSession, function (req, res) {
  const updated = db.updateSession(req.sessionRecord.id, function (session) {
    session.quiz.status = 'live';
    session.quiz.phase = 'answering';
    session.quiz.startedAt = new Date().toISOString();
    session.quiz.currentQuestionId = session.quiz.questions[0] ? session.quiz.questions[0].id : null;
    session.quiz.attempts = [];
    session.quiz.reveals = [];
    return session;
  });

  realtime.publish(updated.id, 'quiz.launched', {
    questionCount: updated.quiz.questions.length,
    currentQuestionId: updated.quiz.currentQuestionId
  });
  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.post('/sessions/:sessionId/quiz/reveal', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  const ids = [];
  session.quiz.reveals = session.quiz.reveals || [];

  if (body.all === true) {
    session.quiz.questions.forEach(function (question) { ids.push(question.id); });
  } else if (body.questionId) {
    const found = session.quiz.questions.find(function (question) { return question.id === body.questionId; });
    if (!found) return res.status(404).json({ error: 'QUESTION_NOT_FOUND' });
    ids.push(found.id);
  } else {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Send questionId or all: true.' });
  }

  const at = new Date().toISOString();
  ids.forEach(function (id) {
    const already = session.quiz.reveals.some(function (reveal) { return reveal.questionId === id; });
    if (!already) {
      session.quiz.reveals.push({
        id: 'reveal_' + Date.now() + '_' + id,
        questionId: id,
        revealedBy: req.user.id,
        at: at
      });
    }
  });

  session.quiz.phase = 'revealed';
  const updated = db.updateSession(session.id, function () { return session; });
  realtime.publish(updated.id, 'quiz.answer.revealed', { questionIds: ids, at: at });

  /* A perfect-score celebration fires only after the reveal and carries no
     score, option or explanation in its payload. */
  const questionCount = (updated.quiz.questions || []).length;
  const correctCount = (updated.quiz.attempts || []).filter(function (attempt) {
    return attempt.correct === true;
  }).length;
  if (questionCount && correctCount >= questionCount) celebrate(req, 'quiz_perfect_score');

  return res.json({ session: serializers.toTrainerSession(updated) });
});

/* A hint is trainer-only material. It reaches the student only through this
   explicit grant and the student serializer's narrow grantedHints option. */
router.post('/sessions/:sessionId/quiz/hints', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  const body = req.body || {};
  const question = (session.quiz.questions || []).find(function (item) {
    return item.id === body.questionId;
  });
  if (!question) {
    return res.status(404).json({ error: 'QUESTION_NOT_FOUND', message: 'Unknown question.' });
  }

  const ordered = Array.isArray(question.hints) && question.hints.filter(Boolean);
  const requested = Number(body.hintIndex || 1);
  const index = Number.isInteger(requested) && requested > 0 ? requested - 1 : 0;
  const hint = ordered && ordered.length
    ? ordered[Math.min(index, ordered.length - 1)]
    : question.hint;
  if (typeof hint !== 'string' || !hint.trim()) {
    return res.status(404).json({ error: 'HINT_NOT_FOUND', message: 'This question has no trainer hint.' });
  }

  session.quiz.grantedHints = session.quiz.grantedHints || {};
  session.quiz.grantedHints[question.id] = {
    hint: hint.slice(0, 500),
    index: index + 1,
    grantedBy: req.user.id,
    grantedAt: new Date().toISOString()
  };

  const updated = db.updateSession(session.id, function () { return session; });
  /* No hint text on the shared channel: only a nudge to re-read the safe state. */
  realtime.publish(updated.id, 'quiz.assistance.granted', {
    questionId: question.id,
    at: session.quiz.grantedHints[question.id].grantedAt
  });

  return res.json({
    session: serializers.toTrainerSession(updated),
    questionId: question.id,
    hint: session.quiz.grantedHints[question.id].hint
  });
});

router.post('/sessions/:sessionId/quiz/next', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  const body = req.body || {};
  const pending = masteryGating.pendingParallelCheck(session);
  if (pending && body.force !== true) {
    return res.status(409).json({
      error: 'PARALLEL_CHECK_REQUIRED',
      message: 'The student must solve this parallel check before moving on.',
      questionId: pending.id
    });
  }
  if (pending && body.force === true) {
    session.quiz.overrides = session.quiz.overrides || [];
    session.quiz.overrides.push({
      questionId: pending.id,
      forcedBy: req.user.id,
      at: new Date().toISOString()
    });
  }
  const questions = session.quiz.questions;
  const index = questions.findIndex(function (question) { return question.id === session.quiz.currentQuestionId; });
  const next = questions[index + 1];

  if (!next) {
    session.quiz.phase = 'complete';
    session.quiz.status = 'ended';
    const completed = db.updateSession(session.id, function () { return session; });
    realtime.publish(completed.id, 'quiz.completed', {});
    return res.json({ session: serializers.toTrainerSession(completed) });
  }

  session.quiz.currentQuestionId = next.id;
  session.quiz.phase = 'answering';
  const updated = db.updateSession(session.id, function () { return session; });
  realtime.publish(updated.id, 'quiz.question.changed', { currentQuestionId: next.id });

  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.get('/sessions/:sessionId/quiz/drafts', auth.loadSession, function (req, res) {
  return res.json({ drafts: req.sessionRecord.quiz.drafts || [] });
});

router.post('/sessions/:sessionId/quiz/drafts/:draftId/approve', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  session.quiz.drafts = session.quiz.drafts || [];
  const index = session.quiz.drafts.findIndex(function (draft) { return draft.id === req.params.draftId; });
  if (index === -1) return res.status(404).json({ error: 'DRAFT_NOT_FOUND' });

  const draft = session.quiz.drafts[index];
  const review = moderation.moderateDraft(draft);
  if (!review.ok) {
    return res.status(422).json({
      error: 'DRAFT_REJECTED',
      message: 'Draft failed content moderation: ' + review.reasons.join('; ')
    });
  }
  session.quiz.drafts.splice(index, 1);
  const approved = Object.assign({}, draft, {
    id: 'q_' + Date.now(),
    source: 'ai_draft',
    status: 'active'
  });
  delete approved.note;
  session.quiz.questions.push(approved);

  const updated = db.updateSession(session.id, function () { return session; });
  realtime.publish(updated.id, 'quiz.draft.approved', { questionId: approved.id });

  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.post('/sessions/:sessionId/quiz/reteach', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  session.quiz.phase = 'reteach';
  const updated = db.updateSession(session.id, function () { return session; });
  realtime.publish(updated.id, 'quiz.reteach.started', {
    questionId: session.quiz.currentQuestionId,
    reason: (req.body || {}).reason || null
  });
  return res.json({ session: serializers.toTrainerSession(updated) });
});

/* Generate AI drafts into the review queue. Nothing reaches the student until
   the existing approve endpoint promotes a draft to an active question. */
router.post('/sessions/:sessionId/quiz/generate', auth.loadSession, async function (req, res) {
  const session = req.sessionRecord;
  const body = req.body || {};
  const usedPrompts = session.quiz.questions.map(function (question) { return question.prompt; })
    .concat((session.quiz.drafts || []).map(function (draft) { return draft.prompt; }));
  const count = Math.min(5, Math.max(1, Number(body.count) || 3));

  try {
    const generated = await quizGenerator.generateAdaptiveQuiz(
      body.topic || session.title || 'mathematics',
      Number.isFinite(Number(body.currentMasteryScore))
        ? Number(body.currentMasteryScore)
        : session.mastery,
      {
        count: count,
        templateId: body.templateId || null,
        usedPrompts: usedPrompts
      }
    );

    const candidates = generated.map(function (question, index) {
      return Object.assign({}, question, {
        id: 'draft_' + Date.now() + '_' + index + '_' + Math.random().toString(36).slice(2, 7),
        note: question.source === 'fallback'
          ? 'Local draft: configure Cloudflare Workers AI to generate with AI.'
          : 'AI draft awaiting trainer approval.'
      });
    });
    const drafts = candidates.filter(function (draft) {
      return moderation.moderateDraft(draft).ok;
    });
    const rejected = candidates.length - drafts.length;

    session.quiz.drafts = (session.quiz.drafts || []).concat(drafts);
    const updated = db.updateSession(session.id, function () { return session; });

    realtime.publish(updated.id, 'quiz.draft.generated', {
      count: drafts.length,
      rejected: rejected,
      difficultyLevel: drafts[0] ? drafts[0].difficultyLevel : null
    });

    return res.status(201).json({
      session: serializers.toTrainerSession(updated),
      drafts: drafts,
      rejected: rejected,
      generationMode: drafts[0] ? drafts[0].source : null
    });
  } catch (failure) {
    return res.status(failure.status || 502).json({
      error: failure.code || 'QUIZ_GENERATION_FAILED',
      message: failure.message
    });
  }
});

/* Scaffolded mastery: after a trainer explains a failed item on the whiteboard,
   generate ONE parallel question on the same concept. It cannot be skipped;
   only a correct attempt (or an explicit trainer override) allows progress. */
router.post('/sessions/:sessionId/quiz/new-check', auth.loadSession, async function (req, res) {
  const session = req.sessionRecord;
  const body = req.body || {};
  const questions = session.quiz.questions;
  const usedPrompts = questions.map(function (question) {
    return question.prompt || question.stem || '';
  }).filter(Boolean);

  const currentQuestion = questions.find(function (question) {
    return question.id === (body.questionId || session.quiz.currentQuestionId);
  }) || questions[questions.length - 1] || null;
  const concept = String(body.concept || body.topicId || (currentQuestion && (
    currentQuestion.concept || currentQuestion.topicId || currentQuestion.prompt || currentQuestion.stem
  )) || session.topicId || session.title || '').trim();
  if (!concept) {
    return res.status(400).json({
      error: 'MISSING_CONCEPT',
      message: 'Send concept or topicId, or have a current question to check.'
    });
  }

  const difficulty = body.difficulty || (session.quiz && session.quiz.currentDifficultyLevel) ||
    session.currentLevel || session.difficultyLevel ||
    quizGenerator.difficultyLabel(quizGenerator.difficultyForMastery(session.mastery));

  try {
    const student = db.findUserById(session.studentId);
    const generated = await aiCurriculumService.generateParallelQuestion(
      student, concept, difficulty, {
        usedPrompts: usedPrompts,
        allowFallback: body.allowFallback
      }
    );
    const options = generated.options.map(function (option) { return option.text; });
    const answerIndex = generated.options.findIndex(function (option) {
      return option.id === generated.correctOptionId;
    });

    const question = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      prompt: generated.stem,
      stem: generated.stem,
      options: options,
      answerIndex: answerIndex,
      correctOptionId: generated.correctOptionId,
      answerKey: generated.answerKey,
      explanation: generated.explanation,
      hint: generated.hint,
      concept: generated.concept,
      difficultyLevel: generated.difficulty,
      source: generated.source,
      status: 'active',
      requiresCorrectAnswer: true,
      createdAt: new Date().toISOString()
    };

    if (body.replace === true && currentQuestion) {
      const index = questions.indexOf(currentQuestion);
      questions[index] = question;
      session.quiz.attempts = session.quiz.attempts.filter(function (attempt) {
        return attempt.questionId !== currentQuestion.id;
      });
      session.quiz.reveals = session.quiz.reveals.filter(function (reveal) {
        return reveal.questionId !== currentQuestion.id;
      });
    } else {
      questions.push(question);
    }

    session.quiz.currentQuestionId = question.id;
    session.quiz.phase = 'recheck';
    session.quiz.status = session.quiz.status === 'live' ? 'live' : session.quiz.status;

    const updated = db.updateSession(session.id, function () { return session; });
    /* No answer key or correctness in the shared realtime payload. */
    realtime.publish(updated.id, 'quiz.check.added', {
      currentQuestionId: question.id,
      questionId: question.id,
      concept: concept,
      requiresCorrectAnswer: true,
      difficultyLevel: question.difficultyLevel
    });

    return res.status(201).json({
      session: serializers.toTrainerSession(updated),
      questionId: question.id,
      generationMode: generated.source
    });
  } catch (failure) {
    return res.status(failure.status || 502).json({
      error: failure.code || 'QUIZ_GENERATION_FAILED',
      message: failure.message
    });
  }
});

/* ------------------------------------------------ committed slot calendar */
router.get('/slots', function (req, res) {
  return res.json({ slots: db.listTrainerSlots(req.user.id), rules: slotService.rules() });
});

router.post('/slots', function (req, res) {
  try {
    return res.status(201).json({ slot: slotService.addSlot(req.user, req.body || {}) });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'SLOT_FAILED',
      message: error.message
    });
  }
});

router.delete('/slots/:slotId', function (req, res) {
  try {
    return res.json(slotService.removeSlot(req.user, req.params.slotId));
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'SLOT_FAILED',
      message: error.message
    });
  }
});

router.get('/schedule', function (req, res) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month || ''))
    ? String(req.query.month) : currentPeriod();
  return res.json({ schedule: slotService.monthView(req.user, month, sessionsFor(req.user)) });
});

/* Persist a student's school curriculum. Academic fields only — the repository
   rejects any key resembling a name, email, phone, social link or address. */
router.put('/students/:studentId/curriculum', async function (req, res) {
  const student = db.findUserById(req.params.studentId);
  if (!student || student.role !== 'student') {
    return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Unknown student.' });
  }
  const assigned = db.listSessionsForUser(req.user).some(function (session) {
    return session.studentId === student.id;
  });
  if (!assigned && req.user.role !== 'founder') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Student is not on your roster.' });
  }

  try {
    const profile = await curriculumRepository.upsert(student.id, req.body || {}, req.user.id);
    return res.json({ curriculum: profile, adapter: curriculumRepository.adapterName() });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.code || 'INVALID_CURRICULUM', message: error.message });
  }
});

/* Cloudflare-backed planner copilot. Academic context comes from an assigned
   session only; contact details never enter the prompt. */
router.post('/copilot/query', async function (req, res) {
  const body = req.body || {};
  let studentId = null;

  if (body.sessionId) {
    const session = db.findSession(body.sessionId);
    if (!session || !auth.canAccessSession(req.user, session)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not assigned to this session.' });
    }
    studentId = session.studentId;
  } else if (body.studentId) {
    const student = db.findUserById(body.studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Unknown student.' });
    }
    const assigned = db.listSessionsForUser(req.user).some(function (session) {
      return session.studentId === student.id;
    });
    if (!assigned && req.user.role !== 'founder') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Student is not on your roster.' });
    }
    studentId = student.id;
  }

  const result = await chatAssistant.reply('trainer', body.question, {
    studentId: studentId,
    sessionId: body.sessionId || null
  });
  return res.json({ reply: result.reply, source: result.source });
});

module.exports = router;
