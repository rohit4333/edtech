/* ==========================================================================
   MATHIFY — self-service account registration

   The public registration page may create exactly three roles: student,
   trainer and relationship manager. Founder accounts are never self-created.
   Staff registrations stay pending until KYC is submitted and the founder (or
   an authorised relationship manager) grants the desk, matching the onboarding
   contract used everywhere else. A manager cannot create another manager from
   the admin desk, and the same rule holds here.
   ========================================================================== */

const crypto = require('crypto');
const db = require('../db');
const password = require('../auth/password');
const timezoneService = require('./timezoneService');

const ROLES = ['student', 'trainer', 'relationship_manager'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function problem(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 422;
  return error;
}

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

async function register(input) {
  const body = input || {};
  const role = text(body.role).toLowerCase();
  if (ROLES.indexOf(role) === -1) {
    throw problem('INVALID_ROLE', 'Choose a student, trainer or relationship-manager account.', 422);
  }
  const name = text(body.name);
  if (name.length < 2 || name.length > 80) {
    throw problem('INVALID_NAME', 'Name must be between 2 and 80 characters.', 422);
  }
  const email = text(body.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) {
    throw problem('INVALID_EMAIL', 'A valid email address is required.', 422);
  }
  const secret = body.password === undefined || body.password === null ? '' : String(body.password);
  if (secret.length < 8 || secret.length > 200 || !secret.trim()) {
    throw problem('INVALID_PASSWORD', 'Choose a password of at least 8 characters.', 422);
  }

  /* The child's zone is the anchor for scheduled classes. A trainer and a
     manager also register their own zone so every dashboard renders the same
     absolute class instant in the viewer's local time. */
  const suppliedZone = timezoneService.normalize(body.timezone);
  if (body.timezone && !suppliedZone) {
    throw problem('INVALID_TIMEZONE', 'Choose a valid timezone from the list.', 422);
  }
  const timezone = suppliedZone || timezoneService.DEFAULT_ZONE;

  const users = await Promise.resolve(db.listUsers());
  const taken = users.some(function (user) {
    if (text(user.email).toLowerCase() === email) return true;
    return (Array.isArray(user.loginAliases) ? user.loginAliases : [])
      .some(function (alias) { return text(alias).toLowerCase() === email; });
  });
  if (taken) throw problem('EMAIL_IN_USE', 'That email is already registered. Sign in instead.', 409);

  const secured = password.hashPassword(secret);
  const isStaff = role === 'trainer' || role === 'relationship_manager';
  const record = Object.assign({
    id: 'usr_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex'),
    name: name,
    email: email,
    role: role,
    /* Staff wait for KYC review and founder approval before they see data. */
    status: isStaff ? 'pending' : 'active',
    createdAt: new Date().toISOString(),
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    registeredAt: new Date().toISOString(),
    registeredVia: 'public',
    timezone: timezone
  }, role === 'trainer'
    ? { title: 'Mathify trainer', payPerSession: 350, maxHoursPerDay: 6, maxSessionsPerDay: 6 }
    : role === 'relationship_manager'
      ? { title: 'Relationship manager', monthlySalary: 35000 }
      : {
        grade: text(body.grade) || null,
        sessionsRemaining: 0,
        streak: 0,
        badges: [],
        trophyPoints: 0
      });

  await Promise.resolve(db.insertUser(record));
  return {
    user: { id: record.id, name: record.name, role: record.role, status: record.status },
    next: isStaff ? '/login.html?role=' + role : '/login.html?role=student',
    note: isStaff
      ? 'Account created. Complete your KYC details; the founder must grant desk access before you see students, sessions or batches.'
      : 'Account created. Sign in with your new credentials.'
  };
}

module.exports = {
  ROLES: ROLES,
  register: register
};
