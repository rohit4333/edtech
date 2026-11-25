/* Mastery gating for the 80% rule.
   A score at or above the configured threshold unlocks the next curriculum
   topic. Anything below keeps the student on the current topic and marks the
   session for trainer-led reteach. */

const policy = require('../config/policy.json');

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

function checkMasteryGating(studentId, topicId, currentQuizScore, thresholdOverride) {
  const currentScore = normalizeScore(currentQuizScore);
  const threshold = configuredThreshold(thresholdOverride);
  const unlockedNext = currentScore >= threshold;

  return {
    studentId: studentId || null,
    topicId: topicId || null,
    currentScore: currentScore,
    threshold: threshold,
    unlockedNext: unlockedNext,
    reteachRequired: !unlockedNext,
    nextTopicId: unlockedNext ? null : (topicId || null),
    status: unlockedNext ? 'unlocked_next' : 'reteach_required',
    note: unlockedNext
      ? 'Next module unlocked. The curriculum service assigns the next topic.'
      : 'Stay on the current topic. Trainer should trigger reteach, then a new check.',
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

function applyMasteryGating(session, currentQuizScore, topicId) {
  const resolvedTopicId = topicId || (session && session.topicId) ||
    (session && session.title) || 'general-mathematics';
  const decision = checkMasteryGating(
    session && session.studentId,
    resolvedTopicId,
    Number.isFinite(Number(currentQuizScore)) ? currentQuizScore : scoreFromSession(session)
  );

  session.masteryGating = decision;
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
  UNLOCK_THRESHOLD: UNLOCK_THRESHOLD
};
