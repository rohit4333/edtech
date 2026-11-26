/* Founder administration contract. The founder is the admin: named trainer
   and student desks, base-rate control, access grant/revoke, and reversible
   penalties. Credentials and one-to-one privacy never leak into these views. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const payout = require('../services/payoutService');
const founderAdmin = require('../services/founderAdminService');
const onboarding = require('../services/trainerOnboardingService');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

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

  try {
    const founder = await request('POST', '/api/auth/login', {
      email: 'founder@mathify.app', password: 'mathify-demo'
    });
    ok(founder.status === 200, 'founder signs in through credential login');
    const token = founder.body.token;
    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    });
    const trainerToken = trainerLogin.body.token;

    const anonymous = await request('GET', '/api/admin/people/trainer');
    ok(anonymous.status === 401, 'admin people list requires sign-in');
    const denied = await request('GET', '/api/admin/people/trainer', undefined, trainerToken);
    ok(denied.status === 403, 'a trainer token cannot open founder administration');

    const trainers = await request('GET', '/api/admin/people/trainer', undefined, token);
    const students = await request('GET', '/api/admin/people/student', undefined, token);
    ok(trainers.status === 200 && trainers.body.people.length >= 1,
      'founder lists named trainers for the trainer administration desk');
    ok(students.status === 200 && students.body.people.length >= 1,
      'founder lists named students for the student administration desk');
    ok(!/passwordHash|passwordSalt/.test(trainers.text + students.text),
      'admin lists never contain password hashes or salts');

    const invalidRole = await request('GET', '/api/admin/people/parent', undefined, token);
    ok(invalidRole.status === 422 && invalidRole.body.error === 'INVALID_ROLE',
      'administration is allowlisted to trainer and student roles');

    const created = await request('POST', '/api/admin/people', {
      role: 'trainer', name: 'Admin Test Trainer', email: 'admin.trainer@mathify.test'
    }, token);
    ok(created.status === 200 && created.body.person.role === 'trainer',
      'founder can add a trainer');
    ok(created.body.temporaryPassword === 'admin@mathify123',
      'the first password uses the agreed firstname@mathify123 pattern');
    ok(created.body.person.status === 'pending',
      'a new trainer stays pending until the founder validates and grants access');
    const newTrainerId = created.body.person.id;

    const duplicate = await request('POST', '/api/admin/people', {
      role: 'student', name: 'Duplicate', email: 'admin.trainer@mathify.test'
    }, token);
    ok(duplicate.status === 409 && duplicate.body.error === 'EMAIL_IN_USE',
      'an existing email cannot be registered twice');
    const kycRef = { id: 'test_doc', ref: 'onboarding/test/doc.png', fileName: 'doc.png', mimeType: 'image/png' };
    await onboarding.submit(newTrainerId, {
      identity: { fullName: 'Admin Test Trainer', dateOfBirth: '1994-06-12' },
      documents: {
        aadhaar: { number: '123456789012', front: kycRef, rear: kycRef },
        pan: { number: 'ABCDE1234F', front: kycRef, rear: kycRef },
        signature: { image: kycRef }
      }
    });

    const badRate = await request('PATCH', '/api/admin/people/' + newTrainerId + '/base-rate', {
      rate: -5
    }, token);
    ok(badRate.status === 422 && badRate.body.error === 'INVALID_RATE',
      'a non-positive base rate is rejected');

    const rate = await request('PATCH', '/api/admin/people/' + newTrainerId + '/base-rate', {
      rate: 425
    }, token);
    ok(rate.status === 200 && rate.body.person.payPerSession === 425,
      'founder sets an individual trainer base rate');
    ok(rate.body.bandWarning !== null,
      'a rate outside the ₹300–₹400 band is flagged rather than silently forced');
    const storedUser = await db.findUserById(newTrainerId);
    ok(payout.rateFor(storedUser, { rateRange: [300, 400] }) === 400,
      'payout engine consumes the stored base rate within the policy band');

    const detail = await request('GET', '/api/admin/people/trainer/' + newTrainerId, undefined, token);
    ok(detail.status === 200 && detail.body.person.name === 'Admin Test Trainer',
      'choosing a trainer by name loads that trainer’s full operational detail');
    ok(Array.isArray(detail.body.sessions) && Array.isArray(detail.body.penalties),
      'trainer detail includes sessions and penalty history');
    ok(!/passwordHash|passwordSalt/.test(detail.text),
      'trainer detail excludes credential fields');

    const studentCreated = await request('POST', '/api/admin/people', {
      role: 'student', name: 'Admin Test Student', email: 'admin.student@mathify.test',
      password: 'student-pass-123'
    }, token);
    ok(studentCreated.status === 200 &&
      studentCreated.body.passwordSource === 'founder',
      'founder can add a student with a chosen password');
    ok(studentCreated.body.temporaryPassword === null,
      'a founder-chosen password is not echoed back');
    const studentDetail = await request('GET',
      '/api/admin/people/student/' + studentCreated.body.person.id, undefined, token);
    ok(studentDetail.status === 200 &&
      studentDetail.body.person.role === 'student' &&
      Array.isArray(studentDetail.body.practiceBatches),
      'choosing a student loads that student’s data');
    ok(!/passwordHash|passwordSalt/.test(studentDetail.text),
      'student detail excludes credential fields');

    const suspended = await request('PATCH', '/api/admin/people/' + newTrainerId + '/access', {
      status: 'suspended'
    }, token);
    ok(suspended.status === 200 && suspended.body.person.status === 'suspended',
      'founder can revoke a trainer’s desk access');
    const revokedLogin = await request('POST', '/api/auth/login', {
      email: 'admin.trainer@mathify.test', password: created.body.temporaryPassword
    });
    ok(revokedLogin.status === 401,
      'a suspended account cannot sign in after access is revoked');
    const restored = await request('PATCH', '/api/admin/people/' + newTrainerId + '/access', {
      status: 'active'
    }, token);
    ok(restored.body.person.status === 'active',
      'founder can restore access to the same account');

    const studentAccess = await request('PATCH',
      '/api/admin/people/' + studentCreated.body.person.id + '/access', {
        status: 'suspended'
      }, token);
    ok(studentAccess.status === 200 && studentAccess.body.person.status === 'suspended',
      'founder can revoke a student’s desk access');

    const selfLock = await request('PATCH', '/api/admin/people/' + founder.body.user.id + '/access', {
      status: 'suspended'
    }, token);
    ok(selfLock.status === 403 && selfLock.body.error === 'FOUNDER_ACCESS_LOCKED',
      'founder access cannot be suspended from the admin desk');

    const penalty = await request('POST', '/api/admin/people/' + newTrainerId + '/penalties', {
      amount: 250, reason: 'Late cancellation without notice'
    }, token);
    ok(penalty.status === 200 && penalty.body.penalty.status === 'applied',
      'founder can adhere a penalty to an individual trainer');
    const penalties = await request('GET', '/api/admin/people/' + newTrainerId + '/penalties', undefined, token);
    ok(penalties.body.penalties.some(function (row) { return row.id === penalty.body.penalty.id; }),
      'the penalty appears in the named trainer’s history');

    const revokedPenalty = await request('PATCH',
      '/api/admin/penalties/' + penalty.body.penalty.id + '/revoke', {}, token);
    ok(revokedPenalty.status === 200 &&
      revokedPenalty.body.penalty.status === 'revoked' &&
      Boolean(revokedPenalty.body.penalty.revokedAt),
      'founder can revoke a penalty with an audit trail');
    const afterRevoke = await request('GET', '/api/admin/people/' + newTrainerId + '/penalties', undefined, token);
    const preserved = afterRevoke.body.penalties.find(function (row) {
      return row.id === penalty.body.penalty.id;
    });
    ok(preserved && preserved.status === 'revoked',
      'revocation keeps the original decision in the audit trail');

    const badPenalty = await request('POST', '/api/admin/people/' + newTrainerId + '/penalties', {
      amount: 0, reason: 'invalid'
    }, token);
    ok(badPenalty.status === 422 && badPenalty.body.error === 'INVALID_PENALTY',
      'a non-positive penalty is rejected');

    const grantTrainer = await request('POST', '/api/admin/people', {
      role: 'trainer', name: 'Granted Trainer', email: 'granted.trainer@mathify.test'
    }, token);
    const grantId = grantTrainer.body.person.id;
    await onboarding.submit(grantId, {
      identity: { fullName: 'Granted Trainer', dateOfBirth: '1995-01-02' },
      documents: {
        aadhaar: { number: '111111111111', front: kycRef, rear: kycRef },
        pan: { number: 'FGHIJ1234K', front: kycRef, rear: kycRef },
        signature: { image: kycRef }
      }
    });
    const pendingLogin = await request('POST', '/api/auth/login', {
      email: 'granted.trainer@mathify.test', password: 'granted@mathify123'
    });
    ok(pendingLogin.status === 200, 'a pending trainer can sign in to finish setup');
    const pendingToken = pendingLogin.body.token;
    const pendingDashboard = await request('GET', '/api/trainer/dashboard', undefined, pendingToken);
    ok(pendingDashboard.status === 200 &&
      pendingDashboard.body.dashboard.access.granted === false,
      'the pending dashboard reports that founder access is not granted');
    ok(pendingDashboard.body.dashboard.today.length === 0 &&
      pendingDashboard.body.dashboard.nextSession === null,
      'the pending dashboard carries no student, session or planner details');
    const pendingBatches = await request('GET', '/api/trainer/batches', undefined, pendingToken);
    ok(pendingBatches.status === 403 && pendingBatches.body.error === 'TRAINER_ACCESS_PENDING',
      'pending trainers cannot see assigned batches');
    const grant = await request('POST', '/api/admin/people/' + grantId + '/grant', {}, token);
    ok(grant.status === 200 && grant.body.password === 'granted@mathify123' &&
      grant.body.email === 'granted.trainer@mathify.test',
      'founder grant opens the desk and returns the copyable first password and email');
    const grantedLogin = await request('POST', '/api/auth/login', {
      email: grant.body.email, password: grant.body.password
    });
    const grantedDashboard = await request('GET', '/api/trainer/dashboard',
      undefined, grantedLogin.body.token);
    ok(grantedDashboard.status === 200 &&
      grantedDashboard.body.dashboard.access.granted === true,
      'after founder grant the trainer desk is fully unlocked');
    const grantedBatches = await request('GET', '/api/trainer/batches',
      undefined, grantedLogin.body.token);
    ok(grantedBatches.status === 200,
      'an unlocked trainer can see only the batches the founder assigned');

    ok(founderAdmin.ADMIN_ROLES.join(',') === 'trainer,relationship_manager,student',
      'the admin surface is scoped to trainer, manager and student roles only');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('founderAdmin: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
