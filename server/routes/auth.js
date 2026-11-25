const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const tokenService = require('../auth/token');
const auth = require('../middleware/auth');

const router = express.Router();

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/login', function (req, res) {
  const body = req.body || {};
  const user = db.findUserByEmail(body.email);
  const passwordHash = hash(body.password);

  if (!user || !sameHash(user.passwordHash, passwordHash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is wrong.' });
  }

  return res.json({
    token: tokenService.sign(user),
    user: auth.publicUser(user)
  });
});

router.get('/demo', function (req, res) {
  return res.json({
    password: process.env.DEMO_PASSWORD || 'mathify-demo',
    accounts: [
      { role: 'founder', email: 'founder@mathify.app' },
      { role: 'trainer', email: 'trainer@mathify.app' },
      { role: 'student', email: 'student@mathify.app' }
    ]
  });
});

router.get('/me', auth.requireAuth, function (req, res) {
  return res.json({ user: req.user });
});

module.exports = router;
