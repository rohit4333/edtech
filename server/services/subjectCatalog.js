/* Subject dimension for the shared LMS.
 *
 * Math, Coding and English are three views of the same product: one auth
 * system, one batch/session lifecycle, one policy file and one set of role
 * desks. This module only names the subject and its safe display metadata;
 * it never decides access, payment or attendance rules.
 */

const SUBJECTS = {
  math: {
    slug: 'math',
    label: 'Mathematics',
    shortLabel: 'Math',
    workspace: 'board',
    strands: ['Number', 'Patterns', 'Shape and space', 'Measurement', 'Data', 'Reasoning'],
    description: 'Numbers, patterns, shapes and mathematical reasoning.'
  },
  coding: {
    slug: 'coding',
    label: 'Coding',
    shortLabel: 'Coding',
    workspace: 'ide',
    strands: ['Sequencing', 'Variables', 'Conditions', 'Loops', 'Functions', 'Debugging'],
    description: 'Live coding, practice challenges and a JavaScript answer checker.'
  },
  english: {
    slug: 'english',
    label: 'English Communication',
    shortLabel: 'English',
    workspace: 'literacy',
    /* This is a communication course: reading, writing, public speaking,
       listening and vocabulary. It is not a literature or grammar track. */
    strands: ['Reading', 'Writing', 'Public speaking', 'Listening', 'Vocabulary', 'Expression'],
    description: 'Reading, writing, public speaking, listening and vocabulary.'
  }
};

const ALIASES = {
  math: 'math',
  maths: 'math',
  mathematics: 'math',
  numeracy: 'math',
  coding: 'coding',
  code: 'coding',
  programming: 'coding',
  javascript: 'coding',
  english: 'english',
  communication: 'english',
  'public speaking': 'english',
  reading: 'english',
  writing: 'english'
};

function normalize(value) {
  const key = String(value === null || value === undefined ? '' : value)
    .trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return ALIASES[key] || (SUBJECTS[key] ? key : 'math');
}

function get(value) {
  return SUBJECTS[normalize(value)];
}

function list() {
  return Object.keys(SUBJECTS).map(function (slug) {
    return Object.assign({}, SUBJECTS[slug], { subject: slug });
  });
}

function publicView(value) {
  const item = get(value);
  return {
    subject: item.slug,
    label: item.label,
    shortLabel: item.shortLabel,
    workspace: item.workspace,
    strands: item.strands.slice()
  };
}

function subjectLabel(value) {
  return get(value).label;
}

module.exports = {
  SUBJECTS: SUBJECTS,
  normalize: normalize,
  get: get,
  list: list,
  publicView: publicView,
  subjectLabel: subjectLabel
};
