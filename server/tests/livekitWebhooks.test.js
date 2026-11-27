/* LiveKit webhook contract: real signature verification, replay protection,
   server-derived room ownership, verified participant roles and egress state.
   No mock bypass is used: payloads are signed exactly as LiveKit signs them. */

const assert = require('assert');
const crypto = require('crypto');
const app = require('../app');
const db = require('../db');
const presence = require('../services/presenceService');

const KEY = 'webhook-test-key';
const SECRET = 'webhook-test-secret-that-is-not-a-real-secret';
let checks = 0;

function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signed(body, options) {
  const opts = options || {};
  const checksum = crypto.createHash('sha256').update(body).digest('base64');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: opts.key || KEY,
    sub: 'webhook-test',
    sha256: opts.tamper ? Buffer.from('wrong-checksum').toString('base64') : checksum,
    iat: now, nbf: now, exp: now + 300
  };
  const unsigned = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(claims);
  const jwt = unsigned + '.' + crypto.createHmac('sha256', opts.secret || SECRET)
    .update(unsigned).digest('base64url');
  return jwt;
}

function eventBody(event, sessionId, identity, id) {
  const body = {
    event: event,
    id: id || 'evt_' + crypto.randomUUID(),
    createdAt: String(Math.floor(Date.now() / 1000)),
    room: { sid: 'RM_test', name: 'mathify-' + sessionId }
  };
  if (event.indexOf('participant_') === 0) {
    body.participant = { sid: 'PA_test', identity: identity, name: 'Untrusted display name' };
  }
  if (event.indexOf('egress_') === 0) {
    body.egressInfo = { egressId: 'EG_test', status: 'EGRESS_STARTED' };
  }
  return JSON.stringify(body);
}

async function main() {
  const previousKey = process.env.LIVEKIT_API_KEY;
  const previousSecret = process.env.LIVEKIT_API_SECRET;
  process.env.LIVEKIT_API_KEY = KEY;
  process.env.LIVEKIT_API_SECRET = SECRET;

  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const sessionId = 'ses_math_001';

  async function post(body, options) {
    const opts = options || {};
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    const jwt = signed(body, opts);
    if (!opts.unsigned) {
      headers.authorize = jwt;
      headers.authorization = jwt;
    }
    const response = await fetch(base + '/api/webhooks/livekit', {
      method: 'POST', headers: headers, body: body
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = { raw: text }; }
    return { status: response.status, body: data || {} };
  }

  try {
    db.updateSession(sessionId, function (session) {
      session.status = 'scheduled';
      session.scheduledAt = new Date(Date.now() + 3600000).toISOString();
      session.startedAt = session.scheduledAt;
      return session;
    });

    const joined = eventBody('participant_joined', sessionId, 'trainer-usr_trainer_001', 'evt_join_once');
    const first = await post(joined);
    equal(first.status, 200, 'a correctly signed join webhook is accepted');
    equal(first.body.role, 'trainer', 'the trainer role is derived from the participant identity');
    equal(first.body.kind, 'agora_join', 'a join writes a verified presence join');
    equal(first.body.sessionId, sessionId, 'the room maps back to the server-owned session');

    const eventsAfterJoin = db.listPresenceEvents(sessionId);
    equal(eventsAfterJoin.filter(function (item) { return item.kind === 'agora_join'; }).length, 1,
      'one verified join presence event is stored');

    const presenceSnapshot = await presence.compute(db.findSession(sessionId), Date.now());
    ok(Boolean(presenceSnapshot.trainerJoinedAt),
      'the verified join feeds the presence snapshot used by the T-2m warning');

    const replay = await post(joined);
    equal(replay.status, 200, 'a replay is answered without a retry storm');
    equal(replay.body.duplicate, true, 'the replay carries a duplicate marker');
    equal(db.listPresenceEvents(sessionId).filter(function (item) {
      return item.kind === 'agora_join';
    }).length, 1, 'a replayed event does not create a second presence event');

    const tampered = await post(eventBody('participant_joined', sessionId, 'trainer-usr_trainer_001'),
      { tamper: true });
    equal(tampered.status, 401, 'a tampered body fails the checksum signature check');
    equal(tampered.body.error, 'INVALID_SIGNATURE', 'signature failures use an honest error code');

    const unsigned = await post(eventBody('participant_joined', sessionId, 'trainer-usr_trainer_001'),
      { unsigned: true });
    equal(unsigned.status, 401, 'an unsigned webhook is refused');

    const wrongIdentity = await post(eventBody('participant_joined', sessionId,
      'student-usr_founder_001', 'evt_wrong_identity'));
    equal(wrongIdentity.status, 200, 'an unknown participant is ignored without a retry');
    equal(wrongIdentity.body.ignored, 'participant_not_in_session',
      'a user outside the 1:1 session cannot write presence');

    const unknownRoom = await post(eventBody('participant_joined', 'ses_not_a_real_room',
      'trainer-usr_trainer_001', 'evt_unknown_room'));
    equal(unknownRoom.body.ignored, 'unknown_room', 'an unowned room is ignored');

    const studentJoined = await post(eventBody('participant_joined', sessionId,
      'student-usr_student_001', 'evt_student_join'));
    equal(studentJoined.body.role, 'student', 'the student identity maps to the student role');

    const left = await post(eventBody('participant_left', sessionId,
      'trainer-usr_trainer_001', 'evt_leave'));
    equal(left.body.kind, 'agora_leave', 'a verified leave writes a presence leave');

    const egress = await post(eventBody('egress_ended', sessionId, 'simulator', 'evt_egress_end'));
    equal(egress.body.egressEvent, 'egress_ended', 'egress events are handled');
    equal(db.findSession(sessionId).livekitEgress.status, 'egress_ended',
      'the session records the latest egress status');
    ok(db.findSession(sessionId).livekitEgress.egressId === 'EG_test',
      'the egress id is stored without a browser-supplied value');

    console.log('livekitWebhooks: ' + checks + ' assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    if (previousKey === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.LIVEKIT_API_SECRET;
    else process.env.LIVEKIT_API_SECRET = previousSecret;
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
