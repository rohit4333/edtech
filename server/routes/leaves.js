const express = require('express');
const auth = require('../middleware/auth');
const leaveService = require('../services/leaveService');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('trainer', 'student', 'founder'));

router.get('/', async function (req, res) {
  try {
    return res.json({ leave: await leaveService.list(req.user) });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.code || 'LEAVE_LIST_FAILED',
      message: error.message
    });
  }
});

router.post('/', async function (req, res) {
  try {
    return res.status(201).json({ leave: await leaveService.apply(req.user, req.body || {}) });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.code || 'LEAVE_REQUEST_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
