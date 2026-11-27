/* One credential-shaped app for kids, parents and managers, plus a separate
 * server-gated founder admin application. This suite checks the static bundle
 * boundaries and the real HTTP static gate; API authorization stays in the
 * existing route middleware and is covered by its own suites. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');

const root = path.resolve(__dirname, '..', '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

const shell = read('unified/shell.js');
const unifiedHtml = read('unified/index.html');
const serverApp = read('server/app.js');
const authRoutes = read('server/routes/auth.js');
const loginClient = read('login/login.js');
const sectionRouter = read('shared/sectionRouter.js');
const founderAdminHtml = read('founder-admin/index.html');
const appsHub = read('apps.html');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function absent(text, needle, label) {
  ok(text.indexOf(needle) === -1, label);
}
function present(text, needle, label) {
  ok(text.indexOf(needle) !== -1, label);
}

function staticChecks() {
  present(unifiedHtml, '<span>Mathify</span><i>.</i>', 'the unified shell keeps the Mathify wordmark');
  absent(unifiedHtml, 'href="#"', 'the unified shell has no dead-end links');

  /* The shell is inert until the server verifies a token. The query string may
     choose which desk to try, but only /auth/me decides what is rendered. */
  present(shell, "request('/auth/me', { token: presented })", 'the shell asks the server who is signed in');
  present(shell, 'answer.user.role', 'the rendered role comes from the verified session');
  present(shell, 'roleFromQuery()', 'the query only selects a desk candidate');
  present(shell, 'verify(desk, stored)', 'a stored token is verified before any view renders');
  present(shell, 'DESKS[activeRole].nav', 'navigation is built from the verified role');

  /* The unified bundle never carries founder credentials or founder controls. */
  absent(shell, 'mathify.classroom.token.founder', 'the unified bundle has no founder token key');
  absent(shell, 'mathify_founder_gate', 'the unified bundle has no founder gate cookie');
  absent(shell, '/admin/settings', 'the unified bundle has no founder settings route');
  absent(shell, '/admin/audit', 'the unified bundle has no founder audit route');
  absent(shell, 'monthly-salary', 'the unified bundle has no salary control');
  absent(unifiedHtml, '<iframe', 'the unified app does not embed desks in iframes');

  /* Student controls: explicit classroom role, signed recording links, and a
     Study Buddy that surfaces the daily image allowance. */
  present(shell, 'role=student&view=student', 'student classroom joins state the viewer role explicitly');
  present(shell, "'/recordings/' + encodeURIComponent(row.sessionId) + '/url?expiresIn=600'",
    'recordings are opened through a short-lived signed link');
  present(shell, 'row.available', 'only available recordings are listed');
  absent(shell, 'lms/index.html#recordings', 'the unified app does not send kids to an unimplemented player');
  present(shell, 'getStudyBuddyQuota', 'Study Buddy reads today’s photo allowance');
  present(shell, 'IMAGE_QUOTA_EXCEEDED', 'the friendly quota message reaches the kid');

  /* Parent controls are scoped by the server-returned thread, never by a
     student id typed or queried in the browser. */
  present(shell, "request('/parent-chat/thread')", 'the parent view loads only the server-linked thread');
  present(shell, "request('/parent-chat/thread/' + encodeURIComponent(thread.studentId) + '/messages'",
    'parent sends use the server-derived child link');
  absent(shell, "queryParam('studentId')", 'the parent view cannot authorize with a client student id');

  /* RM controls stay inside the founder-set boundary. */
  present(shell, "'/grant'", 'the manager can grant desk access');
  present(shell, "'/password'", 'the manager can issue a generated temporary password');
  absent(shell, "'/penalties'", 'the unified app has no manager penalty action');
  absent(shell, 'Record penalty', 'the manager cannot record a penalty from the unified app');
  absent(shell, "status: 'suspended'", 'the manager cannot revoke access from the unified app');
  absent(shell, "type = 'password'", 'the manager cannot choose a credential');

  /* Every unified nav target is a real same-origin section URL. */
  [
    '/app/home', '/app/attendance', '/app/mastery', '/app/recordings', '/app/buddy',
    '/app/parent/inbox', '/app/parent/child', '/app/parent/sessions',
    '/app/parent/guidance', '/app/parent/policies',
    '/app/rm/dashboard', '/app/rm/trainers', '/app/rm/students',
    '/app/rm/classes'
  ].forEach(function (route) {
    present(shell, "'" + route + "?desk=", 'the shell links ' + route);
    present(serverApp, "'" + route + "': 'unified/index.html'", route + ' is served by the section route map');
  });

  /* The founder app is a separate document behind its own static gate. */
  present(founderAdminHtml, 'href="/founder-admin/overview"', 'the founder admin app has its own navigation');
  absent(founderAdminHtml, 'href="/founder/overview"', 'the founder admin app never leaves its gated path');
  present(serverApp, 'requireFounderDesktop', 'founder admin delivery is server-gated');
  present(serverApp, 'founder-admin/index.html', 'the gated entry serves the separate admin document');
  present(serverApp, 'mathify_founder_gate', 'the gate reads the founder session cookie');
  present(authRoutes, 'httpOnly: true', 'the founder gate cookie is HttpOnly');
  present(authRoutes, "user.role === 'founder'", 'only a verified founder receives the gate cookie');
  present(loginClient, 'founder-admin/index.html', 'founder sign-in opens the separate admin app');
  present(loginClient, 'founder-admin', 'safe redirects allow the founder admin path');
  present(loginClient, 'app|founder-admin|student', 'safe redirects allow the unified app path');
  ['overview', 'money', 'trainer-admin', 'student-admin', 'audit'].forEach(function (section) {
    present(sectionRouter, "'/founder-admin/" + section + "':",
      'the founder admin section router renders ' + section);
  });

  /* The launcher reflects what is actually live and keeps the planner copy. */
  present(appsHub, 'login.html?role=parent&amp;next=/app/parent/inbox', 'the launcher links the unified parent app');
  present(appsHub, 'login.html?role=rm&amp;next=/app/rm/dashboard', 'the launcher links the unified manager app');
  present(appsHub, '06 · Parent</span><span class="pill open">Live', 'parent is no longer marked as planned');
  present(appsHub, '06 · Practice</span><span class="pill open">Live', 'mastery practice is live');
  present(appsHub, 'login.html?role=founder&amp;next=/founder-admin/overview', 'the launcher links the gated founder app');
  present(appsHub, 'modules, review and the planner designer are usable',
    'the launcher keeps the reviewed planner copy');
}

async function httpChecks() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(requestPath, options) {
    const response = await fetch(base + requestPath, options);
    const body = await response.text();
    return { status: response.status, text: body, cookie: response.headers.get('set-cookie') || '' };
  }
  try {
    const anonymous = await call('/founder-admin/overview');
    ok(anonymous.status === 403 && anonymous.text.indexOf('FOUNDER_DESK_REQUIRED') !== -1,
      'an anonymous browser cannot open the founder admin document');

    const unified = await call('/app/home');
    ok(unified.status === 200 && unified.text.indexOf('One phone-first Mathify app') !== -1,
      'the unified app shell is served on a real same-origin route');

    const founderLogin = await call('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'founder@mathify.app', password: 'mathify-demo', role: 'founder' })
    });
    ok(founderLogin.status === 200, 'the founder can sign in through credential login');
    const gateCookie = String(founderLogin.cookie).split(';')[0];
    ok(gateCookie.indexOf('mathify_founder_gate=') === 0, 'founder sign-in sets the admin gate cookie');
    ok(founderLogin.cookie.indexOf('HttpOnly') !== -1, 'the admin gate cookie cannot be read by scripts');

    const gated = await call('/founder-admin/overview', { headers: { cookie: gateCookie } });
    ok(gated.status === 200 && gated.text.indexOf('Founder settings') !== -1,
      'a verified founder opens the separate admin document');
    ok(gated.text.indexOf('href="/founder-admin/audit"') !== -1,
      'the gated document keeps its own admin navigation');

    const gatedAsset = await call('/founder-admin/app.js', { headers: { cookie: gateCookie } });
    ok(gatedAsset.status === 200 && gatedAsset.text.indexOf("window.MATHIFY_API_BASE || '/api'") !== -1,
      'founder scripts are delivered only through the gated entry');

    const studentLogin = await call('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'student@mathify.app', password: 'mathify-demo', role: 'student' })
    });
    ok(studentLogin.status === 200, 'a student can sign in through credential login');
    const wrongCookie = 'mathify_founder_gate=' + JSON.parse(studentLogin.text).token;
    const denied = await call('/founder-admin/overview', { headers: { cookie: wrongCookie } });
    ok(denied.status === 403, 'a student token cannot open the founder admin document');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function main() {
  staticChecks();
  await httpChecks();
  console.log('unifiedApp: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
