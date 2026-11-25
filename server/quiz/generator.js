/* Adaptive quiz generation.
   Production path: Cloudflare Workers AI, strict JSON output, trainer review
   before any question reaches a student. Local fallback: deterministic
   curriculum scaffold used when Workers AI is unavailable. */

const templates = require('./templates');
const policy = require('../config/policy.json');
const { generateAIResponse, isConfigured } = require('../services/cloudflareAiService');
const { getCurriculumContext } = require('../services/curriculumContext');

const DEFAULT_COUNT = 3;
const MAX_COUNT = 5;
const MASTERY_LEVEL_2 = 60;
const DEFAULT_LEVEL = 2;

function error(message, code, status) {
  const failure = new Error(message);
  failure.code = code;
  failure.status = status || 500;
  return failure;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numericScore(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), 0, 100) : fallback;
}

function configuredNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unlockThreshold() {
  return configuredNumber(policy.quiz && policy.quiz.unlockThreshold, 80);
}

function difficultyMapping() {
  const configured = (policy.quiz && policy.quiz.difficultyMapping) || {};
  return {
    level1: configured.level1 || { label: 'easy', level: 1, scoreBand: [0, 39] },
    level2: configured.level2 || { label: 'medium', level: 2, scoreBand: [40, 79] },
    level3: configured.level3 || { label: 'hard', level: 3, scoreBand: [80, 100] }
  };
}

/* Level 1 is baseline. Level 2 is +5% harder than L1. Level 3 is +25% harder
   than L2. The 80% mark also matches the mastery gate for the next module. */
function difficultyForMastery(currentMasteryScore) {
  const score = numericScore(currentMasteryScore, MASTERY_LEVEL_2);
  if (score >= unlockThreshold()) return 3;
  if (score >= MASTERY_LEVEL_2) return 2;
  return 1;
}

function difficultyLabel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (/^level\s*[123]$/i.test(raw)) return 'Level ' + raw.replace(/\D/g, '');
  if (raw === 'easy' || raw === '1' || raw === 'l1') return 'Level 1';
  if (raw === 'hard' || raw === '3' || raw === 'l3') return 'Level 3';
  return 'Level 2';
}

function difficultyNumber(value) {
  return Number(difficultyLabel(value).replace(/\D/g, ''));
}

/**
 * Adaptive step from the current level using the latest score.
 * >= threshold steps up, < 40 steps down, 40..threshold-1 stays level.
 * Level 1 and Level 3 are clamped because there is no Level 0 or 4.
 */
function calculateNextDifficulty(currentLevel, score) {
  const mapping = difficultyMapping();
  const number = difficultyNumber(currentLevel);
  const entry = mapping['level' + number];
  const level = clamp(configuredNumber(entry && entry.level, number) || DEFAULT_LEVEL, 1, 3);
  const value = clamp(configuredNumber(score, 0), 0, 100);

  if (value >= unlockThreshold()) return Math.min(3, level + 1);
  if (value < 40) return Math.max(1, level - 1);
  return level;
}

function parseJsonObject(text) {
  let content = String(text || '').trim();
  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) content = fenced[1].trim();

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object.');
    }
    return parsed;
  } catch (failure) {
    throw error('Workers AI response was not a strict JSON object.', 'CLOUDFLARE_INVALID_JSON', 502);
  }
}

function buildMessages(topic, level, count, student) {
  const spec = templates.difficultySpec(level);
  const curriculum = getCurriculumContext(student || {});
  const system = [
    'You write math checkpoint questions for a 1-on-1 tutor to review before a student sees them.',
    'The student follows their own school curriculum. Do not introduce group-class context.',
    'Curriculum context (follow its style, notation and illustration context exactly): ' +
      curriculum.promptInjection.replace(/\n/g, ' '),
    'Teaching design for every block: open with a visual analogy and a short story narration, then reserve a sketch_space block (minHeight 220, expandable: true) for live trainer drawing.',
    'For EVERY block prepare trainerInstructions (what to say and draw) and misconception_watch. Both are trainer-only: use them to shape the question, but do not emit them in the JSON.',
    'There are exactly three difficulty levels:',
    'Level 1 = Easiest (Baseline). Direct recognition, one clear step, small friendly numbers.',
    'Level 2 = Moderate, exactly +5% harder than Level 1. Add one reasoning step.',
    'Level 3 = Hardest, exactly +25% harder than Level 2. Require transfer or two reasoning steps.',
    'Selected difficulty: ' + spec.level + '. ' + spec.label + '. ' + spec.instruction,
    'Return ONLY a JSON object with this exact shape:',
    '{"questions":[{"question":"string","options":["a","b","c","d"],"correctAnswer":"a","hint":"string"}]}',
    'Rules: exactly ' + count + ' questions; exactly 4 string options per question;',
    'correctAnswer must exactly match one of the options; hint must be a short teaching nudge;',
    'no markdown, no code fences, no commentary, no explanation, no answer key field.'
  ].join(' ');

  return [
    { role: 'system', content: system },
    { role: 'user', content: 'Write ' + count + ' ' + spec.level + ' question(s) about ' + topic + '.' }
  ];
}

function validatePayload(parsed, expectedCount, usedPrompts) {
  const questions = parsed && parsed.questions;
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw error(
      'Workers AI must return exactly ' + expectedCount + ' question(s) in a questions array.',
      'CLOUDFLARE_INVALID_JSON',
      502
    );
  }

  const seen = (usedPrompts || []).slice();
  questions.forEach(function (question, index) {
    if (!question || typeof question.question !== 'string' || !question.question.trim()) {
      throw error('Question ' + (index + 1) + ' has no question text.', 'CLOUDFLARE_INVALID_JSON', 502);
    }
    if (!Array.isArray(question.options) || question.options.length !== 4 ||
        question.options.some(function (option) { return typeof option !== 'string' || !option.trim(); })) {
      throw error('Question ' + (index + 1) + ' needs exactly 4 non-empty string options.', 'CLOUDFLARE_INVALID_JSON', 502);
    }
    if (typeof question.correctAnswer !== 'string' || !question.correctAnswer.trim()) {
      throw error('Question ' + (index + 1) + ' has no correctAnswer.', 'CLOUDFLARE_INVALID_JSON', 502);
    }
    if (typeof question.hint !== 'string' || !question.hint.trim()) {
      throw error('Question ' + (index + 1) + ' has no hint.', 'CLOUDFLARE_INVALID_JSON', 502);
    }
    if (seen.indexOf(question.question.trim()) !== -1) {
      throw error('Question ' + (index + 1) + ' repeats a prompt.', 'CLOUDFLARE_INVALID_JSON', 502);
    }
    seen.push(question.question.trim());
  });

  return questions;
}

function questionId(index) {
  return 'q_ai_' + Date.now() + '_' + index + '_' + Math.random().toString(36).slice(2, 7);
}

function normalizeQuestion(raw, index, level, templateId) {
  const options = raw.options.map(function (option) { return option.trim(); });
  const correctAnswer = raw.correctAnswer.trim();
  const answerIndex = options.indexOf(correctAnswer);
  if (answerIndex === -1) {
    throw error('correctAnswer must match one of the four options.', 'CLOUDFLARE_INVALID_JSON', 502);
  }

  const objective = templates.resolveObjective(templateId);
  return {
    id: questionId(index),
    prompt: raw.question.trim(),
    options: options,
    answerIndex: answerIndex,
    correctAnswer: correctAnswer,
    hint: raw.hint.trim(),
    explanation: null,
    source: 'ai_draft',
    templateId: objective.id,
    difficultyLevel: level,
    status: 'draft'
  };
}

async function callCloudflare(topic, level, count, student) {
  const messages = buildMessages(topic, level, count, student);
  const generatedText = await generateAIResponse(
    messages[0].content,
    messages[1].content,
    { jsonOnly: true }
  );
  if (!generatedText) {
    throw error('Workers AI returned no quiz draft.', 'CLOUDFLARE_EMPTY_RESULT', 502);
  }
  return parseJsonObject(generatedText);
}

function buildFallbackQuiz(topic, currentMasteryScore, options) {
  const settings = options || {};
  const level = difficultyNumber(settings.level || difficultyForMastery(currentMasteryScore));
  const count = clamp(Number(settings.count) || DEFAULT_COUNT, 1, MAX_COUNT);
  const used = (settings.usedPrompts || []).slice();
  const templateId = settings.templateId || settings.objectiveId || null;
  const questions = [];

  for (let index = 0; index < count; index += 1) {
    const question = templates.buildFallbackQuestion(templateId, used, level);
    question.id = questionId(index);
    questions.push(question);
    used.push(question.prompt);
  }

  return questions;
}

/**
 * Generate trainer-reviewable adaptive quiz questions.
 * @param {string} topic student's current curriculum topic
 * @param {number} currentMasteryScore 0-100
 * @param {object} options { count, usedPrompts, templateId, allowFallback }
 * @returns {Promise<Array<{prompt:string, options:string[], answerIndex:number, correctAnswer:string, hint:string, source:string}>>}
 */
async function generateAdaptiveQuiz(topic, currentMasteryScore, options) {
  const settings = options || {};
  const safeTopic = String(topic || '').trim() || 'general mathematics';
  const score = clamp(configuredNumber(currentMasteryScore, 0), 0, 100);
  const currentLevel = difficultyNumber(
    settings.currentLevel || settings.level || difficultyForMastery(score)
  );
  const level = calculateNextDifficulty(currentLevel, score);
  const count = clamp(Number(settings.count) || DEFAULT_COUNT, 1, MAX_COUNT);
  const usedPrompts = Array.isArray(settings.usedPrompts) ? settings.usedPrompts : [];

  if (!isConfigured() && settings.allowFallback !== false) {
    return buildFallbackQuiz(safeTopic, score, {
      count: count,
      level: level,
      usedPrompts: usedPrompts,
      templateId: settings.templateId
    });
  }

  const parsed = await callCloudflare(safeTopic, level, count, settings.student);
  const validated = validatePayload(parsed, count, usedPrompts);
  return validated.map(function (question, index) {
    return normalizeQuestion(question, index, level, settings.templateId);
  });
}

function scoreFromAttempts(session) {
  const attempts = (session && session.quiz && session.quiz.attempts) || [];
  if (!attempts.length) return 0;
  const correct = attempts.filter(function (attempt) { return attempt.correct; }).length;
  return Math.round((correct / attempts.length) * 100);
}

async function generateQuestionForSession(session, options) {
  const settings = options || {};
  const sessionMastery = Number(session && session.mastery);
  const score = Number.isFinite(sessionMastery) ? sessionMastery : scoreFromAttempts(session);
  const topic = settings.topic || (session && session.title) || 'mathematics';
  const student = settings.student || (session && session.student) || null;
  const questions = await generateAdaptiveQuiz(topic, score, Object.assign({}, settings, {
    count: 1,
    student: student
  }));
  return questions[0];
}

module.exports = {
  generateAdaptiveQuiz: generateAdaptiveQuiz,
  generateQuestionForSession: generateQuestionForSession,
  buildFallbackQuiz: buildFallbackQuiz,
  difficultyForMastery: difficultyForMastery,
  calculateNextDifficulty: calculateNextDifficulty,
  difficultyLabel: difficultyLabel,
  difficultyNumber: difficultyNumber,
  scoreFromAttempts: scoreFromAttempts,
  validatePayload: validatePayload
};
