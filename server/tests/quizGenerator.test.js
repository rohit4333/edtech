const assert = require('assert');
const generator = require('../quiz/generator');

async function main() {
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
});
