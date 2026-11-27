const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const founderSettings = require('../services/founderSettingsService');
const batchService = require('../services/batchService');
const trainerOnboarding = require('../services/trainerOnboardingService');
const trainerDocuments = require('../services/trainerDocumentService');
const announcementService = require('../services/announcementService');
const founderAdmin = require('../services/founderAdminService');
const adminAudit = require('../services/adminAuditService');
const demoService = require('../services/demoService');
const subjectCatalog = require('../services/subjectCatalog');

const router = express.Router();

/* A relationship manager shares the founder's operating view. Owner-only
   controls (settings, base rate, salary, credential choice and access
   revocation) are enforced here; the single scoped exception is a generated
   temporary password for an already granted trainer. */
const adminRole = auth.requireRole('founder', 'relationship_manager');
const founderRole = auth.requireRole('founder');

function adminError(res, error) {
  return res.status(error.status || 422).json({
    error: error.code || 'ADMIN_ACTION_FAILED',
    message: error.message || 'Admin action could not be completed.'
  });
}

/* One line per action, written before the response. The founder dashboard
   reads this file so every manager decision is reflected back with an actor. */
function audit(req, action, targetType, targetId, targetName, detail) {
  try {
    adminAudit.record({
      actorRole: req.user.role,
      actorId: req.user.id,
      actorName: req.user.name,
      action: action,
      targetType: targetType,
      targetId: targetId,
      targetName: targetName,
      detail: detail
    });
  } catch (error) {
    console.error('Admin audit write failed:', error.message);
    return false;
  }
  return true;
}

router.get(
  '/audit',
  auth.requireAuth,
  founderRole,
  function (req, res) {
    res.set('Cache-Control', 'no-store');
    return res.json(adminAudit.list({
      role: req.query.role || null,
      limit: req.query.limit || 100
    }));
  }
);

router.get(
  '/support-escalations',
  auth.requireAuth,
  adminRole,
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
  founderRole,
  function (req, res) {
    return res.json(founderSettings.view());
  }
);

/* Founder-only field assignment. A trainer sees only this subject in LMS and
   in AI prompts; RM cannot reach the route at all. */
router.put(
  '/trainers/:trainerId/subject',
  auth.requireAuth,
  founderRole,
  async function (req, res) {
    const trainer = await db.findUserById(req.params.trainerId);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(404).json({ error: 'TRAINER_NOT_FOUND', message: 'Unknown trainer.' });
    }
    const subject = subjectCatalog.normalize((req.body || {}).subject);
    const updated = await db.updateUser(trainer.id, function (current) {
      return Object.assign({}, current, {
        subject: subject,
        subjectUpdatedAt: new Date().toISOString(),
        subjectUpdatedBy: req.user.id
      });
    });
    const recorded = audit(req, 'assign_trainer_field', 'trainer', trainer.id, trainer.name,
      { subject: subject });
    if (!recorded) {
      return res.status(500).json({
        error: 'AUDIT_WRITE_FAILED',
        message: 'The field assignment was saved but its audit could not be recorded.'
      });
    }
    return res.json({
      trainer: { id: trainer.id, name: updated.name, role: 'trainer' },
      subject: subjectCatalog.publicView(subject)
    });
  }
);

router.patch(
  '/settings',
  auth.requireAuth,
  founderRole,
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
  founderRole,
  function (req, res) {
    return res.json(founderSettings.reset());
  }
);

/* Founder-only batch allotment. The calendar is booked server-side in the
   same operation; the trainer receives name + batch ID only. */
router.post(
  '/batches/:batchId/allot',
  auth.requireAuth,
  adminRole,
  function (req, res, next) {
    const body = req.body || {};
    batchService.allot(req.params.batchId, body.trainerId, body.slots)
      .then(function (batch) {
        audit(req, 'batch.allotted', 'batch', batch && batch.id, batch && batch.title, {
          batchId: req.params.batchId,
          trainerId: body.trainerId
        });
        return res.json({ batch: batch });
      })
      .catch(next);
  }
);

router.get(
  '/batches',
  auth.requireAuth,
  adminRole,
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

/* Demo requests are shared with the founder/RM desk. The family login is
   issued and emailed at booking; staff only read its safe status and hand over
   trainer passwords from the staff administration desk. */
router.get(
  '/demos',
  auth.requireAuth,
  adminRole,
  function (req, res, next) {
    demoService.listRequests(req.query.limit || 50)
      .then(function (demos) { return res.json({ demos: demos }); })
      .catch(next);
  }
);

router.post(
  '/demos/:demoId/credentials',
  auth.requireAuth,
  adminRole,
  function (req, res, next) {
    demoService.prepare(req.params.demoId, req.user, req.body || {})
      .then(function (result) {
        audit(req, 'demo.credentials_checked', 'demo', req.params.demoId, null, {
          issuedAtBooking: Boolean(result.demo && result.demo.credentialsIssued)
        });
        return res.json(result);
      })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding',
  auth.requireAuth,
  adminRole,
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
  adminRole,
  function (req, res, next) {
    trainerOnboarding.correct(req.params.trainerId, req.body, req.user.id)
      .then(function (result) { return res.json(result); })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding/corrections',
  auth.requireAuth,
  adminRole,
  function (req, res, next) {
    trainerOnboarding.history(null, { reveal: req.query.reveal === 'true' })
      .then(function (rows) { return res.json({ corrections: rows }); })
      .catch(next);
  }
);

router.get(
  '/trainer-onboarding/:trainerId/documents/:documentId',
  auth.requireAuth,
  adminRole,
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
  adminRole,
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
  adminRole,
  function (req, res, next) {
    announcementService.founderList()
      .then(function (announcements) { return res.json({ announcements: announcements }); })
      .catch(next);
  }
);

router.post(
  '/announcements',
  auth.requireAuth,
  adminRole,
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

/* ---------------------------------------------------- people administration
   One route family serves the trainer, relationship-manager and student desks.
   Both the founder and founder-authorised relationship managers may use it;
   owner-only controls are refused before the service is reached. */
router.get(
  '/people/:role',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.list(req.params.role))
      .then(function (people) { return res.json({ people: people }); })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.get(
  '/people/:id/penalties',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.listPenalties(req.params.id))
      .then(function (penalties) { return res.json({ penalties: penalties }); })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.get(
  '/people/:role/:id',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.detail(req.params.role, req.params.id, req.user.role))
      .then(function (person) { return res.json(person); })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.post(
  '/people',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.create(req.body && req.body.role, req.body, req.user.role))
      .then(function (result) {
        audit(req, 'account.created', result.person.role, result.person.id, result.person.name, {
          role: result.person.role,
          temporaryPasswordIssued: Boolean(result.temporaryPassword)
        });
        return res.json(result);
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.patch(
  '/people/:id/access',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    const status = String((req.body && req.body.status) || '').toLowerCase();
    if (status === 'suspended' && req.user.role === 'relationship_manager') {
      return adminError(res, {
        code: 'RM_REVOKE_DENIED',
        message: 'A relationship manager can grant access but cannot revoke it.',
        status: 403
      });
    }
    Promise.resolve(founderAdmin.setAccess(req.params.id, req.body && req.body.status, req.user.id, req.user.role))
      .then(function (person) {
        audit(req, status === 'suspended' ? 'access.revoked' : 'access.granted',
          person.role, person.id, person.name, { status: status });
        return res.json({ person: person });
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

/* Founder validation step: approve submitted KYC, open the desk and issue the
   first password in one action. The UI shows the value once with a copy button. */
router.post(
  '/people/:id/grant',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.grantAccess(req.params.id, req.user.id, req.user.role))
      .then(function (result) {
        audit(req, 'access.granted_after_kyc', result.person.role, result.person.id, result.person.name, {
          role: result.person.role,
          generatedPasswordIssued: true
        });
        return res.json(result);
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

/* Credential choice, replacement and founder-set pay are owner-only. A manager
   may only ask for the generated temporary trainer password; the service
   refuses a chosen value, another target role or an ungranted account. Both
   outcomes are written to the founder-visible audit with the acting role. */
router.patch(
  '/people/:id/password',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    const isManager = req.user.role === 'relationship_manager';
    Promise.resolve(founderAdmin.setPassword(req.params.id, req.body, req.user.id, req.user.role))
      .then(function (result) {
        const generated = Boolean(result.temporaryPassword);
        audit(req, isManager ? 'password.temp_issued' : 'password.granted',
          result.person.role, result.person.id, result.person.name, {
            role: result.person.role,
            generated: generated,
            temporaryPasswordIssued: generated
          });
        return res.json(result);
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.patch(
  '/people/:id/base-rate',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.setBaseRate(req.params.id, req.body && req.body.rate, req.user.id, req.user.role))
      .then(function (person) {
        audit(req, 'base_rate.set', 'trainer', person.id, person.name, {
          rate: person.payPerSession,
          locked: Boolean(person.rateLockedAt)
        });
        return res.json({ person: person });
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.patch(
  '/people/:id/monthly-salary',
  auth.requireAuth,
  founderRole,
  function (req, res) {
    Promise.resolve(founderAdmin.setMonthlySalary(req.params.id, req.body && req.body.amount, req.user.role))
      .then(function (person) {
        audit(req, 'salary.set', person.role, person.id, person.name, {
          amount: person.monthlySalary
        });
        return res.json({ person: person });
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.post(
  '/people/:id/penalties',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.addPenalty(req.params.id, req.body, req.user.id, req.user.role))
      .then(function (penalty) {
        audit(req, 'penalty.added', 'trainer', penalty.trainerId, penalty.trainerName, {
          amount: penalty.amount,
          reason: penalty.reason
        });
        return res.json({ penalty: penalty });
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

router.patch(
  '/penalties/:penaltyId/revoke',
  auth.requireAuth,
  adminRole,
  function (req, res) {
    Promise.resolve(founderAdmin.revokePenalty(req.params.penaltyId, req.user.id, req.user.role))
      .then(function (penalty) {
        audit(req, 'penalty.revoked', 'trainer', penalty.trainerId, penalty.trainerName, {
          trainerId: penalty.trainerId,
          reason: penalty.reason
        });
        return res.json({ penalty: penalty });
      })
      .catch(function (error) { return adminError(res, error); });
  }
);

module.exports = router;
