const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const founderSettings = require('../services/founderSettingsService');

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

module.exports = router;
