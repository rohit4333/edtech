const express = require('express');
const auth = require('../middleware/auth');
const leaveService = require('../services/leaveService');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('trainer', 'student', 'founder'));

router.get('/', function (req, res) {
  return res.json({ leave: leaveService.list(req.user) });
});

router.post('/', function (req, res) {
  try {
    return res.status(201).json({ leave: leaveService.apply(req.user, req.body || {}) });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'LEAVE_REQUEST_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
