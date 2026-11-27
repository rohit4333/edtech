/* Study Buddy allowance contract: ten image questions per student per day,
 * unlimited text, atomic slot claims and next-day reset. No AI or network call
 * is made here; the service-only mock records are isolated by student id. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const quota = require('../services/studentDoubtQuotaService');

const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const student = 'usr_quota_' + stamp;
const otherStudent = 'usr_quota_other_' + stamp;
const day = '2026-11-27T12:00:00.000Z';
const nextDay = '2026-11-28T00:30:00.000Z';
const PRIVATE_FIELDS = ['image', 'data', 'question', 'name', 'email', 'phone'];

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
async function rejects(action, expected, label) {
  await assert.rejects(action, function (error) {
    return Object.keys(expected).every(function (key) { return error[key] === expected[key]; });
  }, label);
  checks += 1;
}

async function main() {
  equal(quota.DAILY_IMAGE_LIMIT, 10, 'the daily image allowance is ten');
  equal(quota.COLLECTION, 'student_doubt_image_quota', 'quota lives in service-only records');
  equal(quota.dayKey(day, 'UTC'), '2026-11-27', 'UTC day keys use YYYY-MM-DD');
  equal(quota.dayKey('2026-11-28T01:30:00.000Z', 'Asia/Kolkata'), '2026-11-28',
    'the child display timezone decides the calendar day');
  equal(quota.dayKey('2026-11-28T01:30:00.000Z', 'America/New_York'), '2026-11-27',
    'the same instant can belong to the previous local day');

  for (let sequence = 1; sequence <= 10; sequence += 1) {
    const result = await quota.reserveImage(student, { now: day, timezone: 'UTC' });
    equal(result.used, sequence, 'reservation ' + sequence + ' is counted');
    equal(result.remaining, 10 - sequence, 'reservation ' + sequence + ' reports the balance');
    equal(result.limit, 10, 'reservation ' + sequence + ' reports the cap');

    const stored = await db.getRecord(quota.COLLECTION, quota.slotKey(student, '2026-11-27', sequence));
    ok(Boolean(stored), 'slot ' + sequence + ' is persisted');
    equal(stored.studentId, student, 'slot ' + sequence + ' belongs only to the student');
    equal(stored.date, '2026-11-27', 'slot ' + sequence + ' carries the day key');
    equal(stored.sequence, sequence, 'slot ' + sequence + ' stores its position');
    const serialized = JSON.stringify(stored);
    PRIVATE_FIELDS.forEach(function (field) {
      ok(serialized.indexOf('"' + field + '"') === -1,
        'slot ' + sequence + ' stores no ' + field);
    });
  }

  await rejects(
    function () { return quota.reserveImage(student, { now: day, timezone: 'UTC' }); },
    { code: 'IMAGE_QUOTA_EXCEEDED', status: 429 },
    'the eleventh image question is refused'
  );

  const fullUsage = await quota.getUsage(student, { now: day, timezone: 'UTC' });
  equal(fullUsage.used, 10, 'usage counts all ten slots');
  equal(fullUsage.remaining, 0, 'usage reports an empty allowance');
  equal(fullUsage.limit, 10, 'usage repeats the cap');

  const tomorrow = await quota.reserveImage(student, { now: nextDay, timezone: 'UTC' });
  equal(tomorrow.used, 1, 'the next calendar day starts at one');
  equal(tomorrow.remaining, 9, 'the next calendar day has a fresh allowance');
  equal(tomorrow.date, '2026-11-28', 'the new reservation uses the new day key');

  const other = await quota.reserveImage(otherStudent, { now: day, timezone: 'UTC' });
  equal(other.used, 1, 'another student has an independent allowance');

  equal(await quota.releaseReservation(tomorrow), true, 'a failed AI call can release its slot');
  const afterRelease = await quota.getUsage(student, { now: nextDay, timezone: 'UTC' });
  equal(afterRelease.used, 0, 'the released slot is available again');

  equal(quota.validateImage(null).ok, false, 'a missing image is rejected');
  equal(quota.validateImage({ mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,QQ==' }).code,
    'INVALID_IMAGE_TYPE', 'unsupported image types are rejected');
  equal(quota.validateImage({ mime: 'image/png', data: 'data:image/jpeg;base64,iVBORw0KGgo=' }).code,
    'INVALID_IMAGE_DATA', 'a mismatched data URL is rejected');
  equal(quota.validateImage({ mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }).ok,
    true, 'a valid PNG data URL passes the pre-check');
  const tooLarge = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((1024 * 1024 + 1) * 4 / 3));
  equal(quota.validateImage({ mime: 'image/png', data: tooLarge }).code,
    'IMAGE_TOO_LARGE', 'oversized images are rejected before spending a slot');

  const root = path.join(__dirname, '..', '..');
  const route = fs.readFileSync(path.join(root, 'server', 'routes', 'chat.js'), 'utf8');
  ok(route.indexOf("kind === 'student-doubt' && req.user.role === 'student' && body.image") !== -1,
    'only signed-in student image questions are charged');
  ok(route.indexOf('reserveImage(req.user.id') !== -1,
    'the route derives the student from the verified session');
  ok(route.indexOf('releaseReservation(reservation)') !== -1,
    'a failed model call releases the reservation');
  ok(route.indexOf("error.code === 'IMAGE_QUOTA_EXCEEDED'") !== -1,
    'the friendly cap message reaches the browser');

  const api = fs.readFileSync(path.join(root, 'student', 'api.js'), 'utf8');
  ok(api.indexOf('/chat/student-doubt/quota') !== -1, 'the browser can read today\'s allowance');
  ok(api.indexOf('body: { question: question, image: image || null }') !== -1,
    'text questions still use the existing unlimited endpoint');

  const app = fs.readFileSync(path.join(root, 'student', 'app.js'), 'utf8');
  ok(app.indexOf('IMAGE_QUOTA_EXCEEDED') !== -1, 'the panel shows the quota message');
  ok(app.indexOf('getStudyBuddyQuota') !== -1, 'the panel refreshes the allowance');
  const html = fs.readFileSync(path.join(root, 'student', 'index.html'), 'utf8');
  ok(html.indexOf('id="aiQuota"') !== -1, 'the panel has a visible allowance line');
  ok(html.indexOf('Text is unlimited; you get 10 photo questions each day.') !== -1,
    'the greeting states both rules');

  console.log('studentDoubtQuota: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
