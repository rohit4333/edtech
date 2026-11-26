/* Contract for the founder stdio MCP server: three read tools, no mutation
 * tools, token-gated discovery/calls, dry-run proposals and zero db writes.
 * The db facade is fully stubbed; no network, env or child process is used. */

const assert = require('node:assert');
const mcp = require('../mcp-server');

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

const MONTH = '2026-11';
const TRAINER_ID = 'usr_trainer_001';
const STUDENT_ID = 'usr_student_001';
const MASTERED_ID = 'usr_student_002';
const TRAINER_EMAIL = 'trainer@example.test';
const STUDENT_EMAIL = 'student@example.test';
const MASTERED_EMAIL = 'mastered@example.test';

const users = [
  { id: 'usr_founder_001', name: 'Founder', email: 'founder@mathify.app', role: 'founder' },
  {
    id: TRAINER_ID,
    name: 'Trainer One',
    email: TRAINER_EMAIL,
    role: 'trainer',
    status: 'active',
    payPerSession: 350,
    maxHoursPerDay: 6,
    maxSessionsPerDay: 6,
    attendanceBonusStreak: 0
  },
  {
    id: STUDENT_ID,
    name: 'Student One',
    email: STUDENT_EMAIL,
    role: 'student',
    grade: '7',
    batch: 'Ratios',
    mastery: 62,
    sessionsRemaining: 5,
    masteryByTopic: { ratios: 62 }
  },
  {
    id: MASTERED_ID,
    name: 'Mastered Student',
    email: MASTERED_EMAIL,
    role: 'student',
    batch: 'Fractions',
    mastery: 95,
    sessionsRemaining: 2
  }
];

const sessions = [
  {
    id: 'ses_1',
    trainerId: TRAINER_ID,
    studentId: STUDENT_ID,
    title: 'Ratios · Lesson 15',
    status: 'ended',
    startedAt: '2026-11-03T10:00:00.000Z',
    scheduledAt: '2026-11-03T10:00:00.000Z',
    durationMinutes: 50
  },
  {
    id: 'ses_2',
    trainerId: TRAINER_ID,
    studentId: STUDENT_ID,
    status: 'cancelled',
    scheduledAt: '2026-11-10T10:00:00.000Z',
    cancelledAt: '2026-11-08T10:00:00.000Z',
    cancelledBy: 'trainer'
  }
];

const attendance = [
  {
    id: 'att_1',
    sessionId: 'ses_1',
    trainerId: TRAINER_ID,
    studentId: STUDENT_ID,
    status: 'present',
    markedAt: '2026-11-03T10:50:00.000Z'
  }
];

const practiceBatches = [
  {
    id: 'practice_1',
    studentId: STUDENT_ID,
    topic: 'Ratios',
    iteration: 0,
    questions: [{ id: 'q1' }, { id: 'q2' }],
    attempts: [{ questionId: 'q1' }, { questionId: 'q2' }],
    topicTotal: 10
  }
];

const writes = [];
const READ_METHODS = new Set([
  'findUserByEmail',
  'listSessionsForUser',
  'listUsers',
  'listAttendance',
  'listPracticeBatches',
  'listLeaveRequests'
]);

const readStore = {
  findUserByEmail: async function (email) {
    const normalized = String(email || '').toLowerCase();
    const found = users.find(function (user) { return user.email.toLowerCase() === normalized; });
    return found ? JSON.parse(JSON.stringify(found)) : null;
  },
  listSessionsForUser: async function (user) {
    if (!user) return [];
    if (user.role === 'founder') return JSON.parse(JSON.stringify(sessions));
    if (user.id === TRAINER_ID) return JSON.parse(JSON.stringify(sessions));
    return JSON.parse(JSON.stringify(sessions.filter(function (session) {
      return session.studentId === user.id;
    })));
  },
  listUsers: async function () { return JSON.parse(JSON.stringify(users)); },
  listAttendance: async function () { return JSON.parse(JSON.stringify(attendance)); },
  listPracticeBatches: async function () { return JSON.parse(JSON.stringify(practiceBatches)); },
  listLeaveRequests: async function () { return []; }
};

/* Any write-shaped access is recorded and refused. Unknown reads are refused
 * too, so a new hidden write call cannot slip through this test. */
const fakeDb = new Proxy(readStore, {
  get: function (target, property) {
    const name = String(property);
    if (READ_METHODS.has(name)) return target[name];
    if (/^(save|update|upsert|insert|record|add|delete|patch|append|create|remove|set|submit|send|pay|allot|reschedule|seed)/i.test(name)) {
      writes.push(name);
      throw new Error('write method invoked: ' + name);
    }
    throw new Error('unexpected db method: ' + name);
  }
});

async function main() {
  equal(mcp.tools.length, 3, 'exactly three tools are advertised');
  assert.deepStrictEqual(mcp.tools.map(function (tool) { return tool.name; }), [
    'get_trainer_payout',
    'get_student_mastery',
    'get_trainer_attendance'
  ]);
  checks += 1;
  ok(mcp.tools.every(function (tool) { return tool.name.indexOf('get_') === 0; }),
    'every tool is a get_ read tool');
  ok(!mcp.tools.some(function (tool) {
    return /^(pay|allot|reschedule|create|update|delete|send|link)/i.test(tool.name);
  }), 'no write or payment-link tool exists');

  const server = mcp.createServer({
    token: 'test-founder-token',
    db: fakeDb,
    databaseMode: 'mock',
    asOf: '2026-11-26T00:00:00.000Z'
  });
  equal(server.isAuthorized(), true, 'a configured founder token authorizes handlers');

  const init = await server.handleMessage({ jsonrpc: '2.0', id: 0, method: 'initialize' });
  ok(init.result && init.result.serverInfo.name === 'mathify-founder-read-dryrun',
    'initialize returns server info');
  equal(init.error, undefined, 'initialize has no error');

  const list = await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  equal(list.error, undefined, 'tools/list succeeds with a token');
  equal(list.result.tools.length, 3, 'tools/list returns the three read tools');

  const payoutResponse = await server.handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'get_trainer_payout', arguments: { trainer_email: TRAINER_EMAIL, month: MONTH } }
  });
  equal(payoutResponse.error, undefined, 'payout tool call succeeds');
  equal(payoutResponse.result.content[0].type, 'text', 'tools/call carries text content');
  const payout = payoutResponse.result.structuredContent;
  equal(payout.readOnly, true, 'payout result is marked read-only');
  equal(payout.executed, false, 'payout result is marked not executed');
  equal(payout.dataSource, 'mock', 'payout result reports the mock data source');
  equal(payout.period, MONTH, 'payout result uses the requested month');
  equal(payout.trainer.id, TRAINER_ID, 'payout result is scoped to the requested trainer');
  equal(payout.sessions.length, 2, 'payout result includes the trainer’s sessions');
  ok(payout.payout.amount.value > 0, 'payout result includes a calculated amount');
  equal(payout.proposal.type, 'pay', 'a payable statement drafts a pay proposal');
  equal(payout.proposal.requiresFounderApproval, true, 'pay proposal requires founder approval');
  equal(payout.proposal.dryRun, true, 'pay proposal is a dry run');
  equal(payout.proposal.executed, false, 'pay proposal was not executed');

  const mastery = await server.callTool('get_student_mastery', { student_email: STUDENT_EMAIL });
  equal(mastery.readOnly, true, 'mastery result is marked read-only');
  equal(mastery.executed, false, 'mastery result is marked not executed');
  equal(mastery.dataSource, 'mock', 'mastery result reports the mock data source');
  equal(mastery.student.id, STUDENT_ID, 'mastery result is scoped to the requested student');
  equal(mastery.mastery.overall, 62, 'mastery result reports overall mastery');
  equal(mastery.mastery.gating.reteachRequired, true, 'mastery result reports the gating decision');
  equal(mastery.progress.practiceBatches.length, 1, 'mastery result includes practice progress');
  equal(mastery.proposal.type, 'allotment', 'a blocked gate drafts an allotment proposal');
  equal(mastery.proposal.requiresFounderApproval, true, 'allotment proposal requires founder approval');
  equal(mastery.proposal.dryRun, true, 'allotment proposal is a dry run');

  const mastered = await server.callTool('get_student_mastery', { student_email: MASTERED_EMAIL });
  ok(!('proposal' in mastered), 'no proposal when the mastery gate is already cleared');

  const register = await server.callTool('get_trainer_attendance', {
    trainer_email: TRAINER_EMAIL,
    month: MONTH
  });
  equal(register.readOnly, true, 'attendance result is marked read-only');
  equal(register.executed, false, 'attendance result is marked not executed');
  equal(register.dataSource, 'mock', 'attendance result reports the mock data source');
  equal(register.month, MONTH, 'attendance result uses the requested month');
  equal(register.trainer.id, TRAINER_ID, 'attendance result is scoped to the requested trainer');
  equal(register.register.length, 2, 'attendance result includes the month’s sessions');
  equal(register.summary.sessionCount, 2, 'attendance result summarizes the month');
  equal(register.proposal.type, 'reschedule', 'a disrupted month drafts a reschedule proposal');
  equal(register.proposal.requiresFounderApproval, true, 'reschedule proposal requires founder approval');
  equal(register.proposal.dryRun, true, 'reschedule proposal is a dry run');

  const quietMonth = await server.callTool('get_trainer_attendance', {
    trainer_email: TRAINER_EMAIL,
    month: '2026-10'
  });
  ok(!('proposal' in quietMonth), 'no proposal when no session needs rescheduling');

  const unauthenticated = mcp.createServer({
    token: '',
    db: fakeDb,
    databaseMode: 'mock',
    asOf: '2026-11-26T00:00:00.000Z'
  });
  equal(unauthenticated.isAuthorized(), false, 'an empty founder token is refused');
  const deniedList = await unauthenticated.handleMessage({
    jsonrpc: '2.0', id: 3, method: 'tools/list'
  });
  equal(deniedList.error.code, -32001, 'tools/list is refused without a token');
  equal(deniedList.error.data.code, 'FOUNDER_TOKEN_REQUIRED', 'refusal carries a stable code');
  const deniedCall = await unauthenticated.handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_trainer_payout', arguments: { trainer_email: TRAINER_EMAIL } }
  });
  equal(deniedCall.error.code, -32001, 'tools/call is refused without a token');
  await assert.rejects(function () {
    return unauthenticated.callTool('get_trainer_payout', { trainer_email: TRAINER_EMAIL });
  }, function (error) {
    return error.code === 'FOUNDER_TOKEN_REQUIRED';
  });
  checks += 1;
  const openInit = await unauthenticated.handleMessage({ jsonrpc: '2.0', id: 5, method: 'initialize' });
  ok(openInit.result, 'initialize remains available for protocol handshake');

  const unknownTool = await server.handleMessage({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'execute_payment', arguments: {} }
  });
  equal(unknownTool.error.code, -32602, 'unknown tool is a JSON-RPC invalid params error');
  equal(unknownTool.error.data.code, 'UNKNOWN_TOOL', 'unknown tool carries a stable code');

  const unknownMethod = await server.handleMessage({
    jsonrpc: '2.0', id: 7, method: 'resources/read'
  });
  equal(unknownMethod.error.code, -32601, 'unknown method is a JSON-RPC method-not-found error');

  const invalidRequest = await server.handleMessage({ jsonrpc: '2.0', id: 8, method: 42 });
  equal(invalidRequest.error.code, -32600, 'malformed message is an invalid request');

  equal(writes.length, 0, 'no db write method was invoked by any tool');
  console.log('mcpServer tests passed (' + checks + ' checks)');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
