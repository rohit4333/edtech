/* Session reminders (~24h and ~1h) and a daily "Needs Attention" trainer email.
   Long-running mode uses a timer; `node jobs/reminders.js --once` is the cron
   entry point. Claims are persisted so a fresh runner never double-sends. */
require('../config'); // Loads server/.env regardless of the working directory.

const logger = require('../services/logger');

const RUN_ONCE = process.argv.includes('--once') ||
  String(process.env.REMINDER_RUN_ONCE || '').toLowerCase() === 'true';
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

async function recipientFor(session) {
  const db = require('../db');
  if (session && session.studentId && typeof db.findUserById === 'function') {
    const student = await db.findUserById(session.studentId);
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

async function claim(key, payload) {
  const db = require('../db');
  if (typeof db.claimReminder === 'function') return db.claimReminder(key, payload);
  /* Fallback only for a legacy adapter without persisted claims. */
  if (sent.has(key)) return { claimed: false, data: null };
  sent.add(key);
  return { claimed: true, data: null };
}

async function release(key) {
  const db = require('../db');
  if (typeof db.releaseReminderClaim === 'function') await db.releaseReminderClaim(key);
  else sent.delete(key);
}

async function checkReminders() {
  const db = require('../db');
  if (typeof db.listAllSessions !== 'function') {
    logger.warn('reminders', { event: 'listAllSessions_unavailable' });
    return 0;
  }

  const sessions = await db.listAllSessions();
  if (!Array.isArray(sessions)) return 0;

  const now = Date.now();
  let sentCount = 0;

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (!session || !session.id) continue;

    const bucket = bucketFor(session, now);
    if (!bucket) continue;

    const key = String(session.id) + ':reminder:' + bucket;
    const claimed = await claim(key, {
      kind: 'session_reminder',
      sessionId: session.id,
      when: bucket
    });
    if (!claimed.claimed) continue;

    try {
      const notificationService = require('../services/notificationService');
      if (typeof notificationService.sendSessionReminder !== 'function') {
        throw new Error('sendSessionReminder is not exported yet');
      }

      const recipient = await recipientFor(session);
      const delivery = await notificationService.sendSessionReminder({
        session: session,
        recipient: recipient,
        when: bucket
      });
      const delivered = Boolean(delivery &&
        ((delivery.email && delivery.email.sent) || (delivery.slack && delivery.slack.sent)));

      if (!delivered) {
        await release(key);
        logger.warn('reminders', {
          event: 'delivery_unconfigured',
          sessionId: session.id,
          when: bucket
        });
        continue;
      }

      sent.add(key);
      sentCount += 1;
      logger.info('reminders', {
        event: 'sent',
        sessionId: session.id,
        when: bucket,
        email: delivery && delivery.email ? delivery.email.sent : false,
        slack: delivery && delivery.slack ? delivery.slack.sent : false
      });
    } catch (caught) {
      await release(key);
      logger.error('reminders', {
        event: 'send_failed',
        sessionId: session.id,
        when: bucket,
        error: caught && caught.message ? caught.message : 'unknown'
      });
    }
  }

  return sentCount;
}

async function checkAttentionQueue() {
  const db = require('../db');
  if (typeof db.listUsers !== 'function' || typeof db.listAttendance !== 'function') {
    logger.warn('reminders', { event: 'attention_inputs_unavailable' });
    return 0;
  }

  const users = await db.listUsers();
  const sessions = await db.listAllSessions();
  const attendance = await db.listAttendance();
  if (!Array.isArray(users) || !Array.isArray(sessions)) return 0;

  const serializers = require('../serializers');
  const notificationService = require('../services/notificationService');
  if (typeof notificationService.sendAttentionDigest !== 'function') {
    throw new Error('sendAttentionDigest is not exported yet');
  }

  const day = new Date().toISOString().slice(0, 10);
  let sentCount = 0;
  const founderItems = [];

  for (let index = 0; index < users.length; index += 1) {
    const trainer = users[index];
    if (!trainer || trainer.role !== 'trainer' || !trainer.email) continue;

    const trainerSessions = sessions.filter(function (session) {
      return session && session.trainerId === trainer.id;
    });
    if (!trainerSessions.length) continue;

    const items = serializers.toTrainerAttention(trainerSessions, attendance || []).items;
    if (!items.length) continue;

    items.forEach(function (item) {
      const copy = Object.assign({}, item);
      copy.meta = [trainer.name || trainer.id, item.meta].filter(Boolean).join(' · ');
      founderItems.push(copy);
    });

    const key = String(trainer.id) + ':attention:' + day;
    const claimed = await claim(key, {
      kind: 'attention_digest',
      trainerId: trainer.id,
      date: day,
      itemCount: items.length
    });
    if (!claimed.claimed) continue;

    try {
      const delivery = await notificationService.sendAttentionDigest({
        recipient: { id: trainer.id, name: trainer.name, email: trainer.email },
        trainer: trainer,
        items: items,
        date: day
      });

      if (!delivery || !delivery.email || !delivery.email.sent) {
        await release(key);
        logger.warn('reminders', {
          event: 'attention_digest_unconfigured',
          trainerId: trainer.id,
          items: items.length
        });
        continue;
      }

      sent.add(key);
      sentCount += 1;
      logger.info('reminders', {
        event: 'attention_digest_sent',
        trainerId: trainer.id,
        items: items.length,
        email: true
      });
    } catch (caught) {
      await release(key);
      logger.error('reminders', {
        event: 'attention_digest_failed',
        trainerId: trainer.id,
        error: caught && caught.message ? caught.message : 'unknown'
      });
    }
  }

  const founder = users.find(function (user) {
    return user && user.role === 'founder' && user.email;
  });
  const founderEmail = process.env.ADMIN_EMAIL || (founder && founder.email);
  if (founderEmail && founderItems.length) {
    const key = 'founder:attention:' + day;
    const claimed = await claim(key, {
      kind: 'attention_digest',
      recipientRole: 'founder',
      date: day,
      itemCount: founderItems.length
    });
    if (claimed.claimed) {
      try {
        const delivery = await notificationService.sendAttentionDigest({
          recipient: { id: founder && founder.id ? founder.id : 'admin', name: 'Founder', email: founderEmail, role: 'founder' },
          scope: 'All trainers',
          items: founderItems,
          date: day
        });

        if (!delivery || !delivery.email || !delivery.email.sent) {
          await release(key);
          logger.warn('reminders', {
            event: 'founder_attention_digest_unconfigured',
            items: founderItems.length
          });
        } else {
          sent.add(key);
          sentCount += 1;
          logger.info('reminders', {
            event: 'founder_attention_digest_sent',
            items: founderItems.length,
            email: true
          });
        }
      } catch (caught) {
        await release(key);
        logger.error('reminders', {
          event: 'founder_attention_digest_failed',
          error: caught && caught.message ? caught.message : 'unknown'
        });
      }
    }
  }

  return sentCount;
}

async function runOnce() {
  const results = await Promise.all([checkReminders(), checkAttentionQueue()]);
  return {
    remindersSent: results[0],
    attentionDigestsSent: results[1]
  };
}

function tick() {
  if (running) return;
  running = true;

  runOnce()
    .then(function (summary) {
      if (summary.remindersSent || summary.attentionDigestsSent) {
        logger.info('reminders', { event: 'tick_complete', summary: summary });
      }
    })
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

  logger.info('reminders', { event: 'started', intervalMs: CHECK_MS, once: RUN_ONCE });
  timer = setInterval(tick, CHECK_MS);
  tick();
  return timer;
}

function stopReminders() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info('reminders', { event: 'stopped' });
}

if (require.main === module) {
  if (RUN_ONCE) {
    runOnce()
      .then(function (summary) {
        console.log(JSON.stringify(Object.assign({ event: 'reminder_run_once' }, summary)));
      })
      .catch(function (caught) {
        console.error('reminder run failed:', caught && caught.message ? caught.message : caught);
        process.exitCode = 1;
      });
  } else {
    startReminders();
  }
}

module.exports = { startReminders, stopReminders, checkReminders, checkAttentionQueue, runOnce };
