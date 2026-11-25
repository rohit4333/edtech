const assert = require('assert');
const generator = require('../quiz/generator');

/* Keep generator assertions deterministic even when .env has Cloudflare creds. */
const providerKeys = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_MODEL',
  'CLOUDFLARE_TIMEOUT_MS'
];
const originalProviderEnv = {};
providerKeys.forEach(function (key) { originalProviderEnv[key] = process.env[key]; });

async function main() {
  providerKeys.forEach(function (key) { delete process.env[key]; });

  assert.strictEqual(generator.difficultyForMastery(45), 1);
  assert.strictEqual(generator.difficultyForMastery(72), 2);
  assert.strictEqual(generator.difficultyForMastery(80), 3);

  const quiz = await generator.generateAdaptiveQuiz('Equivalent ratios', 72, { count: 2 });
  assert.strictEqual(quiz.length, 2);
  quiz.forEach(function (question) {
    assert.strictEqual(question.options.length, 4);
    assert.ok(question.options.indexOf(question.correctAnswer) !== -1);
    assert.strictEqual(question.answerIndex, question.options.indexOf(question.correctAnswer));
    assert.ok(typeof question.hint === 'string' && question.hint.length > 0);
    assert.strictEqual(question.difficultyLevel, 2);
    assert.ok(question.source === 'fallback' || question.source === 'ai_draft');
  });

  const next = await generator.generateQuestionForSession({
    title: 'Ratios · Lesson 15',
    mastery: 86,
    quiz: { attempts: [] }
  });
  assert.strictEqual(next.difficultyLevel, 3);
  assert.strictEqual(next.status, 'draft');

  console.log('quizGenerator: 21 assertions passed');
}

main().catch(function (failure) {
  console.error(failure);
  process.exitCode = 1;
}).finally(function () {
  providerKeys.forEach(function (key) {
    if (originalProviderEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalProviderEnv[key];
  });
});
