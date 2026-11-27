/* Demo lifecycle, family credentials and persistent sign-in regression suite.
 *
 * Covers the booked -> prepared -> assigned -> attended -> enrolled path with
 * real route requests and service hooks. The family password is issued at
 * booking, never at a founder/RM desk. No mail, AI or payment provider is
 * contacted: Resend stays fail-closed and links use the server origin only. */
const assert = require('assert');
const crypto = require('crypto');
const app = require('../app');
const db = require('../db');
const mock = require('../db/mock');
const config = require('../config');
const tokenService = require('../auth/token');
const demoService = require('../services/demoService');
const passwordService = require('../services/passwordService');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'mathify-demo';
const FAMILY_EMAIL = 'lifecycle.family@example.com';
const PHONE = '+1 555 0199';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const originalEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  APP_ORIGIN: process.env.APP_ORIGIN,
  CORS_ORIGIN: process.env.CORS_ORIGIN
};
let checks = 0;
let passwordResetId = null;

function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function restoreEnv() {
  Object.keys(originalEnv).forEach(function (key) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
}

async function main() {
  process.env.RESEND_API_KEY = '';
  process.env.RESEND_FROM = '';
  process.env.APP_ORIGIN = '';
  process.env.CORS_ORIGIN = '*';

  const previousOnboarding = await Promise.resolve(db.findTrainerOnboarding('usr_trainer_001'));
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let demoId = null;
  let studentId = null;
  let parentId = null;

  async function request(method, path, body, tokenValue) {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (tokenValue) headers.authorization = 'Bearer ' + tokenValue;
    const response = await fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data, text: text, headers: response.headers };
  }

  function signIn(email, passwordValue, role) {
    return request('POST', '/api/auth/login', {
      email: email, password: passwordValue, role: role
    });
  }

  try {
    ok(tokenService.ttlSeconds < tokenService.rememberTtlSeconds,
      'access tokens are short-lived while remembered refresh tokens last longer');

    /* Mandatory booking fields are enforced twice: browser and API. */
    const badBooking = await request('POST', '/api/contact', {
      parentName: 'Test Parent', email: FAMILY_EMAIL, message: 'Book a demo.'
    });
    equal(badBooking.status, 400, 'incomplete demo booking is refused');

    const booking = await request('POST', '/api/contact', {
      parentName: 'Test Parent', childName: 'Test Child', email: FAMILY_EMAIL,
      phone: PHONE, curriculum: 'cbse', grade: 'class-7',
      timezone: 'Asia/Dubai', message: 'Book a demo.'
    });
    equal(booking.status, 201, 'complete demo booking is accepted');
    demoId = booking.body.demoId;
    equal(booking.body.demoId, booking.body.reference, 'demo ID is the booking reference');
    const sharedPassword = booking.body.credentials && booking.body.credentials.password;
    ok(typeof sharedPassword === 'string' && sharedPassword.length >= 8,
      'the shared child/parent password is returned in the booking window');
    equal(booking.body.credentials.email, FAMILY_EMAIL, 'the confirmation repeats the login email');
    ok(Boolean(booking.body.credentials.studentLink) === false,
      'a wildcard origin never becomes an emailed child link');
    equal(booking.body.delivery.email, false, 'email delivery stays fail-closed without Resend');
    equal(booking.body.delivery.credentialsEmail, false,
      'credential mail is never claimed as delivered without Resend');
    ok(!JSON.stringify(booking.body).includes('"temperature"'),
      'booking response carries no planner or provider detail');

    let current = await db.findContactRequest(demoId);
    studentId = current.studentId;
    parentId = current.parentId;
    equal(current.status, 'prepared', 'booking prepares the demo immediately');
    equal(current.credentialsIssued, true, 'the family login is issued at booking');
    equal(current.curriculum, 'cbse', 'booking stores the registered board');
    equal(current.grade, 'class-7', 'booking stores the registered grade');
    equal(current.classAccess, 'demo', 'booking allows the demo class');
    equal(Object.keys(demoService.deskLinks(demoId)).length, 0,
      'a wildcard origin never becomes an email link');
    const familyNotice = await db.listParentNotifications(studentId);
    ok(familyNotice.some(function (row) {
      return row.kind === 'credentials' && row.message.indexOf('Check your email') !== -1;
    }), 'the parent inbox points to the credential email');
    ok(!JSON.stringify(familyNotice).includes(sharedPassword),
      'the persisted notice never contains the password');

    const founder = await signIn('founder@mathify.app', DEMO_PASSWORD);
    equal(founder.status, 200, 'founder signs in to review the demo');
    const staffView = await demoService.prepare(demoId,
      { id: 'usr_founder_001', role: 'founder' });
    equal(staffView.temporaryPassword, null, 'the founder desk never receives the family password');
    equal(staffView.delivery.email.reason, 'issued_at_booking',
      'the founder desk reports the password was issued at booking');
    const deskRows = await demoService.listRequests(50);
    ok(!JSON.stringify(deskRows).includes(sharedPassword),
      'the founder/RM demo list carries no family password');

    const childLogin = await signIn(FAMILY_EMAIL, sharedPassword, 'student');
    const parentLogin = await signIn(FAMILY_EMAIL, sharedPassword, 'parent');
    equal(childLogin.status, 200, 'the booking password opens the child desk');
    equal(parentLogin.status, 200, 'the same password opens the parent desk');
    equal(childLogin.body.user.email, undefined, 'browser identity carries no email');
    equal(childLogin.body.user.passwordHash, undefined, 'browser identity carries no password hash');

    const refreshed = await request('POST', '/api/auth/refresh', {
      refreshToken: childLogin.body.refreshToken
    });
    equal(refreshed.status, 200, 'a remembered sign-in silently renews access');
    ok(typeof refreshed.body.token === 'string', 'refresh returns a fresh access token');

    const beforeAssignment = await request('GET', '/api/demo/status', undefined, childLogin.body.token);
    equal(beforeAssignment.status, 200, 'child can read their demo status');
    equal(beforeAssignment.body.demo.trainerAssigned, false, 'trainer is pending before assignment');
    equal(beforeAssignment.body.trainer, null, 'no trainer profile is exposed before assignment');

    const batch = {
      id: 'batch_lifecycle_001', code: 'TB-LIFE', studentId: studentId,
      trainerId: 'usr_trainer_001', slots: []
    };
    await db.saveTrainerOnboarding({
      trainerId: 'usr_trainer_001',
      fullName: 'Ananya Rao',
      personal: { contactNumber: '+91 99999 00000', emailId: 'trainer.private@example.com' },
      aadhaar: { number: '1234 5678 9012' },
      bank: { accountNumber: '000123456789' },
      publicProfile: {
        fullName: 'Ananya Rao',
        profilePicture: 'data:image/png;base64,' + PNG,
        yearsExperience: 8,
        degrees: ['M.Sc Mathematics', 'B.Ed'],
        achievements: ['National teaching award']
      }
    });
    const assigned = await demoService.onAllotted(batch,
      { id: 'usr_trainer_001', name: 'Ananya Rao' });
    equal(assigned.demo.status, 'assigned', 'trainer allotment moves the demo to assigned');
    equal(assigned.demo.trainerAssigned, true, 'assignment exposes the trainer name');
    current = await db.findContactRequest(demoId);
    equal(current.batchCode, 'TB-LIFE', 'batch code is stored on the demo');
    equal(current.classAccess, 'demo', 'assignment keeps the demo class open');
    const unchangedLogin = await signIn(FAMILY_EMAIL, sharedPassword, 'student');
    equal(unchangedLogin.status, 200, 'assignment does not replace the family password');

    const notices = await db.listParentNotifications(studentId);
    const assignmentNotice = notices.find(function (row) { return row.kind === 'assignment'; });
    ok(Boolean(assignmentNotice), 'trainer assignment creates a persisted parent notice');
    ok(assignmentNotice && assignmentNotice.message.indexOf(sharedPassword) === -1,
      'the in-app notice never contains the password');
    const parentNotices = await request('GET', '/api/demo/notifications', undefined, parentLogin.body.token);
    equal(parentNotices.status, 200, 'parent reads their own notice inbox');
    ok(parentNotices.body.unreadCount >= 1, 'assignment notice is unread until opened');
    const marked = await request('POST', '/api/demo/notifications/' + assignmentNotice.id + '/read',
      {}, parentLogin.body.token);
    equal(marked.status, 200, 'parent can mark their own notice read');
    const missingNotice = await request('POST', '/api/demo/notifications/pn_missing/read',
      {}, parentLogin.body.token);
    equal(missingNotice.status, 404, 'a foreign or missing notice cannot be marked read');

    const trainerLogin = await signIn('trainer@mathify.app', DEMO_PASSWORD);
    equal(trainerLogin.status, 200, 'assigned trainer signs in');
    const trainerDemo = await request('GET', '/api/demo/trainer/' + demoId,
      undefined, trainerLogin.body.token);
    equal(trainerDemo.status, 200, 'trainer can open only their assigned demo');
    ok(!/lifecycle\.family@example|contactNumber|aadhaar|99999|1234 5678/.test(trainerDemo.text),
      'trainer demo payload carries no family contact or KYC detail');

    const afterAssignment = await request('GET', '/api/demo/status', undefined, childLogin.body.token);
    equal(afterAssignment.body.trainer.name, 'Ananya Rao', 'family sees only the public trainer name');
    equal(afterAssignment.body.trainer.yearsExperience, 8, 'family sees years of experience');
    equal(afterAssignment.body.trainer.degrees.length, 2, 'family sees the public degree list');
    equal(afterAssignment.body.trainer.achievements.length, 1, 'family sees the public achievement list');
    equal(afterAssignment.body.trainer.photoUrl, '/api/demo/photo', 'public picture uses the scoped photo route');
    ok(!/lifecycle\.family@example|99999|aadhaar|accountNumber|bank/i.test(JSON.stringify(afterAssignment.body.trainer)),
      'family trainer card excludes contact, KYC and bank fields');
    const photo = await request('GET', '/api/demo/photo', undefined, childLogin.body.token);
    equal(photo.status, 200, 'family picture endpoint serves the allowlisted image');
    equal(String(photo.headers.get('content-type') || '').indexOf('image/png') === 0, true,
      'picture is returned with its image content type');

    const classBefore = await request('GET', '/api/student/sessions/ses_math_001',
      undefined, childLogin.body.token);
    ok(classBefore.body.error !== 'DEMO_COMPLETE', 'demo class access works before attendance');

    await demoService.onSessionEnded({ studentId: studentId, batchId: batch.id });
    current = await db.findContactRequest(demoId);
    equal(current.status, 'attended', 'ending the demo marks it attended');
    equal(current.classAccess, 'post_demo', 'post-demo class access is closed');
    const doneStatus = await request('GET', '/api/demo/status', undefined, childLogin.body.token);
    equal(doneStatus.body.classAccess, 'post_demo', 'family status reports post-demo access');
    const blockedClass = await request('GET', '/api/student/sessions/ses_math_001',
      undefined, childLogin.body.token);
    equal(blockedClass.status, 403, 'class content is refused after the demo');
    equal(blockedClass.body.error, 'DEMO_COMPLETE', 'family receives the demo-complete reason');
    const blockedPlanner = await request('GET', '/api/lms/planner', undefined, childLogin.body.token);
    equal(blockedPlanner.status, 403, 'the class planner is refused after the demo');
    const policy = await request('GET', '/api/policy/config', undefined, childLogin.body.token);
    equal(policy.status, 200, 'policies remain reachable with the same login');
    equal((await signIn(FAMILY_EMAIL, sharedPassword, 'student')).status, 200,
      'the same booking password still opens the desk after the demo');

    await demoService.onEnrolled(studentId);
    current = await db.findContactRequest(demoId);
    equal(current.status, 'enrolled', 'a credited pack enrolls the demo family');
    equal(current.classAccess, 'regular', 'enrollment restores regular class access');
    const restored = await request('GET', '/api/student/sessions/ses_math_001',
      undefined, childLogin.body.token);
    ok(restored.status !== 403 || restored.body.error !== 'DEMO_COMPLETE',
      'class content is no longer demo-gated after enrollment');

    /* The family alone rotates their credential. Both accounts share the hash,
       and every previously issued token is revoked on both sides. */
    const nextPassword = 'family-new-password-2026';
    const changed = await passwordService.changePassword(parentId, {
      currentPassword: sharedPassword, newPassword: nextPassword
    });
    equal(changed.changed, true, 'the parent can change the shared password themselves');
    equal(changed.notification.sent, false, 'password-change email is fail-closed without Resend');
    equal(changed.notification.reason, 'not_configured',
      'no password-change delivery is claimed without Resend');
    const oldAccess = await request('GET', '/api/auth/me', undefined, childLogin.body.token);
    equal(oldAccess.status, 401, 'an old access token stops working after the change');
    equal(oldAccess.body.error, 'SESSION_EXPIRED', 'revocation reports an expired session');
    const oldRefresh = await request('POST', '/api/auth/refresh', {
      refreshToken: childLogin.body.refreshToken
    });
    equal(oldRefresh.status, 401, 'an old refresh token stops working after the change');
    const oldParent = await request('GET', '/api/demo/notifications', undefined, parentLogin.body.token);
    equal(oldParent.status, 401, 'the other side of the shared login is revoked as well');
    equal((await signIn(FAMILY_EMAIL, sharedPassword, 'student')).status, 401,
      'the original booking password stops working');
    const childFinal = await signIn(FAMILY_EMAIL, nextPassword, 'student');
    const parentFinal = await signIn(FAMILY_EMAIL, nextPassword, 'parent');
    equal(childFinal.status, 200, 'the changed password opens the child desk');
    equal(parentFinal.status, 200, 'the same changed password opens the parent desk');
    const finalStatus = await request('GET', '/api/demo/status', undefined, childFinal.body.token);
    equal(finalStatus.body.classAccess, 'regular', 'regular class flow survives the password change');

    /* Email OTP recovery works without a link and never claims live delivery. */
    const resetRequest = await passwordService.requestReset({ email: FAMILY_EMAIL });
    equal(resetRequest.requested, true, 'a reset code can be requested for the family email');
    equal(resetRequest.delivered, false, 'no live mail is claimed without Resend');
    equal(resetRequest.otpSent, false, 'no OTP delivery is claimed without Resend');
    ok(/^\d{6}$/.test(String(resetRequest.developmentOtp || '')),
      'local verification exposes a clearly labelled six-digit code');
    ok(Boolean(resetRequest.developmentToken), 'the one-time link token is available locally too');
    const plainHash = crypto.createHash('sha256').update(resetRequest.developmentOtp).digest('hex');
    equal(await db.findPasswordResetByOtpHash(plainHash), null,
      'the six-digit code is stored with a keyed hash, not a plain digest');
    passwordResetId = String(resetRequest.developmentToken);
    const otpReset = await passwordService.confirmReset({
      email: FAMILY_EMAIL, otp: resetRequest.developmentOtp, password: 'family-otp-password-2026'
    });
    equal(otpReset.reset, true, 'a six-digit email code resets the password');
    equal(otpReset.notification.sent, false, 'the reset confirmation email is fail-closed');
    equal((await signIn(FAMILY_EMAIL, nextPassword, 'parent')).status, 401,
      'the pre-reset password stops working');
    const afterOtp = await signIn(FAMILY_EMAIL, 'family-otp-password-2026', 'parent');
    equal(afterOtp.status, 200, 'the OTP-reset password opens the parent desk');
    const replay = await passwordService.confirmReset({
      email: FAMILY_EMAIL, otp: resetRequest.developmentOtp, password: 'family-replay-2026'
    }).then(function () { return { reset: true }; }, function (error) { return { error: error.code }; });
    equal(replay.error, 'INVALID_RESET_TOKEN', 'the same email code cannot be replayed');
    let throttled = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await passwordService.confirmReset({
          email: FAMILY_EMAIL, otp: '000000', password: 'family-guess-' + attempt
        });
      } catch (error) {
        if (error.code === 'RESET_ATTEMPT_LIMIT') throttled = true;
      }
    }
    ok(throttled, 'repeated wrong codes are throttled');
    ok(!config.isProduction, 'local verification runs without production mail');

    console.log('demoLifecycle: ' + checks + ' assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    restoreEnv();
    if (passwordResetId) {
      const hash = crypto.createHash('sha256').update(passwordResetId).digest('hex');
      for (let index = mock.passwordResets.length - 1; index >= 0; index -= 1) {
        if (mock.passwordResets[index].tokenHash === hash) mock.passwordResets.splice(index, 1);
      }
    }
    if (demoId) {
      const index = mock.contactRequests.findIndex(function (row) { return row.id === demoId; });
      if (index !== -1) mock.contactRequests.splice(index, 1);
    }
    [studentId, parentId].forEach(function (id) {
      if (!id) return;
      const index = mock.users.findIndex(function (user) { return user.id === id; });
      if (index !== -1) mock.users.splice(index, 1);
    });
    if (studentId) {
      for (let index = mock.parentNotifications.length - 1; index >= 0; index -= 1) {
        if (mock.parentNotifications[index].childId === studentId) {
          mock.parentNotifications.splice(index, 1);
        }
      }
    }
    const onboardingIndex = mock.trainerOnboarding.findIndex(function (row) {
      return row.trainerId === 'usr_trainer_001';
    });
    if (onboardingIndex !== -1) mock.trainerOnboarding.splice(onboardingIndex, 1);
    if (previousOnboarding) mock.trainerOnboarding.push(previousOnboarding);
  }
}

main().catch(function (error) {
  console.error('demoLifecycle: FAILED');
  console.error(error);
  process.exitCode = 1;
});
