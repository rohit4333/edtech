const assert = require('assert');
const service = require('../services/deepseekService');
const serializers = require('../serializers');
const policy = require('../config/policy.json');

const originalKey = process.env.DEEPSEEK_API_KEY;
const originalBaseUrl = process.env.DEEPSEEK_BASE_URL;
const originalFetch = global.fetch;
let checks = 0;

function ok(value, label) {
  assert.ok(value, label);
  checks += 1;
}

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

function deepEqual(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  checks += 1;
}

function envelope(content) {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }]
  });
}

async function main() {
  try {
    delete process.env.DEEPSEEK_API_KEY;

    const context = {
      board: 'CBSE',
      grade: 5,
      topic: 'Equivalent ratios',
      student_age: 10,
      language: 'English',
      mode: 'school_curriculum',
      school_chapter_context: 'NCERT Class 5 Ratios',
      mastery_pct: 72,
      current_level: 2,
      previously_asked_questions: [{ stem: 'Which ratio equals 2 : 3?' }],
      learning_objectives: ['Identify equivalent ratios'],
      estimated_minutes: 45
    };

    deepEqual(service.safeParseJSON('```json\n{"a":1,}\n```'), { a: 1 },
      'safeParseJSON strips fences and trailing commas');
    equal(service.safeParseJSON('{ definitely not json '), null,
      'safeParseJSON returns null on invalid JSON');

    equal(service.calculateNextDifficulty('medium', 85), 'hard',
      'score >=80 moves one difficulty level up');
    equal(service.calculateNextDifficulty('medium', 35), 'easy',
      'score <40 moves one difficulty level down');
    equal(service.calculateNextDifficulty('medium', 72), 'medium',
      'score 40–79 keeps the current difficulty level');
    equal(service.calculateNextDifficulty('hard', 95), 'hard',
      'difficulty never moves past hard');
    equal(service.calculateNextDifficulty('easy', 20), 'easy',
      'difficulty never moves below easy');
    equal(service.calculateNextDifficulty(2, 85), 3,
      'numeric difficulty path remains backward compatible');
    equal(service.difficultyForMastery(85), 3,
      'difficultyForMastery remains intact');
    equal(typeof service.generatePlannerAndCurriculum, 'function',
      'generatePlannerAndCurriculum is exported for routes');
    equal(typeof service.generateQuizTiers, 'function',
      'generateQuizTiers is exported for routes');

    deepEqual(policy.quiz.scoringBands, {
      easy: { min: 0, max: 40 },
      medium: { min: 41, max: 79 },
      hard: { min: 80, max: 100 }
    }, 'policy exposes authoritative scoring bands');

    assert.throws(function () {
      service.validatePlannerOutput({ topic_id: 'incomplete' }, context);
    }, /schema validation/);
    checks += 1;

    const planner = await service.generatePlannerAndCurriculum(context);
    equal(planner.planner.version, 1, 'planner schema version is 1');
    equal(planner.curriculum_map.chapter, 'NCERT Class 5 Ratios',
      'school_curriculum maps to the supplied chapter');

    const types = planner.planner.blocks.map(function (block) { return block.type; });
    ['heading', 'analogy', 'story', 'sketch_space', 'text'].forEach(function (type) {
      ok(types.indexOf(type) !== -1, 'planner includes a ' + type + ' block');
    });

    planner.planner.blocks.forEach(function (block) {
      ok(typeof block.trainerInstructions === 'string' && block.trainerInstructions.length > 0,
        'block ' + block.id + ' has trainerInstructions');
      ok(Array.isArray(block.misconception_watch) && block.misconception_watch.length > 0,
        'block ' + block.id + ' has misconception_watch');
    });

    const sketches = planner.planner.blocks.filter(function (block) {
      return block.type === 'sketch_space';
    });
    ok(sketches.length > 0, 'planner includes sketch space');
    sketches.forEach(function (block) {
      ok(block.sketch.minHeight >= 220, 'sketch ' + block.id + ' has real height');
      ok(block.sketch.expandable === true, 'sketch ' + block.id + ' is expandable');
      ok(typeof block.sketch.prompt_for_trainer === 'string',
        'sketch ' + block.id + ' has a trainer drawing prompt');
    });

    const studentPlannerJson = JSON.stringify(serializers.toStudentCurriculum(planner));
    ['trainerInstructions', 'trainer_instructions', 'misconception_watch', 'prompt_for_trainer']
      .forEach(function (key) {
        equal(studentPlannerJson.indexOf('"' + key + '"'), -1,
          'student planner excludes ' + key);
      });
    ok(studentPlannerJson.indexOf('Equivalent ratios') !== -1,
      'student planner keeps lesson content');

    const quiz = await service.generateQuizTiers(context, planner);
    deepEqual(Object.keys(quiz.quiz), ['level_1', 'level_2', 'level_3'],
      'quiz has exactly three tiers');

    const limits = { level_1: 45, level_2: 75, level_3: 120 };
    const allItems = [];
    Object.keys(quiz.quiz).forEach(function (tier) {
      ok(quiz.quiz[tier].length > 0, tier + ' has at least one item');
      quiz.quiz[tier].forEach(function (item) {
        allItems.push(item);
        equal(item.options.length, 4, item.id + ' has four options');
        equal(item.hints.length, 2, item.id + ' has two ordered hints');
        equal(item.time_limit_sec, limits[tier], item.id + ' uses the tier time limit');
        equal(Object.keys(item.distractor_rationale).length, 3,
          item.id + ' names all three distractor misconceptions');
        const correct = item.options.find(function (option) {
          return option.id === item.correctOptionId;
        });
        equal(item.answerKey, correct.text, item.id + ' answerKey matches the correct option');
        ok(item.hints.every(function (hint) {
          return hint.toLowerCase().indexOf(item.answerKey.toLowerCase()) === -1;
        }), item.id + ' hints do not restate the answer');
        ok(item.stem !== context.previously_asked_questions[0].stem,
          item.id + ' does not repeat asked history');
      });
    });
    ok(allItems.some(function (item) { return item.requires_sketch; }),
      'at least one quiz item needs the sketch space');
    ok(quiz.advance_criteria.gate_pct >= 70 && quiz.advance_criteria.gate_pct <= 80,
      'advance gate sits inside 70–80%');
    equal(quiz.advance_criteria.repeat_if_below, true, 'below-gate repeats the check');

    const studentQuizJson = JSON.stringify(serializers.toStudentQuizTiers(quiz));
    ['answerKey', 'correctOptionId', 'explanation', 'hints', 'distractor_rationale']
      .forEach(function (key) {
        equal(studentQuizJson.indexOf('"' + key + '"'), -1,
          'student quiz excludes ' + key);
      });

    const firstItem = allItems[0];
    const grantedJson = JSON.stringify(serializers.toStudentQuizTiers(quiz, {
      grantedHints: {}
    }));
    equal(grantedJson.indexOf('"hints"'), -1,
      'hints stay withheld until explicitly granted');

    const oneHintJson = JSON.stringify(serializers.toStudentQuizTiers(quiz, {
      grantedHints: { [firstItem.id]: firstItem.hints[0] }
    }));
    ok(oneHintJson.indexOf('"' + firstItem.hints[0] + '"') !== -1,
      'explicitly granted hint is released to the student');
    ok(oneHintJson.indexOf('"' + firstItem.hints[1] + '"') === -1,
      'only one hint is released at a time');

    const repeated = JSON.parse(JSON.stringify(quiz));
    repeated.quiz.level_1[0].stem = context.previously_asked_questions[0].stem;
    assert.throws(function () { service.validateQuizOutput(repeated, context); },
      /repeats a previously asked question/);
    checks += 1;

    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = 'https://example.test/v1';
    let calls = 0;
    const systemPrompts = [];
    global.fetch = async function (url, options) {
      calls += 1;
      const body = JSON.parse(options.body);
      systemPrompts.push(body.messages[0].content);
      return {
        ok: true,
        status: 200,
        text: async function () {
          return envelope(calls === 1 ? planner : quiz);
        }
      };
    };

    const remotePlanner = await service.generatePlannerAndCurriculum(context);
    const remoteQuiz = await service.generateQuizTiers(context, remotePlanner);
    equal(calls, 2, 'curriculum generation uses exactly two API calls');
    ok(systemPrompts[0].indexOf('CBSE') !== -1,
      'planner call renders board into the system prompt');
    ok(systemPrompts[0].indexOf('NCERT Class 5 Ratios') !== -1,
      'planner call renders chapter context into the system prompt');
    ok(systemPrompts[1].indexOf('72') !== -1,
      'quiz call renders mastery into the system prompt');
    ok(systemPrompts[1].indexOf('trainerInstructions') === -1,
      'quiz call does not leak trainer notes into the model context');
    deepEqual(Object.keys(remoteQuiz.quiz), ['level_1', 'level_2', 'level_3'],
      'remote quiz path returns all three tiers');

    console.log('curriculumAuthoring: ' + checks + ' assertions passed');
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
  }
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
