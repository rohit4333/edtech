/* Curriculum catalogue for adaptive quiz generation.
   DeepSeek writes the questions at runtime. This file keeps curriculum
   objectives, the three difficulty contracts and a deterministic fallback
   used only when DEEPSEEK_API_KEY is not configured. */

const OBJECTIVES = [
  {
    id: 'ratio_equivalent_check',
    objective: 'Identify equivalent ratios',
    curriculum: 'Ratios · Grade 6-8',
    baselineSkill: 'Scale both parts of a ratio by the same factor.'
  },
  {
    id: 'ratio_part_value_check',
    objective: 'Find an unknown part from a ratio',
    curriculum: 'Ratios · Grade 6-8',
    baselineSkill: 'Find one part, then scale to the requested part.'
  }
];

const DIFFICULTY_STEPS = [
  {
    level: 1,
    label: 'Level 1 — Easiest (Baseline)',
    change: 'Baseline',
    instruction: 'Use direct recognition. One clear step, small numbers and familiar wording.'
  },
  {
    level: 2,
    label: 'Level 2 — Moderate',
    change: '+5% harder than Level 1',
    instruction: 'Add one reasoning step. Keep numbers friendly but ask the student to choose the scale factor.'
  },
  {
    level: 3,
    label: 'Level 3 — Hardest',
    change: '+25% harder than Level 2',
    instruction: 'Require transfer or two reasoning steps. Use a short word problem with a total or scaled comparison.'
  }
];

function listTemplates() {
  return OBJECTIVES.map(function (item) {
    return {
      id: item.id,
      objective: item.objective,
      curriculum: item.curriculum,
      baselineSkill: item.baselineSkill,
      difficulty: 'adaptive'
    };
  });
}

function listDifficultyLevels() {
  return DIFFICULTY_STEPS.map(function (item) {
    return Object.assign({}, item);
  });
}

function resolveObjective(templateId) {
  return OBJECTIVES.find(function (item) { return item.id === templateId; }) || OBJECTIVES[0];
}

function difficultySpec(level) {
  const value = Number(level);
  return DIFFICULTY_STEPS.find(function (item) { return item.level === value; }) || DIFFICULTY_STEPS[1];
}

function hash(value) {
  const text = String(value || '');
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seedNumber(seed, shift, min, max) {
  const value = (seed >>> shift) % (max - min + 1);
  return min + value;
}

function shuffled(options, seed) {
  const result = options.slice();
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const temp = result[index];
    result[index] = result[swap];
    result[swap] = temp;
  }
  return result;
}

function questionShape(prompt, options, correctAnswer, hint, objective, spec) {
  const answerIndex = options.indexOf(correctAnswer);
  return {
    prompt: prompt,
    options: options.slice(),
    answerIndex: answerIndex,
    correctAnswer: correctAnswer,
    hint: hint,
    explanation: null,
    source: 'fallback',
    templateId: objective.id,
    difficultyLevel: spec.level,
    status: 'draft'
  };
}

function buildEquivalentRatioQuestion(objective, spec, seed) {
  const a = seedNumber(seed, 0, 2, 5);
  const b = seedNumber(seed, 5, 3, 7);
  const scale = spec.level === 1 ? 2 : spec.level === 2 ? 3 : 4;
  const correctAnswer = a * scale + ' : ' + b * scale;
  const options = shuffled([
    correctAnswer,
    b + ' : ' + a,
    a * scale + ' : ' + b,
    a + ' : ' + (b + scale)
  ], seed);

  const prompt = spec.level === 1
    ? 'Which ratio is equivalent to ' + a + ' : ' + b + '?'
    : spec.level === 2
      ? 'A ribbon is split ' + a + ' : ' + b + '. Which scaled ratio keeps the same comparison?'
      : 'A class mixes red : blue beads in the ratio ' + a + ' : ' + b + '. Which ratio shows the same mix after scaling?';

  return questionShape(
    prompt,
    options,
    correctAnswer,
    'Multiply both parts by the same number.',
    objective,
    spec
  );
}

function buildPartValueQuestion(objective, spec, seed) {
  const firstPart = seedNumber(seed, 0, 2, 4);
  const secondPart = firstPart + seedNumber(seed, 4, 1, 3);
  const unit = seedNumber(seed, 8, 3, 7);
  const shorter = firstPart * unit;
  const longer = secondPart * unit;
  const total = shorter + longer;
  const correctAnswer = String(longer);
  const options = shuffled([
    correctAnswer,
    String(shorter),
    String(total),
    String(unit)
  ], seed);

  const prompt = spec.level === 1
    ? 'In a ' + firstPart + ' : ' + secondPart + ' ribbon, the shorter piece is ' + shorter + ' cm. How long is the longer piece?'
    : spec.level === 2
      ? 'A ' + firstPart + ' : ' + secondPart + ' mix uses ' + shorter + ' red beads. How many blue beads are needed?'
      : 'A ribbon is split ' + firstPart + ' : ' + secondPart + '. Its total length is ' + total + ' cm. How long is the longer piece?';

  return questionShape(
    prompt,
    options,
    correctAnswer,
    spec.level === 3
      ? 'Find the value of one part from the total first.'
      : 'Find the value of one part, then scale the requested part.',
    objective,
    spec
  );
}

function buildFallbackQuestion(templateId, usedPrompts, level) {
  const objective = resolveObjective(templateId);
  const spec = difficultySpec(level);
  const used = Array.isArray(usedPrompts) ? usedPrompts : [];
  const baseSeed = hash(objective.id + '|' + spec.level);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const seed = (baseSeed + attempt * 7919) >>> 0;
    const question = objective.id === 'ratio_equivalent_check'
      ? buildEquivalentRatioQuestion(objective, spec, seed)
      : buildPartValueQuestion(objective, spec, seed);
    if (used.indexOf(question.prompt) === -1) return question;
  }

  const lastSeed = (baseSeed + 99991) >>> 0;
  return objective.id === 'ratio_equivalent_check'
    ? buildEquivalentRatioQuestion(objective, spec, lastSeed)
    : buildPartValueQuestion(objective, spec, lastSeed);
}

/* Backward-compatible aliases for older callers. */
function buildQuestion(templateId, usedPrompts, level) {
  return buildFallbackQuestion(templateId, usedPrompts, level || 2);
}

function draftExample(templateId) {
  return buildFallbackQuestion(templateId || OBJECTIVES[0].id, [], 2);
}

module.exports = {
  listTemplates: listTemplates,
  listDifficultyLevels: listDifficultyLevels,
  resolveObjective: resolveObjective,
  difficultySpec: difficultySpec,
  buildFallbackQuestion: buildFallbackQuestion,
  buildQuestion: buildQuestion,
  draftExample: draftExample
};
