/* LMS auto-planner API.
 *
 * The catalog is public and academic-only. Generated planners require a signed
 * Mathify role. Student/parent/trainer reads always resolve the child's
 * registered board, grade and topic; only a founder may override them or
 * mutate a planner. A trainer may trigger generation only when no active
 * planner exists — the service returns the stored JSON on a cache hit.
 */

const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const curriculumRepository = require('../db/curriculum');
const catalog = require('../services/curriculumCatalog');
const planner = require('../services/weeklyPlannerService');

const router = express.Router();

router.get('/curriculum-catalog', function (req, res) {
  const curricula = catalog.list();
  return res.json({
    curricula: curricula,
    count: curricula.length,
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
  const curriculum = requestedCurriculum || (profile && profile.curriculum) || null;
  const grade = requestedGrade || (profile && profile.grade) || (student && student.grade) || null;
  if (!curriculum || !grade) {
    const error = new Error('This child has no registered curriculum and grade yet.');
    error.code = 'PROFILE_INCOMPLETE';
    error.status = 409;
    throw error;
  }
  const selection = planner.resolveSelection({
    curriculum: curriculum,
    grade: grade,
    topic: requestedTopic || (profile && profile.schoolChapter)
  });
  return Object.assign({}, selection, {
    source: requestedCurriculum || requestedGrade || requestedTopic ? 'request' : 'profile'
  });
}

async function founderSelection(req) {
  const body = req.body || {};
  const query = req.query || {};
  if (body.studentId || query.studentId) return selectionFor(req);
  return planner.resolveSelection({
    curriculum: body.curriculum || query.curriculum,
    grade: body.grade || query.grade,
    topic: body.topic || query.topic
  });
}

/* Every signed-in learning role can read. Generation happens inside the
   service only when no active cached planner exists; no force flag is read. */
router.get('/planner', auth.requireAuth, auth.requireRole('student', 'founder', 'parent', 'trainer'),
  auth.requireClassAccess,
  async function (req, res) {
    try {
      const selection = await selectionFor(req);
      const page = await planner.getOrCreate(selection);
      return res.json(Object.assign({ selection: selection }, page));
    } catch (error) {
      return problem(res, error);
    }
  });

/* Founder-controlled regeneration archives the old immutable JSON and moves
   the pointer from v1 to v2 (or the next version). */
router.post('/planner/regenerate', auth.requireAuth, auth.requireRole('founder'), auth.requireClassAccess, async function (req, res) {
  try {
    const selection = await founderSelection(req);
    const page = await planner.regenerate(selection, req.user.id);
    return res.json(Object.assign({ regenerated: true, selection: selection }, page));
  } catch (error) {
    return problem(res, error);
  }
});

/* Founder-only manual edit. The prior version is archived; the edited JSON is
   stored as a new immutable record and becomes the active pointer. */
router.patch('/planner', auth.requireAuth, auth.requireRole('founder'), auth.requireClassAccess, async function (req, res) {
  try {
    const selection = await founderSelection(req);
    const page = await planner.editPlanner(Object.assign({}, selection, {
      planner: req.body && req.body.planner
    }), req.user.id);
    return res.json(Object.assign({ edited: true, selection: selection }, page));
  } catch (error) {
    return problem(res, error);
  }
});

module.exports = router;
module.exports.selectionFor = selectionFor;
