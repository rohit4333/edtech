/* Session reminders (~24h and ~1h), 15-minute parent+trainer join emails, a
   trainer-only T-2m warning while absent, and a daily "Needs Attention" email.
   `node jobs/reminders.js --once` is the cron entry point. Claims are persisted
   per recipient so a fresh runner never double-sends. */
require('../config'); // Loads server/.env regardless of the working directory.

const logger = require('../services/logger');

const RUN_ONCE = process.argv.includes('--once') ||
  String(process.env.REMINDER_RUN_ONCE || '').toLowerCase() === 'true';
const CHECK_MS = (function () {
  const configured = Number(process.env.REMINDER_CHECK_MS);
  return Number.isFinite(configured) && configured >= 60000 ? configured : 60000;
})();

const WINDOWS = [
  { bucket: '24h', target: 24 * 60 * 60 * 1000, tolerance: 15 * 60 * 1000 },
  { bucket: '1h', target: 60 * 60 * 1000, tolerance: 5 * 60 * 1000 },
  /* Parent + trainer join reminder. */
  { bucket: '15m', target: 15 * 60 * 1000, tolerance: 60 * 1000 },
  /* Trainer-only warning, sent only while the trainer is still absent. */
  { bucket: '2m', target: 2 * 60 * 1000, tolerance: 60 * 1000 }
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

/* Attach the batch identity to a session before any reminder is rendered.
   Older sessions may predate batchCode, so the stored batch is the fallback. */
async function withBatch(session, db) {
  if (!session) return session;
  if (session.batchCode && session.batchId) return session;
  let batch = null;
  try {
    if (session.batchId || session.batchCode) {
      batch = await db.findBatch(session.batchId || session.batchCode);
    }
    if (!batch && session.studentId && typeof db.findBatchForStudent === 'function') {
      batch = await db.findBatchForStudent(session.studentId);
    }
  } catch (caught) {
    logger.warn('reminders', { event: 'batch_lookup_failed', sessionId: session.id });
    return session;
  }
  if (!batch) return session;
  return Object.assign({}, session, {
    batchId: session.batchId || batch.id,
    batchCode: session.batchCode || batch.code
  });
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
    /* Join-window emails are role-specific and handled by checkJoinReminders. */
    if (!bucket || bucket === '15m' || bucket === '2m') continue;

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
        session: await withBatch(session, db),
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

/* Deliver one role-specific join reminder with its own claim key. A failed
   recipient releases only its own claim, so one mailbox cannot block the other. */
async function deliverJoin(key, payload, send) {
  const claim = await claim(key, payload);
  if (!claim.claimed) return false;
  try {
    const result = await send();
    const email = result && result.email ? result.email : result;
    if (!email || !email.sent) {
      await release(key);
      logger.warn('reminders', {
        event: 'join_delivery_unconfigured',
        sessionId: payload.sessionId,
        role: payload.role,
        when: payload.when,
        reason: email && email.reason ? email.reason : 'unknown'
      });
      return false;
    }
    logger.info('reminders', {
      event: 'join_reminder_sent',
      sessionId: payload.sessionId,
      role: payload.role,
      when: payload.when
    });
    return true;
  } catch (caught) {
    await release(key);
    logger.error('reminders', {
      event: 'join_reminder_failed',
      sessionId: payload.sessionId,
      role: payload.role,
      when: payload.when,
      error: caught && caught.message ? caught.message : 'unknown'
    });
    return false;
  }
}

async function checkJoinReminders() {
  const db = require('../db');
  const presence = require('../services/presenceService');
  const notifications = require('../services/notificationService');
  if (typeof db.listAllSessions !== 'function' || typeof db.listUsers !== 'function') return 0;

  const sessions = await db.listAllSessions();
  const users = await db.listUsers();
  if (!Array.isArray(sessions) || !Array.isArray(users)) return 0;

  const now = Date.now();
  let sentCount = 0;

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (!session || !session.id || session.status === 'ended') continue;
    const bucket = bucketFor(session, now);
    if (bucket !== '15m' && bucket !== '2m') continue;
    const reminderSession = await withBatch(session, db);

    const trainer = session.trainerId
      ? await db.findUserById(session.trainerId)
      : null;
    const parent = users.find(function (user) {
      return user && user.role === 'parent' && user.childId === session.studentId;
    }) || null;

    if (bucket === '15m') {
      if (trainer && trainer.email) {
        const ok = await deliverJoin(
          session.id + ':reminder:15m:trainer',
          {
            kind: 'class_join_reminder', sessionId: session.id, studentId: session.studentId,
            role: 'trainer', when: '15m', title: session.title, startsAt: session.startsAt
          },
          function () {
            return notifications.sendJoinEmail({
              session: reminderSession, recipient: trainer, role: 'trainer', when: '15m'
            }).then(function (email) { return { email: email }; });
          }
        );
        if (ok) sentCount += 1;
      } else {
        logger.warn('reminders', { event: 'trainer_contact_missing', sessionId: session.id });
      }

      if (parent && parent.email) {
        const student = session.studentId
          ? await db.findUserById(session.studentId)
          : null;
        const ok = await deliverJoin(
          session.id + ':reminder:15m:parent',
          {
            kind: 'class_join_reminder', sessionId: session.id, studentId: session.studentId,
            role: 'parent', when: '15m', title: session.title, startsAt: session.startsAt
          },
          function () {
            return notifications.sendJoinEmail({
              session: Object.assign({}, reminderSession, {
                studentName: student && student.name ? student.name : 'your child',
                studentTimezone: student && student.timezone ? student.timezone : session.studentTimezone
              }),
              recipient: parent, role: 'parent', when: '15m'
            }).then(function (email) { return { email: email }; });
          }
        );
        if (ok) sentCount += 1;
      } else {
        logger.warn('reminders', { event: 'parent_contact_missing', sessionId: session.id });
      }
      continue;
    }

    /* T-2m: only when the trainer has no verified presence yet. Presence is
       recomputed from events at send time; a cached session snapshot is not
       trusted here. */
    let snapshot = null;
    try {
      snapshot = await presence.compute(session, now);
    } catch (caught) {
      logger.error('reminders', {
        event: 'presence_check_failed', sessionId: session.id,
        error: caught && caught.message ? caught.message : 'unknown'
      });
      continue;
    }
    if (snapshot && snapshot.trainerJoinedAt) {
      logger.info('reminders', { event: 'trainer_already_joined', sessionId: session.id });
      continue;
    }
    if (!trainer || !trainer.email) {
      logger.warn('reminders', { event: 'trainer_contact_missing', sessionId: session.id });
      continue;
    }
    const ok = await deliverJoin(
      session.id + ':reminder:2m:trainer',
      {
        kind: 'class_join_urgent', sessionId: session.id, studentId: session.studentId,
        role: 'trainer', when: '2m', title: session.title, startsAt: session.startsAt
      },
      function () {
        return notifications.sendTrainerUrgentReminder({ session: reminderSession, trainer: trainer });
      }
    );
    if (ok) sentCount += 1;
  }

  return sentCount;
}

/* Low-balance parent renewal mail runs on the same cron tick. The service owns
   its own dedupe claims and skips families that already renewed. */
async function checkRenewalReminders() {
  try {
    const renewal = require('../services/renewalService');
    return await renewal.check(Date.now());
  } catch (caught) {
    logger.error('reminders', {
      event: 'renewal_check_failed',
      error: caught && caught.message ? caught.message : 'unknown'
    });
    return 0;
  }
}

async function runOnce() {
  const results = await Promise.all([
    checkReminders(), checkAttentionQueue(), checkJoinReminders(), checkRenewalReminders()
  ]);
  return {
    remindersSent: results[0],
    attentionDigestsSent: results[1],
    joinRemindersSent: results[2],
    renewalRemindersSent: results[3]
  };
}

function tick() {
  if (running) return;
  running = true;

  runOnce()
    .then(function (summary) {
      if (summary.remindersSent || summary.attentionDigestsSent ||
          summary.joinRemindersSent || summary.renewalRemindersSent) {
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

module.exports = {
  startReminders, stopReminders, checkReminders, checkAttentionQueue,
  checkJoinReminders, runOnce
};
