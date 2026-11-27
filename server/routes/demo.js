/* Child/parent demo desk state. Every value is derived from the signed-in
   identity: no student id, batch id or trainer id is accepted from the browser.
   The trainer card is a small allowlist and never includes KYC or contact data. */

const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const demoService = require('../services/demoService');
const parentNotices = require('../services/parentNotificationService');

const router = express.Router();

function studentIdOf(user) {
  if (!user) return null;
  return user.role === 'student' ? user.id : (user.role === 'parent' ? user.childId : null);
}

router.get('/status', auth.requireAuth, auth.requireRole('student', 'parent'), async function (req, res, next) {
  try {
    return res.json(await demoService.statusFor(req.user));
  } catch (error) {
    return next(error);
  }
});

/* An assigned trainer may open the demo by its ID, but only from their own
   assignment. No parent contact detail is included in this read. */
router.get('/trainer/:demoId', auth.requireAuth, auth.requireRole('trainer'), async function (req, res, next) {
  try {
    const request = await Promise.resolve(db.findContactRequest(String(req.params.demoId || '')));
    if (!request || request.trainerId !== req.user.id) {
      return res.status(404).json({ error: 'DEMO_NOT_FOUND', message: 'Demo not found.' });
    }
    return res.json({
      demo: {
        demoId: request.id,
        childName: request.childName,
        curriculum: request.curriculumLabel || request.curriculum,
        grade: request.gradeLabel || request.grade,
        batchCode: request.batchCode || null,
        status: request.status || 'booked',
        demoLink: '/trainer/students?demoId=' + encodeURIComponent(request.id)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/photo', auth.requireAuth, auth.requireRole('student', 'parent'), async function (req, res, next) {
  try {
    const studentId = studentIdOf(req.user);
    if (!studentId) return res.status(403).json({ error: 'FORBIDDEN', message: 'No linked child.' });
    const request = await Promise.resolve(db.findContactRequestForStudent(studentId));
    if (!request || !request.trainerId) {
      return res.status(404).json({ error: 'NO_ASSIGNED_TRAINER', message: 'No trainer has been assigned yet.' });
    }
    const photo = await demoService.trainerPhoto(request.trainerId);
    if (!photo) {
      return res.status(404).json({ error: 'PHOTO_NOT_AVAILABLE', message: 'No profile picture is available.' });
    }
    res.set('Cache-Control', 'no-store');
    return res.type(photo.mimeType).send(photo.buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/notifications', auth.requireAuth, auth.requireRole('parent'), async function (req, res, next) {
  try {
    const user = await Promise.resolve(db.findUserById(req.user.id));
    return res.json(await parentNotices.listForParent(user));
  } catch (error) {
    return next(error);
  }
});

router.post('/notifications/:id/read', auth.requireAuth, auth.requireRole('parent'), async function (req, res, next) {
  try {
    const user = await Promise.resolve(db.findUserById(req.user.id));
    const row = await Promise.resolve(parentNotices.markRead(req.params.id, user));
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Notice not found.' });
    return res.json({ ok: true, id: row.id, readAt: row.readAt });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
