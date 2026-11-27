/* Relationship-manager administration boundary. A manager shares the founder's
   operating view, can grant rather than revoke access, and has one scoped
   credential power: a generated temporary password for a KYC-verified, granted
   trainer. A manager may edit the shared demo/regular trainer pay rate, but
   cannot choose or replace a credential, set salary/penalties, change founder
   settings or the gratitude credit. No live database is used. */

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
  const managerActiveRate = await founderAdmin.setBaseRate(active.id, 425, 'usr_rm_001', RM);
  equal(managerActiveRate.payPerSession, 425, 'a manager can change an active trainer rate');
  equal(managerActiveRate.rateSetByRole, RM, 'the active rate edit records the manager role');
  await rejects(founderAdmin.setMonthlySalary('usr_rm_001', 99000, RM),
    'RM_SALARY_LOCKED', 'a manager cannot set a salary');

  const pending = await createTrainer('Pending Trainer', 'pending');
  const trainerKyc = await onboarding.submit(pending.id, KYC, 'trainer');

  /* A relationship manager registers and completes KYC through the same
     service, with the same document set, lock rules and editable sections. */
  const pendingManager = await db.insertUser({
    id: unique('usr_rmself'), name: 'Pending Manager', email: unique('rmself') + '@mathify.test',
    role: RM, status: 'pending', createdAt: new Date().toISOString()
  });
  const managerKyc = await onboarding.submit(pendingManager.id, KYC, RM);
  equal(managerKyc.status, trainerKyc.status,
    'manager and trainer KYC records enter the same review state');
  equal(Object.keys(managerKyc.locked).sort().join(','),
    Object.keys(trainerKyc.locked).sort().join(','),
    'manager and trainer KYC lock the same identity and document fields');
  equal(managerKyc.editable.join(','), trainerKyc.editable.join(','),
    'manager and trainer KYC expose the same editable sections');
  equal(managerKyc.documents.aadhaar.number, trainerKyc.documents.aadhaar.number,
    'manager and trainer require the same Aadhaar card data');
  equal(managerKyc.documents.pan.number, trainerKyc.documents.pan.number,
    'manager and trainer require the same PAN card data');
  ok(Boolean(managerKyc.documents.signature.image && trainerKyc.documents.signature.image),
    'manager and trainer require the same signature document');

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
  equal(firstRate.payPerSession, 375, 'a manager can set the base rate while pending');
  equal(firstRate.rateSetByRole, RM, 'the onboarding rate records the manager role');
  ok(!firstRate.rateLockedAt, 'a manager-set rate does not create a founder lock');
  const secondRate = await founderAdmin.setBaseRate(onboardingTrainer.id, 390, 'usr_rm_001', RM);
  equal(secondRate.payPerSession, 390, 'a manager can revise a pending rate');
  equal(secondRate.rateSetByRole, RM, 'the revision stays tagged to the manager');

  const founderRateTrainer = await createTrainer('Founder Rate Trainer', 'pending');
  await founderAdmin.setBaseRate(founderRateTrainer.id, 360, 'usr_founder_001', 'founder');
  const managerReplacedRate = await founderAdmin.setBaseRate(founderRateTrainer.id, 365, 'usr_rm_001', RM);
  equal(managerReplacedRate.payPerSession, 365, 'a manager can replace a founder-set pending rate');
  equal(managerReplacedRate.rateSetByRole, RM, 'the replacement records the manager role');

  const penaltyTrainer = await createTrainer('Penalty Trainer', 'active');
  await rejects(founderAdmin.addPenalty(penaltyTrainer.id, {
    amount: 250, reason: 'Late cancellation without notice'
  }, 'usr_rm_001', RM),
  'RM_PENALTY_DENIED', 'a manager cannot adhere a penalty or fine');
  const added = await founderAdmin.addPenalty(penaltyTrainer.id, {
    amount: 250, reason: 'Late cancellation without notice'
  }, 'usr_founder_001', 'founder');
  equal(added.decidedByRole, 'founder', 'the founder penalty records the owner decision');
  await rejects(founderAdmin.revokePenalty(added.id, 'usr_rm_001', RM),
    'RM_PENALTY_DENIED', 'a manager cannot revoke a penalty or fine');
  const revoked = await founderAdmin.revokePenalty(added.id, 'usr_founder_001', 'founder');
  equal(revoked.status, 'revoked', 'the founder revokes a penalty with an audit trail');
  equal(revoked.revokedByRole, 'founder', 'penalty revocation records the founder role');

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

    const rateRoute = '/api/admin/people/' + encodeURIComponent(active.id) + '/base-rate';
    const rmRate = await request('PATCH', rateRoute, { rate: 430 }, rmLogin.body.token);
    ok(rmRate.status === 200 && rmRate.body.person.payPerSession === 430 &&
      rmRate.body.person.rateSetByRole === RM,
    'the route lets a manager update the shared demo/regular rate for an active trainer');
    const rateAudit = await request('GET', '/api/admin/audit?role=relationship_manager&limit=50',
      undefined, founderLogin.body.token);
    const rateAuditRow = rateAudit.status === 200 && rateAudit.body.entries.find(function (row) {
      return row.action === 'base_rate.set' && row.targetId === active.id &&
        String(row.detail.rate) === '430';
    });
    ok(Boolean(rateAuditRow) && rateAuditRow.actorRole === RM,
      'the founder audit records base_rate.set with the manager actor');

    const salaryRoute = '/api/admin/people/' + encodeURIComponent('usr_rm_001') + '/monthly-salary';
    const rmSalary = await request('PATCH', salaryRoute, { amount: 99000 }, rmLogin.body.token);
    ok(rmSalary.status === 403 && rmSalary.body.error === 'FORBIDDEN',
      'the salary route remains founder-only');
    const penaltyRoute = '/api/admin/people/' + encodeURIComponent(active.id) + '/penalties';
    const rmPenalty = await request('POST', penaltyRoute, {
      amount: 250, reason: 'Manager penalty attempt'
    }, rmLogin.body.token);
    ok(rmPenalty.status === 403 && rmPenalty.body.error === 'FORBIDDEN',
      'penalty and fine decisions remain founder-only');
    const revokeRoute = '/api/admin/penalties/' + encodeURIComponent('unauthorized_penalty') + '/revoke';
    const rmRevoke = await request('PATCH', revokeRoute, {}, rmLogin.body.token);
    ok(rmRevoke.status === 403 && rmRevoke.body.error === 'FORBIDDEN',
      'penalty revocation remains founder-only');
    const settingsRoute = '/api/admin/settings';
    const rmSettings = await request('GET', settingsRoute, undefined, rmLogin.body.token);
    ok(rmSettings.status === 403 && rmSettings.body.error === 'FORBIDDEN',
      'founder settings remain founder-only');
    const rmPolicy = await request('PATCH', settingsRoute,
      { section: 'policy', values: { 'quiz.unlockThreshold': 85 } }, rmLogin.body.token);
    ok(rmPolicy.status === 403 && rmPolicy.body.error === 'FORBIDDEN',
      'policy settings remain founder-only');
    const rmGratitude = await request('PATCH', settingsRoute,
      { section: 'policy', values: { 'payout.founderGratitude.amount': 5000 } }, rmLogin.body.token);
    ok(rmGratitude.status === 403 && rmGratitude.body.error === 'FORBIDDEN',
      'the gratitude credit remains founder-only');

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
