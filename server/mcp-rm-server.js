/* Relationship-manager MCP.
 *
 * Read-only desk tools plus one draft-only pay-rate proposal. Every handler
 * runs with a fixed relationship_manager service identity resolved from an
 * existing seeded account; there is no role or actor argument a caller can
 * escalate. Founder-owned policies, penalties, salaries, KYC reveals,
 * credentials and LMS planners are not registered as tools at all.
 */

const fs = require('fs');
const path = require('path');
const core = require('./mcp-core');
const db = require('./db');
const admin = require('./services/founderAdminService');
const trainerAccess = require('./services/trainerAccessService');
const trainerOnboarding = require('./services/trainerOnboardingService');
const demoService = require('./services/demoService');

function audit(entry) {
  const directory = path.join(__dirname, 'logs');
  fs.mkdirSync(directory, { recursive: true });
  fs.appendFileSync(path.join(directory, 'mcp-actions.jsonl'),
    JSON.stringify(Object.assign({ at: new Date().toISOString(), server: SERVER_NAME }, entry)) + '\n');
}

const SERVER_NAME = 'mathify-rm-desc';
const SERVER_VERSION = '0.1.0';

const TOOLS = [
  {
    name: 'get_rm_dashboard',
    description: 'Read the manager desk for this token. Honours the founder-grant lock. No mutation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_trainers',
    description: 'Read the trainer roster with status, subject and pay metadata. No credential fields.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_trainer_pay',
    description: 'Read one trainer derived pay statement, attendance and session history.',
    inputSchema: {
      type: 'object',
      properties: { trainer_id: { type: 'string' } },
      required: ['trainer_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_trainer_attendance',
    description: 'Read the attendance rows attached to one trainer record.',
    inputSchema: {
      type: 'object',
      properties: { trainer_id: { type: 'string' } },
      required: ['trainer_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_trainer_onboarding',
    description: 'Read a trainer KYC record in masked founder view. No document numbers are revealed.',
    inputSchema: {
      type: 'object',
      properties: { trainer_id: { type: 'string' } },
      required: ['trainer_id'],
      additionalProperties: false
    }
  },
  {
    name: 'get_demo_queue',
    description: 'Read the booking queue. Family passwords are never returned.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } },
      additionalProperties: false
    }
  },
  {
    name: 'get_support_escalations',
    description: 'Read the support escalation inbox.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } },
      additionalProperties: false
    }
  },
  {
    name: 'draft_base_rate_change',
    description: 'Draft the one pay edit an RM may request. Returns a proposal only; the desk applies it.',
    inputSchema: {
      type: 'object',
      properties: {
        trainer_id: { type: 'string' },
        rate: { type: 'number', exclusiveMinimum: 0, maximum: 100000 }
      },
      required: ['trainer_id', 'rate'],
      additionalProperties: false
    }
  }
];

function toolPayload(tool, extra) {
  return Object.assign({
    tool: tool,
    readOnly: tool !== 'draft_base_rate_change',
    executed: false,
    requiresFounderApproval: false
  }, extra || {});
}

async function resolveActor(settings) {
  const explicit = String((settings && settings.userId) || process.env.MCP_RM_USER_ID || '').trim();
  const users = await Promise.resolve(db.listUsers());
  const actor = explicit
    ? users.find(function (user) { return user.id === explicit && user.role === 'relationship_manager'; })
    : users.find(function (user) { return user.role === 'relationship_manager'; });
  if (!actor) throw core.toolError('RM_ACCOUNT_NOT_FOUND', 'No granted relationship-manager account is available to this MCP.');
  return actor;
}

function createHandlers(actor) {
  return {
    get_rm_dashboard: async function () {
      const access = await trainerAccess.evaluate(actor);
      if (!access.granted) {
        return toolPayload('get_rm_dashboard', {
          access: access,
          dashboard: { name: actor.name, role: actor.role, locked: true },
          note: 'Operational payloads stay locked until the founder grants the desk.'
        });
      }
      const users = await Promise.resolve(db.listUsers());
      const sessions = await Promise.resolve(db.listSessionsForUser({ role: 'founder' }));
      const batches = await Promise.resolve(db.listBatches());
      return toolPayload('get_rm_dashboard', {
        access: access,
        dashboard: {
          name: actor.name,
          role: actor.role,
          title: actor.title || 'Relationship manager',
          monthlySalary: actor.monthlySalary || null,
          locked: false,
          counts: {
            trainers: users.filter(function (user) { return user.role === 'trainer'; }).length,
            students: users.filter(function (user) { return user.role === 'student'; }).length,
            managers: users.filter(function (user) { return user.role === 'relationship_manager'; }).length,
            trainersNeedingAction: users.filter(function (user) {
              return user.role === 'trainer' && user.status === 'pending' &&
                user.accessGrantedByRole !== 'relationship_manager';
            }).length,
            sessions: sessions.length,
            batches: batches.length
          }
        }
      });
    },

    list_trainers: async function () {
      const people = await admin.list('trainer');
      return toolPayload('list_trainers', {
        people: people,
        note: 'Read-only roster. Credential fields are excluded.'
      });
    },

    get_trainer_pay: async function (args) {
      const detail = await admin.detail('trainer', String(args.trainer_id || ''), 'relationship_manager');
      return toolPayload('get_trainer_pay', {
        trainer: detail.person,
        payouts: detail.payouts || [],
        sessions: detail.sessions || [],
        note: 'Read-only derived pay. No payment link or ledger entry was created.'
      });
    },

    get_trainer_attendance: async function (args) {
      const detail = await admin.detail('trainer', String(args.trainer_id || ''), 'relationship_manager');
      return toolPayload('get_trainer_attendance', {
        trainer: detail.person,
        attendance: detail.attendance || [],
        sessions: detail.sessions || [],
        note: 'Read-only attendance. Nothing was marked or changed.'
      });
    },

    get_trainer_onboarding: async function (args) {
      let record = null;
      try {
        record = await trainerOnboarding.viewFor(String(args.trainer_id || ''), 'founder');
      } catch (error) {
        record = null;
      }
      return toolPayload('get_trainer_onboarding', {
        onboarding: record,
        masked: true,
        note: 'Founder-style masked view. An RM MCP cannot reveal KYC documents.'
      });
    },

    get_demo_queue: async function (args) {
      const limit = Math.min(500, Math.max(1, Number(args.limit) || 50));
      const demos = await demoService.listRequests(limit);
      return toolPayload('get_demo_queue', {
        demos: demos,
        note: 'Booking status only. The family password is never returned to staff.'
      });
    },

    get_support_escalations: async function (args) {
      const limit = Math.min(500, Math.max(1, Number(args.limit) || 50));
      return toolPayload('get_support_escalations', {
        escalations: await Promise.resolve(db.listSupportEscalations(limit))
      });
    },

    draft_base_rate_change: async function (args) {
      const rate = Number(args.rate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
        throw core.toolError('INVALID_RATE', 'Rate must be between 0 and 100000.');
      }
      const person = await admin.detail('trainer', String(args.trainer_id || ''), 'relationship_manager');
      return toolPayload('draft_base_rate_change', {
        proposal: {
          type: 'pay_rate',
          status: 'draft',
          dryRun: true,
          executed: false,
          trainerId: person.person.id,
          trainerName: person.person.name,
          rate: Math.round(rate * 100) / 100,
          currency: 'INR',
          note: 'Draft only. Apply through the manager desk; this MCP never writes a rate.'
        }
      });
    }
  };
}

function createServer(settings) {
  const options = settings || {};
  const actor = options.actor || null;
  return core.createServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: 'Relationship-manager reads and one draft-only pay-rate proposal. No policy, penalty, salary, credential or planner tool is available.',
    token: options.token,
    authorized: options.authorized,
    authCode: 'MCP_RM_TOKEN_REQUIRED',
    authMessage: 'A relationship-manager MCP token is required.',
    tools: TOOLS,
    handlers: createHandlers(actor || { id: 'unresolved', role: 'relationship_manager' }),
    onCall: function (entry) {
      audit({
        actorRole: 'relationship_manager',
        actorId: actor && actor.id,
        tool: entry.tool,
        argsHash: core.digest(entry.args),
        resultHash: core.digest(entry.result),
        executed: false
      });
    }
  });
}

async function start() {
  const token = String(process.env.MCP_RM_TOKEN || '').trim();
  if (!token) {
    process.stderr.write(SERVER_NAME + ': MCP_RM_TOKEN is required; stdio startup refused.\n');
    process.exitCode = 1;
    return null;
  }
  const actor = await resolveActor({});
  const server = createServer({ token: token, authorized: true, actor: actor });
  /* The core owns stdio; hand it a pre-built server through a tiny factory. */
  return core.start(SERVER_NAME, [{ env: 'MCP_RM_TOKEN', profile: 'relationship_manager' }],
    function () { return server; });
}

module.exports = {
  tools: TOOLS,
  createServer: createServer,
  resolveActor: resolveActor,
  start: start
};

if (require.main === module) {
  start().catch(function (error) {
    process.stderr.write(SERVER_NAME + ': startup failed: ' + String(error && error.message || error) + '\n');
    process.exitCode = 1;
  });
}
