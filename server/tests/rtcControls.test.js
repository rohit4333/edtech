/* Regression suite for trainer-owned student media controls, the two-sided
   connection gate, persistent quiz/whiteboard media and reward trophies. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');

const workspaceRoot = path.join(__dirname, '..', '..');

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function read(relative) {
  return fs.readFileSync(path.join(workspaceRoot, relative), 'utf8');
}

async function main() {
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
    return { status: response.status, body: data, text: text };
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
    check(Boolean(trainer && student), 'demo roles sign in for the control tests');

    /* Students start with control; a poor connection still blocks the class. */
    const initial = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(initial.body.state.permissions.canStudentToggleMedia === true,
      'students have camera/audio controls by default');
    check(initial.body.state.mediaPermissions.forceMicOn === false &&
      initial.body.state.mediaPermissions.forceCameraOn === false,
      'no media is forced on without an explicit revoke');
    check(initial.body.state.network.canStartCall === false,
      'the class stays closed before the connection check');

    const studentPost = await request('POST', '/api/sessions/ses_math_001/media-permission', {
      studentCanToggleMedia: false
    }, student);
    check(studentPost.status === 403, 'a student cannot revoke their own media permission');

    const grant = await request('POST', '/api/sessions/ses_math_001/media-permission', {
      studentCanToggleMedia: true
    }, trainer);
    check(grant.status === 200 && grant.body.mediaPermissions.studentCanToggleMedia === true,
      'trainer can affirm student media access');

    const revoke = await request('POST', '/api/sessions/ses_math_001/media-permission', {
      studentCanToggleMedia: false
    }, trainer);
    check(revoke.status === 200 && revoke.body.mediaPermissions.studentCanToggleMedia === false,
      'trainer can revoke student media access');
    check(revoke.body.mediaPermissions.forceMicOn === true &&
      revoke.body.mediaPermissions.forceCameraOn === true,
      'revoke marks microphone and camera as forced on');
    check(revoke.body.mediaPermissions.version > grant.body.mediaPermissions.version,
      'media permission versions advance on every change');

    const afterRevoke = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(afterRevoke.body.state.permissions.canToggleMedia === false &&
      afterRevoke.body.state.permissions.canStudentToggleMedia === false,
      'student state locks the controls after revoke');

    const mediaEvents = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, student);
    const mediaEvent = mediaEvents.body.events.filter(function (event) {
      return event.event === 'rtc.media.control.changed';
    }).pop();
    check(Boolean(mediaEvent), 'media permission change reaches the student event stream');
    check(mediaEvent.payload.studentCanToggleMedia === false &&
      mediaEvent.payload.forceMicOn === true && mediaEvent.payload.forceCameraOn === true,
      'media event carries the force-on-before-lock instruction');
    check(!/answer|correct|hint|trainer|instruction|misconception|key/i.test(JSON.stringify(mediaEvent)),
      'media event carries no trainer-only or correctness fields');

    const regrant = await request('POST', '/api/sessions/ses_math_001/media-permission', {
      studentCanToggleMedia: true
    }, trainer);
    check(regrant.body.mediaPermissions.forceMicOn === false &&
      regrant.body.mediaPermissions.forceCameraOn === false,
      'granting access clears the force flags');

    /* Both sides must pass. A student cannot submit for the trainer role. */
    const low = await request('POST', '/api/sessions/ses_math_001/network-check', {
      downloadMbps: 4, uploadMbps: 3, latencyMs: 90
    }, trainer);
    check(low.status === 200 && low.body.ok === false && low.body.network.canStartCall === false,
      'a low-bandwidth result fails the gate');

    const blockedToken = await request('POST', '/api/sessions/ses_math_001/rtc-token', {
      channel: 'attacker-channel'
    }, trainer);
    check(blockedToken.status === 409 && blockedToken.body.error === 'NETWORK_BELOW_MINIMUM',
      'no RTC token is issued while either participant fails the check');

    await request('POST', '/api/sessions/ses_math_001/network-check', {
      downloadMbps: 30, uploadMbps: 20, latencyMs: 80
    }, trainer);
    const oneSided = await request('POST', '/api/sessions/ses_math_001/rtc-token', {}, trainer);
    check(oneSided.status === 409, 'one passing participant is not enough to start class');

    await request('POST', '/api/sessions/ses_math_001/network-check', {
      downloadMbps: 22, uploadMbps: 14, latencyMs: 110
    }, student);
    const trainerToken = await request('POST', '/api/sessions/ses_math_001/rtc-token', {
      channel: 'attacker-channel', uid: 7, role: 'subscriber'
    }, trainer);
    const studentToken = await request('POST', '/api/sessions/ses_math_001/rtc-token', {}, student);
    check(trainerToken.status === 200 && studentToken.status === 200,
      'the class opens only after both participants pass');
    check(trainerToken.body.rtc.roomName !== 'attacker-channel',
      'browser-supplied room name is still ignored after the gate passes');

    const readyState = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(readyState.body.state.network.canStartCall === true,
      'session state reports both connections ready');
    check(typeof readyState.body.state.network.student.downloadMbps === 'number' &&
      readyState.body.state.network.trainer.downloadMbps === undefined,
      'a student sees their own speed but not the trainer speed');

    const networkEvents = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, student);
    const networkEvent = networkEvents.body.events.filter(function (event) {
      return event.event === 'network.check.completed';
    }).pop();
    check(Boolean(networkEvent && networkEvent.payload.canStartCall !== undefined),
      'connection gate changes reach the browser event stream');
    check(networkEvent.payload.downloadMbps === undefined &&
      networkEvent.payload.uploadMbps === undefined,
      'connection events do not broadcast raw speed measurements');

    const publicConfig = await request('GET', '/api/public/config');
    check(publicConfig.body.network.minDownloadMbps === 15 &&
      publicConfig.body.network.minUploadMbps === 10,
      'public policy advertises the 15/10 Mbps connection floor');
    check(Array.isArray(publicConfig.body.badges) && publicConfig.body.badges.length >= 5,
      'badge catalog is available to the trainer UI');

    /* Reward badges: fixed catalog, server-owned points, student-safe trophies. */
    const studentBadge = await request('POST', '/api/sessions/ses_math_001/badges', {
      badgeId: 'focus_star'
    }, student);
    check(studentBadge.status === 403, 'a student cannot award their own badge');

    const unknownBadge = await request('POST', '/api/sessions/ses_math_001/badges', {
      badgeId: 'free_text', label: 'Custom', points: 9999
    }, trainer);
    check(unknownBadge.status === 400, 'unknown or invented badges are rejected');

    const awarded = await request('POST', '/api/sessions/ses_math_001/badges', {
      badgeId: 'sharp_thinking', label: 'Custom', points: 9999
    }, trainer);
    check(awarded.status === 201 && awarded.body.badge.label === 'Sharp Thinking' &&
      awarded.body.badge.points === 20,
      'trainer picks a badge while policy owns label and points');
    check(awarded.body.badge.awardedBy === undefined && awarded.body.badge.trainerId === undefined,
      'trophy response hides the awarding trainer identity');

    const dashboard = await request('GET', '/api/student/dashboard', undefined, student);
    check(dashboard.status === 200 && dashboard.body.dashboard.trophyPoints >= 20,
      'student dashboard includes accumulated reward points');
    check(dashboard.body.dashboard.badges.some(function (badge) {
      return badge.badgeId === 'sharp_thinking';
    }), 'awarded badge appears on the student dashboard');
    check(!/awardedBy|trainerId|trainerNotes/.test(dashboard.text),
      'dashboard trophy payload carries no trainer identity or notes');

    const badgeEvents = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, student);
    const badgeEvent = badgeEvents.body.events.filter(function (event) {
      return event.event === 'badge.awarded';
    }).pop();
    check(Boolean(badgeEvent && badgeEvent.payload.label === 'Sharp Thinking'),
      'student receives a safe badge award notification');

    /* Browser contract: ordered revoke, persistent media, visible trophy UI. */
    const classroomApp = read('classroom/app.js');
    const livekit = read('classroom/livekit.js');
    const sessionLayer = read('classroom/session.js');
    const classroomHtml = read('classroom/index.html');
    const studentHtml = read('student/index.html');
    const studentApp = read('student/app.js');

    const observerRoleAt = livekit.indexOf("rtc.role === 'subscriber'");
    const observerGuardAt = livekit.indexOf(
      'if (state.observer || !state.room || !state.room.localParticipant) return Promise.resolve(false);');
    const publishAt = livekit.indexOf('setCameraEnabled(Boolean(enabled))');
    check(observerRoleAt !== -1 && observerGuardAt !== -1 && publishAt !== -1,
      'the LiveKit observer role, local-track guard and publish path are present');
    check(observerGuardAt < publishAt &&
      /if \(state\.observer[\s\S]{0,220}setCameraEnabled\(Boolean\(enabled\)\)/.test(livekit),
      'the observer guard precedes local camera publication');
    check(/Observing the 1:1 call/.test(livekit),
      'the observer status text says the user is observing');
    check(!/if \(!keepAliveTimer\)/.test(livekit),
      'local-track keepalive is not started unconditionally');

    check(/forceStudentMediaOn\(\)[\s\S]*setMediaButtonsLocked\(true\)/.test(classroomApp),
      'student media is forced on before the controls are locked');
    check(/studentCanToggleMedia: true/.test(classroomApp),
      'students start with media controls enabled in the classroom');
    check(/id="studentMediaAccessBtn"/.test(classroomHtml),
      'trainer media access control is present');
    check(/id="networkCheckBtn"/.test(classroomHtml),
      'connection check control is present in the call panel');
    check(/function reaffirmMedia\(\)/.test(livekit) &&
      /visibilitychange/.test(livekit) && /setInterval/.test(livekit),
      'local tracks are reaffirmed on focus and while the call stays live');
    check(/launchQuiz\(\)[\s\S]*reaffirmCallMedia\(\)/.test(sessionLayer),
      'quiz launch reaffirms camera and microphone instead of switching them off');
    check(/Open the safe event channel on load[\s\S]{0,80}initRealtime\(\)/.test(sessionLayer),
      'media control events reach a participant even when no quiz is running');
    check(/id="trophyList"/.test(studentHtml) && /id="trophyPoints"/.test(studentHtml),
      'student dashboard renders trophies and reward points');
    check(/renderTrophies\(data && data\.dashboard\)/.test(studentApp),
      'student dashboard fills trophies from the server response');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

main().then(function () {
  console.log('rtcControls: ' + assertions + ' assertions passed');
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
