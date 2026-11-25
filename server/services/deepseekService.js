/* Backward-compatible wrapper around the adaptive quiz generator.
   New code should require quiz/generator directly. */

const generator = require('../quiz/generator');

const DIFFICULTY_SCORES = {
  l1: 30,
  easy: 30,
  level1: 30,
  l2: 65,
  medium: 65,
  level2: 65,
  l3: 90,
  hard: 90,
  level3: 90
};

function scoreForDifficulty(difficulty) {
  const key = String(difficulty || '').trim().toLowerCase().replace(/\s+/g, '');
  return DIFFICULTY_SCORES[key] || DIFFICULTY_SCORES.level2;
}

/**
 * Legacy export kept so existing callers do not break.
 * Difficulty accepts easy|medium|hard, 1|2|3 or Level 1|2|3.
 */
async function generateQuizDraft(topic, difficulty) {
  return generator.generateAdaptiveQuiz(topic, scoreForDifficulty(difficulty), { count: 3 });
}

module.exports = Object.assign({}, generator, {
  generateQuizDraft: generateQuizDraft,
  difficultyLabel: generator.difficultyLabel,
  calculateNextDifficulty: generator.calculateNextDifficulty
});
