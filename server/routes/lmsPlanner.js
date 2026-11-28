/* LMS curriculum and planner API.
 *
 * The catalog is public and academic-only. Every non-founder planner read is
 * read-only: it returns an already-stored planner or an honest empty result.
 * Generation, regeneration, edits and suggestion filing are founder-only;
 * planner-agent mutation is paused until the founder explicitly re-enables it.
 * A trainer's assigned planner is derived only from batches whose trainerId is
 * the signed-in trainer, then from that child's registered curriculum profile.
 * No batch, board, grade, hint or suggested edit is invented here.
 */

const express = require('express');
const auth = require('../middleware/auth');
const token = require('../auth/token');
const db = require('../db');
const curriculumRepository = require('../db/curriculum');
const catalog = require('../services/curriculumCatalog');
const subjects = require('../services/subjectCatalog');
const planner = require('../services/weeklyPlannerService');
const plannerRead = require('../services/plannerReadService');
const plannerAgent = require('../services/plannerAgentService');

const router = express.Router();

/* LMS is founder/trainer/planner-agent only for staff. Relationship managers
   never see a course, a planner, a selector or a mutation endpoint. The
   catalogue stays readable without a token for the public LMS preview, but a
   signed-in RM is refused before any payload is built. */
async function optionalUser(req) {
  const header = String((req.headers && req.headers.authorization) || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = token.verify(match[1]);
  if (!payload) return null;
  const user = await db.findUserById(payload.sub);
  if (!user || Number(payload.ver || 0) !== Number(user.tokenVersion || 0)) return null;
  return user;
}

router.use(async function lmsStaffGate(req, res, next) {
  try {
    const user = await optionalUser(req);
    if (user && user.role === 'relationship_manager') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'LMS access is founder, trainer and planner agent only.'
      });
    }
    req.lmsUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
});

function subjectsVisibleTo(user) {
  const all = subjects.list();
  /* The planner agent designs across every field, exactly like the founder. */
  if (!user || user.role === 'founder' || user.role === 'planner_agent') return all;
  if (user.role === 'trainer') {
    const own = subjects.normalize(user.subject);
    return all.filter(function (item) { return item.subject === own; });
  }
  /* Student and parent desks see their own child's course only; the subject
     itself is already resolved server-side from stored family data. */
  return all;
}

router.get('/curriculum-catalog', function (req, res) {
  const curricula = catalog.list();
  const visible = subjectsVisibleTo(req.lmsUser);
  return res.json({
    curricula: curricula,
    count: curricula.length,
    subjects: visible,
    subjectCount: visible.length,
    promptVersion: planner.PROMPT_VERSION
  });
});

function problem(res, error) {
  const status = error && error.status >= 400 && error.status < 600 ? error.status : 500;
  return res.status(status).json({
    error: error && error.code ? error.code : 'PLANNER_UNAVAILABLE',
    message: status < 500 && error && error.message
      ? error.message
      : 'The weekly planner is unavailable right now.'
  });
}

async function studentIdFor(req) {
  const role = req.user.role;
  if (role === 'student') return req.user.id;

  /* A parent's child link is loaded server-side. A client-supplied childId is
     deliberately ignored, so one parent cannot read another child's planner. */
  if (role === 'parent') {
    const parent = await db.findUserById(req.user.id);
    if (!parent || parent.role !== 'parent' || !parent.childId) return null;
    return parent.childId;
  }

  const requested = String((req.query && req.query.studentId) ||
    (req.body && req.body.studentId) || '').trim();
  if (!requested) return null;
  const student = await db.findUserById(requested);
  if (!student || student.role !== 'student') {
    const error = new Error('Unknown student.');
    error.code = 'STUDENT_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  if (role === 'founder') return student.id;

  const sessions = await db.listSessionsForUser(req.user);
  const assigned = sessions.some(function (session) { return session.studentId === student.id; });
  if (!assigned) {
    const error = new Error('Student is not on your roster.');
    error.code = 'FORBIDDEN';
    error.status = 403;
    throw error;
  }
  return student.id;
}

async function selectionFor(req) {
  const studentId = await studentIdFor(req);
  if (!studentId) {
    const error = new Error('No child profile is linked to this account.');
    error.code = 'PROFILE_INCOMPLETE';
    error.status = 409;
    throw error;
  }
  const student = await db.findUserById(studentId);
  const profile = await curriculumRepository.get(studentId);
  /* Overrides are founder-only. Trainers cannot pick a board or grade that is
     not registered on the child's profile just to create a new planner. */
  const founder = req.user.role === 'founder';
  const requestedCurriculum = founder
    ? String((req.query && req.query.curriculum) || (req.body && req.body.curriculum) || '').trim()
    : '';
  const requestedGrade = founder
    ? String((req.query && req.query.grade) || (req.body && req.body.grade) || '').trim()
    : '';
  const requestedTopic = founder
    ? String((req.query && req.query.topic) || (req.body && req.body.topic) || '').trim()
    : '';
  const requestedSubject = founder
    ? String((req.query && req.query.subject) || (req.body && req.body.subject) || '').trim()
    : '';
  const curriculum = requestedCurriculum || (profile && profile.curriculum) || null;
  const grade = requestedGrade || (profile && profile.grade) || (student && student.grade) || null;
  if (!curriculum || !grade) {
    const error = new Error('This child has no registered curriculum and grade yet.');
    error.code = 'PROFILE_INCOMPLETE';
    error.status = 409;
    throw error;
  }
  const selection = planner.resolveSelection({
    subject: requestedSubject || (student && student.subject) || 'math',
    curriculum: curriculum,
    grade: grade,
    topic: requestedTopic || (profile && profile.schoolChapter)
  });
  /* A trainer can only open the field they teach. Founder override is allowed
     above; roster membership was already checked in studentIdFor. */
  if (req.user.role === 'trainer' &&
      subjects.normalize(req.user.subject) !== selection.subject) {
    const error = new Error('This course belongs to another trainer field.');
    error.code = 'FORBIDDEN_SUBJECT';
    error.status = 403;
    throw error;
  }
  return Object.assign({}, selection, {
    source: requestedCurriculum || requestedGrade || requestedTopic || requestedSubject ? 'request' : 'profile'
  });
}

function founderSelection(req) {
  const body = req.body || {};
  const query = req.query || {};
  if (body.studentId || query.studentId) return selectionFor(req);
  return academicSelection(req);
}

/* The planner desk is academic-only. It never resolves a child profile and a
   client-supplied studentId is refused rather than silently ignored, so an
   agent token cannot be used as a back door into family data. */
function academicSelection(req) {
  const body = req.body || {};
  const query = req.query || {};
  return planner.resolveSelection({
    subject: body.subject || query.subject,
    curriculum: body.curriculum || query.curriculum,
    grade: body.grade || query.grade,
    topic: body.topic || query.topic
  });
}

function assertAcademicScope(req) {
  if ((req.body && req.body.studentId) || (req.query && req.query.studentId)) {
    const error = new Error('The planner desk is academic-only; no child profile is used.');
    error.code = 'FORBIDDEN_STUDENT_SCOPE';
    error.status = 403;
    throw error;
  }
}

function designSelection(req) {
  if (req.user && req.user.role === 'planner_agent') {
    assertAcademicScope(req);
    return academicSelection(req);
  }
  return founderSelection(req);
}

/* Every signed-in learning role can read a generated planner, but only the
   founder's explicit load/generate call may create one. A trainer, parent,
   student or planner agent gets an honest unavailable response before any AI
   or deterministic fallback is allowed to write. */
router.get('/planner', auth.requireAuth,
  auth.requireRole('student', 'founder', 'parent', 'trainer', 'planner_agent'),
  auth.requireClassAccess,
  async function (req, res) {
    try {
      /* Founder and the academic planner desk may work from explicit
         curriculum/grade selections; family roles are pinned to a stored child
         profile before any read is allowed. */
      const selection = await (req.user.role === 'planner_agent' || req.user.role === 'founder'
        ? designSelection(req)
        : selectionFor(req));
      if (req.user.role !== 'founder') {
        const stored = await plannerRead.readActive(selection);
        if (!stored) {
          const error = new Error('No founder-generated planner is available yet.');
          error.code = 'PLANNER_NOT_GENERATED';
          error.status = 409;
          throw error;
        }
        return res.json(Object.assign({ selection: selection }, stored));
      }
          const page = await planner.getOrCreate(selection, {
        createdByRole: 'founder', actorId: req.user.id
      });
      return res.json(Object.assign({ selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

async function selectionForBatch(batch) {
  const student = await db.findUserById(batch.studentId);
  if (!student || student.role !== 'student') return null;
  const profile = await curriculumRepository.get(student.id);
  return planner.resolveSelection({
    subject: batch.subject || student.subject || 'math',
    curriculum: (profile && profile.curriculum) || null,
    grade: (profile && profile.grade) || student.grade || null,
    topic: (profile && profile.schoolChapter) || null
  });
}

async function trainerBatches(req) {
  const all = await Promise.resolve(db.listBatches());
  return (Array.isArray(all) ? all : []).filter(function (batch) {
    return batch && batch.trainerId === req.user.id && batch.studentId;
  });
}

async function assignedForBatch(batch) {
  const selection = await selectionForBatch(batch);
  if (!selection || !selection.curriculumSlug || !selection.gradeSlug) return null;
  const stored = await plannerRead.readActive(selection);
  if (!stored) return null;
  return {
    batch: {
      id: batch.id,
      code: batch.code || null,
      subject: subjects.normalize(batch.subject || selection.subject)
    },
    studentId: batch.studentId,
    selection: stored.selection,
    planner: stored.planner,
    cache: stored.cache,
    guidance: plannerRead.guidanceFrom(stored)
  };
}

/* Trainer view-only surface. The batch assignment is read from server records;
   a browser-supplied student, board, grade or topic is never used here. */
router.get('/assigned-planners', auth.requireAuth,
  auth.requireRole('trainer'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const assigned = await Promise.all((await trainerBatches(req)).map(assignedForBatch));
      const items = assigned.filter(Boolean);
      return res.json({
        assignedPlanners: items,
        count: items.length,
        message: items.length
          ? ''
          : 'No generated planner is assigned to your batches yet.'
      });
    } catch (error) {
      return problem(res, error);
    }
  });

/* Compact trainer quiz guidance. It reads only the suggested edits and hint
   additions already present in the assigned planner; absent fields stay empty. */
router.get('/planner-guidance', auth.requireAuth,
  auth.requireRole('trainer'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const query = req.query || {};
      let studentId = String(query.studentId || '').trim();
      let session = null;
      if (!studentId && query.sessionId) {
        session = await db.findSession(String(query.sessionId).trim());
        if (!session || session.trainerId !== req.user.id) {
          const error = new Error('That session is not on your roster.');
          error.code = 'FORBIDDEN_SESSION';
          error.status = 403;
          throw error;
        }
        studentId = session.studentId;
      }
      if (!studentId) {
        const error = new Error('A student or session is required.');
        error.code = 'STUDENT_REQUIRED';
        error.status = 400;
        throw error;
      }
      const batch = (await trainerBatches(req)).find(function (item) {
        return item.studentId === studentId;
      });
      if (!batch) {
        const error = new Error('That child is not on one of your assigned batches.');
        error.code = 'FORBIDDEN_BATCH';
        error.status = 403;
        throw error;
      }
      const assigned = await assignedForBatch(batch);
      if (!assigned) {
        return res.json({
          source: 'assigned-planner',
          plannerAvailable: false,
          batch: { id: batch.id, code: batch.code || null },
          suggestedEdits: [],
          hintAdditions: [],
          hasGuidance: false,
          message: 'No founder-generated planner is assigned to this batch yet.'
        });
      }
      return res.json(Object.assign({
        source: 'assigned-planner',
        plannerAvailable: true,
        batch: assigned.batch
      }, assigned.guidance));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Founder regeneration archives the old immutable JSON and moves the pointer
   from v1 to v2 (or the next version). Agent mutation stays disabled. */
router.post('/planner/regenerate', auth.requireAuth,
  auth.requireRole('founder'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = await designSelection(req);
      const page = await planner.regenerate(selection, req.user.id, {
        createdByRole: 'founder'
      });
      return res.json(Object.assign({ regenerated: true, selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Founder edit. The prior version is archived; the edited JSON is stored as a
   new immutable record and becomes the active pointer. */
router.patch('/planner', auth.requireAuth,
  auth.requireRole('founder'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = await designSelection(req);
      const page = await planner.editPlanner(Object.assign({}, selection, {
        planner: req.body && req.body.planner
      }), req.user.id, { createdByRole: 'founder' });
      return res.json(Object.assign({ edited: true, selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* The queue is read-only until the founder explicitly re-enables agent ideas.
   New ideas require a founder action; no learner or agent may file one. */
router.get('/planner-suggestions', auth.requireAuth,
  auth.requireRole('founder', 'planner_agent'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const query = req.query || {};
      const items = await plannerAgent.list({
        subject: query.subject,
        curriculumSlug: query.curriculum,
        gradeSlug: query.grade
      });
      return res.json({ suggestions: items, count: items.length });
    } catch (error) {
      return problem(res, error);
    }
  });

/* Kept for contract visibility, but the service refuses new ideas until the
   founder explicitly re-enables planner-agent mutation. */
router.post('/planner-suggestion', auth.requireAuth,
  auth.requireRole('planner_agent'), auth.requireClassAccess,
  async function (req, res) {
    try {
      assertAcademicScope(req);
      const selection = academicSelection(req);
      const body = req.body || {};
      const idea = await plannerAgent.propose(Object.assign({}, selection, {
        planner: body.planner,
        note: body.note
      }), req.user);
      return res.status(201).json({ suggestion: idea });
    } catch (error) {
      return problem(res, error);
    }
  });

router.post('/planner-suggestion/:id/decide', auth.requireAuth,
  auth.requireRole('founder'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const result = await plannerAgent.decide(
        req.params.id, (req.body || {}).decision, req.user
      );
      return res.json(result);
    } catch (error) {
      return problem(res, error);
    }
  });

module.exports = router;
module.exports.selectionFor = selectionFor;
