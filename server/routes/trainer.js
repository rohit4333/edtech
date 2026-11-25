const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const policy = require('../config/policy.json');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('trainer', 'founder'));

const ATTENDANCE_STATES = ['present', 'absent', 'late'];

function sessionsFor(user) {
  return db.listSessionsForUser(user).filter(function (session) {
    return session.trainerId === user.id || user.role === 'founder';
  });
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

function sendPayout(req, res, period) {
  if (!validPeriod(period)) {
    return res.status(400).json({
      error: 'INVALID_PERIOD',
      message: 'Period must use YYYY-MM.'
    });
  }
  return res.json({
    payout: serializers.toTrainerPayout(req.user, sessionsFor(req.user), period, policy)
  });
}

router.get('/quiz/templates', function (req, res) {
  return res.json({ templates: require('../quiz/templates').listTemplates() });
});

router.get('/attention', function (req, res) {
  const sessions = sessionsFor(req.user);
  const ids = sessions.map(function (session) { return session.id; });
  const attendance = db.listAttendance().filter(function (row) { return ids.indexOf(row.sessionId) !== -1; });
  return res.json({ attention: serializers.toTrainerAttention(sessions, attendance) });
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
      message: 'Status must be present, absent or late.'
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

  return res.json({ session: serializers.toTrainerSession(updated) });
});

router.post('/sessions/:sessionId/quiz/next', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
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

  const draft = session.quiz.drafts.splice(index, 1)[0];
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

router.post('/sessions/:sessionId/quiz/new-check', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  const templates = require('../quiz/templates');
  const usedPrompts = session.quiz.questions.map(function (question) { return question.prompt; });
  const question = templates.buildQuestion((req.body || {}).templateId, usedPrompts);

  session.quiz.questions.push(question);
  session.quiz.currentQuestionId = question.id;
  session.quiz.phase = 'recheck';

  const updated = db.updateSession(session.id, function () { return session; });
  realtime.publish(updated.id, 'quiz.check.added', { currentQuestionId: question.id });

  return res.json({ session: serializers.toTrainerSession(updated) });
});

module.exports = router;
