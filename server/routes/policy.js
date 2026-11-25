const express = require('express');
const auth = require('../middleware/auth');
const policy = require('../config/policy.json');

const router = express.Router();

router.get('/config', auth.requireAuth, function (req, res) {
  return res.json({ policy: policy });
});

module.exports = router;
