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

/* Scaffolded progression: L1 basics at 80, L2 moderate at 50. */
const l1Mastered = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 85, undefined, 1);
assert.strictEqual(l1Mastered.unlockedNext, true);
assert.strictEqual(l1Mastered.currentLevel, 1);
assert.strictEqual(l1Mastered.requiredScore, 80);
assert.strictEqual(l1Mastered.rule, 'level_1_basics_mastered');

const l1Below = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 79, undefined, 1);
assert.strictEqual(l1Below.unlockedNext, false);
assert.strictEqual(l1Below.reteachRequired, true);

const l2Moderate = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 50, undefined, 2);
assert.strictEqual(l2Moderate.unlockedNext, true);
assert.strictEqual(l2Moderate.requiredScore, 50);
assert.strictEqual(l2Moderate.rule, 'level_2_moderate_mastery');

const l2Below = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 49, undefined, 'level_2');
assert.strictEqual(l2Below.unlockedNext, false);
assert.strictEqual(l2Below.reteachRequired, true);

const l3Review = gating.checkMasteryGating('usr_student_001', 'ratios-ch4', 95, undefined, 'hard');
assert.strictEqual(l3Review.unlockedNext, false);
assert.strictEqual(l3Review.currentLevel, 3);

assert.strictEqual(gating.normalizeLevel('easy'), 1);
assert.strictEqual(gating.normalizeLevel('level_2'), 2);
assert.strictEqual(gating.normalizeLevel('3'), 3);
assert.strictEqual(gating.levelFromSession({ quiz: { currentDifficultyLevel: 'medium' } }), 2);
assert.strictEqual(gating.levelFromSession({}), 1);

const withRequired = {
  quiz: {
    attempts: [{ questionId: 'q_a', correct: false }],
    questions: [
      { id: 'q_a', prompt: 'First', requiresCorrectAnswer: true },
      { id: 'q_b', prompt: 'Second', requiresCorrectAnswer: true }
    ]
  }
};
assert.strictEqual(gating.pendingParallelCheck(withRequired).id, 'q_a');
withRequired.quiz.attempts.push({ questionId: 'q_a', correct: true });
assert.strictEqual(gating.pendingParallelCheck(withRequired).id, 'q_b');
withRequired.quiz.attempts.push({ questionId: 'q_b', correct: true });
assert.strictEqual(gating.pendingParallelCheck(withRequired), null);

console.log('masteryGating: 31 assertions passed');
