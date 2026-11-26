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
  'login.html',
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

/* Credential sign in is a real destination, not a demo shortcut. */
const loginHtml = read('login.html');
const loginScript = read('login/login.js');
ok(loginHtml.indexOf('id="loginForm"') !== -1 &&
  loginHtml.indexOf('id="loginEmail"') !== -1 &&
  loginHtml.indexOf('id="loginPassword"') !== -1,
'login page exposes an email and password form');
ok(loginScript.indexOf("'/auth/login'") !== -1,
  'login page posts to the verified credential endpoint');
ok(loginScript.indexOf('user.role !== role') !== -1,
  'login page refuses credentials from a different account type');
ok(loginScript.indexOf('mathify.student.token') !== -1 &&
  loginScript.indexOf('mathify.trainer.token') !== -1,
'login page stores tokens the dashboards actually read');
ok(!/mathify-demo/.test(loginScript),
  'login page contains no hard-coded demo password');
const appsHtml = read('apps.html');
ok(appsHtml.indexOf('login.html?role=student') !== -1 &&
  appsHtml.indexOf('login.html?role=trainer') !== -1,
'apps hub sends students and trainers through credential sign in');
[
  'student/api.js', 'trainer/api.js', 'classroom/api.js',
  'parent/app.js', 'founder/app.js', 'trainer/parentChat.js'
].forEach(function (client) {
  const source = read(client);
  ok(source.indexOf("'/login.html?role=") !== -1,
    client + ' redirects unauthenticated viewers to the root sign-in page');
  ok(source.indexOf('/auth/demo') === -1 && !/mathify-demo/.test(source),
    client + ' contains no silent demo login');
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

/* The landing demo form uses a full IANA timezone dropdown. */
const landingHtml = read('index.html');
const landingScript = read('landing.js');
ok(landingHtml.indexOf('<select id="demoTimezone" name="timezone"') !== -1,
  'landing demo timezone is a select field');
ok(landingScript.indexOf("Intl.supportedValuesOf('timeZone')") !== -1,
  'landing demo timezone uses the browser IANA zone list');
ok(landingScript.indexOf("'Africa/Abidjan'") !== -1 &&
  landingScript.indexOf("'Asia/Calcutta'") !== -1 &&
  landingScript.indexOf("'UTC'") !== -1,
  'landing demo timezone has an embedded IANA fallback');

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
  const expectedNavCount = surface === 'founder/index.html' ? 6 : 5;
  ok(targets.length === expectedNavCount,
    surface + ' has ' + expectedNavCount + ' nav destinations');
  targets.forEach(function (target) {
    ok(sectionIds.indexOf(target) !== -1, surface + ' nav target #' + target + ' exists');
  });
});

/* Trainer console contract for alloted batches, private KYC uploads and the
   seven-day timetable controls. */
const trainerHtml = read('trainer/index.html');
ok(trainerHtml.indexOf('Alloted Batches') !== -1, 'trainer dashboard has the Alloted Batches section');
ok(trainerHtml.indexOf('id="allotedBatchList"') !== -1, 'alloted batches are rendered from live data');
ok(trainerHtml.indexOf('type="file"') !== -1, 'KYC documents use image upload inputs');
ok(trainerHtml.indexOf('accept="image/jpeg,image/png,image/webp"') !== -1,
  'KYC uploads accept only images');
ok(trainerHtml.indexOf('name="aadhaarNumber"') !== -1 &&
  trainerHtml.indexOf('name="panNumber"') !== -1,
'KYC card numbers have typed text inputs alongside uploads');

const trainerSchedule = read('trainer/schedule.js');
ok(trainerSchedule.indexOf('getWeekSchedule') !== -1, 'calendar loads a seven-day window');
ok(trainerSchedule.indexOf('\'‹ Prev\'') !== -1 &&
  trainerSchedule.indexOf('\'Today\'') !== -1 &&
  trainerSchedule.indexOf('\'Next ›\'') !== -1,
'calendar exposes Prev, Today and Next controls');
ok(trainerSchedule.indexOf('shiftDays(state.weekStart, 7)') !== -1,
  'Next advances the timetable by seven days');
ok(trainerSchedule.indexOf('mondayOf(today())') !== -1,
  'Today returns to the current date column');

const trainerApp = read('trainer/app.js');
ok(trainerApp.indexOf("node.classList.toggle('is-active'") !== -1 &&
  trainerApp.indexOf("getAttribute('data-view')") !== -1,
'nav switches one trainer view at a time instead of stacking every section');
ok(read('trainer/index.html').indexOf('<details class="block onboarding-block"') !== -1,
  'KYC form is collapsed inside the Insights view');

/* Founder announcement audience selector and scoped recipient inboxes. */
const announcementFounderHtml = read('founder/index.html');
ok(announcementFounderHtml.indexOf('id="announcementAudience"') !== -1,
  'founder announcement composer is present');
['trainers', 'students', 'both', 'individual'].forEach(function (value) {
  ok(announcementFounderHtml.indexOf('value="' + value + '"') !== -1,
    'audience option ' + value + ' is offered to the founder');
});
ok(announcementFounderHtml.indexOf('id="announcementRecipientWrap"') !== -1,
  'individual targeting reveals a named recipient picker');
ok(announcementFounderHtml.indexOf('id="announcementHistory"') !== -1,
  'founder can review sent announcements');
['trainer/index.html', 'student/index.html'].forEach(function (surface) {
  const html = read(surface);
  ok(html.indexOf('data-announcement-list') !== -1,
    surface + ' has a scoped announcement inbox');
  ok(html.indexOf('../shared/announcements.js') !== -1,
    surface + ' loads the shared inbox client');
});
const announcementService = read('server/services/announcementService.js');
ok(announcementService.indexOf("AUDIENCES = ['trainers', 'students', 'both', 'individual']") !== -1,
  'server allowlists exactly four announcement audiences');
ok(announcementService.indexOf('dlp.scan(') !== -1,
  'announcements pass the same DLP gate as parent chat');

console.log('navContract: ' + checks.length + ' assertions passed');
