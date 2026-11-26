/* Relationship manager desk API.
 *
 * A manager is founder-authorised staff, onboarded through the same KYC form
 * as a trainer. The desk shell and onboarding stay open while approval is
 * pending; every operational payload is refused by the shared staff-access
 * gate until the founder grants the desk. */
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const trainerAccess = require('../services/trainerAccessService');
const trainerOnboarding = require('../services/trainerOnboardingService');
const trainerDocuments = require('../services/trainerDocumentService');
const requireStaffAccess = require('../middleware/trainerAccess');

const router = express.Router();

router.use(auth.requireAuth);
router.use(auth.requireRole('relationship_manager', 'founder'));
router.use(requireStaffAccess({
  roles: ['relationship_manager'],
  open: function (path) {
    return path === '/dashboard' || /^\/onboarding(?:\/|$)/.test(path);
  }
}));

router.get('/dashboard', function (req, res, next) {
  trainerAccess.evaluate(req.user).then(function (access) {
    if (!access.granted) {
      /* Nothing operational reaches a manager who is still awaiting approval. */
      return res.json({
        access: access,
        dashboard: {
          name: req.user.name,
          role: req.user.role,
          title: req.user.title || 'Relationship manager',
          locked: true
        }
      });
    }
    return Promise.all([
      Promise.resolve(db.listUsers()),
      Promise.resolve(db.listSessionsForUser({ role: 'founder' })),
      Promise.resolve(db.listBatches())
    ]).then(function (results) {
      const users = results[0] || [];
      const sessions = results[1] || [];
      const batches = results[2] || [];
      return res.json({
        access: access,
        dashboard: {
          name: req.user.name,
          role: req.user.role,
          title: req.user.title || 'Relationship manager',
          monthlySalary: req.user.monthlySalary || null,
          locked: false,
          counts: {
            trainers: users.filter(function (user) { return user.role === 'trainer'; }).length,
            students: users.filter(function (user) { return user.role === 'student'; }).length,
            managers: users.filter(function (user) { return user.role === 'relationship_manager'; }).length,
            trainersNeedingAction: users.filter(function (user) {
              return user.role === 'trainer' && user.status === 'pending' &&
                user.accessGrantedByRole !== 'relationship_manager';
            }).length,
            sessions: sessions.length,
            batches: batches.length
          }
        }
      });
    });
  }).catch(next);
});

router.post('/onboarding/documents', function (req, res, next) {
  if (req.user.role !== 'relationship_manager') {
    const error = new Error('Only a relationship manager may upload these documents.');
    error.code = 'ROLE_DENIED';
    error.status = 403;
    return next(error);
  }
  trainerDocuments.upload(req.user.id, req.body)
    .then(function (document) { return res.status(201).json({ document: document }); })
    .catch(next);
});

router.get('/onboarding', function (req, res, next) {
  trainerOnboarding.viewFor(req.user.id, req.user.role)
    .then(function (record) { return res.json({ onboarding: record }); })
    .catch(next);
});

router.post('/onboarding', function (req, res, next) {
  if (req.user.role !== 'relationship_manager') {
    const error = new Error('Only a relationship manager may submit onboarding.');
    error.code = 'ROLE_DENIED';
    error.status = 403;
    return next(error);
  }
  trainerOnboarding.submit(req.user.id, req.body, req.user.role)
    .then(function (record) { return res.status(201).json({ onboarding: record }); })
    .catch(next);
});

router.patch('/onboarding/personal', function (req, res, next) {
  if (req.user.role !== 'relationship_manager') {
    const error = new Error('Only a relationship manager may edit personal details.');
    error.code = 'ROLE_DENIED';
    error.status = 403;
    return next(error);
  }
  trainerOnboarding.updatePersonal(req.user.id, req.body, req.user.role)
    .then(function (record) { return res.json({ onboarding: record }); })
    .catch(next);
});

module.exports = router;
