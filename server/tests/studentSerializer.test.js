const assert = require('assert');
const db = require('../db');
const serializers = require('../serializers');

const session = db.findSession('ses_math_001');
const payload = serializers.toStudentSession(
  serializers.stripTrainerOnlyFields(session)
);
const json = JSON.stringify(payload);

assert.strictEqual(json.indexOf('trainer_instructions'), -1);
assert.strictEqual(json.indexOf('trainerNotes'), -1);
assert.strictEqual(json.indexOf('Opening prompt'), -1);
assert.strictEqual(json.indexOf('answerIndex'), -1);
assert.strictEqual(json.indexOf('"correct"'), -1);
assert.strictEqual(payload.pages.length, session.pages.length);
assert.strictEqual(payload.quiz.status, 'ready');

const hostile = {
  trainerInstructions: 'whisper this to the trainer',
  misconception_watch: ['confuses ratio with difference'],
  answerKey: '6 : 10',
  correctOptionId: 'a',
  explanation: 'both parts scaled by two',
  nested: { explanation: 'nested explanation', safe: 'keep me' },
  items: [{ answerKey: '20 cm', safe: true }]
};
const warnings = [];
const originalWarn = console.warn;
console.warn = function (message) { warnings.push(message); };
let studentCopy;
let trainerCopy;
try {
  studentCopy = serializers.stripTrainerOnlyFields(hostile, 'student');
  trainerCopy = serializers.stripTrainerOnlyFields(hostile, 'trainer');
} finally {
  console.warn = originalWarn;
}

const studentCopyJson = JSON.stringify(studentCopy);
['trainerInstructions', 'misconception_watch', 'answerKey', 'correctOptionId', 'explanation']
  .forEach(function (key) {
    assert.strictEqual(studentCopyJson.indexOf('"' + key + '"'), -1);
  });
assert.strictEqual(studentCopy.nested.safe, 'keep me');
assert.strictEqual(
  warnings.indexOf('[SECURITY] Trainer-only fields detected in student payload!') !== -1,
  true
);
assert.strictEqual(trainerCopy.answerKey, '6 : 10');

const questionImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9a4AAAAABJRU5ErkJggg==';
const requiredQuestion = Object.assign({}, session.quiz.questions[0], {
  id: 'q_required',
  requiresCorrectAnswer: true,
  image: questionImage
});
const withRequired = Object.assign({}, session, {
  quiz: Object.assign({}, session.quiz, {
    status: 'live',
    questions: [requiredQuestion],
    currentQuestionId: requiredQuestion.id
  })
});
const safeRequired = serializers.toStudentSession(
  serializers.stripTrainerOnlyFields(withRequired, 'student')
);
assert.strictEqual(safeRequired.quiz.questions[0].requiresCorrectAnswer, true);
assert.strictEqual(safeRequired.quiz.questions[0].answerIndex, undefined);
assert.strictEqual(safeRequired.quiz.questions[0].image, questionImage);
assert.strictEqual(serializers.toTrainerSession(withRequired).quiz.questions[0].image, questionImage);
assert.strictEqual(JSON.stringify(safeRequired).indexOf('"answerKey"'), -1);
assert.strictEqual(JSON.stringify(safeRequired).indexOf('"explanation"'), -1);

console.log('studentSerializer: 22 assertions passed');
