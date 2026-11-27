/* Platform-wide question totals for one student.
 *
 * Counts stored live-session quiz attempts and self-paced mastery practice
 * attempts. Attempt records already carry correctness; no answer key, option
 * text or explanation is read or returned here. */

function countAttempts(items) {
  if (!Array.isArray(items)) return { attempted: 0, solved: 0 };
  let attempted = 0;
  let solved = 0;
  items.forEach(function (attempt) {
    if (!attempt || typeof attempt !== 'object') return;
    attempted += 1;
    if (attempt.correct === true) solved += 1;
  });
  return { attempted: attempted, solved: solved };
}

function forStudent(studentId, sessions, practiceBatches) {
  let totals = { attempted: 0, solved: 0 };

  (Array.isArray(sessions) ? sessions : []).forEach(function (session) {
    if (!session || session.studentId !== studentId) return;
    const counted = countAttempts(session.quiz && session.quiz.attempts);
    totals.attempted += counted.attempted;
    totals.solved += counted.solved;
  });

  (Array.isArray(practiceBatches) ? practiceBatches : []).forEach(function (batch) {
    if (!batch || batch.studentId !== studentId) return;
    const counted = countAttempts(batch.attempts);
    totals.attempted += counted.attempted;
    totals.solved += counted.solved;
  });

  return totals;
}

module.exports = {
  countAttempts: countAttempts,
  forStudent: forStudent
};
