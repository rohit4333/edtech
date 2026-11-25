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
  { board: 'CBSE', country: 'India', needles: ['rupees', 'cricket'] },
  { board: 'ICSE', country: 'India', needles: ['rupees', 'cricket'] },
  { board: 'IB', country: 'International', needles: ['UN SDGs'] },
  { board: 'IGCSE', country: 'International (Cambridge)', needles: ['global context'] },
  { board: 'Common Core', country: 'United States', needles: ['dollars', 'baseball'] },
  { board: 'British National', country: 'United Kingdom', needles: ['pounds', 'football'] },
  { board: 'Ontario', country: 'Canada', needles: ['loonies', 'hockey'] }
];

function main() {
  equal(Object.keys(curriculumContext.CURRICULUM_MAP).length, 7,
    'exactly seven curricula are mapped');

  boards.forEach(function (expectation) {
    const student = { board: expectation.board, grade: 7, language: 'English' };
    const context = curriculumContext.getCurriculumContext(student);

    equal(context.board, expectation.board, expectation.board + ' is resolved');
    equal(context.country, expectation.country, expectation.board + ' has the right country');
    ok(typeof context.style === 'string' && context.style.length > 10,
      expectation.board + ' defines style');
    ok(typeof context.notation === 'string' && context.notation.length > 10,
      expectation.board + ' defines notation');
    ok(typeof context.pedagogy === 'string' && context.pedagogy.length > 10,
      expectation.board + ' defines pedagogy');
    ok(typeof context.promptInjection === 'string' && context.promptInjection.length > 50,
      expectation.board + ' returns a promptInjection string');
    expectation.needles.forEach(function (needle) {
      ok(context.promptInjection.toLowerCase().indexOf(needle.toLowerCase()) !== -1,
        expectation.board + ' injection mentions ' + needle);
    });
    ok(context.promptInjection.indexOf('Student grade: 7') !== -1,
      expectation.board + ' injection carries the student grade');
  });

  const aliases = [
    ['ncert', 'CBSE'], ['cambridge', 'IGCSE'], ['ccss', 'Common Core'],
    ['gcse', 'British National'], ['canada', 'Ontario'], ['ibdp', 'IB'], ['isc', 'ICSE']
  ];
  aliases.forEach(function (pair) {
    equal(curriculumContext.getCurriculumContext({ board: pair[0] }).board, pair[1],
      pair[0] + ' aliases to ' + pair[1]);
  });

  equal(curriculumContext.getCurriculumContext({}).board, 'CBSE',
    'missing profile falls back to CBSE');
  equal(curriculumContext.getCurriculumContext({ profile: { curriculum: 'Ontario' } }).board,
    'Ontario', 'nested student profile curriculum is read');

  const privateStudent = {
    name: 'Ishaan Verma',
    email: 'ishaan@example.com',
    phone: '+91 98765 43210',
    parentPhone: '+91 90000 11111',
    social: 'https://instagram.com/ishaan',
    board: 'CBSE',
    grade: 7
  };
  const injection = curriculumContext.getCurriculumContext(privateStudent).promptInjection;
  ['Ishaan Verma', 'ishaan@example.com', '98765', '90000', 'instagram', '@', 'wa.me']
    .forEach(function (leak) {
      ok(injection.indexOf(leak) === -1, 'injection excludes ' + leak);
    });

  console.log('curriculumContext: ' + checks + ' assertions passed');
}

main();
