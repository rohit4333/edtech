/* Approved strand codes for the auto-generated early-years planner.
 *
 * The model may only use entries from this registry. Where a framework
 * publishes a code (for example CCSS), the exact published identifier is used.
 * Elsewhere the official strand name itself is the code: Mathify never invents
 * a framework code or accepts a code the catalogue has not approved.
 */

const catalog = require('./curriculumCatalog');

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

function allowedStandards(curriculumSlug, gradeSlug) {
  const item = catalog.findCurriculum(curriculumSlug);
  const family = item ? item.family : 'local';
  const familyList = FAMILY_STRANDS[family] || GLOBAL_STRANDS;
  const grade = gradeSlug ? catalog.findGrade(curriculumSlug, gradeSlug) : null;
  const output = familyList.concat(GLOBAL_STRANDS).map(function (entry) {
    return {
      code: entry.code,
      label: entry.label,
      strand: entry.strand,
      framework: item ? item.standardsFramework : 'Mathify global early-years mathematics strands',
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

function codesFor(curriculumSlug, gradeSlug) {
  return allowedStandards(curriculumSlug, gradeSlug).map(function (entry) { return entry.code; });
}

module.exports = {
  allowedStandards: allowedStandards,
  codesFor: codesFor,
  GLOBAL_STRANDS: GLOBAL_STRANDS
};
