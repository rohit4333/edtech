/* LMS auto-planner API.
 *
 * The catalog is public and academic-only. Generated planners require a signed
 * Mathify role. Student/parent/trainer reads always resolve the child's
 * registered board, grade and topic; founder and planner-agent desks may work
 * with academic selections directly. Mutation is founder-controlled: the
 * planner agent can design ordinary planners, but a founder-authored plan is
 * never replaced by it — the agent files an alternate idea for founder review.
 * A trainer may trigger generation only when no active planner exists — the
 * service returns the stored JSON on a cache hit.
 */

const express = require('express');
const auth = require('../middleware/auth');
const token = require('../auth/token');
const db = require('../db');
const curriculumRepository = require('../db/curriculum');
const catalog = require('../services/curriculumCatalog');
const subjects = require('../services/subjectCatalog');
const planner = require('../services/weeklyPlannerService');
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

function authorship(req) {
  return req.user && req.user.role === 'planner_agent' ? 'planner_agent' : 'founder';
}

/* Every signed-in learning role can read. Generation happens inside the
   service only when no active cached planner exists; no force flag is read. */
router.get('/planner', auth.requireAuth,
  auth.requireRole('student', 'founder', 'parent', 'trainer', 'planner_agent'),
  auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = req.user.role === 'planner_agent'
        ? designSelection(req)
        : await selectionFor(req);
      const page = await planner.getOrCreate(selection);
      return res.json(Object.assign({ selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Founder and planner-agent regeneration archives the old immutable JSON and
   moves the pointer from v1 to v2 (or the next version). The service refuses an
   agent attempt on a founder-authored plan. */
router.post('/planner/regenerate', auth.requireAuth,
  auth.requireRole('founder', 'planner_agent'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = await designSelection(req);
      const page = await planner.regenerate(selection, req.user.id, {
        createdByRole: authorship(req)
      });
      return res.json(Object.assign({ regenerated: true, selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Manual edit. The prior version is archived; the edited JSON is stored as a
   new immutable record and becomes the active pointer. A planner agent cannot
   overwrite founder work; the immutability check lives in the service. */
router.patch('/planner', auth.requireAuth,
  auth.requireRole('founder', 'planner_agent'), auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = await designSelection(req);
      const page = await planner.editPlanner(Object.assign({}, selection, {
        planner: req.body && req.body.planner
      }), req.user.id, { createdByRole: authorship(req) });
      return res.json(Object.assign({ edited: true, selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Alternate ideas for founder-authored planners. Nothing here writes a cache
   record or moves a pointer: an idea stays pending until the founder decides. */
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
