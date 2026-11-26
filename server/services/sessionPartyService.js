/* Session party validation for trainer-created 1:1 sessions.
   The Express service role bypasses RLS, so the route must verify that both
   ids resolve to active accounts with the correct roles before an insert. */

const db = require('../db');

function problem(code, message, status) {
  return { error: code, message: message, status: status || 400 };
}

function validate(trainerId, studentId) {
  if (!studentId) {
    return problem('MISSING_STUDENT', 'student_id is required and must be a UUID from public.users.');
  }
  if (!trainerId) {
    return problem('MISSING_TRAINER', 'A trainer is required for a 1-on-1 session.');
  }
  if (trainerId === studentId) {
    return problem('SAME_PARTY', 'A 1-on-1 session needs two different people.');
  }

  const trainer = db.findUserById(trainerId);
  if (!trainer || trainer.status !== 'active' ||
      (trainer.role !== 'trainer' && trainer.role !== 'founder')) {
    return problem('INVALID_TRAINER', 'The session trainer must be an active trainer account.');
  }

  const student = db.findUserById(studentId);
  if (!student || student.status !== 'active' || student.role !== 'student') {
    return problem('INVALID_STUDENT', 'The session student must be an active student account.');
  }
  return { trainer: trainer, student: student };
}

module.exports = { validate: validate };
