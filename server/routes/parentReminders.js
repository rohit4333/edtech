/* GET /api/parent/reminders — in-app class reminders for the signed-in parent.
 * The child link is reloaded from the database; a client-supplied student id is
 * never accepted, so a parent cannot read another student's sessions. */

const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const service = require('../services/parentReminderService');

const router = express.Router();

router.get('/reminders', auth.requireAuth, auth.requireRole('parent'), async function (req, res) {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user || user.role !== 'parent' || !user.childId) {
      return res.json({ reminders: [], earlyJoinMinutes: 10, timezone: user && user.timezone || null });
    }
    const data = await service.forStudent(user.childId, Date.now(), user);
    return res.json(data);
  } catch (error) {
    return res.status(error && error.status >= 400 && error.status < 600 ? error.status : 503).json({
      error: 'PARENT_REMINDERS_UNAVAILABLE',
      message: 'Class reminders are unavailable right now.'
    });
  }
});

module.exports = router;
