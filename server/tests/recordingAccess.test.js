/* Recording access contract: every operating role can watch the classes it is
   entitled to, while links stay role-checked, short-lived and secret-free.
   Founder/RM review all classes; trainer/student/parent stay 1:1 scoped. */

process.env.DATABASE_MODE = process.env.DATABASE_MODE || 'mock';

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const auth = require('../middleware/auth');
const token = require('../auth/token');
const recordingAccess = require('../services/recordingAccessService');

const SESSION_ID = 'ses_math_001';
const OBJECT_KEY = SESSION_ID + '/mathify/test-recording.mp4';
const ENV_KEYS = [
  'LIVEKIT_EGRESS_ENDPOINT', 'LIVEKIT_EGRESS_BUCKET',
  'LIVEKIT_EGRESS_ACCESS_KEY', 'LIVEKIT_EGRESS_SECRET_KEY',
  'LIVEKIT_EGRESS_REGION', 'LIVEKIT_EGRESS_FORCE_PATH_STYLE',
  'LIVEKIT_EGRESS_SESSION_TOKEN'
];
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
  const saved = {};
  ENV_KEYS.forEach(function (key) { saved[key] = process.env[key]; });
  process.env.LIVEKIT_EGRESS_ENDPOINT = 'https://r2.example.test';
  process.env.LIVEKIT_EGRESS_BUCKET = 'mathify-private-recordings';
  process.env.LIVEKIT_EGRESS_ACCESS_KEY = 'example-access-key-id';
  process.env.LIVEKIT_EGRESS_SECRET_KEY = 'example-secret-key-must-never-leak';
  process.env.LIVEKIT_EGRESS_REGION = 'auto';
  process.env.LIVEKIT_EGRESS_FORCE_PATH_STYLE = 'true';
  delete process.env.LIVEKIT_EGRESS_SESSION_TOKEN;

  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(route, user) {
    const headers = { accept: 'application/json' };
    if (user) headers.authorization = 'Bearer ' + token.sign(user);
    const response = await fetch(base + route, { method: 'GET', headers: headers });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (error) { body = { raw: text }; }
    return { status: response.status, body: body || {} };
  }

  try {
    db.updateSession(SESSION_ID, function (session) {
      session.recording = {
        id: 'rec_access_test',
        sessionId: SESSION_ID,
        objectKey: OBJECT_KEY,
        status: 'stopped',
        durationSeconds: 960,
        readyAt: new Date().toISOString(),
        url: null
      };
      return session;
    });

    const outsider = {
      id: 'usr_recording_outsider', name: 'Other Student',
      email: 'other-recording@example.test', role: 'student', status: 'active'
    };
    await Promise.resolve(db.insertUser(outsider));

    const founder = await Promise.resolve(db.findUserById('usr_founder_001'));
    const manager = await Promise.resolve(db.findUserById('usr_rm_001'));
    const trainer = await Promise.resolve(db.findUserById('usr_trainer_001'));
    const student = await Promise.resolve(db.findUserById('usr_student_001'));
    const parent = await Promise.resolve(db.findUserById('usr_parent_001'));

    equal(auth.canAccessRecording(manager, db.findSession(SESSION_ID)), true,
      'a relationship manager may review any class recording');
    equal(auth.canAccessRecording(outsider, db.findSession(SESSION_ID)), false,
      'an unrelated student may not review another child’s recording');

    const roles = [
      ['founder', founder], ['manager', manager], ['trainer', trainer],
      ['student', student], ['parent', parent]
    ];
    for (const [label, user] of roles) {
      const result = await request('/api/recordings/' + SESSION_ID + '/url', user);
      equal(result.status, 200, label + ' receives a private recording link');
      ok(String(result.body.url || '').indexOf(
        'https://r2.example.test/mathify-private-recordings/' + SESSION_ID + '/') === 0,
        label + ' link targets the private bucket under the session id');
      ok(String(result.body.url || '').indexOf('X-Amz-Signature=') !== -1,
        label + ' link is SigV4 signed');
      ok(String(result.body.url || '').indexOf(process.env.LIVEKIT_EGRESS_SECRET_KEY) === -1,
        label + ' link never contains the secret access key');
      equal(result.body.expiresInSeconds <= 3600, true,
        label + ' link expires within one hour');
    }

    const denied = await request('/api/recordings/' + SESSION_ID + '/url', outsider);
    equal(denied.status, 403, 'an unrelated student is refused the signed link');
    equal(denied.body.error, 'FORBIDDEN', 'denial uses an explicit error code');

    const anonymous = await request('/api/recordings/' + SESSION_ID + '/url', null);
    equal(anonymous.status, 401, 'an anonymous request cannot mint a link');

    for (const [label, user] of roles.concat([['outsider', outsider]])) {
      const list = await request('/api/recordings', user);
      equal(list.status, 200, label + ' can read the available recording list');
      const hasSession = (list.body.recordings || []).some(function (item) {
        return item.sessionId === SESSION_ID;
      });
      equal(hasSession, label !== 'outsider',
        label + ' list visibility matches the recording access scope');
      ok(!(list.body.recordings || []).some(function (item) { return item.url; }),
        label + ' list never contains a permanent playback URL');
    }

    console.log('recordingAccess: ' + checks + ' assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    ENV_KEYS.forEach(function (key) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
