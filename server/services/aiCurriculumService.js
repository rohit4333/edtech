/* Integrated AI curriculum layer.
 *
 * This is the single entry point that joins a student's school profile to the
 * Cloudflare Workers AI authoring calls:
 *
 *   student profile -> curriculumContext.getCurriculumContext(student)
 *                   -> promptInjection into the system prompt
 *                   -> cloudflareService (Zod-validated planner / quiz / parallel)
 *
 * Mastery gating, difficulty maths and all serializers stay untouched; this
 * module only changes what the model is told about the student's curriculum.
 */

const curriculumContext = require('./curriculumContext');
const cloudflareAiService = require('./cloudflareAiService');
const cloudflareService = require('./cloudflareService');

/* Trainer-only authoring contract. These rules are injected into the planner
   prompt, never into a student-facing payload or the quiz prompt. */
const AUTHORING_RULES = [
  'Open EVERY concept with a VISUAL ANALOGY: a concrete physical picture that matches the curriculum illustration context.',
  'Follow the analogy with a STORY NARRATION of 3–6 sentences that carries the mathematics inside the story.',
  'After each text or image cluster insert a sketch_space block with sketch.minHeight = 220 and sketch.expandable = true for live Wacom drawing.',
  'For EVERY block write trainerInstructions (what to say, what to draw, when to pause) plus misconception_watch. Both fields are trainer-only.'
].join('\n');

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Accepts either (student, context) or a legacy single context object. */
function resolveArgs(studentOrContext, maybeContext) {
  if (isObject(maybeContext)) {
    return { student: isObject(studentOrContext) ? studentOrContext : {}, context: maybeContext };
  }
  const input = isObject(studentOrContext) ? studentOrContext : {};
  const looksLikeStudent = Boolean(
    input.board || input.curriculum || input.curriculumBoard || input.schoolBoard ||
    input.profile || input.student_profile || input.academics
  );
  return {
    student: looksLikeStudent && isObject(input.student) ? input.student : (looksLikeStudent ? input : (input.student || {})),
    context: input
  };
}

function injectionFor(student, context, includeAuthoringRules) {
  if (context && context.curriculum_injection) return context.curriculum_injection;
  const curriculum = curriculumContext.getCurriculumContext(student);
  return curriculum.promptInjection + (includeAuthoringRules ? '\n' + AUTHORING_RULES : '');
}

function buildGenerationContext(student, context, includeAuthoringRules) {
  const settings = isObject(context) ? Object.assign({}, context) : {};
  const profile = isObject(student) ? Object.assign({}, student) : {};
  const curriculum = curriculumContext.getCurriculumContext(
    Object.keys(profile).length ? profile : settings
  );

  settings.student = profile;
  if (settings.board === undefined || settings.board === null || settings.board === '') {
    settings.board = curriculum.board;
  }
  if (settings.grade === undefined && profile.grade !== undefined) settings.grade = profile.grade;
  if (settings.student_age === undefined && profile.age !== undefined) settings.student_age = profile.age;
  if (settings.language === undefined && profile.language) settings.language = profile.language;
  settings.curriculum_injection = injectionFor(profile, settings, includeAuthoringRules);

  return settings;
}

/** Call 1: curriculum map + trainer planner blocks. */
async function generatePlannerAndCurriculum(student, context) {
  const args = resolveArgs(student, context);
  return cloudflareService.generatePlannerAndCurriculum(
    buildGenerationContext(args.student, args.context, true)
  );
}

/** Call 2: three-tier quiz, grounded in call 1 and the same curriculum context. */
async function generateQuizTiers(student, context, plannerOutput) {
  const args = resolveArgs(student, context);
  return cloudflareService.generateQuizTiers(
    buildGenerationContext(args.student, args.context, false),
    plannerOutput
  );
}

/** Reteach check: one parallel item matching the student's curriculum style. */
async function generateParallelQuestion(student, concept, difficulty, options) {
  const args = resolveArgs(student, options);
  const settings = isObject(options) ? Object.assign({}, options) : {};
  settings.student = args.student;
  settings.curriculum_injection = injectionFor(args.student, settings, false);
  return cloudflareService.generateParallelQuestion(concept, difficulty, settings);
}

module.exports = {
  AUTHORING_RULES: AUTHORING_RULES,
  getCurriculumContext: curriculumContext.getCurriculumContext,
  generateAIResponse: cloudflareAiService.generateAIResponse,
  safeParseJSON: cloudflareAiService.safeParseJSON,
  buildGenerationContext: buildGenerationContext,
  generatePlannerAndCurriculum: generatePlannerAndCurriculum,
  generateQuizTiers: generateQuizTiers,
  generateParallelQuestion: generateParallelQuestion,
  /* Mastery maths remains authoritative in cloudflareService/generator. */
  calculateNextDifficulty: cloudflareService.calculateNextDifficulty,
  calculateNextNumericDifficulty: cloudflareService.calculateNextNumericDifficulty,
  difficultyForMastery: cloudflareService.difficultyForMastery,
  difficultyLabel: cloudflareService.difficultyLabel,
  validatePlannerOutput: cloudflareService.validatePlannerOutput,
  validateQuizOutput: cloudflareService.validateQuizOutput,
  validateParallelQuestionOutput: cloudflareService.validateParallelQuestionOutput
};
