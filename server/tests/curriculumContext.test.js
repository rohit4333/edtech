/* Curriculum mapper contract: seven boards, stable metadata and a prompt
   injection that never carries personal or contact details. */

const assert = require('assert');
const curriculumContext = require('../services/curriculumContext');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

const boards = [
  { curriculum: 'CBSE', country: 'India', needles: ['rupees', 'cricket', 'Indian festivals'] },
  { curriculum: 'ICSE', country: 'India', needles: ['rupees', 'cricket'] },
  { curriculum: 'IB', country: 'International', needles: ['UN SDGs'] },
  { curriculum: 'IGCSE', country: 'International (British)', needles: ['British English', 'past-paper'] },
  { curriculum: 'Common Core', country: 'USA', needles: ['dollars', 'baseball'] },
  { curriculum: 'British National', country: 'UK', needles: ['Key Stage', '£ (Pounds)'] },
  { curriculum: 'Ontario', country: 'Canada', needles: ['Canadian Dollars', 'Discovery-based'] }
];

function main() {
  equal(Object.keys(curriculumContext.CURRICULUM_PROFILES).length, 7,
    'exactly seven curricula are mapped');
  equal(curriculumContext.CURRICULUM_MAP, curriculumContext.CURRICULUM_PROFILES,
    'CURRICULUM_MAP is a compatibility alias');

  boards.forEach(function (expectation) {
    const student = {
      curriculum: expectation.curriculum,
      grade: 7,
      language: 'en',
      schoolChapter: 'Ratios'
    };
    const context = curriculumContext.getCurriculumContext(student);

    equal(context.curriculum, expectation.curriculum, expectation.curriculum + ' is resolved');
    equal(context.country, expectation.country, expectation.curriculum + ' has the right country');
    equal(context.grade, 7, expectation.curriculum + ' keeps the grade');
    equal(context.language, 'en', expectation.curriculum + ' keeps the language');
    equal(context.currentTopic, 'Ratios', expectation.curriculum + ' keeps the school chapter');
    ['style', 'notation', 'pedagogy'].forEach(function (field) {
      ok(typeof context[field] === 'string' && context[field].length > 10,
        expectation.curriculum + ' defines ' + field);
    });
    ok(typeof context.promptInjection === 'string' && context.promptInjection.length > 80,
      expectation.curriculum + ' returns a promptInjection string');
    ok(context.promptInjection.indexOf(
      'The student follows the ' + expectation.curriculum + ' curriculum in ' + expectation.country
    ) !== -1, expectation.curriculum + ' injection names the curriculum and country');
    expectation.needles.forEach(function (needle) {
      ok(context.promptInjection.indexOf(needle) !== -1,
        expectation.curriculum + ' injection mentions ' + needle);
    });
    ok(context.promptInjection.indexOf('Current school chapter: "Ratios"') !== -1,
      expectation.curriculum + ' injection carries the school chapter');
    ok(context.promptInjection.indexOf('Grade: 7') !== -1,
      expectation.curriculum + ' injection carries the student grade');
  });

  const aliases = [
    ['ncert', 'CBSE'], ['cambridge', 'IGCSE'], ['ccss', 'Common Core'],
    ['gcse', 'British National'], ['canada', 'Ontario'], ['ibdp', 'IB'], ['isc', 'ICSE']
  ];
  aliases.forEach(function (pair) {
    equal(curriculumContext.getCurriculumContext({ curriculum: pair[0] }).curriculum, pair[1],
      pair[0] + ' aliases to ' + pair[1]);
  });

  equal(curriculumContext.getCurriculumContext({}).curriculum, 'IB',
    'missing profile defaults to IB');
  equal(curriculumContext.getCurriculumContext({ profile: { curriculum: 'Ontario' } }).curriculum,
    'Ontario', 'nested student profile curriculum is read');
  equal(curriculumContext.getCurriculumContext({ board: 'CBSE' }).board, 'CBSE',
    'legacy board field still resolves');

  const privateStudent = {
    name: 'Ishaan Verma',
    email: 'ishaan@example.com',
    phone: '+91 98765 43210',
    parentPhone: '+91 90000 11111',
    social: 'https://instagram.com/ishaan',
    curriculum: 'CBSE',
    grade: 7
  };
  const injection = curriculumContext.getCurriculumContext(privateStudent).promptInjection;
  ['Ishaan Verma', 'ishaan@example.com', '98765', '90000', 'instagram', 'wa.me']
    .forEach(function (leak) {
      ok(injection.indexOf(leak) === -1, 'injection excludes ' + leak);
    });

  console.log('curriculumContext: ' + checks + ' assertions passed');
}

main();
