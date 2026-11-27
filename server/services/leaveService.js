/* ==========================================================================
   MATHIFY — leave applications for trainer and student dashboards.

   A leave can be applied only 2+ days before a scheduled session. Once applied
   it is auto-approved as mutual leave: the trainer earns no payout, the child
   loses no pack session, and attendance is recorded as "leave". Trainer leave
   credits are 8 per calendar month; student-initiated leave does not consume
   a trainer credit because the trainer is not being burdened.
   ========================================================================== */

const db = require('../db');
const auth = require('../middleware/auth');
const appPolicy = require('../config/policy.json');

const HOUR_MS = 60 * 60 * 1000;

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  throw error;
}

function periodFrom(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return new Date().toISOString().slice(0, 7);
  return value.toISOString().slice(0, 7);
}

function startOf(session) {
  if (!session) return null;
  const value = new Date(session.scheduledAt || session.startsAt || session.startedAt);
  return Number.isNaN(value.getTime()) ? null : value;
}

function noticeHoursFor(session) {
  const start = startOf(session);
  return start ? (start.getTime() - Date.now()) / HOUR_MS : null;
}

function leaveRules() {
  const payout = appPolicy.payout || {};
  const leave = payout.leaveRules || {};
  const attendance = appPolicy.attendance || {};
  return {
    noticeDays: Number(leave.noticeDays) || 2,
    noticeHours: Number(leave.noticeHours) || Number(attendance.leaveNoticeHours) || 48,
    mutual: leave.mutualForTrainerAndStudent !== false,
    packPenalty: Boolean(
      (appPolicy.leaveBalances && appPolicy.leaveBalances.student &&
        appPolicy.leaveBalances.student.packPenalty) || leave.packPenalty
    )
  };
}

async function balanceFor(user) {
  if (!user || user.role !== 'trainer') return null;

  const configured = appPolicy.leaveBalances && appPolicy.leaveBalances.trainer;
  const total = Number(configured && configured.perMonth) || 8;
  const period = periodFrom(new Date());
  const chargeStudentInitiated = Boolean(configured && configured.chargeStudentInitiatedLeaves);
  const requests = await Promise.resolve(db.listLeaveRequests());
  const used = requests.filter(function (request) {
    if (request.status !== 'approved') return false;
    if (request.trainerId !== user.id) return false;
    if (periodFrom(request.createdAt || request.date) !== period) return false;
    if (!chargeStudentInitiated && request.requestedByRole === 'student') return false;
    return request.requestedBy === user.id || chargeStudentInitiated;
  }).length;

  return {
    total: total,
    used: used,
    remaining: Math.max(0, total - used),
    period: period,
    unit: 'sessions'
  };
}

async function sessionOption(session) {
  const start = startOf(session);
  const trainer = await Promise.resolve(db.findUserById(session.trainerId));
  const student = await Promise.resolve(db.findUserById(session.studentId));
  const noticeHours = noticeHoursFor(session);
  const rules = leaveRules();
  const existing = await Promise.resolve(db.findLeaveRequestForSession(session.id));

  return {
    id: session.id,
    code: session.code || null,
    title: session.title || '1-on-1 maths session',
    status: session.status,
    date: start ? start.toISOString().slice(0, 10) : null,
    time: start ? start.toISOString().slice(11, 16) : null,
    startsAt: start ? start.toISOString() : null,
    trainerName: trainer ? trainer.name : null,
    studentName: student ? student.name : null,
    hasLeave: Boolean(existing),
    eligible: Boolean(start && noticeHours !== null && noticeHours >= rules.noticeHours && !existing)
  };
}

async function list(user) {
  if (!user || ['trainer', 'student', 'founder'].indexOf(user.role) === -1) {
    fail('FORBIDDEN', 'This role cannot view leave requests.', 403);
  }

  const allSessions = await Promise.resolve(db.listSessionsForUser(user));
  const sessions = allSessions.filter(function (session) {
    const start = startOf(session);
    return Boolean(start && start.getTime() > Date.now() &&
      ['scheduled', 'live', 'leave'].indexOf(session.status) !== -1);
  });
  const options = await Promise.all(sessions.map(sessionOption));
  const [balance, requests] = await Promise.all([
    balanceFor(user),
    Promise.resolve(db.listLeaveRequestsForUser(user))
  ]);

  return {
    role: user.role,
    balance: balance,
    rules: leaveRules(),
    sessions: options.sort(function (a, b) {
      return String(a.startsAt).localeCompare(String(b.startsAt));
    }),
    requests: requests
  };
}

async function apply(user, body) {
  if (!user || ['trainer', 'student'].indexOf(user.role) === -1) {
    fail('FORBIDDEN', 'Only trainers and students can apply for leave.', 403);
  }

  const input = body || {};
  const rules = leaveRules();
  const sessions = await Promise.resolve(db.listSessionsForUser(user));
  const sessionId = input.sessionId || input.session || input.id;
  let session = null;

  if (sessionId) {
    session = sessions.find(function (item) { return item.id === sessionId; }) || null;
    if (!session || !auth.canAccessSession(user, session)) {
      fail('SESSION_NOT_FOUND', 'That session is not on your schedule.', 404);
    }
  } else if (input.date) {
    session = sessions.filter(function (item) {
      const start = startOf(item);
      return start && start.toISOString().slice(0, 10) === String(input.date);
    }).sort(function (a, b) {
      return startOf(a) - startOf(b);
    })[0] || null;
    if (!session) fail('SESSION_NOT_FOUND', 'No session found on that date.', 404);
  } else {
    fail('MISSING_SESSION', 'Choose a session or date.', 400);
  }

  if (['scheduled', 'live'].indexOf(session.status) === -1) {
    fail('SESSION_NOT_OPEN', 'That session can no longer be changed.', 409);
  }
  if (await Promise.resolve(db.findLeaveRequestForSession(session.id))) {
    fail('LEAVE_EXISTS', 'Leave has already been applied for this session.', 409);
  }

  const noticeHours = noticeHoursFor(session);
  if (noticeHours === null || noticeHours < rules.noticeHours) {
    fail('TOO_LATE', 'Leave must be applied at least 2 days before the session.', 400);
  }

  if (user.role === 'trainer') {
    const balance = await balanceFor(user);
    if (balance && balance.remaining < 1) {
      fail('NO_LEAVE_BALANCE', 'No session leave credits remain this month.', 409);
    }
  }

  const start = startOf(session);
  const now = new Date();
  const reason = String(input.reason || input.note || '').trim().slice(0, 240);
  const request = await Promise.resolve(db.insertLeaveRequest({
    sessionId: session.id,
    trainerId: session.trainerId,
    studentId: session.studentId,
    requestedBy: user.id,
    requestedByRole: user.role,
    date: start.toISOString().slice(0, 10),
    period: periodFrom(start),
    noticeHours: Math.round(noticeHours * 10) / 10,
    status: 'approved',
    autoApproved: true,
    reason: reason,
    studentStatus: 'leave',
    trainerPayout: 0,
    packPenalty: false,
    decidedAt: now.toISOString()
  }));

  await Promise.resolve(db.updateSession(session.id, function (current) {
    current.status = 'leave';
    current.cancelledBy = user.role;
    current.cancelledAt = now.toISOString();
    current.leaveRequestId = request.id;
    return current;
  }));
  await Promise.resolve(db.upsertAttendance(session.id, session.studentId, 'leave'));

  return { request: request, balance: await balanceFor(user) };
}

module.exports = {
  HOUR_MS: HOUR_MS,
  leaveRules: leaveRules,
  balanceFor: balanceFor,
  list: list,
  apply: apply
};
