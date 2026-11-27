/* Reminder + timezone contract: one UTC instant rendered in each recipient's
   registered zone, parent-only in-app reminders, safe join links, and honest
   fail-closed email when Resend is not configured. */

process.env.DATABASE_MODE = process.env.DATABASE_MODE || 'mock';
process.env.APP_ORIGIN = 'http://127.0.0.1:4000';

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const timezone = require('../services/timezoneService');
const registration = require('../services/registrationService');
const notifications = require('../services/notificationService');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;

  async function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + route, {
      method: method, headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = { raw: text }; }
    return { status: response.status, body: data || {} };
  }

  try {
    /* Same absolute instant, two registered zones. */
    const instant = '2026-02-10T18:30:00.000Z';
    const india = timezone.format(instant, 'Asia/Kolkata');
    const saudi = timezone.format(instant, 'Asia/Riyadh');
    ok(india && india.text.indexOf('Asia/Kolkata') !== -1,
      'India viewer sees the instant in Asia/Kolkata');
    ok(saudi && saudi.text.indexOf('Asia/Riyadh') !== -1,
      'Saudi viewer sees the same instant in Asia/Riyadh');
    ok(india.text !== saudi.text, 'the two registered zones render different local times');
    equal(india.iso, instant, 'the underlying UTC instant is never changed');

    equal(timezone.normalize('Mars/Olympus'), null, 'an invalid IANA zone is rejected');
    equal(timezone.normalize('Asia/Riyadh'), 'Asia/Riyadh', 'a valid IANA zone is canonicalized');

    /* Registration stores the child's own zone, and rejects invented zones. */
    let invalidZone = null;
    try {
      await registration.register({
        role: 'student', name: 'Zone Test', email: 'zone-invalid@example.com',
        password: 'password123', timezone: 'Mars/Olympus'
      });
    } catch (error) { invalidZone = error; }
    equal(invalidZone && invalidZone.code, 'INVALID_TIMEZONE',
      'registration rejects a timezone outside the IANA list');

    const registered = await registration.register({
      role: 'student', name: 'Zone Test', email: 'zone-valid@example.com',
      password: 'password123', timezone: 'Asia/Riyadh'
    });
    equal(db.findUserById(registered.user.id).timezone, 'Asia/Riyadh',
      'registration stores the canonical IANA zone');
    equal(db.findUserById(registered.user.id).status, 'active',
      'student registration remains active after choosing a zone');

    /* Parent in-app reminder: only the signed-in parent's child, in the
       parent's registered zone, with a server-built join URL. */
    db.updateUser('usr_parent_001', function (user) {
      user.timezone = 'Asia/Kolkata';
      return user;
    });
    db.updateUser('usr_student_001', function (user) {
      user.timezone = 'Asia/Riyadh';
      return user;
    });

    const ownSessionId = 'ses_math_001';
    const foreignSessionId = 'ses_math_000';
    const startsAt = new Date(Date.now() + 15 * 60000).toISOString();
    db.updateSession(ownSessionId, function (session) {
      session.title = 'Own child class';
      session.status = 'scheduled';
      session.startsAt = startsAt;
      session.scheduledAt = startsAt;
      session.studentTimezone = 'Asia/Riyadh';
      return session;
    });
    db.updateSession(foreignSessionId, function (session) {
      session.studentId = 'usr_student_002';
      session.title = 'Foreign class';
      session.status = 'scheduled';
      session.startsAt = startsAt;
      session.scheduledAt = startsAt;
      session.studentTimezone = 'Asia/Riyadh';
      return session;
    });

    async function login(email) {
      const result = await request('POST', '/api/auth/login', {
        email: email, password: 'mathify-demo'
      });
      return result.body.token;
    }
    const parentToken = await login('parent@mathify.app');
    const trainerToken = await login('trainer@mathify.app');

    const parentResult = await request('GET', '/api/parent/reminders', undefined, parentToken);
    equal(parentResult.status, 200, 'the parent can read their own in-app reminders');
    const own = (parentResult.body.reminders || []).find(function (item) {
      return item.sessionId === ownSessionId;
    });
    ok(Boolean(own), 'the parent sees their child’s upcoming class');
    ok(own && own.localStart && own.localStart.indexOf('Asia/Kolkata') !== -1,
      'the parent reminder is rendered in the parent’s registered zone');
    equal(own && own.timezone, 'Asia/Kolkata', 'the reminder response reports the viewer zone');
    ok(own && own.joinUrl && own.joinUrl.indexOf('127.0.0.1:4000/classroom/') !== -1,
      'the in-app join link comes from the validated server origin');
    ok(!(parentResult.body.reminders || []).some(function (item) {
      return item.sessionId === foreignSessionId;
    }), 'another student’s class never leaks into the parent inbox');

    const trainerResult = await request('GET', '/api/parent/reminders', undefined, trainerToken);
    equal(trainerResult.status, 403, 'the parent reminder endpoint is parent-only');
    equal(trainerResult.body.error, 'FORBIDDEN', 'role denial uses an explicit error code');

    /* Missing Resend configuration fails closed instead of sending anything. */
    const joinEmail = await notifications.sendJoinEmail({
      session: { id: ownSessionId, scheduledAt: startsAt, studentTimezone: 'Asia/Riyadh' },
      recipient: { id: 'usr_trainer_001', name: 'Trainer', email: 'trainer@mathify.app' },
      role: 'trainer', when: '15m'
    });
    equal(joinEmail.sent, false, 'join email is not sent while Resend is unconfigured');
    equal(joinEmail.reason, 'EMAIL_NOT_CONFIGURED',
      'the join email reports the exact configuration failure');

    console.log('reminderTimezone: ' + checks + ' assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousFrom;
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
