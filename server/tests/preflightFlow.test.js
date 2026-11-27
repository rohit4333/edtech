/* Readiness gate → shared camera feed → whiteboard flow.
 *
 * Static contract checks plus a real HTTP probe that proves the Join action's
 * presence heartbeat starts the server-owned class clock. No LiveKit room is
 * joined by this test and no pay or attendance rule is bypassed.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');

const ROOT = path.join(__dirname, '..', '..');
let checks = 0;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}
function ok(value, message) {
  assert.strictEqual(Boolean(value), true, message);
  checks += 1;
}
function equal(actual, expected, message) {
  assert.strictEqual(actual, expected, message);
  checks += 1;
}

async function main() {
  const preflight = read('classroom/preflight.html');
  const preflightJs = read('classroom/preflight.js');
  const preflightCss = read('classroom/preflight.css');
  const connect = read('classroom/connect.html');
  const connectJs = read('classroom/connect.js');
  const trainerApp = read('trainer/app.js');
  const studentApp = read('student/app.js');
  const sw = read('sw.js');
  const manifest = read('webapp/manifest.webmanifest');

  ok(preflight.includes('id="preflightJoin"'), 'preflight has a Join action');
  ok(preflight.includes('>Join the session<'), 'Join action is labelled Join the session');
  ok(preflight.includes('id="presetMic"') && preflight.includes('id="presetCam"'),
    'preflight exposes mic and camera room presets');
  ok(!preflight.includes('id="preflightContinue"') &&
    !preflight.includes('Continue to the camera'),
  'readiness gate has no student bypass button');
  ok(preflightJs.includes("role === 'student' && canJoin") &&
    preflightJs.includes('openCameraPage(false)'),
  'student continues automatically to the camera page after checks');
  ok(!preflight.includes('href="#"'), 'preflight has no dead links');
  ok(!/<iframe/i.test(preflight), 'preflight has no iframe');
  ok(preflightJs.includes("'/presence'") && preflightJs.includes("active: true"),
    'Join writes an active presence heartbeat');
  ok(preflightJs.includes('MATHIFY_STAY_PRESENT = true'),
    'Join marks the navigation as staying in the meeting');
  ok(/search\.set\('mic'|search\.set\(\"mic\"/.test(preflightJs) &&
    /search\.set\('cam'|search\.set\(\"cam\"/.test(preflightJs),
    'presets are forwarded to the camera page');
  ok(preflightCss.includes('preflight-presets'), 'preset controls are styled');

  ok(connect.includes('id="startSessionBtn"'), 'camera page keeps the tested control id');
  ok(connect.includes('>Open whiteboard<'), 'camera page offers the whiteboard option');
  ok(connectJs.includes("params.get('mic')") && connectJs.includes("params.get('cam')"),
    'camera page honours the room presets');
  ok(connectJs.includes('window.MATHIFY_STAY_PRESENT = true'),
    'camera → whiteboard navigation keeps the clock running');
  ok(trainerApp.includes('../classroom/preflight.html?sessionId='),
    'trainer Start class opens the readiness gate');
  ok(studentApp.includes('../classroom/preflight.html?sessionId='),
    'student Join opens the readiness gate');
  ok(sw.includes("'/classroom/preflight.html'") && sw.includes("'/classroom/preflight.js'"),
    'PWA precache includes the readiness gate');
  ok(manifest.includes('/classroom/preflight.html'), 'PWA shortcut opens the readiness gate');

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
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { parsed = text; }
    return { status: response.status, body: parsed, text: text };
  }

  try {
    const page = await request('GET', '/classroom/preflight.html');
    equal(page.status, 200, 'preflight page is served by the app origin');
    ok(page.text.includes('Get ready for class'), 'served page is the readiness gate');

    const login = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    });
    equal(login.status, 200, 'trainer login works');
    const token = login.body.token;

    const before = await request('GET', '/api/sessions/ses_math_001/state', undefined, token);
    equal(before.status, 200, 'session state readable');
    const beforeRunning = before.body.state.sessionTiming.timerRunning === true;

    const joined = await request('POST', '/api/sessions/ses_math_001/presence', {
      active: true, learningEvents: 0
    }, token);
    equal(joined.status, 200, 'Join heartbeat is accepted');
    equal(joined.body.presence.trainer.state, 'active', 'trainer is active after Join');

    const after = await request('GET', '/api/sessions/ses_math_001/state', undefined, token);
    equal(after.body.state.sessionTiming.timerRunning, true,
      'server-owned class clock is running after Join (was ' + beforeRunning + ')');
    equal(after.body.state.sessionTiming.timerSeconds !== null, true,
      'class clock has a real counted total');

    const html403 = await request('GET', '/classroom/preflight.html?devLabel=0');
    equal(html403.status, 200, 'dev label can be hidden explicitly');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('preflightFlow: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
