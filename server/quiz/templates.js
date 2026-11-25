/* Curriculum-template scaffold for quizzer drafts and reteach checks. */
const templates = [
  {
    id: 'ratio_equivalent_check',
    objective: 'Identify equivalent ratios',
    difficulty: 'core',
    variants: [
      {
        prompt: 'Which ratio is equivalent to 4 : 7?',
        options: ['8 : 14', '7 : 4', '12 : 14', '4 : 10'],
        answerIndex: 0,
        hint: 'Multiply both parts by the same number.',
        explanation: 'Both parts were multiplied by 2.'
      },
      {
        prompt: 'Which ratio is equivalent to 5 : 6?',
        options: ['10 : 6', '15 : 18', '6 : 5', '5 : 12'],
        answerIndex: 1,
        hint: 'Keep the two parts in the same order.',
        explanation: 'Both parts were multiplied by 3.'
      }
    ]
  },
  {
    id: 'ratio_part_value_check',
    objective: 'Find an unknown part from a ratio',
    difficulty: 'core',
    variants: [
      {
        prompt: 'In a 2 : 5 ribbon, the shorter piece is 8 cm. How long is the longer piece?',
        options: ['10 cm', '16 cm', '20 cm', '25 cm'],
        answerIndex: 2,
        hint: 'One part is 8 ÷ 2 = 4 cm.',
        explanation: 'One part is 4 cm, so 5 parts are 20 cm.'
      },
      {
        prompt: 'A 3 : 4 mix uses 9 red beads. How many blue beads are needed?',
        options: ['4', '12', '16', '21'],
        answerIndex: 1,
        hint: 'One part is 9 ÷ 3 = 3 beads.',
        explanation: 'One part is 3 beads, so 4 parts are 12 beads.'
      }
    ]
  }
];

function listTemplates() {
  return templates.map(function (template) {
    return {
      id: template.id,
      objective: template.objective,
      difficulty: template.difficulty,
      variantCount: template.variants.length
    };
  });
}

function buildQuestion(templateId, usedPrompts) {
  const template = templates.find(function (item) { return item.id === templateId; }) || templates[0];
  const used = usedPrompts || [];
  const variant = template.variants.find(function (item) { return used.indexOf(item.prompt) === -1; }) || template.variants[0];

  return {
    id: 'q_check_' + Date.now(),
    prompt: variant.prompt,
    options: variant.options.slice(),
    answerIndex: variant.answerIndex,
    hint: variant.hint,
    explanation: variant.explanation,
    source: 'template',
    templateId: template.id,
    status: 'active'
  };
}

function draftExample(templateId) {
  return buildQuestion(templateId || 'ratio_equivalent_check', []);
}

module.exports = {
  listTemplates,
  buildQuestion,
  draftExample
};
