/* Relationship-manager administration boundary. A manager shares the founder's
   operating view, can grant rather than revoke access, and has one scoped
   credential power: a generated temporary password for a KYC-verified, granted
   trainer. A manager still cannot choose or replace a credential, touch
   founder-set pay, or set an onboarding base rate more than once. No live
   database is used. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const passwordAuth = require('../auth/password');
const founderAdmin = require('../services/founderAdminService');
const onboarding = require('../services/trainerOnboardingService');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

async function rejects(promise, code, label) {
  try {
    await promise;
    ok(false, label + ' (expected ' + code + ')');
  } catch (error) {
    equal(error.code, code, label);
  }
}

const RM = 'relationship_manager';
const DOC = { id: 'rm_test_doc', ref: 'onboarding/rm/doc.png', fileName: 'doc.png', mimeType: 'image/png' };
const KYC = {
  identity: { fullName: 'Meera Test', dateOfBirth: '1992-04-11' },
  personal: { contactNumber: '9000000011', emailId: 'rm.test@mathify.test' },
  bank: { accountHolderName: 'Meera Test', accountNumber: '1234567890', ifscCode: 'HDFC0001234' },
  documents: {
    aadhaar: { number: '123456789012', front: DOC, rear: DOC },
    pan: { number: 'ABCDE1234F', front: DOC, rear: DOC },
    signature: { image: DOC }
  }
};

function unique(seed) {
  return seed + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

async function createTrainer(name, status, extra) {
  const id = unique('usr_rmtrainer');
  await db.insertUser(Object.assign({
    id: id,
    name: name,
    email: unique('rmtrainer') + '@mathify.test',
    role: 'trainer',
    status: status,
    createdAt: new Date().toISOString()
  }, extra || {}));
  return db.findUserById(id);
}

async function main() {
  equal(founderAdmin.ADMIN_ROLES.join(','), 'trainer,relationship_manager,student',
    'admin scope includes founder-authorised managers');

  const active = await createTrainer('Active Trainer', 'active', {
    accessGrantedAt: '2026-01-14T09:00:00.000Z',
    accessGrantedBy: 'usr_founder_001',
    accessGrantedByRole: 'founder',
    rateLockedAt: '2026-01-14T09:00:00.000Z',
    rateSetByRole: 'founder'
  });
  await rejects(founderAdmin.setAccess(active.id, 'suspended', 'usr_rm_001', RM),
    'RM_REVOKE_DENIED', 'a manager cannot suspend an account');
  await rejects(founderAdmin.setPassword(active.id, { password: 'manager-replaced-1' }, 'usr_rm_001', RM),
    'RM_PASSWORD_CHOICE_DENIED', 'a manager cannot choose a password');
  await rejects(founderAdmin.setPassword(active.id, { generated: true }, 'usr_rm_001', RM),
    'KYC_OR_GRANT_REQUIRED', 'a manager cannot issue a password before KYC is on file');
  await rejects(founderAdmin.setBaseRate(active.id, 425, 'usr_rm_001', RM),
    'RM_RATE_LOCKED', 'a manager cannot change an active trainer rate');
  await rejects(founderAdmin.setMonthlySalary('usr_rm_001', 99000, RM),
    'RM_SALARY_LOCKED', 'a manager cannot set a salary');

  const pending = await createTrainer('Pending Trainer', 'pending');
  await onboarding.submit(pending.id, KYC, 'trainer');
  const granted = await founderAdmin.grantAccess(pending.id, 'usr_rm_001', RM);
  equal(granted.person.status, 'active', 'a manager can grant a KYC-verified pending trainer');
  equal(granted.person.accessGrantedByRole, RM, 'the grant records the manager as actor role');
  ok(Boolean(granted.password), 'the first password is returned once for handover');

  const issued = await founderAdmin.setPassword(granted.person.id, { generated: true }, 'usr_rm_001', RM);
  equal(issued.temporaryPassword, 'pending@mathify123',
    'a manager receives the generated firstname@mathify123 trainer password');
  equal(passwordAuth.verifyPassword(issued.temporaryPassword,
    await db.findUserById(granted.person.id)).ok, true,
  'the manager-issued temporary password is the working credential');
  equal(issued.person.passwordIssuedBy, 'usr_rm_001', 'the issued-by id records the manager');
  equal(issued.person.passwordIssuedByRole, RM, 'the issued-by role records the manager');
  equal(issued.person.passwordTemporaryIssued, true, 'the detail view marks a temporary password');
  ok(issued.email === granted.person.email && !/passwordHash|passwordSalt/.test(JSON.stringify(issued)),
    'the handover carries email and one-time password but no credential fields');
  await rejects(founderAdmin.setPassword(granted.person.id,
    { password: 'manager-chosen-1' }, 'usr_rm_001', RM),
  'RM_PASSWORD_CHOICE_DENIED', 'a manager cannot choose even for an approved trainer');

  const ungranted = await createTrainer('Ungranted Trainer', 'pending');
  await rejects(founderAdmin.setPassword(ungranted.id, { generated: true }, 'usr_rm_001', RM),
    'KYC_OR_GRANT_REQUIRED', 'a manager cannot issue a password before an access grant');
  const studentTarget = await db.insertUser({
    id: unique('usr_rmstudent'), name: 'Student Target', email: unique('rmstudent') + '@mathify.test',
    role: 'student', status: 'active', createdAt: new Date().toISOString()
  });
  const managerTarget = await db.insertUser({
    id: unique('usr_rmmanager'), name: 'Manager Target', email: unique('rmmanager') + '@mathify.test',
    role: RM, status: 'active', createdAt: new Date().toISOString()
  });
  const founderTarget = await db.findUserByEmail('founder@mathify.app');
  for (const target of [studentTarget, managerTarget, founderTarget]) {
    await rejects(founderAdmin.setPassword(target.id, { generated: true }, 'usr_rm_001', RM),
      target.role === 'founder' ? 'FOUNDER_PASSWORD_LOCKED' : 'RM_PASSWORD_TARGET_DENIED',
      'a manager cannot issue a password to a ' + target.role);
  }

  const onboardingTrainer = await createTrainer('Rate Trainer', 'pending');
  const firstRate = await founderAdmin.setBaseRate(onboardingTrainer.id, 375, 'usr_rm_001', RM);
  equal(firstRate.payPerSession, 375, 'a manager can set the base rate once while pending');
  equal(firstRate.rateSetByRole, RM, 'the onboarding rate records the manager role');
  ok(Boolean(firstRate.rateLockedAt), 'the first manager-set rate locks immediately');
  await rejects(founderAdmin.setBaseRate(onboardingTrainer.id, 390, 'usr_rm_001', RM),
    'RM_RATE_LOCKED', 'a second manager base-rate edit is refused');

  const founderRateTrainer = await createTrainer('Founder Rate Trainer', 'pending');
  await founderAdmin.setBaseRate(founderRateTrainer.id, 360, 'usr_founder_001', 'founder');
  await rejects(founderAdmin.setBaseRate(founderRateTrainer.id, 365, 'usr_rm_001', RM),
    'RM_RATE_LOCKED', 'a manager cannot replace a founder-set pending rate');

  const penaltyTrainer = await createTrainer('Penalty Trainer', 'active');
  const added = await founderAdmin.addPenalty(penaltyTrainer.id, {
    amount: 250, reason: 'Late cancellation without notice'
  }, 'usr_rm_001', RM);
  equal(added.decidedByRole, RM, 'a manager can adhere a penalty with a tagged decision');
  const revoked = await founderAdmin.revokePenalty(added.id, 'usr_rm_001', RM);
  equal(revoked.status, 'revoked', 'a manager can revoke a penalty with an audit trail');
  equal(revoked.revokedByRole, RM, 'penalty revocation records the manager role');

  await rejects(founderAdmin.create('relationship_manager', {
    name: 'Self Manager', email: unique('self') + '@mathify.test'
  }, RM), 'RM_SELF_PROVISION_DENIED', 'a manager cannot create another manager');

  const trainerList = await founderAdmin.list('trainer');
  ok(trainerList.some(function (person) { return person.id === active.id; }),
    'a manager-facing list includes named trainer accounts');
  ok(!/passwordHash|passwordSalt/.test(JSON.stringify(trainerList)),
    'manager lists never expose credential fields');
  const trainerDetail = await founderAdmin.detail('trainer', penaltyTrainer.id, RM);
  equal(trainerDetail.person.id, penaltyTrainer.id, 'a manager can read full trainer detail');
  ok(Array.isArray(trainerDetail.penalties) && Array.isArray(trainerDetail.sessions),
    'manager trainer detail includes operational records');
  const studentDetail = await founderAdmin.detail('student', 'usr_student_001', RM);
  equal(studentDetail.person.role, 'student', 'a manager can read student detail');
  ok(!/passwordHash|passwordSalt/.test(JSON.stringify(trainerDetail) + JSON.stringify(studentDetail)),
    'manager detail never exposes credential fields');

  const managerId = unique('usr_rm');
  await db.insertUser({
    id: managerId,
    name: 'Tag Manager',
    email: unique('tagmanager') + '@mathify.test',
    role: RM,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  const submitted = await onboarding.submit(managerId, KYC, RM);
  equal(submitted.status, 'submitted', 'manager onboarding submits through the shared KYC flow');
  equal(submitted.masked, false, 'manager KYC view is unmasked for the account owner');
  const updated = await onboarding.updatePersonal(managerId, {
    personal: { contactNumber: '9000000099' }
  }, RM);
  equal(updated.personal.contactNumber, '9000000099', 'manager can edit personal KYC details');
  const events = db.recentSessionEvents(200).filter(function (event) {
    return event.payload && event.payload.targetId === managerId;
  });
  ok(events.some(function (event) {
    return event.event === 'trainer.onboarding.submitted' && event.payload.actorRole === RM;
  }), 'manager KYC submission is tagged with the manager role');
  ok(events.some(function (event) {
    return event.event === 'trainer.onboarding.personal.updated' && event.payload.actorRole === RM;
  }), 'manager KYC edit is tagged with the manager role');

  /* Route-level proof: the temporary issue goes through adminRole, is written
     to the founder-visible audit with the manager as actor, and never carries
     the plain password into that audit. */
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    async function request(method, route, body, token) {
      const headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = 'Bearer ' + token;
      const response = await fetch(base + route, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch (error) { data = text; }
      return { status: response.status, body: data, text: text };
    }

    const founderLogin = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app', password: 'mathify-demo'
    });
    const rmLogin = await request('POST', '/api/auth/login', {
      email: 'rm@mathify.app', password: 'mathify-demo'
    });
    ok(founderLogin.status === 200 && rmLogin.status === 200,
      'founder and manager can sign in for the audit check');
    const route = '/api/admin/people/' + encodeURIComponent(granted.person.id) + '/password';
    const chosen = await request('PATCH', route, { password: 'manager-chosen-http' }, rmLogin.body.token);
    ok(chosen.status === 403 && chosen.body.error === 'RM_PASSWORD_CHOICE_DENIED',
      'the route refuses a manager-chosen password');
    const issuedHttp = await request('PATCH', route, { generated: true }, rmLogin.body.token);
    ok(issuedHttp.status === 200 && typeof issuedHttp.body.temporaryPassword === 'string' &&
      issuedHttp.body.person.passwordIssuedByRole === RM,
    'the route issues a generated temporary password for a granted trainer');
    ok(!/passwordHash|passwordSalt/.test(issuedHttp.text),
      'the temporary-password response carries no credential fields');
    const audit = await request('GET', '/api/admin/audit?role=relationship_manager&limit=20',
      undefined, founderLogin.body.token);
    const auditRow = audit.status === 200 && audit.body.entries.find(function (row) {
      return row.action === 'password.temp_issued' && row.targetId === granted.person.id;
    });
    ok(Boolean(auditRow) && auditRow.actorRole === RM &&
      String(auditRow.detail.generated) === 'true' &&
      String(auditRow.detail.temporaryPasswordIssued) === 'true',
    'the founder audit contains the manager actor for password.temp_issued');
    ok(!JSON.stringify(audit.body).includes(issuedHttp.body.temporaryPassword),
      'the founder audit never contains the one-time password value');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('relationshipManager: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
