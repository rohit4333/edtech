/* Founder announcements. A single authored notice can target trainers,
   students, both, or one named individual. Contact/social content is blocked
   before storage or delivery, and founder identity details are never returned. */
const crypto = require('crypto');
const db = require('../db');
const dlp = require('../services/parentChatDlp');

const AUDIENCES = ['trainers', 'students', 'both', 'individual'];

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 422;
  throw error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function matches(record, user) {
  if (!user) return false;
  if (record.audience === 'both') return user.role === 'trainer' || user.role === 'student';
  if (record.audience === 'trainers') return user.role === 'trainer';
  if (record.audience === 'students') return user.role === 'student';
  return record.recipientId === user.id;
}

function publicView(record, user, readAt) {
  const result = {
    id: record.id,
    audience: record.audience,
    title: record.title,
    message: record.message,
    createdAt: record.createdAt,
    readAt: readAt || null
  };
  if (user && user.role === 'founder' && record.audience === 'individual') {
    result.recipientName = record.recipientName || 'Former account';
    result.recipientId = record.recipientId;
  }
  return result;
}

async function create(actorId, input) {
  const body = input || {};
  const audience = text(body.audience);
  if (AUDIENCES.indexOf(audience) === -1) {
    fail('INVALID_AUDIENCE', 'Choose trainers, students, both, or an individual.');
  }
  const title = text(body.title).slice(0, 120);
  const message = text(body.message).slice(0, 2000);
  if (!title || !message) fail('ANNOUNCEMENT_INCOMPLETE', 'A title and message are required.');

  let recipientId = null;
  let recipientName = null;
  if (audience === 'individual') {
    recipientId = text(body.recipientId);
    const recipient = await Promise.resolve(db.findUserById(recipientId));
    if (!recipient || ['trainer', 'student'].indexOf(recipient.role) === -1) {
      fail('INVALID_RECIPIENT', 'Choose an active trainer or student.');
    }
    /* Name only. No mobile number, email, social link or document detail. */
    recipientName = recipient.name;
  } else if (body.recipientId) {
    fail('INVALID_AUDIENCE', 'A recipient is only valid for an individual announcement.');
  }

  const scan = dlp.scan(title + '\n' + message);
  if (scan.blocked) {
    /* Neutral error only. The blocked text is never stored, echoed or broadcast. */
    fail('CONTENT_BLOCKED', dlp.NEUTRAL_BLOCK_MESSAGE);
  }

  const record = {
    id: 'ann_' + crypto.randomUUID(),
    audience: audience,
    recipientId: recipientId,
    recipientName: recipientName,
    title: title,
    message: message,
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  await db.saveAnnouncement(record);
  return publicView(record, { role: 'founder' });
}

async function forUser(user) {
  const rows = await Promise.resolve(db.listAnnouncements());
  const visible = rows.filter(function (row) { return matches(row, user); });
  visible.sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  });
  return Promise.all(visible.map(function (row) {
    return Promise.resolve(db.findAnnouncementRead(row.id, user.id)).then(function (read) {
      return publicView(row, user, read && read.readAt);
    });
  }));
}

async function unreadSummary(user) {
  const rows = await forUser(user);
  return {
    unread: rows.filter(function (row) { return !row.readAt; }).length,
    total: rows.length
  };
}

async function founderList() {
  const rows = await Promise.resolve(db.listAnnouncements());
  return rows.slice().sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  }).map(function (row) { return publicView(row, { role: 'founder' }); });
}

async function markRead(user, announcementId) {
  const rows = await Promise.resolve(db.listAnnouncements());
  const record = rows.find(function (row) { return row.id === announcementId; });
  if (!record || !matches(record, user)) {
    fail('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.', 404);
  }
  const stored = await Promise.resolve(db.saveAnnouncementRead({
    announcementId: announcementId,
    userId: user.id,
    readAt: new Date().toISOString()
  }));
  return { id: announcementId, readAt: stored.readAt };
}

module.exports = {
  AUDIENCES: AUDIENCES,
  create: create,
  forUser: forUser,
  unreadSummary: unreadSummary,
  founderList: founderList,
  markRead: markRead
};
