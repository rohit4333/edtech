const express = require('express');
const auth = require('../middleware/auth');
const founderSettings = require('../services/founderSettingsService');

const router = express.Router();

router.get('/config', auth.requireAuth, function (req, res) {
  return res.json({ policy: founderSettings.snapshot() });
});

module.exports = router;
