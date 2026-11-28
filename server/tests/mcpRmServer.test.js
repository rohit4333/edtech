/* Contract for the relationship-manager MCP: RM reads, one draft-only pay
 * proposal, and complete absence of founder-owned tools. The db facade runs in
 * mock mode; no network call is made. */

const assert = require('node:assert');
const rmServer = require('../mcp-rm-server');
const db = require('../db');

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

async function call(server, name, args) {
  const response = await server.handleMessage({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: name, arguments: args || {} }
  });
  assert.strictEqual(response.error, undefined, 'tool call has no protocol error: ' + name);
  return response.result.structuredContent;
}

async function main() {
  const closed = rmServer.createServer({ token: '', authorized: false });
  const denied = await closed.handleMessage({ jsonrpc: '2.0', id: 0, method: 'tools/list' });
  equal(denied.error.data.code, 'MCP_RM_TOKEN_REQUIRED', 'discovery is token-gated');

  const actor = await rmServer.resolveActor({});
  equal(actor.role, 'relationship_manager', 'actor is a real seeded manager');
  const server = rmServer.createServer({ token: 'rm-token', authorized: true, actor: actor });
  const list = await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = list.result.tools.map(function (tool) { return tool.name; });
  ok(names.indexOf('get_rm_dashboard') !== -1, 'dashboard tool is exposed');
  ok(names.indexOf('draft_base_rate_change') !== -1, 'draft rate tool is exposed');

  const forbidden = [
    'set_monthly_salary', 'add_penalty', 'revoke_penalty', 'get_admin_settings',
    'patch_admin_settings', 'patch_policy', 'set_founder_gratitude',
    'grant_access', 'issue_password', 'get_lms_planner', 'generate_planner',
    'get_credential', 'reveal_kyc'
  ];
  forbidden.forEach(function (name) {
    equal(names.indexOf(name), -1, 'forbidden tool is absent: ' + name);
  });

  const dashboard = await call(server, 'get_rm_dashboard');
  equal(dashboard.tool, 'get_rm_dashboard', 'dashboard payload is tagged');
  equal(dashboard.executed, false, 'dashboard call executes nothing');
  ok(dashboard.access !== undefined, 'staff access state is returned');

  const trainers = await call(server, 'list_trainers');
  ok(Array.isArray(trainers.people), 'trainer roster is an array');
  equal(JSON.stringify(trainers.people).indexOf('passwordHash'), -1, 'roster has no credential hash');

  const pay = await call(server, 'get_trainer_pay', { trainer_id: 'usr_trainer_001' });
  ok(pay.trainer && pay.trainer.id === 'usr_trainer_001', 'pay view targets the trainer');
  ok(Array.isArray(pay.payouts), 'derived payouts are returned');
  equal(JSON.stringify(pay).indexOf('passwordHash'), -1, 'pay view has no credentials');

  const onboarding = await call(server, 'get_trainer_onboarding', { trainer_id: 'usr_trainer_001' });
  equal(onboarding.masked, true, 'KYC view is always masked');

  const queue = await call(server, 'get_demo_queue', { limit: 5 });
  ok(Array.isArray(queue.demos), 'demo queue is returned');
  equal(/"password"\s*:/.test(JSON.stringify(queue)), false, 'demo queue has no family password field');

  const before = await Promise.resolve(db.findUserById('usr_trainer_001'));
  const draft = await call(server, 'draft_base_rate_change', {
    trainer_id: 'usr_trainer_001', rate: 350
  });
  equal(draft.proposal.status, 'draft', 'rate change is a draft');
  equal(draft.proposal.executed, false, 'rate change was not applied');
  const after = await Promise.resolve(db.findUserById('usr_trainer_001'));
  equal(before.payPerSession, after.payPerSession, 'rate is unchanged in the database');

  const badRate = await server.handleMessage({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'draft_base_rate_change', arguments: { trainer_id: 'usr_trainer_001', rate: -1 } }
  });
  equal(badRate.error.data.code, 'INVALID_RATE', 'invalid rate is refused');

  console.log('mcpRmServer: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
