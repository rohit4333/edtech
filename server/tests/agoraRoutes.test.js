/* GET /api/agora/token contract regression suite.
   No server, sockets or network: token builders, the DB adapter and auth
   middleware are stubbed while the real route and token service run. */

const assert = require('assert');

const agoraSdk = require('agora-token');
const config = require('../config');
const networkQuality = require('../services/networkQualityService');

const ENV_KEYS = ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE'];
const savedEnv = {};
ENV_KEYS.forEach(function (key) { savedEnv[key] = process.env[key]; });

const saved = {
  databaseMode: config.databaseMode,
  rtcBuild: agoraSdk.RtcTokenBuilder.buildTokenWithUid,
  rtmBuild: agoraSdk.RtmTokenBuilder.buildToken,
  bothReady: networkQuality.bothReady,
  findSession: null,
  listSessionsForUser: null,
  requireAuth: null,
  issueSessionToken: null
};

let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function usable(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const users = {
  trainer: { id: 'usr_trainer', name: 'Trainer', role: 'trainer', status: 'active' },
  otherTrainer: { id: 'usr_other', name: 'Other Trainer', role: 'trainer', status: 'active' },
  student: { id: 'usr_student', name: 'Student', role: 'student', status: 'active' },
  founder: { id: 'usr_founder', name: 'Founder', role: 'founder', status: 'active' }
};

const sessions = [
  {
    id: 'ses_a',
    trainerId: users.trainer.id,
    studentId: users.student.id,
    status: 'live',
    rtc: { provider: 'agora', channel: 'mathify-ses_a' }
  },
  {
    id: 'ses_b',
    trainerId: users.otherTrainer.id,
    studentId: users.student.id,
    status: 'live',
    rtc: { provider: 'agora', channel: 'mathify-ses_b' }
  }
];
const sessionsById = {};
sessions.forEach(function (session) { sessionsById[session.id] = session; });

const builderCalls = { rtc: [], rtm: [] };
function goodRtcBuilder() {
  const args = Array.prototype.slice.call(arguments);
  builderCalls.rtc.push(args);
  return 'rtc-built-token';
}
function goodRtmBuilder() {
  const args = Array.prototype.slice.call(arguments);
  builderCalls.rtm.push(args);
  return 'rtm-built-token';
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    sent: false,
    onSend: null,
    status: function (code) { this.statusCode = code; return this; },
    json: function (body) {
      this.body = body;
      this.sent = true;
      if (this.onSend) this.onSend();
      return this;
    }
  };
}

/* Drive one Express layer without an HTTP server. A handler may call next()
   synchronously, return a Promise, or end the response with res.json(). */
function invoke(handle, req, res) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    }
    res.onSend = function () { finish(); };
    try {
      const result = handle(req, res, finish);
      if (result && typeof result.then === 'function') {
        result.then(function () { finish(); }, finish);
      }
    } catch (error) {
      finish(error);
    }
  });
}

async function main() {
  process.env.AGORA_APP_ID = 'a'.repeat(32);
  process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
  config.databaseMode = 'mock';

  agoraSdk.RtcTokenBuilder.buildTokenWithUid = goodRtcBuilder;
  agoraSdk.RtmTokenBuilder.buildToken = goodRtmBuilder;
  networkQuality.bothReady = function () { return true; };

  /* Token service: server-owned identity, Publisher role and one-hour TTL. */
  const tokenService = require('../services/agoraTokenService');
  saved.issueSessionToken = tokenService.issueSessionToken;

  const before = Math.floor(Date.now() / 1000);
  const issued = tokenService.issueSessionToken(sessions[0], users.trainer);
  const after = Math.floor(Date.now() / 1000);
  equal(issued.role, 'publisher', 'RTC builder role is Publisher');
  equal(issued.expiresInSeconds, 3600, 'issued tokens advertise a 3600s lifetime');
  ok(issued.expiresAt >= before + 3600 && issued.expiresAt <= after + 3600,
    'expiresAt is exactly 3600 seconds after issue time');
  ok(usable(issued.rtcToken) && usable(issued.rtmToken),
    'real RTM token issuance returns a usable token, never null');
  equal(builderCalls.rtc.length, 1, 'RTC builder was called once');
  equal(builderCalls.rtc[0][4], agoraSdk.RtcRole.PUBLISHER, 'builder receives RtcRole.PUBLISHER');
  equal(builderCalls.rtc[0][5], 3600, 'RTC token expiry is 3600 seconds');
  equal(builderCalls.rtc[0][6], 3600, 'RTC privilege expiry is 3600 seconds');
  equal(builderCalls.rtm.length, 1, 'RTM builder was called once');
  equal(builderCalls.rtm[0][3], 3600, 'RTM token expiry is 3600 seconds');
  equal(builderCalls.rtm[0][2], String(tokenService.numericUid(users.trainer.id)),
    'RTM uid is derived from the signed-in user');
  equal(issued.rtmToken, 'rtm-built-token', 'RTM token comes from the server builder');

  /* Founder is an explicit observer: subscriber privilege, never a publisher. */
  builderCalls.rtc.length = 0;
  const observerIssued = tokenService.issueSessionToken(sessions[0], users.founder);
  equal(observerIssued.role, 'subscriber', 'founder observer token reports subscriber role');
  equal(observerIssued.observer, true, 'founder observer token reports observer state');
  equal(observerIssued.viewerRole, 'founder', 'founder keeps a sensible viewer role');
  equal(builderCalls.rtc.length, 1, 'founder observer RTC builder was called once');
  equal(builderCalls.rtc[0][4], agoraSdk.RtcRole.SUBSCRIBER,
    'builder receives RtcRole.SUBSCRIBER for founder');
  equal(builderCalls.rtc[0][5], 3600, 'founder RTC token expiry is 3600 seconds');
  equal(builderCalls.rtc[0][6], 3600, 'founder RTC privilege expiry is 3600 seconds');

  /* Live mode must fail closed when the builder yields an empty token. */
  config.databaseMode = 'supabase';
  agoraSdk.RtmTokenBuilder.buildToken = function () { return ''; };
  assert.throws(function () {
    tokenService.issueSessionToken(sessions[0], users.trainer);
  }, function (error) { return error.code === 'RTM_TOKEN_FAILED'; });
  checks += 1;

  /* Mock mode has an explicit allowance: deterministic, non-null tokens. */
  config.databaseMode = 'mock';
  agoraSdk.RtcTokenBuilder.buildTokenWithUid = function () { return ''; };
  const mockIssued = tokenService.issueSessionToken(sessions[0], users.trainer);
  ok(mockIssued.rtmToken.indexOf('mock_rtm_') === 0,
    'mock mode supplies a deterministic RTM token instead of null');
  ok(mockIssued.rtcToken.indexOf('mock_rtc_') === 0,
    'mock mode supplies a deterministic RTC token instead of an empty string');
  const mockObserverIssued = tokenService.issueSessionToken(sessions[0], users.founder);
  ok(mockObserverIssued.rtcToken.indexOf('mock_rtc_') === 0,
    'mock mode supplies a deterministic RTC token for the founder observer');
  ok(mockObserverIssued.rtcToken !== mockIssued.rtcToken,
    'mock RTC digest includes role so observer tokens are distinct');
  agoraSdk.RtmTokenBuilder.buildToken = goodRtmBuilder;
  agoraSdk.RtcTokenBuilder.buildTokenWithUid = goodRtcBuilder;
  config.databaseMode = saved.databaseMode;

  /* Stub the data and identity boundaries before loading the router. */
  const db = require('../db');
  const auth = require('../middleware/auth');
  saved.findSession = db.findSession;
  saved.listSessionsForUser = db.listSessionsForUser;
  saved.requireAuth = auth.requireAuth;

  db.findSession = async function (id) {
    return sessionsById[id] ? Object.assign({}, sessionsById[id]) : null;
  };
  db.listSessionsForUser = async function (user) {
    return sessions.filter(function (session) {
      return auth.canAccessSession(user, session);
    }).map(function (session) { return Object.assign({}, session); });
  };
  auth.requireAuth = function (req, res, next) { return next(); };

  const router = require('../routes/agora');
  const tokenLayer = router.stack.filter(function (layer) {
    return layer.route && layer.route.path === '/token' && layer.route.methods.get;
  })[0];
  ok(Boolean(tokenLayer), 'GET /token route is mounted on the Agora router');

  const routeCalls = [];
  tokenService.issueSessionToken = function (session, user) {
    routeCalls.push({ session: session, user: user });
    const observer = user.role === 'founder';
    return {
      provider: 'agora',
      mode: 'agora',
      appId: 'stub-app-id',
      channelName: String(session.rtc.channel),
      channel: String(session.rtc.channel),
      uid: tokenService.numericUid(user.id),
      peerUid: tokenService.numericUid(session.studentId),
      rtcToken: 'stub-rtc-token',
      rtmToken: 'stub-rtm-token',
      role: observer ? 'subscriber' : 'publisher',
      observer: observer,
      viewerRole: observer ? 'founder' : (user.role === 'student' ? 'student' : 'trainer'),
      expiresInSeconds: 3600
    };
  };

  async function invokeRoute(layer, req) {
    const res = mockResponse();
    for (const entry of layer.route.stack) {
      await invoke(entry.handle, req, res);
      if (res.sent) break;
    }
    return res;
  }

  async function getToken(query, user, body) {
    const req = {
      query: query,
      body: body || {},
      headers: {},
      user: auth.sessionUser(user)
    };
    return invokeRoute(tokenLayer, req);
  }

  const trainerUid = String(tokenService.numericUid(users.trainer.id));
  const otherUid = String(tokenService.numericUid(users.otherTrainer.id));
  const founderUid = String(tokenService.numericUid(users.founder.id));
  let res;

  /* A browser cannot invent a channel or borrow another trainer's room. */
  res = await getToken({ channelName: 'attacker-channel', uid: trainerUid }, users.trainer);
  equal(res.statusCode, 404, 'an unknown channel is refused');
  ok(!res.body || !usable(res.body.rtcToken), 'unknown channel issues no RTC token');

  res = await getToken({ channelName: sessions[0].rtc.channel, uid: otherUid }, users.otherTrainer);
  ok(res.statusCode === 403 || res.statusCode === 404,
    'a channel outside the caller\'s authorized sessions is refused');
  ok(!res.body || !usable(res.body.rtcToken), 'unauthorized channel issues no RTC token');

  res = await getToken({ channelName: sessions[0].rtc.channel }, users.trainer);
  equal(res.statusCode, 400, 'channelName without uid is refused');
  res = await getToken({ channelName: sessions[0].rtc.channel, uid: '7' }, users.trainer);
  equal(res.statusCode, 403, 'a uid that does not match the caller is refused');

  /* Matching channelName + uid resolves to the authorized session. */
  routeCalls.length = 0;
  res = await getToken({ channelName: sessions[0].rtc.channel, uid: trainerUid }, users.trainer);
  equal(res.statusCode, 200, 'authorized channelName/uid pair succeeds');
  equal(res.body.channelName, sessions[0].rtc.channel, 'token keeps the server-owned channel');
  equal(res.body.uid, Number(trainerUid), 'token keeps the server-derived uid');
  equal(res.body.role, 'publisher', 'a real participant still receives publisher role');
  equal(res.body.observer, false, 'a real participant is not marked as an observer');
  ok(usable(res.body.rtmToken), 'successful response carries an RTM token');
  equal(routeCalls.length, 1, 'one authorized session was used for issuance');
  equal(routeCalls[0].session.id, 'ses_a', 'issuance uses the resolved authorized session');

  /* Existing classroom callers still send sessionId only. */
  routeCalls.length = 0;
  res = await getToken({ sessionId: 'ses_a' }, users.trainer);
  equal(res.statusCode, 200, 'authenticated sessionId path still works');
  equal(routeCalls[0].session.id, 'ses_a', 'sessionId path issues against its own session');

  res = await getToken({ sessionId: 'ses_b' }, users.trainer);
  equal(res.statusCode, 403, 'sessionId path still enforces session authorization');

  /* The legacy GET route must not bypass the explicit founder observer gate. */
  routeCalls.length = 0;
  res = await getToken({ sessionId: 'ses_a' }, users.founder);
  equal(res.statusCode, 403, 'implicit founder token is denied on the legacy path');
  equal(res.body.error, 'FOUNDER_OBSERVER_REQUIRED',
    'legacy path reports the same observer gate as the session route');
  ok(!res.body || !usable(res.body.rtcToken), 'implicit founder denial issues no RTC token');
  equal(routeCalls.length, 0, 'denied founder observer never reaches token issuance');

  routeCalls.length = 0;
  res = await getToken({ sessionId: 'ses_a' }, users.founder, { observer: true });
  equal(res.statusCode, 200, 'explicit founder observer is allowed on the legacy path');
  equal(res.body.role, 'subscriber', 'legacy observer token is a subscriber token');
  equal(res.body.observer, true, 'legacy observer token is marked read-only');
  equal(res.body.viewerRole, 'founder', 'legacy observer token keeps the founder viewer role');
  equal(routeCalls.length, 1, 'explicit founder observer reaches token issuance once');

  const asyncFindSession = db.findSession;
  db.findSession = function () { return Promise.resolve(Object.assign({}, sessions[0])); };
  res = await getToken({ sessionId: 'ses_a' }, users.trainer);
  equal(res.statusCode, 200, 'an async adapter Promise is awaited, not used as a session');
  db.findSession = asyncFindSession;

  const originalList = db.listSessionsForUser;
  db.listSessionsForUser = async function () {
    return [
      { id: 'dup_1', rtc: { channel: 'duplicated-channel' } },
      { id: 'dup_2', rtc: { channel: 'duplicated-channel' } }
    ];
  };
  res = await getToken({ channelName: 'duplicated-channel', uid: founderUid }, users.founder);
  equal(res.statusCode, 409, 'duplicate channel is refused');
  equal(res.body.error, 'AMBIGUOUS_CHANNEL', 'duplicate channel reports ambiguity');
  ok(!res.body || !usable(res.body.rtcToken), 'ambiguous channel issues no token');
  db.listSessionsForUser = originalList;

  /* Recording control stays with the trainer even for an explicit observer. */
  const startLayer = router.stack.filter(function (layer) {
    return layer.route && layer.route.path === '/recording/start' && layer.route.methods.post;
  })[0];
  const stopLayer = router.stack.filter(function (layer) {
    return layer.route && layer.route.path === '/recording/stop' && layer.route.methods.post;
  })[0];
  ok(Boolean(startLayer && stopLayer), 'recording start/stop routes are mounted');
  const founderControlReq = {
    query: { sessionId: 'ses_a' },
    body: { observer: true },
    headers: {},
    user: auth.sessionUser(users.founder)
  };
  res = await invokeRoute(startLayer, founderControlReq);
  equal(res.statusCode, 403, 'a founder observer cannot start a recording');
  equal(res.body.error, 'FORBIDDEN', 'recording start denies the founder observer explicitly');
  res = await invokeRoute(stopLayer, founderControlReq);
  equal(res.statusCode, 403, 'a founder observer cannot stop a recording');
  equal(res.body.error, 'FORBIDDEN', 'recording stop denies the founder observer explicitly');

  console.log('agoraRoutes: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
}).finally(function () {
  dbRestore();
  restoreEnv();
});

function dbRestore() {
  /* Modules are restored in a helper so failures still leave the process clean. */
  try {
    const db = require('../db');
    const auth = require('../middleware/auth');
    const tokenService = require('../services/agoraTokenService');
    if (saved.findSession) db.findSession = saved.findSession;
    if (saved.listSessionsForUser) db.listSessionsForUser = saved.listSessionsForUser;
    if (saved.requireAuth) auth.requireAuth = saved.requireAuth;
    if (saved.issueSessionToken) tokenService.issueSessionToken = saved.issueSessionToken;
  } catch (error) {
    console.error('Restore db stubs failed:', error.message);
  }
  try {
    agoraSdk.RtcTokenBuilder.buildTokenWithUid = saved.rtcBuild;
    agoraSdk.RtmTokenBuilder.buildToken = saved.rtmBuild;
    networkQuality.bothReady = saved.bothReady;
    config.databaseMode = saved.databaseMode;
  } catch (error) {
    console.error('Restore token stubs failed:', error.message);
  }
}

function restoreEnv() {
  ENV_KEYS.forEach(function (key) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
}
