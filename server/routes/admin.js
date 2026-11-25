const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get(
  '/support-escalations',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res) {
    return res.json({
      escalations: db.listSupportEscalations(req.query.limit || 50)
    });
  }
);

module.exports = router;
