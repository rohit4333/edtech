const assert = require('assert');
const gating = require('../services/masteryGating');

const atThreshold = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 80);
assert.strictEqual(atThreshold.unlockedNext, true);
assert.strictEqual(atThreshold.reteachRequired, false);
assert.strictEqual(atThreshold.currentScore, 80);

const belowThreshold = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 79);
assert.strictEqual(belowThreshold.unlockedNext, false);
assert.strictEqual(belowThreshold.reteachRequired, true);
assert.strictEqual(belowThreshold.nextTopicId, 'ratios-ch4');

const clamped = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 140);
assert.strictEqual(clamped.currentScore, 100);

const session = { studentId: 'usr_student_001', title: 'Ratios · Lesson 15', quiz: { attempts: [] } };
const applied = gating.applyMasteryGating(session, 72, 'ratios-ch4');
assert.strictEqual(applied.reteachRequired, true);
assert.strictEqual(session.reteachRequired, true);
assert.strictEqual(session.currentTopicId, 'ratios-ch4');

console.log('masteryGating: 9 assertions passed');
