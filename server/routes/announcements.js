/* Announcement inbox for trainers and students.
 *
 * Founder authors announcements through /api/admin/announcements. Recipients
 * can only read notices addressed to their role or their own account. Founder
 * identity details and individual targeting metadata are never returned here.
 */

const express = require('express');
const auth = require('../middleware/auth');
const service = require('../services/announcementService');

const router = express.Router();
router.use(auth.requireAuth);

function handle(fn) {
  return function (req, res) {
    return Promise.resolve()
      .then(function () { return fn(req, res); })
      .catch(function (error) {
        const status = error && error.status ? error.status : 500;
        return res.status(status).json({
          error: error && error.code ? error.code : 'ANNOUNCEMENT_FAILED',
          message: status === 500
            ? 'The announcement service could not complete the request.'
            : (error && error.message ? error.message : 'Request failed.')
        });
      });
  };
}

router.get('/', handle(function (req, res) {
  const list = req.user.role === 'founder'
    ? service.founderList()
    : service.forUser(req.user);
  return list.then(function (announcements) { return res.json({ announcements: announcements }); });
}));

router.get('/unread', auth.requireRole('trainer', 'student'), handle(function (req, res) {
  return service.unreadSummary(req.user)
    .then(function (summary) { return res.json(summary); });
}));

router.post('/:id/read', auth.requireRole('trainer', 'student'), handle(function (req, res) {
  return service.markRead(req.user, req.params.id)
    .then(function (result) { return res.json(result); });
}));

module.exports = router;
