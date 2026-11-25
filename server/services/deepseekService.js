/* DeepSeek quiz-draft service. The trainer still approves every draft before it reaches a student. */
const OpenAI = require('openai');

const DIFFICULTY_LEVELS = {
  easy: 'Level 1',
  medium: 'Level 2',
  hard: 'Level 3'
};

function client() {
  if (!process.env.DEEPSEEK_API_KEY) {
    const error = new Error('DEEPSEEK_API_KEY is not configured.');
    error.code = 'DEEPSEEK_NOT_CONFIGURED';
    throw error;
  }

  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
  });
}

function difficultyLabel(difficulty) {
  const value = String(difficulty || '').trim();
  if (/^level\s*[123]$/i.test(value)) {
    return 'Level ' + value.replace(/\D/g, '');
  }
  return DIFFICULTY_LEVELS[value.toLowerCase()] || 'Level 2';
}

function validateDraft(parsed) {
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('DeepSeek returned no questions array.');
  }

  parsed.questions.forEach(function (question, index) {
    if (typeof question.question_text !== 'string' || !question.question_text.trim()) {
      throw new Error('Question ' + (index + 1) + ' has no question_text.');
    }
    if (!Array.isArray(question.options) || question.options.length !== 4 ||
        question.options.some(function (option) { return typeof option !== 'string'; })) {
      throw new Error('Question ' + (index + 1) + ' must have exactly 4 string options.');
    }
    if (!Number.isInteger(question.correct_option_index) ||
        question.correct_option_index < 0 || question.correct_option_index > 3) {
      throw new Error('Question ' + (index + 1) + ' has an invalid correct_option_index.');
    }
    if (typeof question.hint !== 'string') {
      throw new Error('Question ' + (index + 1) + ' has no hint.');
    }
  });

  return parsed;
}

/**
 * Generate a trainer-reviewable quiz draft.
 * @param {string} topic e.g. "Equivalent ratios"
 * @param {string|number} difficulty easy|medium|hard or 1|2|3
 * @returns {Promise<{questions: Array<{question_text:string, options:string[], correct_option_index:number, hint:string}>}>}
 */
async function generateQuizDraft(topic, difficulty) {
  const level = difficultyLabel(difficulty);
  const safeTopic = String(topic || '').trim() || 'general mathematics';

  const response = await client().chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: [
          'You write math checkpoint questions for a tutor to review before students see them.',
          'Return ONLY a JSON object. No markdown, no code fences, no commentary.',
          'The JSON object must have a "questions" array.',
          'Each question must have exactly these keys: "question_text" (string), "options" (array of exactly 4 strings), "correct_option_index" (integer 0-3), and "hint" (string).',
          'Difficulty must be ' + level + '. Use age-appropriate wording and one clear correct answer.',
          'Do not include answer explanations; the trainer supplies those after review.'
        ].join(' ')
      },
      {
        role: 'user',
        content: 'Write 3 questions about ' + safeTopic + ' at ' + level + '.'
      }
    ]
  });

  const content = response && response.choices && response.choices[0] &&
    response.choices[0].message && response.choices[0].message.content;

  if (!content) {
    throw new Error('DeepSeek returned an empty response.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('DeepSeek response was not valid JSON.');
  }

  return validateDraft(parsed);
}

module.exports = {
  generateQuizDraft,
  difficultyLabel,
  validateDraft
};
