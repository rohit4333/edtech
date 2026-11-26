/* Session reminders: ~24h and ~1h before start, once per session bucket. */
require('../config'); // Loads server/.env regardless of the working directory.

const logger = require('../services/logger');

const CHECK_MS = (function () {
  const configured = Number(process.env.REMINDER_CHECK_MS);
  return Number.isFinite(configured) && configured >= 60000 ? configured : 300000;
})();

const WINDOWS = [
  { bucket: '24h', target: 24 * 60 * 60 * 1000, tolerance: 15 * 60 * 1000 },
  { bucket: '1h', target: 60 * 60 * 1000, tolerance: 5 * 60 * 1000 }
];

const sent = new Set();
let timer = null;
let running = false;

function bucketFor(session, now) {
  const raw = session && (session.startsAt || session.scheduledAt || session.date);
  if (!raw) return null;

  const start = new Date(raw).getTime();
  if (!Number.isFinite(start)) return null;

  const untilStart = start - now;
  for (let index = 0; index < WINDOWS.length; index += 1) {
    const window = WINDOWS[index];
    if (Math.abs(untilStart - window.target) <= window.tolerance) return window.bucket;
  }
  return null;
}

function recipientFor(session) {
  const db = require('../db');
  if (session && session.studentId && typeof db.findUserById === 'function') {
    const student = db.findUserById(session.studentId);
    if (student) {
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone || student.whatsapp || null,
        role: student.role || 'student'
      };
    }
  }
  return { id: session && session.studentId ? session.studentId : null, role: 'student' };
}

async function checkReminders() {
  const db = require('../db');
  if (typeof db.listAllSessions !== 'function') {
    logger.warn('reminders', { event: 'listAllSessions_unavailable' });
    return;
  }

  const sessions = await db.listAllSessions();
  if (!Array.isArray(sessions)) return;

  const now = Date.now();
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (!session || !session.id) continue;

    const bucket = bucketFor(session, now);
    if (!bucket) continue;

    const key = String(session.id) + ':' + bucket;
    if (sent.has(key)) continue;

    try {
      const notificationService = require('../services/notificationService');
      if (typeof notificationService.sendSessionReminder !== 'function') {
        throw new Error('sendSessionReminder is not exported yet');
      }

      await notificationService.sendSessionReminder({
        session: session,
        recipient: recipientFor(session),
        when: bucket
      });

      sent.add(key);
      logger.info('reminders', { event: 'sent', sessionId: session.id, when: bucket });
    } catch (caught) {
      logger.error('reminders', {
        event: 'send_failed',
        sessionId: session.id,
        when: bucket,
        error: caught && caught.message ? caught.message : 'unknown'
      });
    }
  }
}

function tick() {
  if (running) return;
  running = true;

  checkReminders()
    .catch(function (caught) {
      logger.error('reminders', {
        event: 'check_failed',
        error: caught && caught.message ? caught.message : 'unknown'
      });
    })
    .finally(function () { running = false; });
}

function startReminders() {
  if (String(process.env.REMINDERS_ENABLED || '').trim().toLowerCase() === 'false') {
    logger.info('reminders', { event: 'disabled' });
    return null;
  }
  if (timer) {
    logger.warn('reminders', { event: 'already_started' });
    return timer;
  }

  logger.info('reminders', { event: 'started', intervalMs: CHECK_MS });
  timer = setInterval(tick, CHECK_MS);
  return timer;
}

function stopReminders() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info('reminders', { event: 'stopped' });
}

if (require.main === module) startReminders();

module.exports = { startReminders, stopReminders };
