/* Server-owned subject resolution. The browser never decides which course a
   child is enrolled in: a signed-in dashboard, a batch session and a planner
   all derive the same subject from stored family/batch data. */

const db = require('../db');
const catalog = require('./subjectCatalog');

function fail(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

async function forStudent(studentId) {
  if (!studentId) return catalog.publicView('math');
  const student = await Promise.resolve(db.findUserById(studentId));
  return catalog.publicView(student && student.subject);
}

async function forSession(session) {
  if (!session) return catalog.publicView('math');
  if (session.subject) return catalog.publicView(session.subject);
  return forStudent(session.studentId);
}

/* Trainer/founder only. Roster membership is checked by the route before this
   service is called, and only the academic subject field is written. */
async function setForStudent(studentId, value, actorId) {
  const student = await Promise.resolve(db.findUserById(studentId));
  if (!student || student.role !== 'student') {
    throw fail('Unknown student.', 'STUDENT_NOT_FOUND', 404);
  }
  const subject = catalog.normalize(value);
  const updated = await Promise.resolve(db.updateUser(studentId, function (current) {
    return Object.assign({}, current, {
      subject: subject,
      subjectUpdatedAt: new Date().toISOString(),
      subjectUpdatedBy: actorId || null
    });
  }));
  return {
    student: { id: studentId, name: updated && updated.name ? updated.name : student.name },
    subject: catalog.publicView(subject)
  };
}

/* Batches carry their own subject so a scheduled session stays stable even if
   a family later changes the course shown on its dashboard. */
async function forBatch(batch) {
  if (!batch) return catalog.publicView('math');
  if (batch.subject) return catalog.publicView(batch.subject);
  return forStudent(batch.studentId || (batch.student && batch.student.id));
}

module.exports = {
  forStudent: forStudent,
  forSession: forSession,
  forBatch: forBatch,
  setForStudent: setForStudent,
  catalog: catalog
};
