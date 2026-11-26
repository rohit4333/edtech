/* Service contract for capped, ramping mastery self-practice. The mock store is
   shared in-process, so every scenario uses its own topic name. No network or
   AI call is made: the ten prompts come from the deterministic fallback. */

const assert = require('assert');
const practice = require('../services/masteryPracticeService');

const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const PRIVATE_KEYS = [
  'answerIndex', 'correctAnswer', 'hint', 'explanation', 'trainerInstructions',
  'misconception_watch', 'answers', 'answerKey', 'correctOptionId', 'correctOptionIndex'
];

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    label + ' (expected ' + expected + ', got ' + actual + ')');
  checks += 1;
}
async function rejectsWith(action, expected, label) {
  await assert.rejects(action, function (error) {
    return Object.keys(expected).every(function (key) { return error[key] === expected[key]; });
  }, label);
  checks += 1;
}

function assertBatchShape(batch, label) {
  equal(batch.size, practice.BATCH_SIZE, label + ' contains ten questions');
  equal(batch.questions.length, practice.BATCH_SIZE, label + ' serializes ten questions');
  equal(batch.topicLimit, practice.MAX_TOPIC_QUESTIONS, label + ' advertises the 80-question cap');
  equal(batch.topicTotal, (batch.iteration + 1) * practice.BATCH_SIZE,
    label + ' counts the questions offered so far');
  equal(batch.topicRemaining, practice.MAX_TOPIC_QUESTIONS - (batch.iteration + 1) * practice.BATCH_SIZE,
    label + ' reports the remaining allowance');
  equal(batch.topicComplete, false,
    label + ' leaves all ten offered questions answerable');
}

function assertNoLeaks(batch, label) {
  const serialized = JSON.stringify(batch);
  PRIVATE_KEYS.forEach(function (key) {
    ok(serialized.indexOf('"' + key + '"') === -1, label + ' hides ' + key);
  });
  batch.questions.forEach(function (question, index) {
    equal(question.position, index + 1, label + ' numbers question ' + (index + 1));
    equal(question.options.length, 4, label + ' question ' + (index + 1) + ' has four options');
    PRIVATE_KEYS.forEach(function (key) {
      ok(!(key in question), label + ' question ' + (index + 1) + ' omits ' + key);
    });
  });
}

async function main() {
  equal(practice.BATCH_SIZE, 10, 'a practice batch holds ten questions');
  equal(practice.MAX_TOPIC_QUESTIONS, 80, 'a topic allows 80 questions');
  near(practice.DIFFICULTY_STEP, 0.15, 'difficulty rises 15% per batch');
  near(practice.difficultyFor(72, 0).ramp, 1, 'iteration zero has no ramp');
  near(practice.difficultyFor(72, 1).ramp, 1.15, 'iteration one ramps 15%');
  near(practice.difficultyFor(72, 2).ramp, 1.3225, 'the ramp compounds');

  const student = { id: 'usr_practice_' + stamp, role: 'student', mastery: 72 };
  const topic = 'Ratios Cap ' + stamp;
  const otherTopic = 'Fractions Cap ' + stamp;

  const first = await practice.createBatch(student, topic);
  assertBatchShape(first, 'first batch');
  assertNoLeaks(first, 'first batch');
  equal(first.iteration, 0, 'the first batch starts at iteration 0');
  near(first.difficultyRamp, 1, 'the first batch has no difficulty ramp');
  equal(first.difficultyPercent, 0, 'the first batch reports 0% extra difficulty');

  const second = await practice.createBatch(student, topic, first.id);
  assertBatchShape(second, 'second batch');
  equal(second.iteration, 1, 'the second batch advances the iteration');
  ok(second.iteration > first.iteration, 'iteration rises with a valid previous batch id');
  near(second.difficultyRamp, 1.15, 'the second batch ramps about 1.15');
  equal(second.difficultyPercent, 15, 'the second batch reports 15% extra difficulty');

  const batches = [first, second];
  for (let iteration = 2; iteration < practice.MAX_TOPIC_QUESTIONS / practice.BATCH_SIZE; iteration += 1) {
    const batch = await practice.createBatch(student, topic, batches[iteration - 1].id);
    assertBatchShape(batch, 'batch ' + (iteration + 1));
    equal(batch.iteration, iteration, 'batch ' + (iteration + 1) + ' uses the stored iteration');
    batches.push(batch);
  }
  equal(batches.length, 8, 'eight batches (80 questions) are allowed');

  const finalBatch = batches[batches.length - 1];
  assertNoLeaks(finalBatch, 'final batch');
  equal(finalBatch.topicComplete, false, 'the eighth batch is still answerable when offered');

  const fresh = await practice.createBatch(student, otherTopic);
  equal(fresh.iteration, 0, 'a different topic restarts at iteration 0');
  near(fresh.difficultyRamp, 1, 'a different topic restarts without a ramp');
  equal(fresh.topicTotal, practice.BATCH_SIZE, 'a different topic has its own question count');

  const nextOther = await practice.createBatch(student, otherTopic);
  equal(nextOther.iteration, 1, 'iteration is derived from stored batches, not the client');
  near(nextOther.difficultyRamp, 1.15, 'server-derived iteration still ramps 15%');

  const expectedMessage = practice.restMessage(topic);
  equal(expectedMessage.indexOf(topic) !== -1, true, 'the rest message names the topic');
  equal(expectedMessage.indexOf('80') !== -1, true, 'the rest message names the cap');
  await rejectsWith(function () { return practice.createBatch(student, topic, fresh.id); }, {
    code: 'TOPIC_PRACTICE_COMPLETE', status: 409, message: expectedMessage
  }, 'the ninth request is rejected with the topic-complete message');

  let result;
  for (let index = 0; index < finalBatch.questions.length; index += 1) {
    result = await practice.answer(finalBatch.id, finalBatch.questions[index].id, 0, student);
    equal(typeof result.correct, 'boolean', 'each answer returns a private boolean');
  }
  equal(result.answeredCount, practice.BATCH_SIZE, 'all ten answers are recorded');
  equal(result.complete, true, 'the final batch is complete');
  equal(result.topicComplete, true, 'the final answer reports the topic is complete');
  equal(result.restMessage, expectedMessage, 'the final answer carries the rest message');
  PRIVATE_KEYS.forEach(function (key) {
    equal(result[key], undefined, 'the answer result omits ' + key);
  });
  const completedBatch = practice.safeBatch(await practice.findForStudent(finalBatch.id, student));
  equal(completedBatch.topicComplete, true, 'a re-read final batch is complete once answered');
  equal(completedBatch.answeredCount, practice.BATCH_SIZE, 'the re-read batch reports all ten attempts');

  const foreignStudent = { id: 'usr_practice_foreign_' + stamp, role: 'student', mastery: 60 };
  const foreignBatch = await practice.createBatch(foreignStudent, 'Foreign Ratios ' + stamp);
  await rejectsWith(function () { return practice.createBatch(student, otherTopic, foreignBatch.id); }, {
    code: 'FORBIDDEN', status: 403
  }, 'a previous batch owned by another student is rejected');
  await rejectsWith(function () {
    return practice.createBatch(student, otherTopic, 'practice_missing_' + stamp);
  }, { code: 'BATCH_NOT_FOUND', status: 404 }, 'an unknown previous batch id is rejected');

  console.log('masteryPractice: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
