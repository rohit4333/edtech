/* Service-only parent inbox notices.
 *
 * These are durable in-app notices for the child's own demo and classes. Every
 * read is scoped by the child link reloaded from the database, and passwords
 * or contact details are stripped before a row is written. */
const db = require('../db');

function clean(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 300);
}

function safeLink(value) {
  const text = clean(value, 300);
  /* Same-origin, desk-owned paths only. This covers the balance page on both
     the parent desk and the unified app, and never accepts a protocol-relative
     URL, a foreign host or a credential-bearing query. */
  if (!/^\/(student|parent|app|pricing|terms|refund|register|login|classroom)(\/|$|\?)/.test(text))
    return null;
  if (/[\\@]/.test(text)) return null;
  if (
    /\?(?:[^#]*&)?(?:password|passwd|token|secret|api[_-]?key|credential|card|upi|razorpay|payment|amount)=/i.test(
      text
    )
  )
    return null;
  return text;
}

function balanceLink() {
  return safeLink('/parent/balance');
}

async function issue(input) {
  const data = input || {};
  if (!data.childId) return null;
  return Promise.resolve(
    db.insertParentNotification({
      childId: clean(data.childId, 80),
      kind: clean(data.kind, 40) || 'update',
      title: clean(data.title, 120) || 'Mathify update',
      message: clean(data.message, 1000),
      demoId: clean(data.demoId, 80) || null,
      batchId: clean(data.batchId, 80) || null,
      link: safeLink(data.link),
      createdAt: new Date().toISOString(),
    })
  );
}

async function listForParent(parentUser) {
  if (!parentUser || parentUser.role !== 'parent' || !parentUser.childId) {
    return { notifications: [], unreadCount: 0 };
  }
  const rows = await Promise.resolve(db.listParentNotifications(parentUser.childId));
  const notifications = Array.isArray(rows) ? rows : [];
  return {
    notifications: notifications,
    unreadCount: notifications.filter(function (row) {
      return !row.readAt;
    }).length,
  };
}

async function markRead(notificationId, parentUser) {
  if (!parentUser || parentUser.role !== 'parent' || !parentUser.childId) return null;
  const current = await Promise.resolve(db.findParentNotification(notificationId));
  if (!current || current.childId !== parentUser.childId) return null;
  return Promise.resolve(
    db.updateParentNotification(notificationId, {
      readAt: new Date().toISOString(),
    })
  );
}

module.exports = { issue, listForParent, markRead, safeLink, balanceLink };
