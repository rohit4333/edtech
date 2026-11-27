/* Demo lifecycle: booking → prepared credentials → trainer assigned → attended
 * → enrolled. One generated password is shared by the child and parent demo
 * accounts. It is emailed to the parent once, never stored in plain text, and
 * never returned by a student/parent dashboard payload.
 *
 * After the demo is attended the same login still opens the student/parent
 * desk for payments, fee/class policies and the demo record, but class and
 * classroom routes are refused until a pack is credited. On enrollment the
 * accounts move back to the regular class flow. */
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const password = require('../auth/password');
const notifications = require('./notificationService');
const parentNotices = require('./parentNotificationService');
const sessionVersion = require('./sessionVersionService');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPEN_STATUSES = ['booked', 'prepared', 'assigned'];
const PREPARED_STATUSES = ['prepared', 'assigned', 'attended', 'enrolled'];

function text(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 200);
}

function newPassword() {
  return 'demo-' + crypto.randomBytes(6).toString('base64url');
}

function origin() {
  return String(config.resetOrigin() || '').replace(/\/$/, '');
}

function deskLinks(demoId) {
  const base = origin();
  if (!base || !demoId) return {};
  const query = '?demoId=' + encodeURIComponent(demoId);
  return {
    student: base + '/student/home' + query,
    parent: base + '/parent/index.html' + query,
    trainer: base + '/trainer/students' + query
  };
}

function safeImage(value) {
  const raw = text(value, 5000);
  /* Only the onboarding allowlist's inline data URL is served by /api/demo/photo.
     Remote URLs would turn a family-facing image route into a fetch proxy. */
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) ? raw : null;
}

function safeList(value, max) {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  return items.map(function (item) { return text(item, 240); })
    .filter(Boolean).slice(0, max || 8);
}

function years(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(60, Math.round(number)) : null;
}

/* The only trainer fields a child or parent may see. Locked KYC documents,
   phone numbers, emails, salaries and internal identifiers never appear here. */
function publicTrainerProfile(trainer, onboarding) {
  if (!trainer) return null;
  const record = onboarding || {};
  const publicInfo = record.publicProfile || {};
  const picture = safeImage(publicInfo.profilePicture);
  return {
    name: text(publicInfo.fullName || record.fullName || trainer.name, 120) || 'Mathify trainer',
    title: 'Mathify trainer',
    /* Bytes are served by a role-scoped image endpoint, never inlined into a
       dashboard payload whose size and caching the client controls. */
    hasProfilePicture: Boolean(picture),
    photoUrl: picture ? '/api/demo/photo' : null,
    yearsExperience: years(publicInfo.yearsExperience),
    degrees: safeList(publicInfo.degrees, 6),
    achievements: safeList(publicInfo.achievements, 8)
  };
}

function trainerPhoto(trainerId) {
  return Promise.resolve(db.findTrainerOnboarding(trainerId)).then(function (record) {
    const raw = safeImage(record && record.publicProfile && record.publicProfile.profilePicture);
    if (!raw) return null;
    const match = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) return null;
    const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) return null;
    return { mimeType: 'image/' + mime, buffer: buffer };
  });
}

function publicView(request, role) {
  if (!request) return null;
  const view = {
    demoId: request.id,
    status: request.status || 'booked',
    childName: text(request.childName, 120),
    curriculum: text(request.curriculumLabel || request.curriculum, 120),
    grade: text(request.gradeLabel || request.grade, 40),
    batchId: request.batchId || null,
    batchCode: request.batchCode || null,
    trainerAssigned: Boolean(request.trainerId),
    trainerName: text(request.trainerName, 120) || null,
    credentialsIssued: Boolean(request.credentialsIssued),
    credentialsSentAt: request.credentialsIssuedAt || null,
    attendedAt: request.attendedAt || null,
    enrolledAt: request.enrolledAt || null,
    canAttendDemo: OPEN_STATUSES.indexOf(request.status || 'booked') !== -1 &&
      Boolean(request.credentialsIssued) && Boolean(request.trainerId),
    canTakeClasses: request.classAccess === 'regular' ||
      (OPEN_STATUSES.indexOf(request.status || 'booked') !== -1 && Boolean(request.credentialsIssued)),
    links: deskLinks(request.id)
  };
  if (role === 'founder' || role === 'relationship_manager') {
    view.parentName = text(request.parentName, 120);
    view.email = text(request.email, 160);
    view.phone = text(request.phone, 60);
  }
  return view;
}

function patchUser(id, patch) {
  return Promise.resolve(db.updateUser(id, function (user) {
    return user ? Object.assign(user, patch) : user;
  }));
}

async function saveRequest(request, patch) {
  const next = Object.assign({}, request, patch || {});
  await Promise.resolve(db.updateContactRequest(request.id, next));
  return next;
}

/* Creates or refreshes the two demo accounts. The founder/RM sees the generated
   password exactly once; only its salted hash is persisted. */
async function issueCredentials(request, actor, force) {
  const shared = force || !request.credentialsIssued ? newPassword() : null;
  if (!shared) return { password: null, request: request };
  const secured = password.hashPassword(shared);
  const now = new Date().toISOString();
  const studentId = request.studentId || 'demo_stu_' + request.id;
  const parentId = request.parentId || 'demo_par_' + request.id;
  const status = String(request.status || 'booked');
  /* A replacement password never reopens classes after a completed demo and
     never pulls an enrolled family back into the demo flow. */
  const classAccess = request.classAccess === 'regular' ? 'regular'
    : (status === 'attended' || request.classAccess === 'post_demo' ? 'post_demo' : 'demo');
  const demoState = status === 'enrolled' ? 'enrolled'
    : (status === 'attended' ? 'attended' : (status === 'booked' ? 'prepared' : status));
  const student = await Promise.resolve(db.findUserById(studentId));
  const existingParent = await Promise.resolve(db.findUserById(parentId));
  /* Take the highest version seen on either account or the request, so a
     password change made from one desk also retires tokens on the other. */
  const version = await sessionVersion.nextVersion([studentId, parentId], request);
  const base = {
    passwordSalt: secured.salt,
    passwordHash: secured.hash,
    tokenVersion: version,
    demoId: request.id,
    demoState: demoState,
    classAccess: classAccess,
    passwordTemporaryIssued: true,
    passwordGenerated: true,
    passwordIssuedAt: now,
    passwordIssuedBy: actor && actor.id || null,
    passwordIssuedByRole: actor && actor.role || null,
    timezone: request.timezone || null
  };

  const child = Object.assign({}, student || {
    id: studentId,
    name: text(request.childName, 120) || 'Demo student',
    role: 'student',
    status: 'active',
    createdAt: now,
    sessionsRemaining: 0,
    streak: 0,
    badges: [],
    trophyPoints: 0
  }, base, {
    /* The parent email is a login alias, not the stored student address: a
       role hint selects the right desk without exposing the parent's contact. */
    loginAliases: [text(request.email, 160)],
    grade: request.grade || request.gradeLabel || null,
    curriculum: request.curriculum || null,
    batchId: request.batchId || null,
    trainerId: request.trainerId || null,
    demoCredentialActive: true
  });
  if (!student) await Promise.resolve(db.insertUser(child));
  else await patchUser(studentId, child);

  const family = Object.assign({}, existingParent || {
    id: parentId,
    name: text(request.parentName, 120) || 'Demo parent',
    role: 'parent',
    status: 'active',
    createdAt: now
  }, base, {
    email: text(request.email, 160),
    childId: studentId,
    batchId: request.batchId || null,
    trainerId: request.trainerId || null,
    demoCredentialActive: true
  });
  if (!existingParent) await Promise.resolve(db.insertUser(family));
  else await patchUser(parentId, family);

  const updated = await saveRequest(request, {
    studentId: studentId,
    parentId: parentId,
    status: status === 'booked' ? 'prepared' : status,
    credentialsIssued: true,
    credentialsIssuedAt: now,
    tokenVersion: base.tokenVersion,
    classAccess: classAccess
  });
  return { password: shared, request: updated };
}

async function emailParent(request, kind, passwordValue) {
  const links = deskLinks(request.id);
  const info = {
    email: request.email,
    parentName: request.parentName,
    childName: request.childName,
    kind: kind,
    demoId: request.id,
    batchCode: request.batchCode || null,
    trainerName: request.trainerName || null,
    password: kind === 'credentials' ? passwordValue : null,
    studentLink: links.student,
    parentLink: links.parent
  };
  return Promise.resolve(notifications.sendDemoEmail(info));
}

async function notice(childId, kind, title, message, request) {
  if (!childId) return null;
  return Promise.resolve(parentNotices.issue({
    childId: childId,
    kind: kind,
    title: title,
    message: message,
    demoId: request && request.id,
    batchId: request && (request.batchCode || request.batchId),
    link: '/parent/index.html?demoId=' + encodeURIComponent(request && request.id || '')
  }));
}

/* Booking issues the family login immediately. The same password is shown in
   the confirmation window and emailed to the parent with instructions; it stays
   their credential until they change it themselves in Profile → Password. */
async function issueAtBooking(request) {
  const issued = await issueCredentials(request, { id: null, role: 'system' }, false);
  const delivery = await emailParent(issued.request, 'credentials', issued.password);
  await notice(issued.request.studentId, 'credentials', 'Demo login is ready',
    'Check your email for more details. Your demo ID and shared child/parent password are in the confirmation window.',
    issued.request);
  return {
    demo: publicView(issued.request, 'parent'),
    temporaryPassword: issued.password,
    delivery: { email: delivery },
    links: deskLinks(issued.request.id)
  };
}

/* Founder/RM never handle the family password. They only see the safe demo
   status; trainer passwords are issued from the staff administration desk. */
async function prepare(demoId, actor) {
  const request = await Promise.resolve(db.findContactRequest(String(demoId || '')));
  if (!request) {
    const error = new Error('Demo request not found.');
    error.code = 'DEMO_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  if (request.credentialsIssued) {
    return {
      demo: publicView(request, actor && actor.role),
      temporaryPassword: null,
      delivery: { email: { sent: false, reason: 'issued_at_booking' } }
    };
  }
  /* Legacy rows created before booking-time credentials still need the email,
     but the generated value is never handed back to a staff desk. */
  const issued = await issueCredentials(request, actor || { id: null, role: 'founder' }, false);
  const delivery = await emailParent(issued.request, 'credentials', issued.password);
  await notice(issued.request.studentId, 'credentials', 'Demo login is ready',
    'Check your email for more details. Your demo ID and shared child/parent password are ready.',
    issued.request);
  return {
    demo: publicView(issued.request, actor && actor.role),
    temporaryPassword: null,
    delivery: { email: delivery }
  };
}

async function listRequests(limit) {
  const rows = await Promise.resolve(db.listContactRequests(limit));
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return publicView(row, 'founder');
  });
}

/* Batch allotment links the demo to a trainer and hands the child/parent their
   batch ID and working demo credentials in one step. */
async function onAllotted(batch, trainer) {
  if (!batch) return null;
  const request = await Promise.resolve(db.findContactRequestForStudent(batch.studentId));
  if (!request) return null;
  const trainerId = trainer && trainer.id || batch.trainerId;
  const trainerName = trainer && trainer.name || batch.trainer && batch.trainer.name || 'Mathify trainer';
  const status = String(request.status || 'booked');
  const classAccess = request.classAccess === 'regular' ? 'regular'
    : (status === 'attended' || status === 'enrolled' || request.classAccess === 'post_demo'
      ? 'post_demo' : 'demo');
  const demoState = status === 'enrolled' ? 'enrolled'
    : (status === 'attended' ? 'attended' : 'assigned');
  let current = await saveRequest(request, {
    status: status === 'booked' || status === 'prepared' ? 'assigned' : status,
    batchId: batch.id,
    batchCode: batch.code,
    trainerId: trainerId,
    trainerName: text(trainerName, 120),
    trainerAssignedAt: new Date().toISOString(),
    classAccess: classAccess
  });
  await patchUser(batch.studentId, {
    batchId: batch.id,
    trainerId: trainerId,
    demoState: demoState,
    classAccess: classAccess
  });
  if (current.parentId) {
    await patchUser(current.parentId, {
      batchId: batch.id,
      trainerId: trainerId,
      demoState: demoState,
      classAccess: classAccess
    });
  }

  let issuedPassword = null;
  if (!current.credentialsIssued) {
    const issued = await issueCredentials(current, { id: null, role: 'founder' }, false);
    issuedPassword = issued.password;
    current = issued.request;
  }
  const delivery = await emailParent(current, issuedPassword ? 'credentials' : 'assigned', issuedPassword);
  await notice(current.studentId, 'assignment', 'Trainer assigned for your demo',
    text(trainerName, 120) + ' has been assigned to your child’s demo. Batch ' +
    text(current.batchCode, 40) + ' · Demo ID ' + current.id + '.', current);
  return { demo: publicView(current, 'founder'), delivery: { email: delivery } };
}

/* Ending a demo session closes demo-only class access. Login, payments and
   policy pages remain reachable through the same credentials. */
async function onSessionEnded(session) {
  if (!session || !session.studentId) return null;
  const request = await Promise.resolve(db.findContactRequestForStudent(session.studentId));
  if (!request || OPEN_STATUSES.indexOf(request.status) === -1) return null;
  if (request.batchId && session.batchId && request.batchId !== session.batchId) return null;

  const attendedAt = new Date().toISOString();
  const current = await saveRequest(request, {
    status: 'attended',
    attendedAt: attendedAt,
    classAccess: 'post_demo'
  });
  await patchUser(session.studentId, {
    demoState: 'attended',
    classAccess: 'post_demo',
    demoAttendedAt: attendedAt,
    demoCredentialActive: false
  });
  if (current.parentId) {
    await patchUser(current.parentId, {
      demoState: 'attended',
      classAccess: 'post_demo',
      demoAttendedAt: attendedAt,
      demoCredentialActive: false
    });
  }
  const delivery = await emailParent(current, 'complete', null);
  await notice(current.studentId, 'demo_complete', 'Demo complete',
    'Your demo is complete. Demo credentials now open payments and policies only; choose a pack to continue classes.',
    current);
  return { demo: publicView(current, 'founder'), delivery: { email: delivery } };
}

/* A credited pack restores the ordinary class flow for the family. */
async function onEnrolled(studentId) {
  if (!studentId) return null;
  const request = await Promise.resolve(db.findContactRequestForStudent(studentId));
  if (!request || request.status === 'enrolled') return null;
  const enrolledAt = new Date().toISOString();
  const current = await saveRequest(request, {
    status: 'enrolled',
    enrolledAt: enrolledAt,
    classAccess: 'regular'
  });
  await patchUser(studentId, {
    demoState: 'enrolled',
    classAccess: 'regular',
    demoAttendedAt: request.attendedAt || null,
    demoCredentialActive: false
  });
  if (current.parentId) {
    await patchUser(current.parentId, {
      demoState: 'enrolled',
      classAccess: 'regular',
      demoAttendedAt: request.attendedAt || null,
      demoCredentialActive: false
    });
  }
  /* Regular classes use a readable batch name built from the child's region and
     board. Loaded lazily because batchService already imports this module. */
  let named = null;
  try {
    const batchService = require('./batchService');
    named = await Promise.resolve(batchService.nameForRegularClasses(studentId));
  } catch (error) {
    console.error('[demo] enrollment batch naming failed:', error.message);
  }
  const batchLabel = named && named.code
    ? ' Your batch is ' + named.code + '.'
    : '';
  await notice(current.studentId, 'enrolled', 'Classes are unlocked',
    'Your pack is active. Your child now has regular class access.' + batchLabel, current);
  return publicView(current, 'founder');
}

/* Child/parent status is derived entirely from the signed-in identity. The
   trainer profile is a small allowlisted card, never the onboarding record. */
async function statusFor(user) {
  if (!user || (user.role !== 'student' && user.role !== 'parent')) return null;
  const studentId = user.role === 'student' ? user.id : user.childId;
  if (!studentId) return { demo: null, trainer: null };
  const request = await Promise.resolve(db.findContactRequestForStudent(studentId));
  const view = publicView(request, user.role);
  let trainerProfile = null;
  if (request && request.trainerId) {
    const [trainer, onboarding] = await Promise.all([
      Promise.resolve(db.findUserById(request.trainerId)),
      Promise.resolve(db.findTrainerOnboarding(request.trainerId))
    ]);
    trainerProfile = publicTrainerProfile(trainer, onboarding);
  }
  return {
    demo: view,
    trainer: trainerProfile,
    classAccess: user.classAccess || (request && request.classAccess) ||
      (view && view.canTakeClasses ? 'demo' : 'regular')
  };
}

module.exports = {
  issueAtBooking: issueAtBooking,
  prepare: prepare,
  listRequests: listRequests,
  onAllotted: onAllotted,
  onSessionEnded: onSessionEnded,
  onEnrolled: onEnrolled,
  statusFor: statusFor,
  publicView: publicView,
  publicTrainerProfile: publicTrainerProfile,
  trainerPhoto: trainerPhoto,
  deskLinks: deskLinks
};
