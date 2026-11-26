/* Privacy boundary audit.
   Trainers and students see each other's display name only. Contact details,
   social links, profile ids and business fields never cross the 1:1 boundary. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const serializers = require('../serializers');
const auth = require('../middleware/auth');

let checks = 0;

async function run() {
function ok(value, message) {
  assert.strictEqual(Boolean(value), true, message);
  checks += 1;
}
function equal(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
  checks += 1;
}
function deepEqual(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  checks += 1;
}

const session = db.findSession('ses_math_001');
const studentUser = db.findUserById('usr_student_001');
const trainerUser = db.findUserById('usr_trainer_001');

const studentSession = serializers.toStudentSession(session);
const trainerSession = serializers.toTrainerSession(session);
const studentState = await serializers.toSessionState(session, studentUser);
const trainerState = await serializers.toSessionState(session, trainerUser);
const todaySession = Object.assign({}, session, { startedAt: new Date().toISOString() });
const studentDashboard = serializers.toStudentDashboard(studentUser, [todaySession]);
const trainerDashboard = serializers.toTrainerDashboard(trainerUser, [todaySession], []);
const register = serializers.toAttendanceRegister([session], []);
const attention = serializers.toTrainerAttention([session], []);

/* Identity returned to the browser is minimal. */
deepEqual(Object.keys(auth.publicUser(studentUser)).sort(), ['id', 'name', 'role'],
  'login identity exposes id, name and role only');
equal(auth.publicUser(studentUser).email, undefined, 'login identity hides email');
equal(auth.publicUser(studentUser).phone, undefined, 'login identity hides phone');
equal(auth.publicUser(studentUser).parentPhone, undefined, 'login identity hides parent phone');

/* Every cross-role participant object is name-only. */
const participantViews = [
  ['student session trainer', studentSession.trainer],
  ['student session student', studentSession.student],
  ['trainer session trainer', trainerSession.trainer],
  ['trainer session student', trainerSession.student],
  ['student state trainer', studentState.participants.trainer],
  ['student state student', studentState.participants.student],
  ['trainer state trainer', trainerState.participants.trainer],
  ['trainer state student', trainerState.participants.student],
  ['student dashboard trainer', studentDashboard.nextSession.trainer],
  ['trainer dashboard student', trainerDashboard.nextSession.student],
  ['trainer summary student', serializers.toTrainerSummary(session).student]
];
attention.items.filter(function (item) { return item.student; }).forEach(function (item) {
  participantViews.push(['attention student', item.student]);
});

participantViews.forEach(function (entry) {
  deepEqual(Object.keys(entry[1] || {}).sort(), ['name'], entry[0] + ' is name-only');
});

/* Trainer attendance needs an opaque row key, never a contact field. */
deepEqual(Object.keys(register.rows[0].student).sort(), ['id', 'name'],
  'attendance row exposes only an opaque key and name');

/* No contact or social data in any student-facing payload. */
const CONTACT_PATTERNS = [
  { pattern: /@/, label: 'email address' },
  { pattern: /(?:\+\d[\d\s-]{7,}|\b\d{10}\b)/, label: 'phone number' },
  { pattern: /wa\.me/i, label: 'WhatsApp link' },
  { pattern: /whatsapp/i, label: 'WhatsApp reference' },
  { pattern: /instagram/i, label: 'Instagram link' },
  { pattern: /facebook/i, label: 'Facebook link' },
  { pattern: /twitter/i, label: 'Twitter link' },
  { pattern: /linkedin/i, label: 'LinkedIn link' },
  { pattern: /mailto:/i, label: 'mailto link' },
  { pattern: /tel:/i, label: 'tel link' }
];

[studentSession, studentState, studentDashboard].forEach(function (payload, index) {
  const text = JSON.stringify(payload);
  CONTACT_PATTERNS.forEach(function (rule) {
    equal(rule.pattern.test(text), false,
      'student payload ' + index + ' has no ' + rule.label);
  });
});

/* A student can load the same static classroom bundle as a trainer, so no
   answer key, hint text or explanation may be embedded in client source. */
const CLIENT_SURFACES = ['classroom', 'student', 'trainer', 'lms'];
const HARDCODED_KEY_PATTERNS = [
  { pattern: /\banswer\s*:\s*\d+\b/, label: 'numeric answer key' },
  { pattern: /[{,]\s*hint\s*:\s*['"`][^'"`]+['"`]/, label: 'hint text' },
  { pattern: /[{,]\s*why\s*:\s*['"`][^'"`]+['"`]/, label: 'explanation text' },
  { pattern: /\banswerKey\s*:\s*['"`]/, label: 'answerKey value' },
  { pattern: /\bcorrectOptionId\s*:\s*['"`]/, label: 'correctOptionId value' }
];
CLIENT_SURFACES.forEach(function (surface) {
  const directory = path.join(__dirname, '..', '..', surface);
  fs.readdirSync(directory).filter(function (name) { return /\.(js|html)$/.test(name); })
    .forEach(function (name) {
      const source = fs.readFileSync(path.join(directory, name), 'utf8');
      HARDCODED_KEY_PATTERNS.forEach(function (rule) {
        equal(rule.pattern.test(source), false,
          surface + '/' + name + ' has no embedded ' + rule.label);
      });
    });
});

/* Classroom calls must use the API client's ensureAuth flow, and the client
   must keep student and trainer tokens apart. */
const workspaceRoot = path.join(__dirname, '..', '..');
const classroomApiSource = fs.readFileSync(path.join(workspaceRoot, 'classroom', 'api.js'), 'utf8');
const classroomSessionSource = fs.readFileSync(
  path.join(workspaceRoot, 'classroom', 'session.js'), 'utf8');
ok(/TOKEN_PREFIX \+ role/.test(classroomApiSource),
  'classroom API stores tokens per viewer role');
ok(/function hasApiAccess\(\)/.test(classroomSessionSource),
  'classroom session checks API auth capability');
ok(/client\.request\(path/.test(classroomSessionSource),
  'classroom session routes requests through the authenticated client');
ok(/function syncViewerRoleFromState\(\)/.test(classroomSessionSource),
  'classroom session adopts the server-verified viewer role');

/* The database layer enforces the same boundary for browser clients. */
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
ok(/create view public\.session_participant_names/.test(schema),
  'name-only participant view exists');
ok(/grant select on[\s\S]*public\.session_participant_names/i.test(schema),
  'authenticated clients can read the name-only view');
ok(!/grant\s+(select|all)[^;]*\bpublic\.users\b/i.test(schema),
  'direct users table reads are never granted');
ok(!/p_trainer_profiles_student_view/.test(schema),
  'students cannot read trainer profile pay rates');
ok(!/p_student_profiles_trainer_view/.test(schema),
  'trainers cannot read student profile rows directly');

console.log('privacyBoundary: ' + checks + ' assertions passed');
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
