/* Approved strand codes for the auto-generated weekly planner.
 *
 * The model may only use entries from this registry. Where a framework
 * publishes a code (for example CCSS), the exact published identifier is used.
 * Elsewhere the official strand name itself is the code: Mathify never invents
 * a framework code or accepts a code the catalogue has not approved.
 *
 * The math registry is unchanged. Coding and English have their own strand
 * names so a planner for one subject cannot borrow another subject's codes.
 */

const catalog = require('./curriculumCatalog');
const subjects = require('./subjectCatalog');

const GLOBAL_STRANDS = [
  { code: 'Number sense and counting', label: 'Number sense and counting', strand: 'Number' },
  { code: 'Patterns and relationships', label: 'Patterns and relationships', strand: 'Algebra' },
  { code: 'Shape and space', label: 'Shape and space', strand: 'Geometry' },
  { code: 'Measurement and comparison', label: 'Measurement and comparison', strand: 'Measurement' },
  { code: 'Sorting and simple data', label: 'Sorting and simple data', strand: 'Data handling' },
  { code: 'Logical reasoning and talk', label: 'Logical reasoning and talk', strand: 'Reasoning' }
];

const FAMILY_STRANDS = {
  indian: [
    { code: 'Numbers', label: 'Numbers', strand: 'Number' },
    { code: 'Patterns', label: 'Patterns', strand: 'Algebra' },
    { code: 'Shapes', label: 'Shapes', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data handling', label: 'Data handling', strand: 'Data handling' }
  ],
  british: [
    { code: 'Number', label: 'Number', strand: 'Number' },
    { code: 'Numerical patterns', label: 'Numerical patterns', strand: 'Algebra' },
    { code: 'Shape, space and measures', label: 'Shape, space and measures', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Geometry', label: 'Geometry', strand: 'Geometry' }
  ],
  american: [
    { code: 'CCSS.MATH.CONTENT.K.CC.A.1', label: 'Count to 100 by ones and tens', strand: 'Counting and cardinality' },
    { code: 'CCSS.MATH.CONTENT.K.CC.B.4', label: 'Connect number names and quantities', strand: 'Counting and cardinality' },
    { code: 'CCSS.MATH.CONTENT.K.OA.A.1', label: 'Represent addition and subtraction', strand: 'Operations' },
    { code: 'CCSS.MATH.CONTENT.K.G.A.1', label: 'Describe objects using shapes', strand: 'Geometry' },
    { code: 'CCSS.MATH.CONTENT.1.NBT.A.1', label: 'Count to 120', strand: 'Number and operations' },
    { code: 'CCSS.MATH.CONTENT.2.MD.A.1', label: 'Measure length with tools', strand: 'Measurement' }
  ],
  international: [
    { code: 'Number', label: 'Number', strand: 'Number' },
    { code: 'Patterns and functions', label: 'Patterns and functions', strand: 'Algebra' },
    { code: 'Shape and space', label: 'Shape and space', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data handling', label: 'Data handling', strand: 'Data handling' }
  ],
  middleEast: [
    { code: 'Numbers', label: 'Numbers', strand: 'Number' },
    { code: 'Patterns', label: 'Patterns', strand: 'Algebra' },
    { code: 'Geometry', label: 'Geometry', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data', label: 'Data', strand: 'Data handling' }
  ],
  eastAsian: [
    { code: 'Numbers and operations', label: 'Numbers and operations', strand: 'Number' },
    { code: 'Patterns', label: 'Patterns', strand: 'Algebra' },
    { code: 'Shapes and geometry', label: 'Shapes and geometry', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data and charts', label: 'Data and charts', strand: 'Data handling' }
  ],
  european: [
    { code: 'Number and calculation', label: 'Number and calculation', strand: 'Number' },
    { code: 'Patterns and relations', label: 'Patterns and relations', strand: 'Algebra' },
    { code: 'Shapes and space', label: 'Shapes and space', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data and chance', label: 'Data and chance', strand: 'Data handling' }
  ],
  african: [
    { code: 'Number and counting', label: 'Number and counting', strand: 'Number' },
    { code: 'Patterns', label: 'Patterns', strand: 'Algebra' },
    { code: 'Shapes', label: 'Shapes', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data', label: 'Data', strand: 'Data handling' }
  ],
  latinAmerican: [
    { code: 'Number and counting', label: 'Number and counting', strand: 'Number' },
    { code: 'Patterns', label: 'Patterns', strand: 'Algebra' },
    { code: 'Geometry', label: 'Geometry', strand: 'Geometry' },
    { code: 'Measurement', label: 'Measurement', strand: 'Measurement' },
    { code: 'Data', label: 'Data', strand: 'Data handling' }
  ],
  local: GLOBAL_STRANDS
};

const SUBJECT_STRANDS = {
  coding: [
    { code: 'Coding sequences', label: 'Coding sequences', strand: 'Sequencing' },
    { code: 'Coding variables', label: 'Coding variables', strand: 'Variables' },
    { code: 'Coding choices', label: 'Coding choices', strand: 'Conditions' },
    { code: 'Coding repeats', label: 'Coding repeats', strand: 'Loops' },
    { code: 'Coding functions', label: 'Coding functions', strand: 'Functions' },
    { code: 'Coding debugging', label: 'Coding debugging', strand: 'Debugging' }
  ],
  english: [
    { code: 'Reading a passage', label: 'Reading a passage', strand: 'Reading' },
    { code: 'Writing a sentence', label: 'Writing a sentence', strand: 'Writing' },
    { code: 'Speaking clearly', label: 'Speaking clearly', strand: 'Public speaking' },
    { code: 'Listening and responding', label: 'Listening and responding', strand: 'Listening' },
    { code: 'Using new words', label: 'Using new words', strand: 'Vocabulary' },
    { code: 'Sharing an idea', label: 'Sharing an idea', strand: 'Expression' }
  ]
};

function argumentsFor(first, second, third) {
  if (first && typeof first === 'object') {
    return {
      subject: subjects.normalize(first.subject),
      curriculumSlug: first.curriculumSlug,
      gradeSlug: first.gradeSlug
    };
  }
  /* Backward-compatible two-argument math call: (curriculumSlug, gradeSlug). */
  if (third === undefined) {
    return { subject: 'math', curriculumSlug: first, gradeSlug: second };
  }
  return {
    subject: subjects.normalize(first),
    curriculumSlug: second,
    gradeSlug: third
  };
}

function allowedStandards(first, second, third) {
  const input = argumentsFor(first, second, third);
  const item = catalog.findCurriculum(input.curriculumSlug);
  const grade = input.gradeSlug ? catalog.findGrade(input.curriculumSlug, input.gradeSlug) : null;
  const familyList = input.subject === 'math'
    ? (FAMILY_STRANDS[item ? item.family : 'local'] || GLOBAL_STRANDS).concat(GLOBAL_STRANDS)
    : SUBJECT_STRANDS[input.subject];
  const framework = input.subject === 'math'
    ? (item ? item.standardsFramework : 'Mathify global early-years mathematics strands')
    : subjects.get(input.subject).label + ' skills';
  const output = familyList.map(function (entry) {
    return {
      code: entry.code,
      label: entry.label,
      strand: entry.strand,
      framework: framework,
      ageBand: grade ? grade.band : '3–18 years'
    };
  });
  const seen = {};
  return output.filter(function (entry) {
    if (seen[entry.code]) return false;
    seen[entry.code] = true;
    return true;
  });
}

function codesFor(subject, curriculumSlug, gradeSlug) {
  return allowedStandards(subject, curriculumSlug, gradeSlug).map(function (entry) { return entry.code; });
}

module.exports = {
  allowedStandards: allowedStandards,
  codesFor: codesFor,
  GLOBAL_STRANDS: GLOBAL_STRANDS,
  SUBJECT_STRANDS: SUBJECT_STRANDS
};
