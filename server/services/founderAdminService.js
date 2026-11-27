/* ==========================================================================
   MATHIFY — founder and relationship-manager administration service

   The founder is the workspace owner and therefore the admin. A relationship
   manager is founder-authorised staff with the same operating view, except the
   manager may grant but never revoke desk access, may never choose or replace a
   login credential, and may never edit the base rate the founder set. The one
   scoped credential exception is issuing a generated temporary password to an
   already KYC-verified, granted trainer as a recovery handover. Penalty
   decisions, including revocation, are available to both roles. Every browser
   payload is an allowlisted view: password hashes, salts and contact tokens
   never leave this module.
   ========================================================================== */

const crypto = require('crypto');
const db = require('../db');
const password = require('../auth/password');
const sessionVersion = require('./sessionVersionService');
const trainerOnboarding = require('./trainerOnboardingService');
const notifications = require('./notificationService');

const ADMIN_ROLES = ['trainer', 'relationship_manager', 'student'];
const STAFF_ROLES = ['trainer', 'relationship_manager'];
const VALID_ACCESS = ['active', 'suspended'];
const MAX_RATE = 100000;
const MAX_SALARY = 10000000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KYC_STATUSES = ['submitted', 'corrected', 'approved'];

/* Full account detail minus credentials. The founder may see all operational
   data, but never a password hash, salt or login token. */
const DETAIL_FIELDS = [
  'id', 'name', 'email', 'role', 'status', 'createdAt',
  'title', 'grade', 'batch', 'mastery', 'streak', 'sessionsRemaining',
  'badges', 'trophyPoints', 'payPerSession', 'monthlySalary', 'maxHoursPerDay',
  'maxSessionsPerDay', 'childId', 'loginAliases', 'accessGrantedAt',
  'accessGrantedBy', 'accessGrantedByRole', 'accessRevokedAt',
  'accessRevokedBy', 'accessRevokedByRole', 'accessUpdatedAt',
  'rateLockedAt', 'rateSetBy', 'rateSetByRole',
  'passwordIssuedAt', 'passwordIssuedBy', 'passwordIssuedByRole',
  'passwordTemporaryIssued', 'passwordGenerated'
];

function problem(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function personView(user) {
  if (!user) return null;
  const view = {};
  DETAIL_FIELDS.forEach(function (key) {
    if (user[key] !== undefined) view[key] = user[key];
  });
  return view;
}

/* A staff or student credential replaced by an administrator is confirmed to
   the account owner by email. The one-time handover value is never repeated. */
async function notifyCredential(user) {
  if (!user) return { sent: false, reason: 'no_account' };
  const linked = await sessionVersion.linkedAccountIds(user.id);
  const aliases = Array.isArray(user.loginAliases) ? user.loginAliases : [];
  const recipient = String(user.email || aliases[0] ||
    (linked.request && linked.request.email) || '').toLowerCase();
  if (!recipient) return { sent: false, reason: 'no_recipient' };
  return notifications.sendPasswordChangedEmail({
    email: recipient,
    name: user.name,
    role: user.role
  });
}

function requireRole(role, actorRole) {
  if (ADMIN_ROLES.indexOf(role) === -1) {
    throw problem('INVALID_ROLE', 'Only trainer, relationship-manager and student accounts can be administered here.', 422);
  }
  /* A relationship manager may help people but may not create another manager:
     every manager is authorised by the founder himself. */
  if (actorRole === 'relationship_manager' && role === 'relationship_manager') {
    throw problem('RM_SELF_PROVISION_DENIED', 'Only the founder may create a relationship manager.', 403);
  }
  return role;
}

function requireOwner(actorRole, code, message) {
  if (actorRole === 'relationship_manager') {
    throw problem(code, message, 403);
  }
}

async function requirePerson(id, role) {
  const user = await db.findUserById(String(id || ''));
  if (!user || (role && user.role !== role)) {
    throw problem('PERSON_NOT_FOUND', 'That account does not exist.', 404);
  }
  return user;
}

async function list(role) {
  requireRole(role);
  const users = await Promise.resolve(db.listUsers());
  return users.filter(function (user) { return user.role === role; })
    .map(personView);
}

/* Choosing a person by name loads every operational record attached to that
   account. Sensitive credential fields stay excluded by personView. */
async function detail(role, id, actorRole) {
  requireRole(role, actorRole);
  const user = await requirePerson(id, role);
  const sessions = await Promise.resolve(db.listSessionsForUser(user));
  const sessionIds = {};
  sessions.forEach(function (session) { sessionIds[session.id] = true; });

  const [attendance, batches, documents, penalties, onboarding] = await Promise.all([
    Promise.resolve(db.listAttendance()),
    Promise.resolve(db.listBatches()),
    Promise.resolve(db.listTrainerDocuments()),
    STAFF_ROLES.indexOf(role) !== -1
      ? Promise.resolve(db.listFounderPenalties(user.id))
      : Promise.resolve([]),
    STAFF_ROLES.indexOf(role) !== -1
      ? trainerOnboarding.viewFor(user.id, 'founder', { reveal: true })
      : Promise.resolve(null)
  ]);

  const view = {
    person: personView(user),
    sessions: sessions,
    attendance: attendance.filter(function (row) { return sessionIds[row.sessionId]; })
  };

  if (STAFF_ROLES.indexOf(role) !== -1) {
    /* Relationship managers support delivery but never teach a batch. */
    view.batches = role === 'trainer'
      ? batches.filter(function (batch) { return batch.trainerId === user.id; })
      : [];
    view.documents = documents.filter(function (doc) { return doc.trainerId === user.id; })
      .map(function (doc) {
        return {
          id: doc.id,
          kind: doc.kind || doc.documentType || 'document',
          mimeType: doc.mimeType,
          createdAt: doc.createdAt
        };
      });
    view.onboarding = onboarding;
    view.penalties = penalties;
  } else {
    const enrolled = batches.find(function (batch) { return batch.studentId === user.id; });
    view.batch = enrolled || db.findBatchForStudent(user.id) || null;
    const practice = await Promise.resolve(db.listPracticeBatches());
    view.practiceBatches = practice.filter(function (batch) { return batch.studentId === user.id; });
  }
  return view;
}

function newId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex');
}

/* Founder handover passwords follow the agreed, easy-to-dictate pattern:
   firstname@mathify123 (for example ananya@mathify123). Only the first name is
   used. The founder sees it once, copies it with the email address, and the
   server stores only its salted hash. */
function generatedPassword(name) {
  const slug = text(name).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'trainer';
  return slug.split('.')[0] + '@mathify123';
}

async function assertStaffKyc(user) {
  const onboarding = await Promise.resolve(db.findTrainerOnboarding(user.id));
  if (!onboarding || KYC_STATUSES.indexOf(onboarding.status) === -1) {
    const label = user.role === 'relationship_manager' ? 'Relationship manager' : 'Trainer';
    throw problem('KYC_NOT_SUBMITTED',
      label + ' must submit all KYC details before access can be granted.', 422);
  }
  return onboarding;
}

/* Founder or RM creates a trainer/student. A relationship manager is only
   ever created by the founder. When no password is supplied the agreed
   firstname@mathify123 handover password is generated and returned once. */
async function create(role, input, actorRole) {
  requireRole(role, actorRole);
  const body = input || {};
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  if (name.length < 2 || name.length > 80) {
    throw problem('INVALID_NAME', 'Name must be between 2 and 80 characters.', 422);
  }
  if (!EMAIL.test(email) || email.length > 200) {
    throw problem('INVALID_EMAIL', 'A valid email address is required.', 422);
  }

  const users = await Promise.resolve(db.listUsers());
  const taken = users.some(function (user) {
    if (text(user.email).toLowerCase() === email) return true;
    return (Array.isArray(user.loginAliases) ? user.loginAliases : [])
      .some(function (alias) { return text(alias).toLowerCase() === email; });
  });
  if (taken) throw problem('EMAIL_IN_USE', 'That email is already in use.', 409);

  const supplied = body.password === undefined || body.password === null || body.password === ''
    ? null
    : String(body.password);
  if (supplied !== null && (supplied.length < 8 || supplied.length > 200)) {
    throw problem('INVALID_PASSWORD', 'Password must be between 8 and 200 characters.', 422);
  }
  const temporaryPassword = supplied ||
    (STAFF_ROLES.indexOf(role) !== -1
      ? generatedPassword(name)
      : crypto.randomBytes(9).toString('base64url'));
  const secured = password.hashPassword(temporaryPassword);
  const isStaff = STAFF_ROLES.indexOf(role) !== -1;
  const salary = Number(body.monthlySalary);
  const record = Object.assign({
    id: newId('usr'),
    name: name,
    email: email,
    role: role,
    /* New staff wait for KYC review and an explicit founder/manager grant. */
    status: isStaff ? 'pending' : 'active',
    createdAt: new Date().toISOString(),
    passwordSalt: secured.salt,
    passwordHash: secured.hash
  }, role === 'trainer'
    ? { title: 'Mathify trainer', payPerSession: 350, maxHoursPerDay: 6, maxSessionsPerDay: 6 }
    : role === 'relationship_manager'
      ? {
        title: 'Relationship manager',
        monthlySalary: Number.isFinite(salary) && salary > 0
          ? Math.round(salary * 100) / 100
          : 35000
      }
      : { grade: text(body.grade) || null, sessionsRemaining: 0, streak: 0, badges: [], trophyPoints: 0 });

  await Promise.resolve(db.insertUser(record));
  return {
    person: personView(record),
    temporaryPassword: supplied ? null : temporaryPassword,
    passwordSource: supplied ? 'founder' : 'generated'
  };
}

async function setAccess(id, status, actorId, actorRole) {
  const requested = text(status).toLowerCase();
  if (VALID_ACCESS.indexOf(requested) === -1) {
    throw problem('INVALID_ACCESS', 'Access must be active or suspended.', 422);
  }
  if (requested === 'suspended') {
    requireOwner(actorRole, 'RM_REVOKE_DENIED',
      'A relationship manager can grant access but cannot revoke it.');
  }
  const user = await requirePerson(id);
  if (user.role === 'founder') {
    throw problem('FOUNDER_ACCESS_LOCKED', 'Founder access cannot be changed from this screen.', 403);
  }
  if (STAFF_ROLES.indexOf(user.role) !== -1 && requested === 'active') {
    await assertStaffKyc(user);
  }
  const now = new Date().toISOString();
  const updated = await Promise.resolve(db.updateUser(user.id, function (current) {
    current.status = requested;
    current.accessUpdatedAt = now;
    if (requested === 'active' && STAFF_ROLES.indexOf(user.role) !== -1) {
      current.accessGrantedAt = now;
      current.accessGrantedBy = String(actorId || actorRole || 'founder');
      current.accessGrantedByRole = actorRole === 'relationship_manager'
        ? 'relationship_manager' : 'founder';
      current.accessRevokedAt = null;
    } else if (requested === 'suspended') {
      current.accessGrantedAt = null;
      current.accessRevokedAt = now;
      current.accessRevokedBy = String(actorId || 'founder');
      current.accessRevokedByRole = actorRole === 'relationship_manager'
        ? 'relationship_manager' : 'founder';
    }
    return current;
  }));
  return personView(updated || Object.assign({}, user, { status: requested }));
}

/* One grant action: verify KYC, open the desk and issue the first login
   password. The founder or a relationship manager may grant it; only the
   founder may later revoke the desk or replace the credential. The plain value
   is returned once for handover and the store keeps only the salted hash. */
async function grantAccess(id, actorId, actorRole) {
  const user = await requirePerson(id);
  if (STAFF_ROLES.indexOf(user.role) === -1) {
    throw problem('INVALID_ROLE', 'Only staff accounts need a KYC-based access grant.', 422);
  }
  await assertStaffKyc(user);
  const passwordValue = generatedPassword(user.name);
  const secured = password.hashPassword(passwordValue);
  const now = new Date().toISOString();
  const updated = await Promise.resolve(sessionVersion.bump(user.id, {
    status: 'active',
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    passwordChangedAt: now,
    passwordResetByFounderAt: now,
    accessGrantedAt: now,
    accessGrantedBy: String(actorId || actorRole || 'founder'),
    accessGrantedByRole: actorRole === 'relationship_manager'
      ? 'relationship_manager' : 'founder',
    accessRevokedAt: null,
    accessUpdatedAt: now
  }));
  const notification = await notifyCredential(user);
  return {
    person: personView((updated && updated.user) || user),
    email: user.email,
    password: passwordValue,
    passwordSource: 'generated',
    notification: notification,
    note: 'Copy this password with the email address and hand it over. It is shown only once. A confirmation is emailed to the account.'
  };
}

/* Access recovery. The founder may replace any non-founder credential with a
   chosen or generated value. A relationship manager has exactly one narrow
   power here: issue the generated firstname@mathify123 temporary password to a
   trainer whose KYC is on file and whose desk was already granted. The manager
   cannot choose the value, target any other role, or use this as a backdoor for
   an unapproved account. The plain value is returned once for handover. */
async function setPassword(id, input, actorId, actorRole) {
  const body = input || {};
  const user = await requirePerson(id);
  if (user.role === 'founder') {
    throw problem('FOUNDER_PASSWORD_LOCKED', 'Use your own profile to change the founder password.', 403);
  }
  const supplied = body.password === undefined || body.password === null || body.password === ''
    ? null
    : String(body.password);
  const isManager = actorRole === 'relationship_manager';

  if (isManager) {
    if (user.role !== 'trainer') {
      throw problem('RM_PASSWORD_TARGET_DENIED',
        'A manager may issue a temporary password only to a trainer.', 403);
    }
    if (supplied !== null) {
      throw problem('RM_PASSWORD_CHOICE_DENIED',
        'A manager cannot choose a password; only the generated temporary password may be issued.', 403);
    }
    const onboarding = await Promise.resolve(db.findTrainerOnboarding(user.id));
    if (!user.accessGrantedAt || !onboarding || KYC_STATUSES.indexOf(onboarding.status) === -1) {
      throw problem('KYC_OR_GRANT_REQUIRED',
        'The trainer must complete KYC and receive an access grant before a manager can issue a temporary password.', 422);
    }
  } else if (supplied !== null && (supplied.length < 8 || supplied.length > 200 || !supplied.trim())) {
    throw problem('INVALID_PASSWORD', 'Password must be between 8 and 200 characters.', 422);
  }

  const newPassword = supplied ||
    (STAFF_ROLES.indexOf(user.role) !== -1
      ? generatedPassword(user.name)
      : crypto.randomBytes(9).toString('base64url'));
  const secured = password.hashPassword(newPassword);
  const now = new Date().toISOString();
  const actor = String(actorId || actorRole || 'founder');
  const issuedByRole = isManager ? 'relationship_manager' : 'founder';
  const updated = await Promise.resolve(sessionVersion.bump(user.id, {
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    passwordChangedAt: now,
    /* Historical field retained so older founder-desk readers keep working;
       the issued-by fields below make the manager exception explicit. */
    passwordResetByFounderAt: now,
    passwordIssuedAt: now,
    passwordIssuedBy: actor,
    passwordIssuedByRole: issuedByRole,
    passwordTemporaryIssued: !supplied,
    passwordGenerated: !supplied
  }));
  const notification = await notifyCredential(user);
  return {
    person: personView((updated && updated.user) || user),
    email: user.email,
    temporaryPassword: supplied ? null : newPassword,
    passwordSource: supplied ? 'founder' : 'generated',
    notification: notification
  };
}

/* The exact rate is contract-controlled. The founder may edit it at any time.
   A relationship manager may set it once while the trainer is still in pending
   onboarding; after the grant, or after the founder has set the rate, it is
   locked to the manager. The ₹300–₹400 band remains a policy reference. */
async function setBaseRate(id, rate, actorId, actorRole) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_RATE) {
    throw problem('INVALID_RATE', 'Base rate must be a positive amount.', 422);
  }
  const rounded = Math.round(value * 100) / 100;
  const user = await requirePerson(id, 'trainer');
  const now = new Date().toISOString();
  if (actorRole === 'relationship_manager') {
    if (user.status !== 'pending' || user.rateLockedAt || user.rateSetByRole === 'founder') {
      throw problem('RM_RATE_LOCKED',
        'A manager may set the base rate only once during trainer onboarding. It is locked after grant or a founder decision.',
        403);
    }
  }
  const updated = await Promise.resolve(db.updateUser(user.id, function (current) {
    current.payPerSession = rounded;
    current.rateUpdatedAt = now;
    if (actorRole === 'relationship_manager') {
      current.rateLockedAt = now;
      current.rateSetBy = String(actorId || 'relationship_manager');
      current.rateSetByRole = 'relationship_manager';
    } else {
      current.rateSetBy = String(actorId || 'founder');
      current.rateSetByRole = 'founder';
      /* A founder decision closes the manager's onboarding window too. */
      if (!current.rateLockedAt) current.rateLockedAt = now;
    }
    return current;
  }));
  const view = personView(updated || Object.assign({}, user, { payPerSession: rounded }));
  view.bandWarning = rounded < 300 || rounded > 400
    ? 'Rate is outside the current ₹300–₹400 policy band; confirm it matches the trainer contract.'
    : null;
  return view;
}

/* Relationship managers receive a monthly salary. The founder owns that
   number just as they own the trainer base rate; the RM desk only reads it. */
async function setMonthlySalary(id, amount, actorRole) {
  requireOwner(actorRole, 'RM_SALARY_LOCKED', 'Only the founder may set a salary.');
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SALARY) {
    throw problem('INVALID_SALARY', 'Salary must be a positive amount.', 422);
  }
  const user = await requirePerson(id, 'relationship_manager');
  const rounded = Math.round(value * 100) / 100;
  const updated = await Promise.resolve(db.updateUser(user.id, function (current) {
    current.monthlySalary = rounded;
    current.salaryUpdatedAt = new Date().toISOString();
    return current;
  }));
  return personView(updated || Object.assign({}, user, { monthlySalary: rounded }));
}

async function listPenalties(trainerId) {
  await requirePerson(trainerId, 'trainer');
  return Promise.resolve(db.listFounderPenalties(String(trainerId)));
}

/* "Adhere a penalty" means attach it to a named trainer with an auditable
   reason and amount. Nothing is deducted here; the payroll service consumes
   the recorded decision. */
async function addPenalty(trainerId, input, actorId, actorRole) {
  const user = await requirePerson(trainerId, 'trainer');
  const body = input || {};
  const amount = Number(body.amount);
  const reason = text(body.reason);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RATE) {
    throw problem('INVALID_PENALTY', 'Penalty amount must be positive.', 422);
  }
  if (reason.length < 3 || reason.length > 500) {
    throw problem('INVALID_REASON', 'Give a short reason of at least 3 characters.', 422);
  }
  const record = {
    id: newId('pen'),
    trainerId: user.id,
    trainerName: user.name,
    amount: Math.round(amount * 100) / 100,
    currency: 'INR',
    reason: reason,
    status: 'applied',
    decidedBy: String(actorId || actorRole || 'founder'),
    decidedByRole: actorRole === 'relationship_manager' ? 'relationship_manager' : 'founder',
    createdAt: new Date().toISOString(),
    revokedAt: null,
    revokedBy: null
  };
  await Promise.resolve(db.saveFounderPenalty(record));
  return record;
}

/* Revocation is an append-only status change: the original decision stays in
   the audit trail with who removed it and when. */
async function revokePenalty(penaltyId, actorId, actorRole) {
  const current = await Promise.resolve(db.findFounderPenalty(String(penaltyId || '')));
  if (!current) throw problem('PENALTY_NOT_FOUND', 'That penalty does not exist.', 404);
  if (current.status === 'revoked') return current;
  const updated = Object.assign({}, current, {
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    revokedBy: String(actorId || actorRole || 'founder'),
    revokedByRole: actorRole === 'relationship_manager' ? 'relationship_manager' : 'founder'
  });
  await Promise.resolve(db.saveFounderPenalty(updated));
  return updated;
}

module.exports = {
  ADMIN_ROLES: ADMIN_ROLES,
  personView: personView,
  list: list,
  detail: detail,
  create: create,
  setAccess: setAccess,
  grantAccess: grantAccess,
  setPassword: setPassword,
  setBaseRate: setBaseRate,
  setMonthlySalary: setMonthlySalary,
  listPenalties: listPenalties,
  addPenalty: addPenalty,
  revokePenalty: revokePenalty
};
