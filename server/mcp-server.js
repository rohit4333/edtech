/* Founder MCP server over stdio.
 *
 * Contract: three read-only tools. The process needs MCP_FOUNDER_TOKEN at
 * startup; without it, tools/list and tools/call are refused. Data comes from
 * the existing service-role db facade in live mode and the mock store in mock
 * mode. Nothing here pays, allots, reschedules, or creates a payment link.
 * Proposals are drafts that always require explicit founder approval.
 *
 * JSON-RPC framing, fail-closed auth and structuredContent come from the shared
 * mcp-core used by the RM and planner-designer servers.
 */

const core = require('./mcp-core');
const config = require('./config');
const db = require('./db');
const policy = require('./config/policy.json');
const payoutService = require('./services/payoutService');
const attendancePolicy = require('./services/attendancePolicy');
const masteryGating = require('./services/masteryGating');

const SERVER_NAME = 'mathify-founder-read-dryrun';
const SERVER_VERSION = '0.1.0';
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CLOSED_SESSION_STATUSES = ['ended', 'completed'];
const RESCHEDULE_STATUSES = ['cancelled', 'canceled', 'leave', 'no-show', 'noshow'];

/* Exactly three founder tools. Every name starts with get_; no mutation verb
 * is exposed as an MCP tool. */
const tools = [
  {
    name: 'get_trainer_payout',
    description: 'Read one trainer’s payout and session data for a month. Never pays; may draft a pay proposal for founder approval.',
    inputSchema: {
      type: 'object',
      properties: {
        trainer_email: { type: 'string', description: 'Trainer account email.' },
        month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Optional YYYY-MM; defaults to the current month.' },
        period: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Alias for month.' }
      },
      required: ['trainer_email'],
      additionalProperties: false
    }
  },
  {
    name: 'get_student_mastery',
    description: 'Read one student’s mastery, gating and practice progress. Never allots a trainer; may draft an allotment/reteach proposal.',
    inputSchema: {
      type: 'object',
      properties: {
        student_email: { type: 'string', description: 'Student account email.' }
      },
      required: ['student_email'],
      additionalProperties: false
    }
  },
  {
    name: 'get_trainer_attendance',
    description: 'Read one trainer’s attendance register for a month. Never edits attendance; may draft a reschedule proposal.',
    inputSchema: {
      type: 'object',
      properties: {
        trainer_email: { type: 'string', description: 'Trainer account email.' },
        month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Required YYYY-MM.' }
      },
      required: ['trainer_email', 'month'],
      additionalProperties: false
    }
  }
];

const rpcResult = core.rpcResult;
const rpcError = core.rpcError;
const toolError = core.toolError;
const clone = core.clone;

function founderToken() {
  return String(process.env.MCP_FOUNDER_TOKEN || process.env.MCP_FOUNDER_AUTH_TOKEN || '').trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sessionDate(session) {
  const raw = session && (session.startedAt || session.startsAt || session.scheduledAt || session.date);
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dateKey(session) {
  const date = sessionDate(session);
  return date ? date.toISOString().slice(0, 10) : null;
}

function inPeriod(session, period) {
  const date = sessionDate(session);
  return Boolean(date && date.toISOString().slice(0, 7) === period);
}

function normalizePeriod(value, label) {
  const period = String(value || '').trim();
  if (!PERIOD_PATTERN.test(period)) {
    throw toolError(label || 'INVALID_PERIOD', 'Month must use YYYY-MM.');
  }
  return period;
}

function emailOf(value, label) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) throw toolError('INVALID_EMAIL', label + ' email is required.');
  return email;
}

async function readUser(store, value, expectedRole, label) {
  const email = emailOf(value, label);
  const user = await store.findUserByEmail(email);
  if (!user || user.role !== expectedRole) {
    throw toolError(label.toUpperCase() + '_NOT_FOUND', 'No ' + label.toLowerCase() + ' account found for that email.');
  }
  return user;
}

function proposalBase(type, summary, intent, note) {
  return {
    type: type,
    status: 'draft',
    dryRun: true,
    executed: false,
    requiresFounderApproval: true,
    summary: summary,
    intent: intent,
    note: note || 'Draft only. Requires founder approval before any action.'
  };
}

function createServer(options) {
  const settings = options || {};
  const token = settings.token !== undefined
    ? String(settings.token || '').trim()
    : founderToken();
  const authorized = settings.authorized === undefined ? Boolean(token) : Boolean(settings.authorized);
  const store = settings.db || db;
  const activePolicy = settings.policy || policy;
  const dataSource = settings.databaseMode || config.databaseMode || 'mock';
  const asOf = settings.asOf || new Date().toISOString();

  function currentPeriod() {
    const date = new Date(asOf);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 7) : date.toISOString().slice(0, 7);
  }

  async function getTrainerPayout(input) {
    const args = input || {};
    const trainer = await readUser(store, args.trainer_email, 'trainer', 'Trainer');
    const period = normalizePeriod(args.period || args.month || currentPeriod());
    const allSessions = array(await store.listSessionsForUser({ role: 'founder' }));
    const sessions = allSessions.filter(function (session) {
      return session.trainerId === trainer.id && inPeriod(session, period);
    });
    const trainers = array(await store.listUsers());
    const attendance = array(await store.listAttendance());

    const payout = payoutService.buildPayout(
      trainer,
      sessions,
      period,
      activePolicy,
      {
        trainers: trainers,
        allSessions: allSessions,
        attendance: attendance,
        provenance: dataSource,
        asOf: asOf
      }
    );

    const timingById = {};
    array(payout.sessionTiming && payout.sessionTiming.sessions).forEach(function (row) {
      timingById[row.sessionId] = row;
    });

    const payload = {
      tool: 'get_trainer_payout',
      readOnly: true,
      executed: false,
      dataSource: dataSource,
      period: period,
      trainer: { id: trainer.id, name: trainer.name, email: trainer.email, role: trainer.role },
      payout: clone(payout),
      sessions: sessions.map(function (session) {
        return {
          id: session.id,
          date: dateKey(session),
          status: session.status || null,
          studentId: session.studentId || null,
          payoutTiming: timingById[session.id] || null
        };
      }),
      note: 'Read-only payout snapshot. No payment, ledger entry or payment link was created.'
    };

    const amount = Number(payout.amount && payout.amount.value) || 0;
    const violations = array(payout.caps && payout.caps.violations);
    if (amount > 0 || violations.length) {
      const currency = (payout.amount && payout.amount.currency) || 'INR';
      payload.proposal = proposalBase(
        'pay',
        amount > 0
          ? 'Draft payout of ' + currency + ' ' + amount + ' for ' + trainer.name + ' for ' + period + '.'
          : 'Draft payroll review for ' + trainer.name + ' for ' + period + '.',
        {
          trainerId: trainer.id,
          period: period,
          amount: amount,
          currency: currency,
          sessionCount: payout.sessionCount,
          reviewReasons: violations.map(function (row) { return row.kind; })
        },
        'Draft only. No payout was executed and no payment link was created.'
      );
    }

    return payload;
  }

  async function getStudentMastery(input) {
    const args = input || {};
    const student = await readUser(store, args.student_email, 'student', 'Student');
    const sessions = array(await store.listSessionsForUser(student)).filter(function (session) {
      return session.studentId === student.id;
    });
    const batches = array(await store.listPracticeBatches()).filter(function (batch) {
      return batch.studentId === student.id;
    });
    const users = array(await store.listUsers());
    const trainers = users.filter(function (user) {
      return user.role === 'trainer' && String(user.status || 'active').toLowerCase() !== 'suspended';
    });

    const numericMastery = Number(student.mastery);
    const mastery = Number.isFinite(numericMastery) ? numericMastery : 0;
    const topic = String(student.batch || 'general-mathematics');
    const gating = masteryGating.checkMasteryGating(student.id, topic, mastery, undefined, 1);
    const completed = sessions.filter(function (session) {
      return CLOSED_SESSION_STATUSES.indexOf(String(session.status || '').toLowerCase()) !== -1;
    }).length;

    const payload = {
      tool: 'get_student_mastery',
      readOnly: true,
      executed: false,
      dataSource: dataSource,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        grade: student.grade === undefined ? null : student.grade,
        batch: student.batch || null
      },
      mastery: {
        overall: mastery,
        byTopic: clone(student.masteryByTopic || {}),
        gating: {
          status: gating.status,
          rule: gating.rule,
          threshold: gating.threshold,
          requiredScore: gating.requiredScore,
          reteachRequired: gating.reteachRequired
        }
      },
      progress: {
        sessions: sessions.map(function (session) {
          return {
            id: session.id,
            date: dateKey(session),
            status: session.status || null,
            topic: session.title || session.topicId || null
          };
        }),
        completedSessionCount: completed,
        sessionsRemaining: student.sessionsRemaining === undefined ? null : Number(student.sessionsRemaining) || 0,
        practiceBatches: batches.map(function (batch) {
          return {
            id: batch.id,
            topic: batch.topic,
            iteration: batch.iteration === undefined ? null : batch.iteration,
            offeredCount: array(batch.questions).length,
            answeredCount: array(batch.attempts).length,
            topicTotal: batch.topicTotal === undefined ? null : batch.topicTotal
          };
        })
      },
      note: 'Read-only mastery snapshot. No batch was allotted and no trainer calendar was changed.'
    };

    if (gating.reteachRequired && trainers.length) {
      payload.proposal = proposalBase(
        'allotment',
        'Draft founder-reviewed trainer allotment/reteach plan for ' + student.name + '.',
        {
          studentId: student.id,
          topic: topic,
          mastery: mastery,
          reason: gating.rule,
          suggestedTrainerIds: trainers.slice(0, 3).map(function (trainer) { return trainer.id; }),
          reviewFields: ['trainerId', 'slots']
        },
        'Draft only. No batch was allotted, no trainer was assigned and no calendar entry was created.'
      );
    }

    return payload;
  }

  async function getTrainerAttendance(input) {
    const args = input || {};
    const trainer = await readUser(store, args.trainer_email, 'trainer', 'Trainer');
    if (args.month === undefined && args.period === undefined) {
      throw toolError('INVALID_MONTH', 'month is required (YYYY-MM).');
    }
    const month = normalizePeriod(args.month || args.period, 'INVALID_MONTH');
    const allSessions = array(await store.listSessionsForUser({ role: 'founder' }));
    const sessions = allSessions.filter(function (session) {
      return session.trainerId === trainer.id && inPeriod(session, month);
    });
    const attendance = array(await store.listAttendance());
    const leaveRequests = array(await store.listLeaveRequests());

    const rowsBySession = {};
    attendance.forEach(function (row) {
      if (row && row.sessionId) rowsBySession[row.sessionId] = row;
    });

    const register = sessions.map(function (session) {
      const row = rowsBySession[session.id] || null;
      return {
        sessionId: session.id,
        date: dateKey(session),
        startsAt: session.startsAt || session.startedAt || session.scheduledAt || null,
        studentId: session.studentId || null,
        sessionStatus: session.status || null,
        attendanceStatus: row ? row.status || null : null,
        effectiveStatus: attendancePolicy.effectiveStudentStatus(session, row ? row.status : null, activePolicy),
        markedAt: row ? row.markedAt || null : null,
        source: row ? 'attendance_records' : 'session_policy'
      };
    });

    const summary = {
      sessionCount: sessions.length,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      unattended: 0,
      unmarked: 0
    };
    register.forEach(function (row) {
      const status = String(row.effectiveStatus || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(summary, status)) summary[status] += 1;
      else summary.unmarked += 1;
    });

    const monthLeaveRequests = leaveRequests.filter(function (request) {
      if (!request) return false;
      const belongs = request.trainerId === trainer.id || request.requestedBy === trainer.id;
      const raw = request.createdAt || request.startAt || request.scheduledAt || request.date;
      const origin = raw ? new Date(raw) : null;
      return belongs && (request.month === month ||
        (origin && !Number.isNaN(origin.getTime()) && origin.toISOString().slice(0, 7) === month));
    });

    const payload = {
      tool: 'get_trainer_attendance',
      readOnly: true,
      executed: false,
      dataSource: dataSource,
      month: month,
      trainer: { id: trainer.id, name: trainer.name, email: trainer.email, role: trainer.role },
      register: register,
      summary: summary,
      leaveRequests: clone(monthLeaveRequests),
      note: 'Read-only attendance snapshot. No attendance record, leave or session was changed.'
    };

    const rescheduleCandidates = register.filter(function (row) {
      const status = String(row.sessionStatus || '').toLowerCase().replace(/[_\s]+/g, '-');
      if (RESCHEDULE_STATUSES.indexOf(status) !== -1) return true;
      return !row.attendanceStatus && CLOSED_SESSION_STATUSES.indexOf(status) !== -1;
    }).map(function (row) { return row.sessionId; });

    if (rescheduleCandidates.length) {
      payload.proposal = proposalBase(
        'reschedule',
        'Draft founder-reviewed reschedule review for ' + rescheduleCandidates.length +
          ' session(s) in ' + month + '.',
        {
          trainerId: trainer.id,
          month: month,
          sessionIds: rescheduleCandidates,
          reviewFields: ['studentId', 'newStartsAt']
        },
        'Draft only. No session was moved, cancelled or re-booked.'
      );
    }

    return payload;
  }

  const handlers = {
    get_trainer_payout: getTrainerPayout,
    get_student_mastery: getStudentMastery,
    get_trainer_attendance: getTrainerAttendance
  };

  return core.createServer({
    token: token,
    authorized: authorized,
    tools: tools,
    handlers: handlers,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: 'Founder read/dry-run tools only. Proposals require approval and are never executed.',
    authCode: 'FOUNDER_TOKEN_REQUIRED',
    authMessage: 'Founder authorization token is required.',
    profile: 'founder'
  });
}

/* Startup fails closed. A missing founder token never reaches tool discovery
 * or tool execution. */
function start() {
  return core.start(SERVER_NAME, [
    { env: 'MCP_FOUNDER_TOKEN', profile: 'founder' },
    { env: 'MCP_FOUNDER_AUTH_TOKEN', profile: 'founder' }
  ], function (options) {
    return createServer({ token: options.token, authorized: options.authorized });
  });
}

const defaultServer = createServer();

module.exports = {
  tools: defaultServer.tools,
  callTool: defaultServer.callTool,
  handleMessage: defaultServer.handleMessage,
  createServer: createServer,
  start: start,
  rpcError: rpcError,
  rpcResult: rpcResult
};

if (require.main === module) start();
