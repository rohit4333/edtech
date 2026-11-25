/* Global curriculum mapper for Mathify.
 *
 * A student's school board changes the examples, notation and pedagogy the AI
 * is allowed to use. This module turns a student profile into a short, safe
 * prompt injection. Only academic fields (board, grade, language) are read —
 * never a name, email, phone number, social handle or pay detail.
 */

const CURRICULUM_MAP = {
  cbse: {
    key: 'cbse',
    label: 'CBSE',
    country: 'India',
    style: 'NCERT-aligned; concept first, then a worked example, then an exam-style application',
    notation: 'Indian number names (lakh/crore), metric units (cm, m, kg), rupees (₹), ratio a : b',
    pedagogy: 'Concrete–pictorial–abstract (CPA), bar models, stepwise reasoning, frequent low-stakes checks',
    illustrationContext: 'Use Indian context (rupees, cricket, NCERT examples, a local shop or festival).',
    aliases: ['cbse', 'ncert', 'central board', 'india', 'indian']
  },
  icse: {
    key: 'icse',
    label: 'ICSE',
    country: 'India',
    style: 'ICSE/CISCE; detailed explanatory answers with strong foundational sequencing',
    notation: 'Metric units, rupees (₹), ratio a : b, fractions written in full',
    pedagogy: 'Concept clarity through guided practice and reasoning in complete sentences',
    illustrationContext: 'Use Indian context (rupees, cricket, a school fete, Indian railways).',
    aliases: ['icse', 'isc', 'cisce', 'indian council']
  },
  ib: {
    key: 'ib',
    label: 'IB',
    country: 'International',
    style: 'Inquiry-led and concept-based; connect the maths to a global issue or transferable idea',
    notation: 'SI units, ratio a : b, international decimal notation',
    pedagogy: 'Inquiry, reflection, approaches to learning (ATL) skills, real-world transfer',
    illustrationContext: 'Use global context (UN SDGs, climate, sustainability, world travel).',
    aliases: ['ib', 'ibdp', 'international baccalaureate', 'baccalaureate']
  },
  igcse: {
    key: 'igcse',
    label: 'IGCSE',
    country: 'International (Cambridge)',
    style: 'Cambridge IGCSE; graded progression with applied and multi-step problem solving',
    notation: 'SI units, ratio a : b, decimal notation, standard form where relevant',
    pedagogy: 'Scaffolded practice, past-paper style reasoning, clear method marks',
    illustrationContext: 'Use global context (international sport, trade, maps, exchange rates).',
    aliases: ['igcse', 'cambridge', 'cambridge igcse', 'olevel', 'o level']
  },
  'common_core': {
    key: 'common_core',
    label: 'Common Core',
    country: 'United States',
    style: 'CCSS; balance conceptual understanding, procedural fluency and application',
    notation: 'US customary units where natural, ratio a : b, fractions and decimals',
    pedagogy: 'CPA progressions, number talks, mathematical practices, explain-your-reasoning prompts',
    illustrationContext: 'Use United States context (dollars, baseball, school lunch, local distances).',
    aliases: ['common core', 'common_core', 'ccss', 'us', 'usa', 'united states', 'american']
  },
  'british_national': {
    key: 'british_national',
    label: 'British National',
    country: 'United Kingdom',
    style: 'National Curriculum (England); mastery with reasoning and problem solving',
    notation: 'Metric/SI units, ratio a : b, pounds (£), decimal notation',
    pedagogy: 'Mastery through intelligent variation: fluency, then reasoning, then problem solving',
    illustrationContext: 'Use British context (pounds, football, a high-street shop, train times).',
    aliases: ['british national', 'british_national', 'uk', 'england', 'national curriculum', 'gcse', 'british']
  },
  ontario: {
    key: 'ontario',
    label: 'Ontario',
    country: 'Canada',
    style: 'Ontario Mathematics Curriculum; strands revisited and interconnected over time',
    notation: 'Metric units, ratio a : b, Canadian dollars (CAD)',
    pedagogy: 'Investigation, mathematical communication, real-world connections, progressive disclosure',
    illustrationContext: 'Use Canadian context (loonies, hockey, weather, the local community).',
    aliases: ['ontario', 'canada', 'canadian', 'on']
  }
};

const DEFAULT_CURRICULUM = 'cbse';

function text(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const result = String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return result || fallback;
}

/** Accepts canonical keys, labels and common aliases; case-insensitive. */
function normalizeCurriculum(board) {
  const raw = text(board, '').toLowerCase();
  if (!raw) return CURRICULUM_MAP[DEFAULT_CURRICULUM];

  const direct = CURRICULUM_MAP[raw.replace(/[\s]+/g, '_')];
  if (direct) return direct;

  const keys = Object.keys(CURRICULUM_MAP);
  for (let index = 0; index < keys.length; index += 1) {
    const entry = CURRICULUM_MAP[keys[index]];
    if (entry.aliases.some(function (alias) { return raw === alias || raw.indexOf(alias) !== -1; })) {
      return entry;
    }
  }
  return CURRICULUM_MAP[DEFAULT_CURRICULUM];
}

/** Pull academic fields from the several profile shapes used across Mathify. */
function profileOf(student) {
  if (typeof student === 'string') return { board: student };
  if (!student || typeof student !== 'object') return {};

  const nested = [
    student.profile,
    student.student_profile,
    student.studentProfile,
    student.academic,
    student.academics,
    student.school
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
    board: first(['curriculum', 'curriculum_board', 'curriculumBoard', 'board', 'schoolBoard', 'school_board', 'syllabus']),
    grade: first(['grade', 'gradeLevel', 'grade_level', 'class']),
    language: first(['language', 'medium', 'mediumOfInstruction'])
  };
}

function buildPromptInjection(curriculum, profile) {
  const lines = [
    'Mathify curriculum context: ' + curriculum.label + ' (' + curriculum.country + ').',
    'Teaching style: ' + curriculum.style + '.',
    'Notation and units: ' + curriculum.notation + '.',
    'Pedagogy: ' + curriculum.pedagogy + '.',
    'Illustration context: ' + curriculum.illustrationContext
  ];
  if (profile.grade) lines.push('Student grade: ' + text(profile.grade, '') + '.');
  if (profile.language) lines.push('Language of instruction: ' + text(profile.language, '') + '.');
  lines.push('Keep every example age-appropriate and strictly 1-on-1; never reference group classes.');
  return lines.join('\n');
}

/**
 * @param {object|string} student student profile (or a board string)
 * @returns {{board:string, country:string, style:string, notation:string, pedagogy:string,
 *            illustrationContext:string, promptInjection:string}}
 */
function getCurriculumContext(student) {
  const profile = profileOf(student);
  const curriculum = normalizeCurriculum(profile.board || DEFAULT_CURRICULUM);

  return {
    board: curriculum.label,
    key: curriculum.key,
    country: curriculum.country,
    style: curriculum.style,
    notation: curriculum.notation,
    pedagogy: curriculum.pedagogy,
    illustrationContext: curriculum.illustrationContext,
    promptInjection: buildPromptInjection(curriculum, profile)
  };
}

module.exports = {
  CURRICULUM_MAP: CURRICULUM_MAP,
  DEFAULT_CURRICULUM: DEFAULT_CURRICULUM,
  normalizeCurriculum: normalizeCurriculum,
  getCurriculumContext: getCurriculumContext,
  buildPromptInjection: buildPromptInjection
};
