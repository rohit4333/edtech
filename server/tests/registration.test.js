/* Public registration contract. Only student, trainer and relationship-manager
   accounts can be created here; staff remain pending until KYC review and an
   explicit founder/manager grant. Credentials are stored as salted hashes. */

const assert = require('assert');
const db = require('../db');
const passwordAuth = require('../auth/password');
const registration = require('../services/registrationService');

const RM_ROLE = 'relationship_manager';

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

function unique(seed) {
  return seed + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

async function main() {
  equal(registration.ROLES.join(','), 'student,trainer,relationship_manager',
    'registration allowlists exactly three roles');

  const secret = 'registered-password-123';
  const studentEmail = unique('student') + '@mathify.test';
  const student = await registration.register({
    role: 'student', name: 'Registered Student', email: studentEmail,
    password: secret, grade: '8'
  });
  equal(student.user.role, 'student', 'a student can self-register');
  equal(student.user.status, 'active', 'student access opens without staff KYC');
  equal(student.next, '/login.html?role=student', 'student registration points at root sign-in');
  const storedStudent = await db.findUserById(student.user.id);
  ok(storedStudent.passwordSalt && storedStudent.passwordHash,
    'a per-user salt and hash are stored');
  equal(storedStudent.password, undefined, 'the plain password is never stored on the user');
  equal(passwordAuth.verifyPassword(secret, storedStudent).ok, true,
    'the registered password verifies against the stored hash');
  equal(passwordAuth.verifyPassword('wrong-password', storedStudent).ok, false,
    'a different password cannot open the account');

  await rejects(registration.register({
    role: 'student', name: 'Duplicate', email: studentEmail.toUpperCase(), password: secret
  }), 'EMAIL_IN_USE', 'duplicate email is refused case-insensitively');

  const trainerEmail = unique('trainer') + '@mathify.test';
  const trainer = await registration.register({
    role: 'trainer', name: 'Registered Trainer', email: trainerEmail, password: secret
  });
  equal(trainer.user.status, 'pending', 'a self-registered trainer waits for founder approval');
  equal(trainer.next, '/login.html?role=trainer', 'trainer registration points at the trainer sign-in hint');
  ok(/founder must grant desk access/.test(trainer.note),
    'the trainer is told that desk access is not automatic');

  const managerEmail = unique('manager') + '@mathify.test';
  const manager = await registration.register({
    role: 'relationship_manager', name: 'Registered Manager', email: managerEmail, password: secret
  });
  equal(manager.user.role, RM_ROLE, 'a relationship manager can self-register');
  equal(manager.user.status, trainer.user.status,
    'trainer and manager registration share the same pending status');
  equal(manager.note, trainer.note,
    'trainer and manager registration share the same KYC and approval instruction');
  equal(manager.next, '/login.html?role=relationship_manager',
    'manager registration keeps the verified role in its sign-in hint');

  await rejects(registration.register({
    role: 'founder', name: 'Fake Founder', email: unique('founder') + '@mathify.test', password: secret
  }), 'INVALID_ROLE', 'founder accounts cannot be self-created');
  await rejects(registration.register({
    role: 'parent', name: 'Fake Parent', email: unique('parent') + '@mathify.test', password: secret
  }), 'INVALID_ROLE', 'parent accounts cannot be self-created');
  await rejects(registration.register({
    role: 'student', name: 'Bad Secret', email: unique('short') + '@mathify.test', password: 'short'
  }), 'INVALID_PASSWORD', 'short passwords are refused');

  console.log('registration: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
