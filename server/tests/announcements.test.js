/* Founder announcement audience and DLP regression suite. Mock mode only. */

const assert = require('assert');
const app = require('../app');

const password = process.env.DEMO_PASSWORD || 'mathify-demo';
let checks = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  function request(method, route, body, token) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (response) {
      return response.text().then(function (text) {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
        return { status: response.status, body: data, text: text };
      });
    });
  }

  async function login(email) {
    const response = await request('POST', '/api/auth/login', { email: email, password: password });
    equal(response.status, 200, email + ' credential login succeeds');
    return response.body.token;
  }

  try {
    const founder = await login('founder@mathify.app');
    const trainer = await login('trainer@mathify.app');
    const student = await login('student@mathify.app');

    const denied = await request('POST', '/api/admin/announcements', {
      audience: 'trainers', title: 'Denied', message: 'No access.'
    }, trainer);
    equal(denied.status, 403, 'trainers cannot author announcements');
    const adminRead = await request('GET', '/api/admin/announcements', undefined, student);
    equal(adminRead.status, 403, 'students cannot read the founder announcement audit');

    async function send(audience, title, message, recipientId) {
      const response = await request('POST', '/api/admin/announcements', {
        audience: audience,
        title: title,
        message: message,
        recipientId: recipientId
      }, founder);
      equal(response.status, 200, 'founder sends ' + audience + ' announcement');
      return response.body.announcement;
    }

    const toTrainers = await send('trainers', 'Trainer brief', 'Bring the ratio cards on Friday.');
    const toStudents = await send('students', 'Student brief', 'Practice starts at 4 PM.');
    const toBoth = await send('both', 'Holiday notice', 'No class on Sunday.');
    const toOne = await send('individual', 'One to one', 'Your batch is confirmed.', 'usr_student_001');

    const trainerInbox = await request('GET', '/api/announcements', undefined, trainer);
    const studentInbox = await request('GET', '/api/announcements', undefined, student);
    equal(trainerInbox.status, 200, 'trainer inbox is readable');
    equal(studentInbox.status, 200, 'student inbox is readable');

    const trainerIds = trainerInbox.body.announcements.map(function (row) { return row.id; });
    const studentIds = studentInbox.body.announcements.map(function (row) { return row.id; });
    ok(trainerIds.indexOf(toTrainers.id) !== -1, 'trainers-only notice reaches trainers');
    equal(trainerIds.indexOf(toStudents.id), -1, 'students-only notice is hidden from trainers');
    ok(trainerIds.indexOf(toBoth.id) !== -1, 'both notice reaches trainers');
    equal(trainerIds.indexOf(toOne.id), -1, 'individual student notice is hidden from trainers');

    equal(studentIds.indexOf(toStudents.id) !== -1, true, 'students-only notice reaches students');
    equal(studentIds.indexOf(toTrainers.id), -1, 'trainers-only notice is hidden from students');
    ok(studentIds.indexOf(toBoth.id) !== -1, 'both notice reaches students');
    ok(studentIds.indexOf(toOne.id) !== -1, 'individual notice reaches its named student');

    const individual = studentInbox.body.announcements.find(function (row) { return row.id === toOne.id; });
    equal(individual.recipientId, undefined, 'student payload hides the targeting id');
    equal(individual.recipientName, undefined, 'student payload hides founder targeting metadata');
    equal(JSON.stringify(studentInbox.body).indexOf('@'), -1, 'student inbox carries no contact details');

    const audit = await request('GET', '/api/admin/announcements', undefined, founder);
    const auditOne = audit.body.announcements.find(function (row) { return row.id === toOne.id; });
    equal(auditOne.recipientName, 'Ishaan Verma', 'founder audit shows the recipient name only');
    equal(auditOne.recipientId, 'usr_student_001', 'founder audit keeps the targeting id');
    equal(JSON.stringify(audit.body).indexOf('@'), -1, 'founder audit carries no contact details');

    const blocked = await request('POST', '/api/admin/announcements', {
      audience: 'both',
      title: 'Call me',
      message: 'Reach me on 9876543210 or me@example.com'
    }, founder);
    equal(blocked.status, 422, 'contact details are blocked before storage');
    equal(blocked.body.error, 'CONTENT_BLOCKED', 'blocked send uses the neutral code');
    equal(blocked.text.indexOf('9876543210'), -1, 'blocked phone number is never echoed');
    equal(blocked.text.indexOf('me@example.com'), -1, 'blocked email is never echoed');
    const afterBlock = await request('GET', '/api/admin/announcements', undefined, founder);
    equal(afterBlock.body.announcements.length, audit.body.announcements.length,
      'blocked announcement was not stored');

    const badAudience = await request('POST', '/api/admin/announcements', {
      audience: 'everyone', title: 'Bad', message: 'Bad audience.'
    }, founder);
    equal(badAudience.status, 422, 'unknown audiences are refused');
    equal(badAudience.body.error, 'INVALID_AUDIENCE', 'audience error code is explicit');

    const badRecipient = await request('POST', '/api/admin/announcements', {
      audience: 'individual', title: 'Bad', message: 'Unknown person.', recipientId: 'usr_missing'
    }, founder);
    equal(badRecipient.status, 422, 'unknown individual recipients are refused');
    equal(badRecipient.body.error, 'INVALID_RECIPIENT', 'recipient error code is explicit');

    const beforeUnread = await request('GET', '/api/announcements/unread', undefined, trainer);
    equal(beforeUnread.status, 200, 'unread summary is available');
    ok(beforeUnread.body.unread >= 2, 'unread summary counts trainer notices');
    const marked = await request('POST', '/api/announcements/' + toTrainers.id + '/read', undefined, trainer);
    equal(marked.status, 200, 'recipient can mark a notice read');
    const afterUnread = await request('GET', '/api/announcements/unread', undefined, trainer);
    equal(afterUnread.body.unread, beforeUnread.body.unread - 1, 'read notice leaves the unread count');
    const deniedRead = await request('POST', '/api/announcements/' + toTrainers.id + '/read', undefined, student);
    equal(deniedRead.status, 404, 'a student cannot mark a trainer notice read');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('announcements: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
