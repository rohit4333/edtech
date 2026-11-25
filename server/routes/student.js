const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');

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

module.exports = router;
