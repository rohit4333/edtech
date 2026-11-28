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
  'classroom/index.html',
].forEach(function (surface) {
  const html = read(surface);
  REQUIRED.forEach(function (page) {
    ok(html.indexOf(page) !== -1, surface + ' links ' + page);
  });
});

/* Credential sign in is a real destination, not a demo shortcut. */
const loginHtml = read('login.html');
const loginScript = read('login/login.js');
ok(
  loginHtml.indexOf('id="loginForm"') !== -1 &&
    loginHtml.indexOf('id="loginEmail"') !== -1 &&
    loginHtml.indexOf('id="loginPassword"') !== -1,
  'login page exposes an email and password form'
);
ok(
  loginScript.indexOf("'/auth/login'") !== -1 &&
    loginScript.indexOf('password: password, role: role') !== -1,
  'login page posts credentials with the opened desk as a role hint'
);
ok(
  loginScript.indexOf('user.role !== role') === -1 && loginHtml.indexOf('role-tab') === -1,
  'login page has no role picker and no client-side role mismatch refusal'
);
ok(
  loginScript.indexOf('shared student/parent credential') !== -1,
  'login page documents the shared student/parent credential'
);
ok(
  loginScript.indexOf('mathify.student.token') !== -1 &&
    loginScript.indexOf('mathify.trainer.token') !== -1,
  'login page stores tokens the dashboards actually read'
);
ok(!/mathify-demo/.test(loginScript), 'login page contains no hard-coded demo password');
const chooserHtml = read('view-choice.html');
const chooserScript = read('login/viewChoice.js');
ok(
  loginScript.indexOf('/view-choice.html') !== -1 &&
    loginScript.indexOf("'mathify.postLogin'") !== -1,
  'credential sign-in hands off to the post-login view chooser'
);
ok(
  chooserHtml.indexOf('id="choiceGrid"') !== -1 &&
    chooserHtml.indexOf('id="loginForm"') === -1 &&
    chooserHtml.indexOf('type="password"') === -1,
  'view chooser has view cards and no second credential form'
);
ok(
  chooserScript.indexOf("'/auth/me'") !== -1 &&
    chooserScript.indexOf("'/auth/view'") !== -1 &&
    chooserScript.indexOf("'mathify.viewChoice'") !== -1,
  'view chooser verifies identity, mints only allowed views and stores the session choice'
);
const sharedBlock = chooserScript.match(/var SHARED_VIEWS = \{([\s\S]*?)\n {2}\};/);
ok(
  Boolean(sharedBlock) &&
    sharedBlock[1].indexOf("parent: ['parent', 'student']") !== -1 &&
    sharedBlock[1].indexOf("student: ['student', 'parent']") !== -1 &&
    !/trainer:|relationship_manager:|founder:|planner_agent:/.test(sharedBlock[1]),
  'only the shared family pair offers alternate views'
);
const appsHtml = read('apps.html');
ok(
  appsHtml.indexOf('login.html?role=student') !== -1 &&
    appsHtml.indexOf('login.html?role=trainer') !== -1,
  'apps hub sends students and trainers through credential sign in'
);
[
  'student/api.js',
  'trainer/api.js',
  'classroom/api.js',
  'parent/app.js',
  'founder/app.js',
  'trainer/parentChat.js',
].forEach(function (client) {
  const source = read(client);
  ok(
    source.indexOf("'/login.html?role=") !== -1,
    client + ' redirects unauthenticated viewers to the root sign-in page'
  );
  ok(
    source.indexOf('/auth/demo') === -1 && !/mathify-demo/.test(source),
    client + ' contains no silent demo login'
  );
});

/* Every authenticated desk exposes a profile panel and an explicit logout. */
['trainer', 'student', 'parent', 'founder', 'rm', 'planner-agent'].forEach(function (role) {
  const html = read(role + '/index.html');
  ok(
    html.indexOf('id="profileBtn"') !== -1 && html.indexOf('id="profilePanel"') !== -1,
    role + ' desk has a profile menu'
  );
  ok(
    html.indexOf('id="logoutBtn"') !== -1 && html.indexOf('>Log out<') !== -1,
    role + ' desk has a visible logout control'
  );
});
['trainer/api.js', 'student/api.js', 'parent/app.js', 'founder/app.js', 'rm/app.js'].forEach(
  function (client) {
    const source = read(client);
    ok(
      source.indexOf('function logout()') !== -1 &&
        source.indexOf('window.location.replace(LOGIN_PAGE)') !== -1,
      client + ' clears the session and returns to role sign-in on logout'
    );
  }
);

/* Partial work is labelled in the UI, not only in documentation. */
ok(
  /preview-banner/.test(read('lms/index.html')) &&
    /Curriculum preview/.test(read('lms/index.html')),
  'LMS surface carries a visible preview banner'
);
ok(
  /pill soon">Preview/.test(read('apps.html')) &&
    /Partial course library preview/.test(read('apps.html')),
  'apps hub labels the LMS as a preview'
);

/* The booking form is a contact request, never a payment form. Home and
   contact mount the same shared frame. */
const contact = read('contact.html');
const bookingFrame = read('shared/demo-booking.js');
ok(/No payment is taken here/.test(bookingFrame), 'shared booking frame says no payment is taken');
ok(
  /id="demoBookingMount"/.test(contact) && /id="demoBookingMount"/.test(read('index.html')),
  'home and contact mount the same demo booking frame'
);
ok(
  !/card-number|cardNumber|paymentMethod|razorpay/i.test(bookingFrame + contact),
  'booking frame collects no payment fields'
);

/* The shared demo form uses a full IANA timezone dropdown. */
ok(
  bookingFrame.indexOf('<select id="demoTimezone" name="timezone"') !== -1,
  'shared demo timezone is a select field'
);
ok(
  bookingFrame.indexOf("Intl.supportedValuesOf('timeZone')") !== -1,
  'shared demo timezone uses the browser IANA zone list'
);
ok(
  bookingFrame.indexOf("'Africa/Abidjan'") !== -1 &&
    bookingFrame.indexOf("'Asia/Calcutta'") !== -1 &&
    bookingFrame.indexOf("'UTC'") !== -1,
  'shared demo timezone has an embedded IANA fallback'
);

/* Founder settings are honest drafts with locked money widgets. */
const founderHtml = read('founder/index.html');
const founderScript = read('founder/app.js');
ok(
  founderHtml.indexOf('id="money-readonly"') !== -1,
  'founder surface has a read-only money section'
);
ok(
  founderHtml.indexOf('Never get emotional about money transactions.') !== -1,
  'founder surface keeps the money rule visible'
);
ok(
  founderScript.indexOf('copy.readOnly = true') !== -1,
  'money fields are marked read-only in the founder client'
);
ok(
  founderScript.indexOf('data-section="money"') === -1,
  'no founder input is bound to a money section'
);

/* Planner designer v1 keeps trainer notes out of the student payload. */
const lmsHtml = read('lms/index.html');
const plannerScript = read('lms/planner.js');
ok(
  lmsHtml.indexOf('id="plannerBtn"') !== -1 && lmsHtml.indexOf('id="sheet-planner"') !== -1,
  'LMS exposes the planner designer sheet'
);
ok(
  /Number\(item\.sketch\.minHeight\)\s*>=\s*220/.test(plannerScript),
  'planner enforces a 220px sketch floor'
);
ok(/expandable\s*!==\s*true/.test(plannerScript), 'planner requires expandable sketch spaces');
ok(
  plannerScript.indexOf('function buildStudentPayload') !== -1,
  'planner builds a separate student payload'
);
const studentSerializer = plannerScript.slice(
  plannerScript.indexOf('function studentBlocks()'),
  plannerScript.indexOf('function buildStudentPayload()')
);
ok(
  studentSerializer.indexOf('safe.sketch = {') !== -1 &&
    studentSerializer.indexOf('prompt_for_trainer') === -1,
  'student sketch view excludes the trainer drawing prompt'
);
ok(
  plannerScript.indexOf('quizPrompt.indexOf(String(item.trainerInstructions).trim())') !== -1,
  'planner checks the quiz prompt against trainer instructions'
);
ok(
  read('apps.html').indexOf('modules, review and the planner designer are usable') !== -1,
  'apps hub labels the planner designer as usable'
);

/* Public nav is exact and ordered. */
const publicNav = read('index.html').match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0];
const publicHrefs = (publicNav.match(/href="[^"]+"/g) || []).map(function (value) {
  return value.slice(6, -1);
});
assert.deepStrictEqual(publicHrefs, [
  'index.html',
  'pricing.html',
  'terms.html',
  'privacy.html',
  'refund.html',
  'contact.html',
  'contact.html',
]);
checks.push('public nav is the exact seven-item list');

/* Dashboard navigation uses a real page URL per section, not an in-page hash. */
const dashboardRoutes = {
  'trainer/index.html': [
    '/trainer/today',
    '/trainer/sessions',
    '/trainer/leave',
    '/trainer/students',
    '/trainer/insights',
  ],
  'student/index.html': [
    '/student/home',
    '/student/recordings',
    '/student/mastery',
    '/student/reports',
    '/student/schedule',
  ],
  'founder/index.html': [
    '/founder/overview',
    '/founder/policy',
    '/founder/mastery',
    '/founder/trainer-policy',
    '/founder/money',
    '/founder/announcements',
    '/founder/trainer-admin',
    '/founder/student-admin',
    '/founder/audit',
  ],
  'rm/index.html': [
    '/rm/dashboard',
    '/rm/trainers',
    '/rm/students',
    '/rm/penalties',
    '/rm/classes',
  ],
  'parent/index.html': [
    '/parent/inbox',
    '/parent/child',
    '/parent/sessions',
    '/parent/guidance',
    '/parent/policies',
  ],
};
const appSource = read('server/app.js');
const routerScript = read('shared/sectionRouter.js');
Object.keys(dashboardRoutes).forEach(function (surface) {
  const html = read(surface);
  ok(html.indexOf('href="#"') === -1, surface + ' has no dead-end links');
  ok(html.indexOf('Batch pause') === -1, surface + ' has no Batch pause dead end');
  ok(html.indexOf('Community') === -1, surface + ' has no group-class Community link');
  ok(
    html.indexOf('../shared/sectionRouter.js') !== -1,
    surface + ' loads the section router for separate page views'
  );

  const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  const targets = Array.from(nav.matchAll(/<a[^>]+href="([^"]+)"/g)).map(function (match) {
    return match[1];
  });
  assert.deepStrictEqual(targets, dashboardRoutes[surface]);
  checks.push(surface + ' nav is the exact ordered page-route list');
  targets.forEach(function (route) {
    ok(
      appSource.indexOf("'" + route + "':") !== -1,
      route + ' is served by the same-origin section route map'
    );
    ok(
      routerScript.indexOf("'" + route + "':") !== -1,
      route + ' is rendered by the section router'
    );
  });
});

/* Trainer console contract for alloted batches, private KYC uploads and the
   seven-day timetable controls. */
const trainerHtml = read('trainer/index.html');
ok(
  trainerHtml.indexOf('Alloted Batches') !== -1,
  'trainer dashboard has the Alloted Batches section'
);
ok(
  trainerHtml.indexOf('id="allotedBatchList"') !== -1,
  'alloted batches are rendered from live data'
);
ok(trainerHtml.indexOf('type="file"') !== -1, 'KYC documents use image upload inputs');
ok(
  trainerHtml.indexOf('accept="image/jpeg,image/png,image/webp"') !== -1,
  'KYC uploads accept only images'
);
ok(
  trainerHtml.indexOf('name="aadhaarNumber"') !== -1 &&
    trainerHtml.indexOf('name="panNumber"') !== -1,
  'KYC card numbers have typed text inputs alongside uploads'
);
ok(
  trainerHtml.indexOf('name="aadhaarFrontImage"') !== -1 &&
    trainerHtml.indexOf('name="aadhaarRearImage"') !== -1 &&
    trainerHtml.indexOf('name="panFrontImage"') !== -1 &&
    trainerHtml.indexOf('name="panRearImage"') !== -1,
  'Aadhaar and PAN each require front and rear image uploads'
);
const bankDetails = trainerHtml.match(/<legend>Bank details[\s\S]*?<\/fieldset>/)[0];
ok(
  bankDetails.indexOf('id="kycBankProofImage"') !== -1,
  'bank proof image is grouped with bank details'
);
ok(
  trainerHtml.indexOf('exact pay per contract/offer letter or as stated during onboarding') !== -1,
  'payout copy defers exact pay to the contract, offer letter or onboarding'
);

const trainerSchedule = read('trainer/schedule.js');
ok(trainerSchedule.indexOf('getWeekSchedule') !== -1, 'calendar loads a seven-day window');
ok(
  trainerSchedule.indexOf("'‹ Prev'") !== -1 &&
    trainerSchedule.indexOf("'Today'") !== -1 &&
    trainerSchedule.indexOf("'Next ›'") !== -1,
  'calendar exposes Prev, Today and Next controls'
);
ok(
  trainerSchedule.indexOf('shiftDays(state.weekStart, 7)') !== -1,
  'Next advances the timetable by seven days'
);
ok(trainerSchedule.indexOf('mondayOf(today())') !== -1, 'Today returns to the current date column');

const trainerApp = read('trainer/app.js');
ok(
  trainerApp.indexOf("node.classList.toggle('is-active'") !== -1 &&
    trainerApp.indexOf("getAttribute('data-view')") !== -1,
  'nav switches one trainer view at a time instead of stacking every section'
);
ok(
  read('trainer/index.html').indexOf('<details class="block onboarding-block"') !== -1,
  'KYC form is collapsed inside the Insights view'
);

/* Founder announcement audience selector and scoped recipient inboxes. */
const announcementFounderHtml = read('founder/index.html');
ok(
  announcementFounderHtml.indexOf('id="announcementAudience"') !== -1,
  'founder announcement composer is present'
);
['trainers', 'students', 'both', 'individual'].forEach(function (value) {
  ok(
    announcementFounderHtml.indexOf('value="' + value + '"') !== -1,
    'audience option ' + value + ' is offered to the founder'
  );
});
ok(
  announcementFounderHtml.indexOf('id="announcementRecipientWrap"') !== -1,
  'individual targeting reveals a named recipient picker'
);
ok(
  announcementFounderHtml.indexOf('id="announcementHistory"') !== -1,
  'founder can review sent announcements'
);
['trainer/index.html', 'student/index.html'].forEach(function (surface) {
  const html = read(surface);
  ok(html.indexOf('data-announcement-list') !== -1, surface + ' has a scoped announcement inbox');
  ok(html.indexOf('../shared/announcements.js') !== -1, surface + ' loads the shared inbox client');
});
const announcementService = read('server/services/announcementService.js');
ok(
  announcementService.indexOf("AUDIENCES = ['trainers', 'students', 'both', 'individual']") !== -1,
  'server allowlists exactly four announcement audiences'
);
ok(
  announcementService.indexOf('dlp.scan(') !== -1,
  'announcements pass the same DLP gate as parent chat'
);

/* Account creation and recovery are real, allowlisted public destinations. */
ok(loginHtml.indexOf('href="register.html"') !== -1, 'sign in links to the account-creation page');
ok(
  read('register.html').indexOf('id="registerForm"') !== -1 &&
    read('register/register.js').indexOf("'/auth/register'") !== -1,
  'registration posts to the throttled server route'
);
ok(
  appSource.indexOf("'password-reset.html'") !== -1 &&
    appSource.indexOf("'register.html'") !== -1 &&
    appSource.indexOf("'register', 'rm'") !== -1,
  'registration, reset and manager assets are on the reviewed static allowlist'
);
const authSource = read('server/routes/auth.js');
ok(
  /router\.post\(\s*'\/register'/.test(authSource) &&
    /router\.post\(\s*'\/password-reset\/request'/.test(authSource) &&
    /router\.post\(\s*'\/password-reset\/confirm'/.test(authSource),
  'registration and both password-recovery requests are server routes'
);

/* Manager activity is visible to the founder but stays inside the founder desk. */
ok(
  founderHtml.indexOf('href="/founder/audit"') !== -1 &&
    founderHtml.indexOf('>Manager activity</a>') !== -1,
  'founder navigation exposes Manager activity at the audit route'
);
ok(
  founderHtml.indexOf('id="audit-log"') !== -1 &&
    founderHtml.indexOf('id="auditLogTable"') !== -1 &&
    founderHtml.indexOf('server/logs/admin-actions.jsonl') !== -1,
  'founder audit section shows a table and the service-side log path'
);
ok(
  read('founder/adminDesk.js').indexOf("'/admin/audit?role=relationship_manager'") !== -1,
  'founder audit view reads only relationship-manager actions'
);

/* The manager desk states and enforces the founder boundary, with one scoped
   generated-password recovery for an approved trainer. */
const rmHtml = read('rm/index.html');
const rmScript = read('rm/app.js');
ok(
  rmHtml.indexOf(
    'Only the founder revokes a desk, chooses or replaces a credential or edits founder-set pay.'
  ) !== -1 && rmHtml.indexOf('id="rmIssueTrainerPassword"') !== -1,
  'manager desk states the founder-only boundary and offers generated-password recovery'
);
ok(
  rmScript.indexOf(
    "Founder has completed this trainer's onboarding. No manager action remains; base pay is locked."
  ) !== -1 &&
    rmScript.indexOf('You may still issue a temporary trainer password if needed.') !== -1,
  'manager desk labels founder-completed onboarding as read-only except for temporary password recovery'
);
ok(
  rmScript.indexOf(
    "request('/admin/people/' + encodeURIComponent(id) + '/password', { generated: true }, 'PATCH')"
  ) !== -1,
  'manager desk sends only a generated request to the scoped password route'
);
ok(
  rmScript.indexOf('trainersNeedingAction') !== -1,
  'manager desk tracks trainers still awaiting manager action'
);

/* Staff registration and KYC are role-neutral. The public page uses one form
   for trainer and manager, and the two onboarding desks expose the same field
   contract; only the signed-in role changes. */
const registerHtml = read('register.html');
['value="trainer"', 'value="relationship_manager"'].forEach(function (option) {
  ok(registerHtml.indexOf(option) !== -1, 'registration offers ' + option);
});
function onboardingIds(html) {
  const start = html.indexOf('id="onboardingForm"');
  const form = html.slice(start, html.indexOf('</form>', start));
  const found = [];
  const pattern = /<(?:input|textarea)\b[^>]*\bid="([^"]+)"/g;
  let match = pattern.exec(form);
  while (match) {
    found.push(match[1]);
    match = pattern.exec(form);
  }
  return found;
}
const trainerIds = onboardingIds(read('trainer/index.html'));
const managerIds = onboardingIds(rmHtml);
ok(
  trainerIds.length && trainerIds.join(',') === managerIds.join(','),
  'trainer and manager onboarding desks collect exactly the same fields'
);
ok(
  [
    'kycAadhaarFrontImage',
    'kycAadhaarRearImage',
    'kycPanFrontImage',
    'kycPanRearImage',
    'kycSignatureImage',
  ].every(function (id) {
    return trainerIds.indexOf(id) !== -1 && managerIds.indexOf(id) !== -1;
  }),
  'trainer and manager require the same identity documents'
);

/* The planner agent desk keeps the shared brand mark, a relative sign-out and
   an explicit founder-review boundary, and its assets are statically served. */
const plannerAgentHtml = read('planner-agent/index.html');
const plannerAgentScript = read('planner-agent/app.js');
ok(
  plannerAgentHtml.indexOf('Mathify<i>.</i>') !== -1 && plannerAgentHtml.indexOf('Mathify.') === -1,
  'planner agent desk uses the exact brand mark'
);
ok(
  plannerAgentScript.indexOf("window.location.replace('../login.html')") !== -1 &&
    plannerAgentScript.indexOf('mathify.planner.token') !== -1 &&
    plannerAgentScript.indexOf('mathify.classroom.token.planner_agent') !== -1,
  'planner agent logout clears both agent tokens and returns to role sign-in'
);
ok(
  plannerAgentHtml.indexOf('Founder-created planners are immutable') !== -1,
  'planner agent desk states the founder-review boundary'
);
ok(
  appSource.indexOf("'planner-agent'") !== -1,
  'planner agent desk is on the reviewed static allowlist'
);

console.log('navContract: ' + checks.length + ' assertions passed');
