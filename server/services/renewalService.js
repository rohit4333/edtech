/* Low-balance subscription reminders to parents.
 *
 * A child at 2 remaining classes gets one renewal email; at 1 or fewer a
 * second email follows. Two more spaced reminders may follow, but no parent
 * ever receives more than four emails about a low balance. Every send is
 * claimed before delivery and released on failure, so a retry or a fresh cron
 * process cannot double-send. A pack bought after the previous reminder (or a
 * very recent enrollment) cancels the sequence: families that already renewed
 * are not nagged. */
const db = require('../db');
const notifications = require('./notificationService');
const parentNotices = require('./parentNotificationService');

const MAX_REMINDERS = 4;
const DEFAULT_SPACING_MS = 24 * 60 * 60 * 1000;
const RECENT_ENROLLMENT_MS = 24 * 60 * 60 * 1000;

function spacingMs() {
  const value = Number(process.env.RENEWAL_REMINDER_SPACING_MS);
  return Number.isFinite(value) && value >= 60 * 60 * 1000 ? value : DEFAULT_SPACING_MS;
}

function keyFor(parentId, step) {
  return 'renewal:' + parentId + ':' + step;
}

async function claimStep(parentId, step) {
  const claim = await Promise.resolve(
    db.claimReminder(keyFor(parentId, step), {
      kind: 'renewal_reminder',
      parentId: parentId,
      step: step,
    })
  );
  return claim;
}

function releaseStep(parentId, step) {
  return Promise.resolve(db.releaseReminderClaim(keyFor(parentId, step)));
}

function timeOf(record) {
  const value = record && Date.parse(record.claimedAt || record.purchasedAt || record.enrolledAt);
  return Number.isFinite(value) ? value : 0;
}

async function alreadyRenewed(studentId, baseline) {
  const request = await Promise.resolve(db.findContactRequestForStudent(studentId));
  const packs = await Promise.resolve(
    typeof db.listPacksForStudent === 'function' ? db.listPacksForStudent(studentId) : []
  );
  const enrolledAt =
    request && request.status === 'enrolled' ? timeOf({ enrolledAt: request.enrolledAt }) : 0;
  const recentPack = (Array.isArray(packs) ? packs : []).some(function (pack) {
    return timeOf(pack) > baseline;
  });
  return enrolledAt > baseline || recentPack;
}

async function checkParent(parent, now) {
  if (!parent || parent.role !== 'parent' || !parent.childId || !parent.email) return false;
  const child = await Promise.resolve(db.findUserById(parent.childId));
  if (!child || child.role !== 'student') return false;

  const balance = Number(child.sessionsRemaining);
  if (!Number.isFinite(balance) || balance > 2) return false;

  let step = 0;
  for (let candidate = 1; candidate <= MAX_REMINDERS; candidate += 1) {
    const claim = await claimStep(parent.id, candidate);
    if (claim.claimed) {
      step = candidate;
      break;
    }
  }
  /* Four reminders have already gone out for this parent. */
  if (!step) return false;

  const skip = async function () {
    await releaseStep(parent.id, step);
    return false;
  };

  try {
    const previousClaim =
      step > 1
        ? await claimStep(parent.id, step - 1) /* already claimed: returns its payload */
        : null;
    const previousAt = previousClaim && previousClaim.data ? timeOf(previousClaim.data) : 0;
    const baseline = previousAt || now - RECENT_ENROLLMENT_MS;

    /* The first mail is tied to exactly 2 classes; later mails only while the
       balance is still at or below 1. A renewed pack raises the balance and
       ends the sequence. */
    if (step === 1 && balance !== 2) return skip();
    if (step > 1 && balance > 1) return skip();
    if (previousAt && now - previousAt < spacingMs()) return skip();
    if (await alreadyRenewed(child.id, baseline)) return skip();

    const batch = await Promise.resolve(db.findBatchForStudent(child.id));
    const delivery = await notifications.sendRenewalEmail({
      parent: parent,
      student: child,
      balance: balance,
      step: step,
      batchCode: batch && batch.code,
    });
    if (!delivery.sent) return skip();

    /* The same low-balance trigger also leaves a child-scoped notice in the
       parent's in-app inbox. It carries only the balance, a renewal prompt and
       a desk-safe balance link — no payment, credential or provider data. */
    try {
      await parentNotices.issue({
        childId: child.id,
        kind: 'renewal_request',
        title: 'Renewal needed',
        message:
          'Only ' + balance + (balance === 1 ? ' session' : ' sessions') + ' left · renewal needed',
        link: parentNotices.balanceLink(),
      });
    } catch (noticeError) {
      /* A failed in-app write must not revoke an already-delivered email. */
      console.error('[renewal] parent notice failed for parent:', parent.id, noticeError.message);
    }
    return true;
  } catch (error) {
    await skip();
    throw error;
  }
}

async function check(now) {
  const users = await Promise.resolve(db.listUsers());
  const parents = (Array.isArray(users) ? users : []).filter(function (user) {
    return user && user.role === 'parent';
  });
  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  let sent = 0;
  for (let index = 0; index < parents.length; index += 1) {
    try {
      if (await checkParent(parents[index], current)) sent += 1;
    } catch (error) {
      console.error(
        '[renewal] reminder check failed for parent:',
        parents[index].id,
        error.message
      );
    }
  }
  return sent;
}

module.exports = {
  check: check,
  checkParent: checkParent,
  MAX_REMINDERS: MAX_REMINDERS,
};
