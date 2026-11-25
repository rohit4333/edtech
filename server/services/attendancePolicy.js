/* ==========================================================================
   MATHIFY — shared leave and attendance rules.

   Final policy:
   - 2+ days notice by either side = mutual leave. No payout, no fine, no pack
     or attendance penalty for either person.
   - A trainer cancellation with less than 2 days notice costs that trainer
     exactly one session's pay. The student's session is marked "unattended".
   - A trainer no-show earns no payout and is not disguised as attendance.
   ========================================================================== */

const HOUR_MS = 60 * 60 * 1000;

function noticeHoursFor(session) {
  if (!session) return null;
  const scheduled = new Date(session.scheduledAt || session.startsAt || session.startedAt);
  const cancelled = new Date(session.cancelledAt || session.updatedAt);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(cancelled.getTime())) return null;
  return (scheduled.getTime() - cancelled.getTime()) / HOUR_MS;
}

function isTrainerCancellation(session) {
  const status = String(session && session.status || '').toLowerCase();
  const cancelled = status === 'cancelled' || status === 'canceled';
  const byTrainer = session.cancelledBy === 'trainer' ||
    session.cancelledByTrainer === true ||
    session.cancelledByRole === 'trainer';
  return cancelled && byTrainer;
}

function isStudentCancellation(session) {
  const status = String(session && session.status || '').toLowerCase();
  const cancelled = status === 'cancelled' || status === 'canceled';
  const byStudent = session.cancelledBy === 'student' ||
    session.cancelledByStudent === true ||
    session.cancelledByRole === 'student';
  return cancelled && byStudent;
}

function noticeLimitHours(policy) {
  const payout = policy && policy.payout;
  const leaveRules = payout && payout.leaveRules;
  const fineRules = payout && payout.fineRules;
  const attendance = policy && policy.attendance;

  const values = [leaveRules, fineRules].map(function (rules) {
    const configured = Number(rules && rules.noticeHours);
    return Number.isFinite(configured) ? configured : null;
  }).filter(function (value) { return value !== null; });

  if (values.length) return values[0];
  const leaveNotice = Number(attendance && attendance.leaveNoticeHours);
  return Number.isFinite(leaveNotice) ? leaveNotice : 48;
}

function isMutualLeave(session, policy) {
  if (!session) return false;
  const status = String(session.status || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (status === 'leave' || status === 'mutual-leave') return true;

  const byEitherParty = isTrainerCancellation(session) || isStudentCancellation(session);
  if (!byEitherParty) return false;
  if (policy && policy.payout && policy.payout.leaveRules &&
      policy.payout.leaveRules.mutualForTrainerAndStudent === false) return false;

  const noticeHours = noticeHoursFor(session);
  return noticeHours !== null && noticeHours >= noticeLimitHours(policy);
}

function isLateTrainerCancellation(session, policy) {
  if (!isTrainerCancellation(session)) return false;
  const noticeHours = noticeHoursFor(session);
  return noticeHours !== null && noticeHours < noticeLimitHours(policy);
}

function studentSessionStatus(session, policy) {
  if (isMutualLeave(session, policy)) {
    const payout = policy && policy.payout;
    const studentAttendance = payout && payout.studentAttendance;
    const attendance = policy && policy.attendance;
    return (studentAttendance && studentAttendance.mutualLeaveStatus) ||
      (attendance && attendance.mutualLeaveStatus) || 'leave';
  }

  if (isLateTrainerCancellation(session, policy)) {
    const payout = policy && policy.payout;
    const studentAttendance = payout && payout.studentAttendance;
    const attendance = policy && policy.attendance;
    return (studentAttendance && studentAttendance.lateTrainerCancellationStatus) ||
      (attendance && attendance.lateTrainerCancellationStudentStatus) || 'unattended';
  }

  return session && session.status || null;
}

function effectiveStudentStatus(session, status, policy) {
  const derived = studentSessionStatus(session, policy);
  if (derived === 'leave' || derived === 'unattended') return derived;
  return status;
}

module.exports = {
  HOUR_MS: HOUR_MS,
  noticeHoursFor: noticeHoursFor,
  isTrainerCancellation: isTrainerCancellation,
  isStudentCancellation: isStudentCancellation,
  isMutualLeave: isMutualLeave,
  isLateTrainerCancellation: isLateTrainerCancellation,
  studentSessionStatus: studentSessionStatus,
  effectiveStudentStatus: effectiveStudentStatus
};
