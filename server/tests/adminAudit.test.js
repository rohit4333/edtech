/* Append-only admin audit contract. Only allowlisted detail fields are written
   to the service-side JSONL file; credentials and tokens are never recorded. */

const assert = require('assert');
const adminAudit = require('../services/adminAuditService');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

async function main() {
  equal(adminAudit.PUBLIC_PATH, 'server/logs/admin-actions.jsonl',
    'the audit file path is reported as a service-side path');

  const marker = 'audit.contract_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const entry = adminAudit.record({
    actorRole: 'relationship_manager',
    actorId: 'usr_rm_contract',
    actorName: 'Audit Manager',
    action: marker,
    targetType: 'trainer',
    targetId: 'usr_trainer_contract',
    targetName: 'Audit Trainer',
    detail: {
      rate: 375,
      amount: 250,
      reason: 'Contract audit',
      generated: true,
      password: 'must-never-be-written',
      passwordHash: 'must-never-be-written',
      token: 'must-never-be-written'
    }
  });
  equal(entry.actorRole, 'relationship_manager', 'the acting role is recorded');
  equal(entry.targetName, 'Audit Trainer', 'the named target is recorded');
  equal(entry.detail.rate, '375', 'numeric allowlisted detail is stored as safe text');
  equal(entry.detail.password, undefined, 'plain passwords are omitted from detail');
  equal(entry.detail.passwordHash, undefined, 'password hashes are omitted from detail');
  equal(entry.detail.token, undefined, 'tokens are omitted from detail');
  ok(!/must-never-be-written/.test(JSON.stringify(entry)), 'no secret value reaches the audit entry');

  const managerRows = adminAudit.list({ role: 'relationship_manager', limit: 500 });
  const recorded = managerRows.entries.find(function (row) { return row.action === marker; });
  ok(Boolean(recorded), 'a manager action is readable through the role filter');
  equal(managerRows.logFile, adminAudit.PUBLIC_PATH, 'the list response names the audit file');
  const founderRows = adminAudit.list({ role: 'founder', limit: 500 });
  ok(!founderRows.entries.some(function (row) { return row.action === marker; }),
    'role filtering excludes another role’s actions');
  ok(managerRows.entries.length <= 500, 'list results are capped at 500 entries');

  console.log('adminAudit: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
