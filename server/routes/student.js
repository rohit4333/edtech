const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const chatAssistant = require('../services/chatAssistantService');
const curriculumRepository = require('../db/curriculum');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('student', 'founder'));

router.get('/dashboard', function (req, res) {
  const sessions = db.listSessionsForUser(req.user);
  return res.json({ dashboard: serializers.toStudentDashboard(req.user, sessions) });
});

router.get('/sessions/:sessionId', auth.loadSession, function (req, res) {
  /* Explicit boundary before serialization: trainer-only guidance is removed here,
     then toStudentSession strips it again as a second layer of defence. */
  const studentSafeSession = serializers.stripTrainerOnlyFields(req.sessionRecord);
  return res.json({ session: serializers.toStudentSession(studentSafeSession) });
});

router.post('/sessions/:sessionId/quiz/answers', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  const question = session.quiz.questions.find(function (item) { return item.id === body.questionId; });
  const optionIndex = Number(body.optionIndex);

  if (!question || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) {
    return res.status(400).json({ error: 'INVALID_ANSWER', message: 'Unknown question or option.' });
  }
  if (session.quiz.status !== 'live') {
    return res.status(409).json({ error: 'QUIZ_NOT_LIVE', message: 'Quiz is not accepting answers.' });
  }
  if (['answering', 'recheck'].indexOf(session.quiz.phase) === -1) {
    return res.status(409).json({
      error: 'QUIZ_NOT_ACCEPTING_ANSWERS',
      message: 'Feedback is pending, reteach is active, or the quiz is complete.'
    });
  }
  if (session.quiz.currentQuestionId && question.id !== session.quiz.currentQuestionId) {
    return res.status(409).json({ error: 'WRONG_QUESTION', message: 'This is not the current question.' });
  }
  const alreadyAnswered = session.quiz.attempts.some(function (item) { return item.questionId === question.id; });
  if (alreadyAnswered) {
    return res.status(409).json({ error: 'ALREADY_ANSWERED', message: 'This question was already answered.' });
  }

  const attempt = {
    id: 'attempt_' + Date.now() + '_' + question.id,
    questionId: question.id,
    optionIndex: optionIndex,
    correct: optionIndex === question.answerIndex,
    at: new Date().toISOString()
  };

  const updated = db.updateSession(session.id, function (current) {
    current.quiz.attempts.push(attempt);
    current.quiz.phase = 'awaiting_reveal';
    return current;
  });

  /* Never broadcast correctness or the answer key on the shared channel. */
  realtime.publish(session.id, 'quiz.answer.saved', {
    questionId: question.id,
    attemptId: attempt.id,
    at: attempt.at
  });

  return res.json({
    attemptId: attempt.id,
    saved: true,
    phase: updated.quiz.phase
  });
});

/* Correctness is released only after the trainer reveals that question. The
   classroom client uses this to unlock a required parallel check. */
router.get('/sessions/:sessionId/quiz/attempts/:attemptId', auth.loadSession, function (req, res) {
  const session = req.sessionRecord;
  const attempt = session.quiz.attempts.find(function (item) {
    return item.id === req.params.attemptId;
  });
  if (!attempt) {
    return res.status(404).json({ error: 'ATTEMPT_NOT_FOUND' });
  }

  const revealed = (session.quiz.reveals || []).some(function (reveal) {
    return reveal.questionId === attempt.questionId;
  });
  if (!revealed) {
    return res.json({
      attemptId: attempt.id,
      questionId: attempt.questionId,
      revealed: false
    });
  }

  return res.json({
    attemptId: attempt.id,
    questionId: attempt.questionId,
    revealed: true,
    correct: attempt.correct === true
  });
});

/* Academic-only curriculum profile for the signed-in student. */
router.get('/me/curriculum', async function (req, res) {
  const profile = await curriculumRepository.get(req.user.id);
  if (!profile) return res.json({ curriculum: null, adapter: curriculumRepository.adapterName() });
  return res.json({ curriculum: profile, adapter: curriculumRepository.adapterName() });
});

/* Cloudflare-backed study tutor. The request is scoped to the signed-in
   student and never receives contact details or trainer-only material. */
router.post('/tutor/query', async function (req, res) {
  const body = req.body || {};
  const ownId = req.user.id;

  if (body.studentId && body.studentId !== ownId && req.user.role !== 'founder') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only ask for your own tutor.' });
  }
  if (body.sessionId) {
    const session = db.findSession(body.sessionId);
    if (!session || !auth.canAccessSession(req.user, session)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
    }
  }

  const result = await chatAssistant.reply('student', body.question, {
    studentId: body.studentId || ownId,
    sessionId: body.sessionId || null
  });
  return res.json({ reply: result.reply, source: result.source });
});

module.exports = router;
