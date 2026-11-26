/* Self-practice for the student mastery card.
 *
 * Batches contain exactly ten student-safe questions, with a 15% difficulty
 * rise each time. A topic offers up to 80 questions (8 batches), then closes
 * with an encouraging rest message. Answer keys stay in the service-only batch
 * record; the browser receives prompts, options and a private correct/try-again
 * flag after it answers. No hint, explanation, answer key or trainer-only field
 * is ever serialized to the student.
 */

const crypto = require('crypto');
const db = require('../db');
const quizGenerator = require('../quiz/generator');

const BATCH_SIZE = 10;
const CHUNK_SIZE = 5;
const MAX_TOPIC_QUESTIONS = 80;
/* Each batch is 15% harder than the previous one, inside the requested
   10-20% range, until the topic's 80-question cap is reached. */
const DIFFICULTY_STEP = 0.15;

function restMessage(topic) {
  return 'Beautifully done! You have practised 80 questions in ' + topic +
    '. Take a rest — you have earned it 🌟';
}

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function topicFor(student, requested) {
  const candidate = String(requested === undefined || requested === null ? '' : requested).trim() ||
    String((student && student.batch) || '').trim() ||
    'Mathematics';
  return candidate.slice(0, 80);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function difficultyFor(score, iteration) {
  const ramp = Math.pow(1 + DIFFICULTY_STEP, iteration);
  const level = quizGenerator.difficultyForMastery(clamp(score * ramp, 0, 100));
  return { level: level, ramp: ramp };
}

function safeBatch(batch) {
  return {
    id: batch.id,
    topic: batch.topic,
    size: batch.questions.length,
    answeredCount: (batch.attempts || []).length,
    iteration: batch.iteration,
    difficultyRamp: batch.difficultyRamp,
    difficultyPercent: Math.round((batch.difficultyRamp - 1) * 100),
    topicTotal: batch.topicTotal || batch.questions.length,
    topicLimit: batch.topicLimit || MAX_TOPIC_QUESTIONS,
    topicRemaining: Math.max(0, (batch.topicLimit || MAX_TOPIC_QUESTIONS) -
      (batch.topicTotal || batch.questions.length)),
    /* Offered count includes the current batch. Only mark the topic complete
       once those final ten questions have actually been answered, otherwise
       the browser would disable the last batch before a child can answer it. */
    topicComplete: (batch.topicTotal || batch.questions.length) >= MAX_TOPIC_QUESTIONS &&
      (batch.attempts || []).length === batch.questions.length,
    questions: batch.questions.map(function (question, index) {
      return {
        id: question.id,
        position: index + 1,
        prompt: question.prompt,
        options: question.options.slice(0),
        difficulty: quizGenerator.difficultyLabel(question.difficultyLevel)
      };
    })
  };
}

async function topicProgress(student, topic) {
  const rows = await db.listPracticeBatches();
  const batches = (Array.isArray(rows) ? rows : []).filter(function (batch) {
    return batch.studentId === student.id && batch.topic === topic;
  });
  const offered = batches.reduce(function (total, batch) {
    return total + ((batch.questions && batch.questions.length) || 0);
  }, 0);
  return {
    batches: batches,
    offered: offered,
    iteration: batches.length,
    remaining: Math.max(0, MAX_TOPIC_QUESTIONS - offered)
  };
}

async function createBatch(student, requestedTopic, previousBatchId) {
  if (!student || !student.id) throw problem('Sign in to start practice.', 'UNAUTHORIZED', 401);
  const topic = topicFor(student, requestedTopic);
  /* A stale batch id from another student must never steer this student's
     difficulty, even though the server-derived progress is authoritative. */
  if (previousBatchId) findForStudent(previousBatchId, student);

  const progress = await topicProgress(student, topic);
  if (progress.offered >= MAX_TOPIC_QUESTIONS) {
    throw problem(restMessage(topic), 'TOPIC_PRACTICE_COMPLETE', 409);
  }
  const mastery = Number(student.mastery);
  const score = Number.isFinite(mastery) ? mastery : 72;
  const iteration = progress.iteration;
  const difficulty = difficultyFor(score, iteration);
  const usedPrompts = [];
  const questions = [];

  while (questions.length < BATCH_SIZE) {
    const chunk = quizGenerator.buildFallbackQuiz(topic, score, {
      count: Math.min(CHUNK_SIZE, BATCH_SIZE - questions.length),
      usedPrompts: usedPrompts,
      level: difficulty.level,
      difficultyRamp: difficulty.ramp
    });
    if (!chunk.length) break;
    chunk.forEach(function (question) {
      usedPrompts.push(question.prompt);
      questions.push({
        id: question.id,
        prompt: question.prompt,
        options: question.options.slice(0, 4),
        answerIndex: question.answerIndex,
        difficultyLevel: question.difficultyLevel,
        difficultyRamp: question.difficultyRamp || difficulty.ramp
      });
    });
  }

  if (questions.length !== BATCH_SIZE) {
    throw problem('Practice questions are unavailable right now.', 'PRACTICE_UNAVAILABLE', 503);
  }

  const answers = {};
  questions.forEach(function (question) { answers[question.id] = question.answerIndex; });

  const batch = {
    id: 'practice_' + crypto.randomUUID(),
    studentId: student.id,
    topic: topic,
    createdAt: new Date().toISOString(),
    iteration: iteration,
    difficultyLevel: difficulty.level,
    difficultyRamp: difficulty.ramp,
    topicTotal: progress.offered + BATCH_SIZE,
    topicLimit: MAX_TOPIC_QUESTIONS,
    questions: questions,
    answers: answers,
    attempts: []
  };
  db.savePracticeBatch(batch);
  return safeBatch(batch);
}

function findForStudent(batchId, student) {
  const batch = db.findPracticeBatch(batchId);
  if (!batch) throw problem('That practice batch was not found.', 'BATCH_NOT_FOUND', 404);
  if (batch.studentId !== student.id && student.role !== 'founder') {
    throw problem('That practice batch belongs to another student.', 'FORBIDDEN', 403);
  }
  return batch;
}

function answer(batchId, questionId, optionIndex, student) {
  const batch = findForStudent(batchId, student);
  const question = batch.questions.find(function (item) { return item.id === questionId; });
  const index = Number(optionIndex);
  if (!question || !Number.isInteger(index) || index < 0 || index >= question.options.length) {
    throw problem('Unknown question or option.', 'INVALID_ANSWER', 400);
  }
  const attempts = batch.attempts || [];
  if (attempts.some(function (item) { return item.questionId === questionId; })) {
    throw problem('That question is already answered.', 'ALREADY_ANSWERED', 409);
  }

  const next = attempts.concat([{
    questionId: questionId,
    optionIndex: index,
    correct: batch.answers[questionId] === index,
    at: new Date().toISOString()
  }]);
  db.updatePracticeBatch(batchId, { attempts: next });
  const complete = next.length >= batch.questions.length;
  const topicTotal = batch.topicTotal || batch.questions.length;
  const topicLimit = batch.topicLimit || MAX_TOPIC_QUESTIONS;
  const topicComplete = complete && topicTotal >= topicLimit;
  return {
    questionId: questionId,
    correct: batch.answers[questionId] === index,
    answeredCount: next.length,
    complete: complete,
    topicTotal: topicTotal,
    topicLimit: topicLimit,
    topicRemaining: Math.max(0, topicLimit - topicTotal),
    topicComplete: topicComplete,
    restMessage: topicComplete ? restMessage(batch.topic) : null
  };
}

module.exports = {
  BATCH_SIZE: BATCH_SIZE,
  MAX_TOPIC_QUESTIONS: MAX_TOPIC_QUESTIONS,
  DIFFICULTY_STEP: DIFFICULTY_STEP,
  restMessage: restMessage,
  difficultyFor: difficultyFor,
  createBatch: createBatch,
  findForStudent: findForStudent,
  safeBatch: safeBatch,
  answer: answer
};
