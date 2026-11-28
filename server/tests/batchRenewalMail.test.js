/* Enrollment batch naming, batch-ID mail and low-balance renewal reminders.
 *
 * Uses real services against the mock store. Mail is captured by stubbing the
 * Resend wrapper locally; no provider is contacted and no delivery is claimed
 * when the configuration is absent. */
process.env.DATABASE_MODE = 'mock';
process.env.APP_ORIGIN = 'http://127.0.0.1:4000';

const assert = require('assert');
const db = require('../db');
const mock = require('../db/mock');
const batches = require('../services/batchService');
const naming = require('../services/batchNamingService');
const notifications = require('../services/notificationService');
const emailService = require('../services/emailService');
const renewal = require('../services/renewalService');
const parentNotices = require('../services/parentNotificationService');

const STUDENT = 'usr_naming_student';
const PARENT = 'usr_naming_parent';
const STUDENT_2 = 'usr_naming_student_2';
const PARENT_2 = 'usr_naming_parent_2';
const DEMO = 'demo_naming_001';

let checks = 0;
const captured = [];
const originalSendMail = emailService.sendMail;
const SESSION_ID = 'ses_naming_001';
let batchId = null;
let originalInsert = null;
const originalEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  RENEWAL_REMINDER_SPACING_MS: process.env.RENEWAL_REMINDER_SPACING_MS,
};

function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function lastBody() {
  const last = captured[captured.length - 1];
  return last ? String(last.html || '') : '';
}
function restore() {
  Object.keys(originalEnv).forEach(function (key) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
  emailService.sendMail = originalSendMail;
}

async function main() {
  try {
    process.env.RENEWAL_REMINDER_SPACING_MS = String(60 * 60 * 1000);

    /* Server-held registration data decides the readable batch name. */
    db.insertUser({
      id: STUDENT,
      name: 'Naming Child',
      email: 'naming.student@example.com',
      role: 'student',
      status: 'active',
      timezone: 'Asia/Dubai',
      curriculum: 'cbse',
      sessionsRemaining: 2,
    });
    db.insertUser({
      id: PARENT,
      name: 'Naming Parent',
      email: 'naming.parent@example.com',
      role: 'parent',
      status: 'active',
      childId: STUDENT,
    });
    db.recordContactRequest({
      id: DEMO,
      studentId: STUDENT,
      parentId: PARENT,
      childName: 'Naming Child',
      parentName: 'Naming Parent',
      email: 'naming.parent@example.com',
      curriculum: 'cbse',
      grade: 'class-7',
      timezone: 'Asia/Dubai',
      status: 'attended',
      classAccess: 'post_demo',
      credentialsIssued: true,
    });

    equal(
      naming.regionCode({ timezone: 'Asia/Dubai' }),
      'AE',
      'the child’s registered zone resolves to the UAE region'
    );
    equal(
      naming.regionCode({ country: 'India' }),
      'IN',
      'an explicit registered country takes priority over a generic zone'
    );
    equal(
      naming.regionCode({ timezone: 'Europe/London' }),
      'UK',
      'UK zone resolves to its country code'
    );
    equal(naming.regionCode({}), 'GL', 'missing region data has an honest global fallback');
    equal(
      naming.curriculumCode({ curriculum: 'igcse' }),
      'IGCSE',
      'registered curriculum becomes the middle token'
    );
    equal(
      naming.curriculumCode({ curriculum: 'unknown-local-board' }),
      'UNKNOW',
      'an unknown board is sanitized rather than invented'
    );

    const batch = await batches.ensureForStudent(STUDENT);
    batchId = batch.id;
    ok(/^TB-[0-9A-F]{6}$/.test(batch.code), 'demo batches keep their short opaque code');
    mock.sessions.push({
      id: SESSION_ID,
      studentId: STUDENT,
      trainerId: 'usr_trainer_001',
      batchId: batch.id,
      batchCode: batch.code,
      status: 'scheduled',
      startsAt: '2026-12-01T10:00:00.000Z',
      scheduledAt: '2026-12-01T10:00:00.000Z',
    });

    const named = await batches.nameForRegularClasses(STUDENT);
    equal(named.reused, false, 'the enrollment rename happens once');
    ok(
      /^AE-CBSE-\d{4}$/.test(named.code),
      'the new batch name mixes region, curriculum and distinguishing digits'
    );
    equal(
      db.findBatchForStudent(STUDENT).code,
      named.code,
      'the stored batch carries the readable name'
    );
    equal(
      db.findSession(SESSION_ID).batchCode,
      named.code,
      'existing sessions carry the readable name for reminders'
    );
    equal(
      db.findContactRequest(DEMO).batchCode,
      named.code,
      'the demo record reports the regular-class batch name'
    );
    equal(
      (await batches.nameForRegularClasses(STUDENT)).code,
      named.code,
      'a retry reuses the same name instead of renaming again'
    );

    equal(
      db.findBatchForStudent(STUDENT).previousCode,
      batch.code,
      'the old demo code is retained for audit'
    );
    ok(
      batches.publicView(db.findBatchForStudent(STUDENT), 'trainer').code === named.code,
      'the trainer desk shows the readable batch ID'
    );

    /* Capture outbound mail without contacting Resend. */
    process.env.RESEND_API_KEY = 'capture-only-key';
    process.env.RESEND_FROM = 'Mathify <capture@example.com>';
    emailService.sendMail = function (message) {
      captured.push(message);
      return Promise.resolve({ ok: true, id: 'captured_' + captured.length });
    };

    const demoMail = await notifications.sendTrainerAssignmentEmail({
      trainer: { id: 'usr_trainer_001', name: 'Ananya Rao', email: 'trainer@mathify.app' },
      batch: { id: batch.id, code: named.code, student: { name: 'Naming Child' } },
      isDemo: true,
      slots: [{ startsAt: '2026-12-01T10:00:00.000Z' }],
    });
    equal(
      demoMail.sent,
      true,
      'trainer assignment mail is delivered through the configured sender'
    );
    ok(
      captured[captured.length - 1].subject.indexOf(named.code) !== -1,
      'the trainer assignment subject carries the batch ID'
    );
    ok(
      lastBody().indexOf('Batch ID: ' + named.code) !== -1,
      'the trainer assignment body carries the batch ID'
    );
    ok(lastBody().indexOf('Demo session') !== -1, 'a demo allotment is labelled as a demo session');

    const classMail = await notifications.sendTrainerAssignmentEmail({
      trainer: { name: 'Ananya Rao', email: 'trainer@mathify.app' },
      batch: { id: batch.id, code: named.code, student: { name: 'Naming Child' } },
      isDemo: false,
      slots: [],
    });
    equal(classMail.sent, true, 'regular class allotment mail is delivered too');
    ok(
      lastBody().indexOf('Regular class') !== -1,
      'a regular allotment is labelled as a regular class'
    );

    const sharedSession = {
      id: SESSION_ID,
      scheduledAt: '2026-12-01T10:00:00.000Z',
      studentTimezone: 'Asia/Dubai',
      studentName: 'Naming Child',
      batchId: batch.id,
      batchCode: named.code,
    };
    const trainerJoin = await notifications.sendJoinEmail({
      session: sharedSession,
      recipient: { name: 'Ananya Rao', email: 'trainer@mathify.app' },
      role: 'trainer',
      when: '15m',
    });
    equal(trainerJoin.sent, true, 'trainer class reminder is delivered');
    ok(
      lastBody().indexOf('Batch ID: ' + named.code) !== -1,
      'the trainer class reminder mentions the batch ID'
    );

    const parentJoin = await notifications.sendJoinEmail({
      session: sharedSession,
      recipient: { name: 'Naming Parent', email: 'naming.parent@example.com' },
      role: 'parent',
      when: '15m',
    });
    equal(parentJoin.sent, true, 'parent class reminder is delivered');
    ok(
      lastBody().indexOf('Batch ID: ' + named.code) !== -1,
      'the parent class reminder mentions the batch ID'
    );

    const renewalMail = await notifications.sendRenewalEmail({
      parent: db.findUserById(PARENT),
      student: db.findUserById(STUDENT),
      balance: 2,
      step: 1,
      batchCode: named.code,
    });
    equal(renewalMail.sent, true, 'renewal mail uses the configured sender');
    ok(
      lastBody().indexOf('2 classes left') !== -1,
      'renewal mail states the exact remaining balance'
    );
    ok(lastBody().indexOf('Batch ID: ' + named.code) !== -1, 'renewal mail identifies the batch');

    /* The real allotment path emails the trainer even for a regular class, and
       a founder retry does not duplicate that mail. */
    function trainerMailsSince(index) {
      return captured.slice(index).filter(function (message) {
        return String(message.subject || '').indexOf('Mathify batch ') === 0;
      });
    }
    const beforeAllot = captured.length;
    originalInsert = db.insertSession;
    /* Mirror the mock store without changing the production live-mode guard. */
    db.insertSession = function (record) {
      mock.sessions.push(Object.assign({}, record));
      return record;
    };
    const allotted = await batches.allot(batch.id, 'usr_trainer_001', [
      { startsAt: '2026-12-05T10:00:00.000Z' },
    ]);
    equal(allotted.status, 'allotted', 'a regular class batch can be allotted');
    equal(trainerMailsSince(beforeAllot).length, 1, 'allotment emails the trainer once');
    ok(
      String(trainerMailsSince(beforeAllot)[0].html).indexOf(named.code) !== -1,
      'the real allotment mail carries the readable batch ID'
    );
    ok(
      String(trainerMailsSince(beforeAllot)[0].html).indexOf('Regular class') !== -1,
      'the real allotment mail labels a regular class assignment'
    );
    const beforeRetry = captured.length;
    await batches.allot(batch.id, 'usr_trainer_001', [{ startsAt: '2026-12-05T10:00:00.000Z' }]);
    equal(
      trainerMailsSince(beforeRetry).length,
      0,
      'a retried allotment does not email the trainer twice'
    );
    db.insertSession = originalInsert;

    /* Two balance-triggered mails, then at most two recurring mails. */
    const now = Date.parse('2026-12-01T09:00:00.000Z');
    const before = captured.length;
    const noticesBefore = (await parentNotices.listForParent(db.findUserById(PARENT))).notifications
      .length;
    equal(await renewal.check(now), 1, 'a child with 2 classes left triggers one parent mail');
    ok(captured.length === before + 1, 'each successful check sends exactly one mail');
    equal(await renewal.check(now), 0, 'the same balance does not resend the first mail');
    equal(
      mock.reminderClaims.has('renewal:' + PARENT + ':1'),
      true,
      'the first reminder is claimed so a retry cannot double-send'
    );

    /* The same low-balance trigger leaves a safe child-scoped parent notice. */
    const firstInbox = await parentNotices.listForParent(db.findUserById(PARENT));
    equal(
      firstInbox.notifications.length,
      noticesBefore + 1,
      'the low-balance check adds exactly one parent notice'
    );
    equal(firstInbox.unreadCount, noticesBefore + 1, 'the new notice is unread');
    const renewalNotice = firstInbox.notifications.find(function (row) {
      return row.kind === 'renewal_request';
    });
    ok(Boolean(renewalNotice), 'the low-balance renewal notice is in the parent inbox');
    equal(renewalNotice.childId, STUDENT, 'the notice is scoped to the child with low balance');
    equal(
      renewalNotice.message,
      'Only 2 sessions left · renewal needed',
      'the notice repeats the alarming balance'
    );
    ok(
      renewalNotice.link === '/parent/balance' || renewalNotice.link === '/app/parent/balance',
      'the notice links to a desk-owned balance page'
    );
    equal(
      /password|credential|razorpay|card|upi|token/i.test(JSON.stringify(renewalNotice)),
      false,
      'the notice carries no password, credential or provider data'
    );

    db.updateUser(STUDENT, function (user) {
      user.sessionsRemaining = 1;
      return user;
    });
    equal(
      await renewal.check(now + 60 * 60 * 1000),
      1,
      'one class left triggers the second parent mail'
    );
    equal(await renewal.check(now + 2 * 60 * 60 * 1000), 1, 'a third spaced mail is allowed');
    equal(await renewal.check(now + 3 * 60 * 60 * 1000), 1, 'a fourth spaced mail is allowed');
    equal(
      await renewal.check(now + 4 * 60 * 60 * 1000),
      0,
      'no parent receives more than four low-balance mails'
    );
    equal(
      mock.reminderClaims.has('renewal:' + PARENT + ':4'),
      true,
      'the fourth reminder is claimed'
    );
    const allNotices = await parentNotices.listForParent(db.findUserById(PARENT));
    const renewalNotices = allNotices.notifications.filter(function (row) {
      return row.kind === 'renewal_request';
    });
    equal(renewalNotices.length, 4, 'four delivered mails leave four renewal notices');
    equal(
      renewalNotices.every(function (row) {
        return row.childId === STUDENT;
      }),
      true,
      'every renewal notice stays on the same child'
    );

    /* A freshly renewed family is skipped, even with a low displayed balance. */
    db.insertUser({
      id: STUDENT_2,
      name: 'Renewed Child',
      email: 'renewed.student@example.com',
      role: 'student',
      status: 'active',
      sessionsRemaining: 2,
      timezone: 'Asia/Dubai',
    });
    db.insertUser({
      id: PARENT_2,
      name: 'Renewed Parent',
      email: 'renewed.parent@example.com',
      role: 'parent',
      status: 'active',
      childId: STUDENT_2,
    });
    db.recordContactRequest({
      id: 'demo_naming_002',
      studentId: STUDENT_2,
      parentId: PARENT_2,
      curriculum: 'cbse',
      status: 'enrolled',
      enrolledAt: new Date(now).toISOString(),
    });
    const secondBefore = captured.length;
    equal(await renewal.check(now), 0, 'a family that already enrolled is not reminded');
    equal(captured.length, secondBefore, 'no mail is sent to an enrolled family');

    /* Fail closed: without a sender no claim is consumed and nothing is sent. */
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    db.updateContactRequest('demo_naming_002', { status: 'attended' });
    equal(
      await renewal.checkParent(db.findUserById(PARENT_2), now + 10 * 60 * 60 * 1000),
      false,
      'renewal mail fails closed when Resend is not configured'
    );
    equal(
      mock.reminderClaims.has('renewal:' + PARENT_2 + ':1'),
      false,
      'a failed delivery releases its claim for a later retry'
    );
    const failedInbox = await parentNotices.listForParent(db.findUserById(PARENT_2));
    equal(
      failedInbox.notifications.length,
      0,
      'a failed mail does not leave a renewal notice behind'
    );

    console.log('batchRenewalMail: ' + checks + ' assertions passed');
  } finally {
    restore();
    if (originalInsert) db.insertSession = originalInsert;
    const demoIndex = mock.contactRequests.findIndex(function (row) {
      return row.id === DEMO;
    });
    if (demoIndex !== -1) mock.contactRequests.splice(demoIndex, 1);
    const secondIndex = mock.contactRequests.findIndex(function (row) {
      return row.id === 'demo_naming_002';
    });
    if (secondIndex !== -1) mock.contactRequests.splice(secondIndex, 1);
    [STUDENT, PARENT, STUDENT_2, PARENT_2].forEach(function (id) {
      const index = mock.users.findIndex(function (user) {
        return user.id === id;
      });
      if (index !== -1) mock.users.splice(index, 1);
    });
    for (let index = mock.sessions.length - 1; index >= 0; index -= 1) {
      if (mock.sessions[index].id === SESSION_ID) mock.sessions.splice(index, 1);
    }
    const batchIndex = mock.batches.findIndex(function (row) {
      return row.studentId === STUDENT;
    });
    if (batchIndex !== -1) mock.batches.splice(batchIndex, 1);
    for (let index = mock.parentNotifications.length - 1; index >= 0; index -= 1) {
      const childId = mock.parentNotifications[index].childId;
      if (childId === STUDENT || childId === STUDENT_2) mock.parentNotifications.splice(index, 1);
    }
    ['1', '2', '3', '4'].forEach(function (step) {
      mock.reminderClaims.delete('renewal:' + PARENT + ':' + step);
    });
    if (batchId) mock.reminderClaims.delete('batch_assignment:' + batchId + ':usr_trainer_001');
  }
}

main().catch(function (error) {
  console.error('batchRenewalMail: FAILED');
  console.error(error);
  process.exitCode = 1;
});
