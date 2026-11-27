/* Global curriculum mapper for Mathify.
 *
 * A student's school curriculum changes the examples, notation and pedagogy
 * the AI is allowed to use. This module turns a student profile into a short,
 * safe prompt injection. Only academic fields (curriculum, grade, language,
 * school chapter) are read — never a name, email, phone or social handle.
 */

/* The catalogue is the single source of boards, aliases and grade ladders.
   It preserves the seven legacy canonical profile names exactly so existing
   callers keep working while adding every board in the LMS picker. */
const catalog = require('./curriculumCatalog');

const CURRICULUM_PROFILES = catalog.profiles();

/* Aliases keep older callers that send a lowercase key, "cambridge" or "uk"
   working while the canonical profile keys stay exactly as specified. */
const ALIASES = catalog.aliases();
/* Earlier integrations used underscore aliases; keep them legal. */
ALIASES.common_core = 'Common Core';
ALIASES.british_national = 'British National';

const DEFAULT_CURRICULUM = 'IB';

function text(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const result = String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return result || fallback;
}

function normalizeCurriculum(value) {
  const raw = text(value, '').toLowerCase();
  if (!raw) return DEFAULT_CURRICULUM;
  if (Object.prototype.hasOwnProperty.call(CURRICULUM_PROFILES, raw)) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  const keys = Object.keys(CURRICULUM_PROFILES);
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index].toLowerCase() === raw) return keys[index];
  }
  return DEFAULT_CURRICULUM;
}

/** Accepts the several profile shapes used across Mathify. */
function profileOf(student) {
  if (typeof student === 'string') return { curriculum: student };
  if (!student || typeof student !== 'object') return {};

  const nested = [
    student.profile, student.student_profile, student.studentProfile,
    student.academic, student.academics, student.school
  ].filter(function (value) { return value && typeof value === 'object'; });

  const sources = [student].concat(nested);
  function first(keys) {
    for (let s = 0; s < sources.length; s += 1) {
      for (let k = 0; k < keys.length; k += 1) {
        const value = sources[s][keys[k]];
        if (value !== null && value !== undefined && String(value).trim()) return value;
      }
    }
    return '';
  }

  return {
    curriculum: first(['curriculum', 'curriculum_board', 'curriculumBoard', 'board', 'schoolBoard', 'school_board', 'syllabus']),
    grade: first(['grade', 'gradeLevel', 'grade_level', 'class']),
    language: first(['language', 'medium', 'mediumOfInstruction']),
    chapter: first(['schoolChapter', 'school_chapter', 'chapter'])
  };
}

function buildPromptInjection(curriculumName, profile) {
  const profileData = CURRICULUM_PROFILES[curriculumName];
  const language = text(profile.language, 'en');
  const chapter = text(profile.chapter, 'to be determined by trainer');
  const lines = [
    'The student follows the ' + curriculumName + ' curriculum in ' + profileData.country + '.',
    'Teaching style: ' + profileData.style,
    'Notation: ' + profileData.notation,
    'Pedagogy: ' + profileData.pedagogy,
    'Current school chapter: "' + chapter + '"',
    'Language preference: ' + language,
    'Use culturally relevant examples for ' + profileData.country + '.',
    profileData.illustrationContext
  ];
  if (profile.grade) lines.push('Grade: ' + text(profile.grade, ''));
  lines.push('Keep every example age-appropriate and strictly 1-on-1; never reference group classes.');
  return '\n' + lines.join('\n') + '\n';
}

/**
 * @param {object|string} student student profile (or a curriculum name)
 * @returns {{curriculum:string, board:string, country:string, grade:string, language:string,
 *            currentTopic:string, style:string, notation:string, pedagogy:string, promptInjection:string}}
 */
function getCurriculumContext(student) {
  const profile = profileOf(student);
  const curriculumName = normalizeCurriculum(profile.curriculum || DEFAULT_CURRICULUM);
  const details = CURRICULUM_PROFILES[curriculumName];

  return {
    curriculum: curriculumName,
    /* board is a compatibility alias for older integration code. */
    board: curriculumName,
    key: curriculumName,
    country: details.country,
    grade: profile.grade,
    language: text(profile.language, 'en'),
    currentTopic: text(profile.chapter, 'General Mathematics'),
    style: details.style,
    notation: details.notation,
    pedagogy: details.pedagogy,
    illustrationContext: details.illustrationContext,
    promptInjection: buildPromptInjection(curriculumName, profile)
  };
}

module.exports = {
  getCurriculumContext: getCurriculumContext,
  CURRICULUM_PROFILES: CURRICULUM_PROFILES,
  /* Compatibility alias used by the earlier mapper tests. */
  CURRICULUM_MAP: CURRICULUM_PROFILES,
  DEFAULT_CURRICULUM: DEFAULT_CURRICULUM,
  normalizeCurriculum: normalizeCurriculum,
  buildPromptInjection: buildPromptInjection,
  catalog: catalog
};
