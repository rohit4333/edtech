/* Static navigation contract. Every surface links the Razorpay-required
   policy pages; dashboard navigation never dead-ends on href="#"; and the
   public nav is exactly the seven approved destinations. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const checks = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks.push(label);
}

const REQUIRED = ['pricing.html', 'terms.html', 'privacy.html', 'refund.html', 'contact.html'];

/* The five payment-policy destinations appear in every user-facing surface. */
[
  'index.html',
  'student/index.html',
  'trainer/index.html',
  'lms/index.html',
  'founder/index.html',
  'apps.html',
  'classroom/index.html'
].forEach(function (surface) {
  const html = read(surface);
  REQUIRED.forEach(function (page) {
    ok(html.indexOf(page) !== -1, surface + ' links ' + page);
  });
});

/* Partial work is labelled in the UI, not only in documentation. */
ok(/preview-banner/.test(read('lms/index.html')) &&
  /Curriculum preview/.test(read('lms/index.html')),
  'LMS surface carries a visible preview banner');
ok(/pill soon">Preview/.test(read('apps.html')) &&
  /Partial course library preview/.test(read('apps.html')),
  'apps hub labels the LMS as a preview');

/* The booking form is a contact request, never a payment form. */
const contact = read('contact.html');
ok(/No payment is taken here/.test(contact), 'contact form says no payment is taken');
ok(!/card-number|cardNumber|paymentMethod|razorpay/i.test(contact),
  'contact form collects no payment fields');

/* Founder settings are honest drafts with locked money widgets. */
const founderHtml = read('founder/index.html');
const founderScript = read('founder/app.js');
ok(founderHtml.indexOf('id="money-readonly"') !== -1, 'founder surface has a read-only money section');
ok(founderHtml.indexOf('Never get emotional about money transactions.') !== -1,
  'founder surface keeps the money rule visible');
ok(founderScript.indexOf('copy.readOnly = true') !== -1,
  'money fields are marked read-only in the founder client');
ok(founderScript.indexOf('data-section="money"') === -1,
  'no founder input is bound to a money section');

/* Planner designer v1 keeps trainer notes out of the student payload. */
const lmsHtml = read('lms/index.html');
const plannerScript = read('lms/planner.js');
ok(lmsHtml.indexOf('id="plannerBtn"') !== -1 && lmsHtml.indexOf('id="sheet-planner"') !== -1,
  'LMS exposes the planner designer sheet');
ok(/Number\(item\.sketch\.minHeight\)\s*>=\s*220/.test(plannerScript), 'planner enforces a 220px sketch floor');
ok(/expandable\s*!==\s*true/.test(plannerScript), 'planner requires expandable sketch spaces');
ok(plannerScript.indexOf('function buildStudentPayload') !== -1,
  'planner builds a separate student payload');
const studentSerializer = plannerScript.slice(
  plannerScript.indexOf('function studentBlocks()'),
  plannerScript.indexOf('function buildStudentPayload()')
);
ok(studentSerializer.indexOf('safe.sketch = {') !== -1 &&
  studentSerializer.indexOf('prompt_for_trainer') === -1,
  'student sketch view excludes the trainer drawing prompt');
ok(plannerScript.indexOf('quizPrompt.indexOf(String(item.trainerInstructions).trim())') !== -1,
  'planner checks the quiz prompt against trainer instructions');
ok(read('apps.html').indexOf('modules, review and the planner designer are usable') !== -1,
  'apps hub labels the planner designer as usable');

/* Public nav is exact and ordered. */
const publicNav = read('index.html').match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0];
const publicHrefs = (publicNav.match(/href="[^"]+"/g) || []).map(function (value) {
  return value.slice(6, -1);
});
assert.deepStrictEqual(publicHrefs, [
  'index.html', 'pricing.html', 'terms.html', 'privacy.html',
  'refund.html', 'contact.html', 'contact.html'
]);
checks.push('public nav is the exact seven-item list');

/* Dashboard navigation resolves to a real section or a real page. */
['student/index.html', 'trainer/index.html', 'founder/index.html'].forEach(function (surface) {
  const html = read(surface);
  ok(html.indexOf('href="#"') === -1, surface + ' has no dead-end links');
  ok(html.indexOf('Batch pause') === -1, surface + ' has no Batch pause dead end');
  ok(html.indexOf('Community') === -1, surface + ' has no group-class Community link');

  const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  const sectionIds = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(function (match) {
    return match[1];
  });
  const targets = Array.from(nav.matchAll(/<a[^>]+href="#([^"]+)"/g)).map(function (match) {
    return match[1];
  });
  ok(targets.length === 5, surface + ' has five nav destinations');
  targets.forEach(function (target) {
    ok(sectionIds.indexOf(target) !== -1, surface + ' nav target #' + target + ' exists');
  });
});

console.log('navContract: ' + checks.length + ' assertions passed');
