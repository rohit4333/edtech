/* Camera-check handoff regression suite.
 *
 * Both participants land on a shared camera-only page. Its LiveKit room is
 * server-owned and outside the presence webhook contract, so camera preview
 * cannot start the clock, write attendance or change pay. The trainer's handoff
 * opens the existing classroom unchanged.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const sessionTiming = require('../services/sessionTimingService');

const workspaceRoot = path.join(__dirname, '..', '..');
const MINUTE = 60 * 1000;
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function read(relative) {
  return fs.readFileSync(path.join(workspaceRoot, relative), 'utf8');
}

async function main() {
  const connectHtml = read('classroom/connect.html');
  const connectJs = read('classroom/connect.js');
  const mediaUiJs = read('shared/rtcMediaUi.js');
  const mediaUiCss = read('shared/rtcMediaUi.css');
  check(/id="selfVideo"/.test(connectHtml) && /id="peerVideo"/.test(connectHtml),
    'the camera-check page has exactly the two participant feeds');
  check(/id="startSessionBtn"/.test(connectHtml) && /Open whiteboard/.test(connectHtml),
    'the trainer has an explicit Open whiteboard handoff');
  check(!/session\.js|app\.js|livekit\.js|cursorRelay\.js/.test(connectHtml),
    'the camera-check page never loads the classroom session layer');
  check(!/presence['"]/.test(connectJs),
    'the camera-check client never writes presence');
  check(/getPreviewToken/.test(connectJs) && /getSessionPresence/.test(connectJs),
    'the camera-check client uses only preview tokens and the safe handoff signal');

  check(connectHtml.indexOf('shared/rtcMediaUi.js') !== -1 &&
    connectHtml.indexOf('shared/rtcMediaUi.js') < connectHtml.indexOf('connect.js'),
  'the camera-check page loads the shared media UI helper before its own client');
  check(/shared\/rtcMediaUi\.css/.test(connectHtml) &&
    /data-media-frame/.test(connectHtml) &&
    /data-speaking/.test(connectHtml) && /data-muted/.test(connectHtml),
  'both camera frames opt into the shared speaking/muted border states');
  ['peerMic', 'selfSpeaking', 'peerSpeaking', 'micLevel', 'selfLevel', 'peerLevel']
    .forEach(function (id) {
      check(new RegExp('id="' + id + '"').test(connectHtml),
        'the camera frame exposes the ' + id + ' overlay or level indicator');
    });

  check(/window\.mathifyRtcMediaUi\s*=/.test(mediaUiJs),
    'the shared media helper is exposed globally for every camera deck');
  ['ActiveSpeakersChanged', 'TrackMuted', 'TrackUnmuted', 'ParticipantDisconnected', 'Disconnected']
    .forEach(function (name) {
      check(new RegExp("listen\\(['\"]" + name + "['\"]").test(mediaUiJs),
        'the shared helper follows LiveKit ' + name);
    });
  check(/participant\.audioLevel/.test(mediaUiJs) &&
    /requestAnimationFrame/.test(mediaUiJs) && /0\.82/.test(mediaUiJs),
  'audio levels are throttled through animation frames and decay towards zero');
  check(/--mic-level/.test(mediaUiJs) && /--mic-level/.test(mediaUiCss) &&
    /--teal/.test(mediaUiCss) && /--coral/.test(mediaUiCss),
  'level bars use the project teal/coral tokens through --mic-level');

  check(/mathifyRtcMediaUi/.test(connectJs),
    'the camera-check client delegates frame overlays to the shared helper');
  check(/renderMediaState\(\);\s*setLocalMedia\('mic'/.test(connectJs) &&
    /renderMediaState\(\);\s*setLocalMedia\('camera'/.test(connectJs),
  'mic and camera controls render optimistically before the SDK promise');
  check(/isMicrophoneEnabled/.test(connectJs) && /isCameraEnabled/.test(connectJs) &&
    /could not be changed/.test(connectJs),
  'SDK results are reconciled from real flags and failures restore the prior state');

  [
    'trainer/app.js',
    'trainer/subjectPanels.js',
    'student/app.js',
    'student/subjectPanels.js',
    'unified/shell.js',
    'server/services/notificationService.js',
    'server/services/parentReminderService.js'
  ].forEach(function (relative) {
    const source = read(relative);
    check(/classroom\/preflight\.html/.test(source),
      relative + ' sends participants to the readiness gate before the camera page');
  });
  check(!/classroom\/index\.html/.test(read('student/app.js')) &&
    !/classroom\/index\.html/.test(read('unified/shell.js')),
  'student desk links no longer bypass the camera check');

  const start = Date.parse('2026-12-01T10:00:00.000Z');
  const session = {
    id: 'preview_unit',
    scheduledAt: new Date(start).toISOString(),
    startsAt: new Date(start).toISOString(),
    status: 'live'
  };
  const joined = new Date(start - MINUTE).toISOString();
  const pausedTiming = sessionTiming.clock(session, new Date(start + 20 * MINUTE).toISOString(),
    joined, { trainerActiveSeconds: 20 * 60, timerRunning: false });
  const resumedTiming = sessionTiming.clock(session, new Date(start + 35 * MINUTE).toISOString(),
    joined, { trainerActiveSeconds: 30 * 60, timerRunning: true });
  check(pausedTiming.timerSeconds === 20 * 60 && pausedTiming.timerRunning === false,
    'the visible clock follows counted active minutes and freezes when the trainer leaves');
  check(resumedTiming.timerSeconds === 30 * 60 && resumedTiming.timerRunning === true,
    'a rejoin continues from the counted total instead of restarting the class');
  check(pausedTiming.activeSecondsInWindow === 20 * 60 &&
    resumedTiming.activeSecondsInWindow === 30 * 60,
  'the pay window keeps the full summed active total across reconnects');

  const lateJoinAt = new Date(start + 5 * MINUTE).toISOString();
  const lateTiming = sessionTiming.clock(session, new Date(start + 25 * MINUTE).toISOString(),
    lateJoinAt, { trainerActiveSeconds: 20 * 60, timerRunning: true });
  check(lateTiming.timerSeconds === 20 * 60,
    'a late trainer does not lose the pre-join gap twice on the teaching clock');

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
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data };
  }

  try {
    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    });
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: 'mathify-demo'
    });
    const trainer = trainerLogin.body.token;
    const student = studentLogin.body.token;
    check(Boolean(trainer && student), 'both participants sign in for the camera-check test');

    const before = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, trainer);
    const preview = await request('POST', '/api/sessions/ses_math_001/preview-token', {}, trainer);
    check(preview.status === 200 && preview.body.rtc &&
      preview.body.rtc.roomName === 'mathify-preview-ses_math_001',
    'the preview token uses a server-owned room outside the session room');
    check(preview.body.rtc.roomName !== 'mathify-ses_math_001',
      'the camera check can never join the teaching room');
    const after = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, trainer);
    check(before.body.events.length === after.body.events.length,
      'issuing a preview token publishes no presence or teaching event');

    const studentPreview = await request('POST', '/api/sessions/ses_math_001/preview-token', {}, student);
    check(studentPreview.status === 200 &&
      studentPreview.body.rtc.identity.indexOf('student-') === 0,
    'the student receives their own server-derived preview identity');

    const studentPresence = await request('GET', '/api/sessions/ses_math_001/presence', undefined, student);
    check(studentPresence.status === 200 &&
      typeof studentPresence.body.presence.classroomOpen === 'boolean',
    'the child receives a boolean handoff signal');
    check(!Object.prototype.hasOwnProperty.call(studentPresence.body.presence, 'trainerJoinedAt') &&
      !Object.prototype.hasOwnProperty.call(studentPresence.body.presence, 'payoutRequirement'),
    'the child presence view exposes no trainer timing or pay data');

    const studentState = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(studentState.status === 200 && studentState.body.state.payoutRequirement === null,
      'the student session state carries no trainer pay requirement');
    check(studentState.body.state.studentAttendance &&
      typeof studentState.body.state.studentAttendance.activeMinutes === 'number',
    'the child dashboard receives only its own attendance minutes');

    const http = await new Promise(function (resolve) {
      const client = require('http').get(base + '/classroom/connect.html', function (response) {
        let text = '';
        response.on('data', function (chunk) { text += chunk; });
        response.on('end', function () { resolve({ status: response.statusCode, text: text }); });
      });
      client.on('error', function () { resolve({ status: 0, text: '' }); });
    });
    check(http.status === 200 && /connect\.js/.test(http.text),
      'the shared camera-check page is served from the existing public classroom directory');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('cameraConnect: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
