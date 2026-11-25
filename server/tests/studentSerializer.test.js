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

console.log('studentSerializer: 7 assertions passed');
