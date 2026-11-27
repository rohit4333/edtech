/* Scaffolded mastery gating.
   Level 1 unlocks at the configured basics threshold (80 by default). Level 2
   unlocks at moderate mastery (50), which the trainer can approve. Level 3 has
   no published progression rule yet, so it stays in trainer-led reteach. */

const policy = require('../config/policy.json');

function configuredLevel2Threshold() {
  const value = policy.quiz && policy.quiz.level2UnlockThreshold;
  if (value === null || value === undefined || value === '') return 50;
  const number = Number(value);
  return Number.isFinite(number) ? number : 50;
}

const LEVEL_2_UNLOCK_THRESHOLD = configuredLevel2Threshold();

function configuredUnlockThreshold() {
  const value = policy.quiz && policy.quiz.unlockThreshold;
  if (value === null || value === undefined || value === '') return 80;
  const number = Number(value);
  return Number.isFinite(number) ? number : 80;
}

const UNLOCK_THRESHOLD = configuredUnlockThreshold();

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function configuredThreshold(override) {
  if (override !== undefined && override !== null && override !== '') {
    const value = Number(override);
    if (Number.isFinite(value)) return value;
  }
  return UNLOCK_THRESHOLD;
}

/** Accept 1/2/3, easy/medium/hard and their level_1 style aliases. */
function normalizeLevel(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  if (['1', 'easy', 'l1', 'level_1'].indexOf(raw) !== -1) return 1;
  if (['2', 'medium', 'l2', 'level_2'].indexOf(raw) !== -1) return 2;
  if (['3', 'hard', 'l3', 'level_3'].indexOf(raw) !== -1) return 3;
  const number = Number(raw);
  return [1, 2, 3].indexOf(number) !== -1 ? number : null;
}

/** Sessions without an explicit difficulty stay on the strict basics rule. */
function levelFromSession(session) {
  if (!session) return 1;
  const sources = [
    session.quiz && session.quiz.currentDifficultyLevel,
    session.currentLevel,
    session.difficultyLevel,
    session.level,
    session.masteryGating && session.masteryGating.currentLevel
  ];
  for (let index = 0; index < sources.length; index += 1) {
    const level = normalizeLevel(sources[index]);
    if (level) return level;
  }
  return 1;
}

function checkMasteryGating(studentId, topicId, currentQuizScore, thresholdOverride, currentLevel) {
  const currentScore = normalizeScore(currentQuizScore);
  const level = normalizeLevel(currentLevel) || 1;
  const basicsThreshold = configuredThreshold(thresholdOverride);
  const requiredScore = level === 2 ? LEVEL_2_UNLOCK_THRESHOLD : basicsThreshold;

  let unlockedNext = false;
  let rule = 'level_3_trainer_review';
  if (level === 1 && currentScore >= basicsThreshold) {
    unlockedNext = true;
    rule = 'level_1_basics_mastered';
  } else if (level === 2 && currentScore >= LEVEL_2_UNLOCK_THRESHOLD) {
    unlockedNext = true;
    rule = 'level_2_moderate_mastery';
  }

  return {
    studentId: studentId || null,
    topicId: topicId || null,
    currentScore: currentScore,
    currentLevel: level,
    threshold: basicsThreshold,
    requiredScore: requiredScore,
    rule: rule,
    unlockedNext: unlockedNext,
    reteachRequired: !unlockedNext,
    nextTopicId: unlockedNext ? null : (topicId || null),
    status: unlockedNext ? 'unlocked_next' : 'reteach_required',
    note: unlockedNext
      ? 'Next module unlocked. The curriculum service assigns the next topic.'
      : 'Stay on the current topic. Trainer should add a new check on the same objective.',
    checkedAt: new Date().toISOString()
  };
}

function scoreFromAttempts(attempts) {
  const rows = Array.isArray(attempts) ? attempts : [];
  if (!rows.length) return 0;
  const correct = rows.filter(function (attempt) { return attempt && attempt.correct; }).length;
  return Math.round((correct / rows.length) * 100);
}

function scoreFromSession(session) {
  return scoreFromAttempts(session && session.quiz && session.quiz.attempts);
}

/** A required parallel check stays pending until a correct attempt exists. */
function pendingParallelCheck(session) {
  const quiz = session && session.quiz;
  if (!quiz || !Array.isArray(quiz.questions)) return null;
  const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : [];
  for (let index = 0; index < quiz.questions.length; index += 1) {
    const question = quiz.questions[index];
    if (!question || question.requiresCorrectAnswer !== true) continue;
    const solved = attempts.some(function (attempt) {
      return attempt && attempt.questionId === question.id && attempt.correct === true;
    });
    if (!solved) return question;
  }
  return null;
}

function applyMasteryGating(session, currentQuizScore, topicId, currentLevel) {
  const resolvedTopicId = topicId || (session && session.topicId) ||
    (session && session.title) || 'general-mathematics';
  const level = normalizeLevel(currentLevel) || levelFromSession(session);
  const decision = checkMasteryGating(
    session && session.studentId,
    resolvedTopicId,
    Number.isFinite(Number(currentQuizScore)) ? currentQuizScore : scoreFromSession(session),
    undefined,
    level
  );

  session.masteryGating = decision;
  session.currentLevel = level;
  session.reteachRequired = decision.reteachRequired;
  if (decision.reteachRequired) session.currentTopicId = resolvedTopicId;

  return decision;
}

module.exports = {
  checkMasteryGating: checkMasteryGating,
  applyMasteryGating: applyMasteryGating,
  scoreFromAttempts: scoreFromAttempts,
  scoreFromSession: scoreFromSession,
  configuredThreshold: configuredThreshold,
  configuredLevel2Threshold: configuredLevel2Threshold,
  normalizeLevel: normalizeLevel,
  levelFromSession: levelFromSession,
  pendingParallelCheck: pendingParallelCheck,
  LEVEL_2_UNLOCK_THRESHOLD: LEVEL_2_UNLOCK_THRESHOLD,
  UNLOCK_THRESHOLD: UNLOCK_THRESHOLD
};
