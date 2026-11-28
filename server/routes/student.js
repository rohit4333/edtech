const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const serializers = require('../serializers');
const realtime = require('../realtime');
const chatAssistant = require('../services/chatAssistantService');
const curriculumRepository = require('../db/curriculum');
const masteryPractice = require('../services/masteryPracticeService');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('student', 'founder'));

router.get('/dashboard', function (req, res, next) {
  Promise.resolve(db.listSessionsForUser(req.user)).then(function (sessions) {
    return Promise.resolve(typeof db.listPracticeBatches === 'function'
      ? db.listPracticeBatches()
      : []).then(function (batches) {
      return res.json({
        dashboard: serializers.toStudentDashboard(req.user, sessions, batches)
      });
    });
  }).catch(next);
});

/* The dashboard stays open so a post-demo family can still reach payments and
   the demo card. Every class-content route below it needs an active class. */
router.use(auth.requireClassAccess);

router.get('/sessions/:sessionId', auth.loadSession, function (req, res) {
  /* Explicit boundary before serialization: trainer-only guidance is removed here,
     then toStudentSession strips it again as a second layer of defence. Hints are
     released only when a trainer has explicitly granted them on the server. */
  const studentSafeSession = serializers.stripTrainerOnlyFields(req.sessionRecord);
  const grantedHints = {};
  Object.keys((studentSafeSession.quiz && studentSafeSession.quiz.grantedHints) || {})
    .forEach(function (questionId) {
      const value = studentSafeSession.quiz.grantedHints[questionId];
      grantedHints[questionId] = value && typeof value === 'object' ? value.hint : value;
    });
  return res.json({
    session: serializers.toStudentSession(studentSafeSession, { grantedHints: grantedHints })
  });
});

/* A live, correctness-free mirror of the child's current option choice. The
   trainer sees the same question popup and the highlighted option before any
   reveal; no attempt, key or explanation is carried on this channel. */
router.post('/sessions/:sessionId/quiz/selection', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  const question = serializers.quizQuestionsFor(session).find(function (item) {
    return item.id === body.questionId;
  });
  const optionIndex = Number(body.optionIndex);

  if (!question || !Number.isInteger(optionIndex) ||
      optionIndex < 0 || optionIndex >= question.options.length) {
    return res.status(400).json({ error: 'INVALID_SELECTION', message: 'Unknown question or option.' });
  }
  if (session.quiz.status !== 'live' || ['answering', 'recheck'].indexOf(session.quiz.phase) === -1) {
    return res.status(409).json({
      error: 'QUIZ_NOT_ACCEPTING_SELECTION',
      message: 'Selection is available only while the question is answerable.'
    });
  }
  if (session.quiz.currentQuestionId && question.id !== session.quiz.currentQuestionId) {
    return res.status(409).json({ error: 'WRONG_QUESTION', message: 'This is not the current question.' });
  }
  const attempts = Array.isArray(session.quiz.attempts) ? session.quiz.attempts : [];
  if (attempts.some(function (item) { return item.questionId === question.id; })) {
    return res.status(409).json({
      error: 'ALREADY_ANSWERED',
      message: 'The saved choice cannot be changed after submission.'
    });
  }

  const at = new Date().toISOString();
  return Promise.resolve(db.updateSession(session.id, function (current) {
    current.quiz.liveSelections = current.quiz.liveSelections || {};
    current.quiz.liveSelections[question.id] = { optionIndex: optionIndex, at: at };
    return current;
  })).then(function () {
    realtime.publish(session.id, 'quiz.option.selected', {
      questionId: question.id,
      optionIndex: optionIndex,
      fromRole: 'student',
      at: at
    });
    return res.json({
      ok: true,
      selected: { questionId: question.id, optionIndex: optionIndex, at: at }
    });
  });
});

router.post('/sessions/:sessionId/quiz/answers', auth.loadSession, function (req, res) {
  const body = req.body || {};
  const session = req.sessionRecord;
  /* Resolve questions exactly as the session serializers do. An English
     session with no stored quiz questions exposes a synthesized bank, so its
     ids must be answerable here too; there is no math-bank lookup. */
  const storedQuestions = Array.isArray(session.quiz.questions) ? session.quiz.questions : [];
  const questions = serializers.quizQuestionsFor(session);
  const question = questions.find(function (item) { return item.id === body.questionId; });
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
  /* A synthesized English bank may inherit a stale math question pointer from
     a legacy session. That pointer is not one of the exposed questions, so it
     must not block a serialized bank id. Stored quizzes keep the strict check. */
  const currentId = session.quiz.currentQuestionId;
  const currentIsExposed = questions.some(function (item) { return item.id === currentId; });
  const synthesizedQuiz = storedQuestions.length === 0 && questions.length > 0;
  if (currentId && (currentIsExposed || !synthesizedQuiz) && question.id !== currentId) {
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

  return Promise.resolve(db.updateSession(session.id, function (current) {
    current.quiz.attempts.push(attempt);
    current.quiz.liveSelections = current.quiz.liveSelections || {};
    current.quiz.liveSelections[question.id] = { optionIndex: optionIndex, at: attempt.at };
    current.quiz.phase = 'awaiting_reveal';
    return current;
  })).then(function (updated) {
    /* Never broadcast correctness or the answer key on the shared channel.
       The chosen option is the student's own saved answer, not a result. */
    realtime.publish(session.id, 'quiz.answer.saved', {
      questionId: question.id,
      attemptId: attempt.id,
      optionIndex: optionIndex,
      at: attempt.at
    });
    realtime.publish(session.id, 'quiz.option.selected', {
      questionId: question.id,
      optionIndex: optionIndex,
      fromRole: 'student',
      at: attempt.at
    });

    return res.json({
      attemptId: attempt.id,
      saved: {
        questionId: question.id,
        optionIndex: optionIndex,
        at: attempt.at
      },
      phase: updated.quiz.phase
    });
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
  try {
    const profile = await curriculumRepository.get(req.user.id);
    if (!profile) return res.json({ curriculum: null, adapter: curriculumRepository.adapterName() });
    return res.json({ curriculum: profile, adapter: curriculumRepository.adapterName() });
  } catch (error) {
    return res.status(error.status || 502).json({
      error: error.code || 'CURRICULUM_REQUEST_FAILED',
      message: error.message
    });
  }
});

/* Self-paced mastery practice. Each batch is ten student-safe questions, up to
   80 per topic; keys stay server-side and correctness is private to this student. */
router.post('/practice/batch', async function (req, res) {
  try {
    const body = req.body || {};
    const batch = await masteryPractice.createBatch(req.user, body.topic, body.previousBatchId);
    return res.json({
      batch: batch,
      batchSize: masteryPractice.BATCH_SIZE,
      topicLimit: masteryPractice.MAX_TOPIC_QUESTIONS,
      topicRemaining: batch.topicRemaining,
      unlimitedTopics: true
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'PRACTICE_FAILED',
      message: error.status === 400 || error.status === 409
        ? error.message
        : 'Practice could not be started.'
    });
  }
});

router.get('/practice/batch/:batchId', async function (req, res) {
  try {
    const batch = await masteryPractice.findForStudent(req.params.batchId, req.user);
    return res.json({ batch: masteryPractice.safeBatch(batch) });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'PRACTICE_FAILED',
      message: 'That practice batch is unavailable.'
    });
  }
});

router.post('/practice/batch/:batchId/answer', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await masteryPractice.answer(req.params.batchId, body.questionId, body.optionIndex, req.user);
    return res.json({ result: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'PRACTICE_FAILED',
      message: error.status === 400 || error.status === 409
        ? error.message
        : 'Your answer could not be saved.'
    });
  }
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
    const session = await db.findSession(body.sessionId);
    if (!session || !auth.canAccessSession(req.user, session)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
    }
  }

  const result = await chatAssistant.reply('student', body.question, {
    studentId: body.studentId || ownId,
    sessionId: body.sessionId || null,
    actor: req.user
  });
  return res.json({ reply: result.reply, source: result.source });
});

module.exports = router;
