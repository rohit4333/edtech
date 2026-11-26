/* Password control contract: a signed-in user proves the current password to
   change it, a one-time email reset token works only once, the founder can grant
   a working password as the documented last resort, and a manager may issue a
   generated temporary password only to an approved trainer (covered in
   relationshipManager.test.js). */

const assert = require('assert');
const db = require('../db');
const passwordAuth = require('../auth/password');
const passwordService = require('../services/passwordService');
const founderAdmin = require('../services/founderAdminService');

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

async function main() {
  const id = 'usr_pwflow_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const email = id + '@mathify.test';
  const original = passwordAuth.hashPassword('original-password-1');
  await db.insertUser({
    id: id,
    name: 'Password Flow',
    email: email,
    role: 'student',
    status: 'active',
    createdAt: new Date().toISOString(),
    passwordSalt: original.salt,
    passwordHash: original.hash
  });

  await rejects(passwordService.changePassword(id, {
    currentPassword: 'wrong-password', newPassword: 'changed-password-1'
  }), 'INVALID_CURRENT_PASSWORD', 'profile change requires the current password');

  const changed = await passwordService.changePassword(id, {
    currentPassword: 'original-password-1', newPassword: 'changed-password-1'
  });
  equal(changed.changed, true, 'profile change succeeds with the correct password');
  equal(passwordAuth.verifyPassword('changed-password-1', await db.findUserById(id)).ok, true,
    'the changed password verifies against the stored hash');

  const missing = await passwordService.requestReset({ email: 'nobody@mathify.test' });
  equal(missing.requested, true, 'reset request does not enumerate unknown accounts');
  equal(missing.delivered, false, 'no email is delivered to an unknown address');

  const reset = await passwordService.requestReset({ email: email.toUpperCase() });
  equal(reset.requested, true, 'reset request accepts the account email case-insensitively');
  ok(Boolean(reset.developmentToken),
    'non-production verification returns a one-time local reset token');
  equal(reset.expiresInMinutes, 15, 'reset tokens expire after 15 minutes');

  await rejects(passwordService.confirmReset({
    email: email, token: 'not-the-token', password: 'reset-password-1'
  }), 'INVALID_RESET_TOKEN', 'an unknown reset token is refused');
  const confirmed = await passwordService.confirmReset({
    email: email, token: reset.developmentToken, password: 'reset-password-1'
  });
  equal(confirmed.reset, true, 'a valid reset token sets a new password');
  equal(passwordAuth.verifyPassword('reset-password-1', await db.findUserById(id)).ok, true,
    'the reset password verifies against the stored hash');
  await rejects(passwordService.confirmReset({
    email: email, token: reset.developmentToken, password: 'replay-password-1'
  }), 'INVALID_RESET_TOKEN', 'the reset token cannot be replayed');
  equal(passwordAuth.verifyPassword('replay-password-1', await db.findUserById(id)).ok, false,
    'a replayed token never changes the password');

  const founderSet = await founderAdmin.setPassword(id, {
    password: 'founder-override-1'
  }, 'usr_founder_001', 'founder');
  equal(founderSet.temporaryPassword, null, 'a founder-chosen password is not echoed back');
  equal(passwordAuth.verifyPassword('founder-override-1', await db.findUserById(id)).ok, true,
    'the founder override grants a working password');
  equal(founderSet.person.passwordIssuedByRole, 'founder',
    'the founder override records the founder as issuer role');

  const generated = await founderAdmin.setPassword(id, {}, 'usr_founder_001', 'founder');
  ok(Boolean(generated.temporaryPassword), 'a generated founder override is returned once');
  equal(passwordAuth.verifyPassword(generated.temporaryPassword, await db.findUserById(id)).ok, true,
    'the generated founder override is the working password');
  equal(generated.person.passwordTemporaryIssued, true,
    'the generated founder override is marked temporary in the detail view');

  console.log('passwordFlow: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
