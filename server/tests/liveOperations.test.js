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
const sessionParty = require('../services/sessionPartyService');

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
  check(moderation.moderateDraft({
    prompt: 'x = 4', options: ['x = 4', 'x = 6'], answerIndex: 0, explanation: null
  }).ok === true, 'empty trainer-side slots do not block draft approval');
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

  /* Cron entry point and attention digest are wired, with durable claims. */
  check(typeof reminders.runOnce === 'function', 'reminder cron exposes a one-shot runner');
  check(typeof reminders.checkAttentionQueue === 'function', 'reminder cron derives the attention queue');
  check(typeof notifications.sendAttentionDigest === 'function', 'attention digest email helper is exported');
  const digest = await notifications.sendAttentionDigest({
    recipient: { name: 'Trainer', email: 'trainer@example.com' },
    items: [{ kind: 'planning', title: '1 planner step still open', meta: 'Ratios' }],
    date: '2026-11-26'
  });
  check(digest.email.sent === false && digest.email.reason === 'not_configured',
    'attention digest reports unconfigured email honestly');

  const attentionDay = new Date().toISOString().slice(0, 10);
  const originalDigest = notifications.sendAttentionDigest;
  const digestTargets = [];
  notifications.sendAttentionDigest = async function (info) {
    digestTargets.push(info);
    return { email: { sent: true } };
  };
  let digestCount = 0;
  try {
    digestCount = await reminders.checkAttentionQueue();
  } finally {
    notifications.sendAttentionDigest = originalDigest;
  }
  check(digestCount === digestTargets.length && digestTargets.length > 0,
    'attention digest counts each attempted recipient once');
  check(digestTargets.some(function (target) { return target.scope === 'All trainers'; }),
    'founder receives one aggregate Needs Attention digest');
  check(digestTargets.some(function (target) {
    return target.recipient && target.recipient.role !== 'founder';
  }), 'each trainer receives their own Needs Attention digest');
  for (const user of db.listUsers().filter(function (user) { return user.role === 'trainer' && user.email; })) {
    await db.releaseReminderClaim(String(user.id) + ':attention:' + attentionDay);
  }
  await db.releaseReminderClaim('founder:attention:' + attentionDay);

  const claimKey = 'test:reminder:' + Date.now();
  const firstClaim = await db.claimReminder(claimKey, { kind: 'test' });
  const secondClaim = await db.claimReminder(claimKey, { kind: 'test' });
  check(firstClaim.claimed === true && secondClaim.claimed === false,
    'reminder claims are one-shot across fresh cron runs');
  check(await db.releaseReminderClaim(claimKey) === true, 'failed claims can be released for retry');
  check((await db.claimReminder(claimKey, { kind: 'test' })).claimed === true,
    'a released reminder claim can be retried');
  await db.releaseReminderClaim(claimKey);

  /* Recording chapters reach the student dashboard serializer. */
  const sessions = db.listSessionsForUser({ id: 'usr_student_001', role: 'student' });
  const dashboard = serializers.toStudentDashboard({ id: 'usr_student_001', name: 'Ishaan' }, sessions);
  const recording = dashboard.recordings.find(function (item) { return item.id === 'ses_math_000'; });
  check(Boolean(recording), 'student dashboard includes a recording');
  check(recording.chapters.some(function (chapter) { return chapter.seconds === 930; }),
    'quiz-review chapter timestamp is exposed to the student');

  /* Trainer-created sessions must resolve to a real student, not just a UUID. */
  const validParty = sessionParty.validate('usr_trainer_001', 'usr_student_001');
  check(validParty.trainer.role === 'trainer' && validParty.student.role === 'student',
    'a trainer and an active student form a valid 1:1 pair');
  check(sessionParty.validate('usr_trainer_001', 'usr_trainer_001').error === 'SAME_PARTY',
    'two roles cannot be filled by the same person');
  check(sessionParty.validate('usr_trainer_001', 'usr_founder_001').error === 'INVALID_STUDENT',
    'a founder account cannot be supplied as the session student');
  check(sessionParty.validate('usr_student_001', 'usr_founder_001').error === 'INVALID_TRAINER',
    'a student account cannot be supplied as the session trainer');
  check(sessionParty.validate('usr_trainer_001', '').error === 'MISSING_STUDENT',
    'a missing student id is rejected before any insert');

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
