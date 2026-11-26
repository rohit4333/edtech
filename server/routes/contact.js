/* Public booking requests. Never falls back to mailto; submissions are
   validated, stored, and forwarded to the configured admin channels. */
const express = require('express');
const db = require('../db');
const notifications = require('../services/notificationService');

const router = express.Router();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;
const attempts = new Map();

function clean(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
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

router.post('/', async function (req, res) {
  if (throttled(req)) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Please wait before sending another request.' });
  }

  const body = req.body || {};
  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 60);
  const message = clean(body.message, 1000);

  if (!name || !email || !message) {
    return res.status(400).json({
      error: 'INVALID_PAYLOAD',
      message: 'Name, email and message are required.'
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
  }

  const request = {
    id: 'contact_' + Date.now(),
    name,
    email,
    phone,
    message,
    receivedAt: new Date().toISOString()
  };
  db.recordContactRequest(request);

  const delivery = await notifications.notifyContactRequest(request);
  return res.status(201).json({
    ok: true,
    reference: request.id,
    delivery: {
      slack: Boolean(delivery.slack && delivery.slack.sent),
      email: Boolean(delivery.email && delivery.email.sent)
    }
  });
});

module.exports = router;
