const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const founderSettings = require('../services/founderSettingsService');
const batchService = require('../services/batchService');
const trainerOnboarding = require('../services/trainerOnboardingService');
const trainerDocuments = require('../services/trainerDocumentService');
const announcementService = require('../services/announcementService');

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

/* Founder-only runtime settings draft. Money fields are deliberately absent
   from the patch allowlist, so a client cannot promote a locked widget into an
   editable one by sending a crafted request. */
router.get(
  '/settings',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res) {
    return res.json(founderSettings.view());
  }
);

router.patch(
  '/settings',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res) {
    const body = req.body || {};
    try {
      const view = founderSettings.patch(body.section, body.values);
      return res.json(view);
    } catch (error) {
      return res.status(error.status || 400).json({
        error: error.code || 'INVALID_SETTING',
        message: error.message
      });
    }
  }
);

router.delete(
  '/settings',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res) {
    return res.json(founderSettings.reset());
  }
);

/* Founder-only batch allotment. The calendar is booked server-side in the
   same operation; the trainer receives name + batch ID only. */
router.post(
  '/batches/:batchId/allot',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    const body = req.body || {};
    batchService.allot(req.params.batchId, body.trainerId, body.slots)
      .then(function (batch) { return res.json({ batch: batch }); })
      .catch(next);
  }
);

router.get(
  '/batches',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    Promise.resolve(db.listBatches())
      .then(function (batches) {
        return res.json({
          batches: batches.map(function (row) { return batchService.publicView(row, 'founder'); })
        });
      })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    Promise.resolve(db.listTrainerOnboarding())
      .then(function (rows) {
        return Promise.all(rows.map(function (row) {
          return trainerOnboarding.viewFor(row.trainerId, 'founder', {
            reveal: req.query.reveal === 'true'
          });
        }));
      })
      .then(function (records) { return res.json({ onboarding: records }); })
      .catch(next);
  }
);

router.patch(
  '/trainer-onboarding/:trainerId/locked',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    trainerOnboarding.correct(req.params.trainerId, req.body, req.user.id)
      .then(function (result) { return res.json(result); })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding/corrections',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    trainerOnboarding.history(null, { reveal: req.query.reveal === 'true' })
      .then(function (rows) { return res.json({ corrections: rows }); })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding/:trainerId/documents/:documentId',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    trainerDocuments.read(req.params.trainerId, req.params.documentId)
      .then(function (file) {
        res.set('Cache-Control', 'no-store');
        return res.type(file.mimeType).send(file.buffer);
      })
      .catch(next);
  }
);

/* Founder announcements. Audience is chosen at authoring time and enforced on
   every read; only trainer, student, both or one named individual are valid. */
router.get(
  '/announcements/recipients',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    Promise.resolve(db.listUsers()).then(function (users) {
      return res.json({
        recipients: users.filter(function (user) {
          return user.role === 'trainer' || user.role === 'student';
        }).map(function (user) {
          return { id: user.id, name: user.name, role: user.role };
        })
      });
    }).catch(next);
  }
);

router.get(
  '/announcements',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res, next) {
    announcementService.founderList()
      .then(function (announcements) { return res.json({ announcements: announcements }); })
      .catch(next);
  }
);

router.post(
  '/announcements',
  auth.requireAuth,
  auth.requireRole('founder'),
  function (req, res) {
    announcementService.create(req.user.id, req.body || {})
      .then(function (announcement) { return res.json({ announcement: announcement }); })
      .catch(function (error) {
        return res.status(error.status || 422).json({
          error: error.code || 'ANNOUNCEMENT_FAILED',
          message: error.message || 'Announcement could not be sent.'
        });
      });
  }
);

module.exports = router;
