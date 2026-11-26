/* Regression suite for moderation, throttling, reminders and observability. */

const assert = require('assert');
const { spawnSync } = require('child_process');
const moderation = require('../quiz/moderation');
const rateLimit = require('../middleware/rateLimit');
const logger = require('../services/logger');
const notifications = require('../services/notificationService');
const reminders = require('../jobs/reminders');
const db = require('../db');
const serializers = require('../serializers');

let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions += 1; }

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    set: function (key, value) { this.headers[key] = value; },
    status: function (code) { this.statusCode = code; return this; },
    json: function (body) { this.body = body; return this; }
  };
}

async function main() {
  /* Cloudflare drafts still require trainer approval, plus a content gate. */
  check(moderation.moderateDraft({
    prompt: 'Solve 2x + 4 = 12.', options: ['x = 4', 'x = 6'], answerIndex: 0
  }).ok === true, 'valid draft passes moderation');
  check(moderation.moderateDraft({
    prompt: 'Message me on WhatsApp at +1 555 123 4567.', options: ['a', 'b']
  }).ok === false, 'personal contact details are rejected');
  check(moderation.moderateDraft({
    prompt: 'x = 4', hints: ['ask the trainer']
  }).ok === false, 'trainer-only fields are rejected');
  check(moderation.moderateDraft(null).ok === false, 'empty draft is rejected');

  /* Public write throttling complements signature verification. */
  const limiter = rateLimit.createLimiter({ name: 'test', windowMs: 60000, max: 2 });
  const request = { headers: { 'x-forwarded-for': '203.0.113.99' }, ip: null, socket: { remoteAddress: null } };
  let nextCalls = 0;
  const next = function () { nextCalls += 1; };
  limiter(request, fakeResponse(), next);
  limiter(request, fakeResponse(), next);
  const blocked = fakeResponse();
  limiter(request, blocked, next);
  check(nextCalls === 2, 'limiter allows exactly the configured number of calls');
  check(blocked.statusCode === 429, 'limiter returns 429 after the window is exhausted');
  check(Number(blocked.headers['Retry-After']) > 0, 'limiter sends a Retry-After header');

  /* Observability never writes secrets and stays quiet without a webhook. */
  const previousWebhook = process.env.OBSERVABILITY_WEBHOOK_URL;
  delete process.env.OBSERVABILITY_WEBHOOK_URL;
  const alert = await logger.alert('test alert', { token: 'do-not-log', message: 'safe' });
  check(alert.sent === false && alert.reason === 'not_configured', 'logger alert is a no-op without a webhook');
  if (previousWebhook === undefined) delete process.env.OBSERVABILITY_WEBHOOK_URL;
  else process.env.OBSERVABILITY_WEBHOOK_URL = previousWebhook;

  /* Reminders are opt-in and report unconfigured delivery honestly. */
  const previousEnabled = process.env.REMINDERS_ENABLED;
  process.env.REMINDERS_ENABLED = 'false';
  check(reminders.startReminders() === null, 'reminders stay off when disabled');
  if (previousEnabled === undefined) delete process.env.REMINDERS_ENABLED;
  else process.env.REMINDERS_ENABLED = previousEnabled;

  const keys = ['SLACK_WEBHOOK_URL', 'ADMIN_EMAIL', 'NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD'];
  const saved = {};
  keys.forEach(function (key) { saved[key] = process.env[key]; process.env[key] = ''; });
  const delivery = await notifications.sendSessionReminder({
    session: { id: 'ses_math_000', title: 'Ratios', scheduledAt: new Date().toISOString() },
    recipient: { name: 'Ishaan', email: 'parent@example.com' },
    when: '24h'
  });
  check(delivery.slack.sent === false && delivery.email.sent === false,
    'unconfigured reminder channels are reported as not sent');
  keys.forEach(function (key) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });

  /* Recording chapters reach the student dashboard serializer. */
  const sessions = db.listSessionsForUser({ id: 'usr_student_001', role: 'student' });
  const dashboard = serializers.toStudentDashboard({ id: 'usr_student_001', name: 'Ishaan' }, sessions);
  const recording = dashboard.recordings.find(function (item) { return item.id === 'ses_math_000'; });
  check(Boolean(recording), 'student dashboard includes a recording');
  check(recording.chapters.some(function (chapter) { return chapter.seconds === 930; }),
    'quiz-review chapter timestamp is exposed to the student');

  /* Seed script is safe in mock mode and does not contact a database. */
  const seeded = spawnSync(process.execPath, ['scripts/seed.js'], {
    cwd: require('path').join(__dirname, '..'),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { DATABASE_MODE: 'mock' })
  });
  check(seeded.status === 0, 'mock seed exits cleanly');
  check(/Seed skipped/.test(seeded.stdout), 'mock seed explains that demo data already exists');

  console.log('liveOperations: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error('liveOperations: FAILED');
  console.error(error);
  process.exitCode = 1;
});
