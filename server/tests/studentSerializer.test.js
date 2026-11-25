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

console.log('studentSerializer: 15 assertions passed');
