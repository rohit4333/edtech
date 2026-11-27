/* Public demo-booking requests. Every field needed to prepare the child's
   demo is mandatory: parent, child, phone, email, board, grade and timezone.
   The server resolves the board/grade against the same catalogue the dropdown
   uses, so a crafted payload cannot invent a curriculum combination. No mailto
   fallback and no payment field is ever accepted here. */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const catalog = require('../services/curriculumCatalog');
const timezoneService = require('../services/timezoneService');
const notifications = require('../services/notificationService');
const demoService = require('../services/demoService');

const router = express.Router();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;
const attempts = new Map();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n<>]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function throttled(req) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

function invalid(res, error, message) {
  return res.status(400).json({ error: error, message: message });
}

router.post('/', async function (req, res) {
  if (throttled(req)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Please wait before sending another request.' });
  }

  const body = req.body || {};
  const parentName = clean(body.parentName || body.name, 120);
  const childName = clean(body.childName || body.studentName, 120);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone || body.mobile, 60);
  const curriculumValue = clean(body.curriculum || body.curriculumSlug, 80);
  const gradeValue = clean(body.grade || body.gradeSlug, 40);
  const timezone = timezoneService.normalize(body.timezone);
  const message = clean(body.message, 1000);

  if (!parentName || !childName || !email || !phone || !curriculumValue || !gradeValue || !body.timezone) {
    return invalid(res, 'INVALID_PAYLOAD',
      'Parent name, child name, phone, email, curriculum, grade and timezone are required.');
  }
  if (!EMAIL.test(email)) {
    return invalid(res, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  const selection = catalog.resolve(curriculumValue, gradeValue);
  if (!selection || !selection.gradeSlug) {
    return invalid(res, 'INVALID_CURRICULUM',
      'Choose a curriculum and a grade from the provided lists.');
  }

  const request = {
    id: 'demo_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    parentName: parentName,
    name: parentName,
    childName: childName,
    email: email,
    phone: phone,
    curriculum: selection.curriculumSlug,
    curriculumLabel: selection.curriculumLabel,
    grade: selection.gradeSlug,
    gradeLabel: selection.gradeLabel,
    timezone: timezone,
    message: message,
    status: 'booked',
    credentialsIssued: false,
    studentId: null,
    parentId: null,
    trainerId: null,
    batchId: null,
    classAccess: 'pending',
    receivedAt: new Date().toISOString()
  };
  await Promise.resolve(db.recordContactRequest(request));
  /* The family credential belongs to the booking, not to a later staff
     handover. It is returned once here and emailed with the same instructions. */
  const family = await demoService.issueAtBooking(request);
  const delivery = await notifications.notifyContactRequest(request);

  return res.status(201).json({
    ok: true,
    demoId: request.id,
    reference: request.id,
    curriculum: selection.curriculumLabel,
    grade: selection.gradeLabel,
    credentials: {
      email: request.email,
      password: family.temporaryPassword,
      studentLink: family.links.student || null,
      parentLink: family.links.parent || null
    },
    delivery: {
      slack: Boolean(delivery.slack && delivery.slack.sent),
      email: Boolean(delivery.email && delivery.email.sent) || Boolean(family.delivery.email.sent),
      credentialsEmail: Boolean(family.delivery.email.sent)
    }
  });
});

module.exports = router;
