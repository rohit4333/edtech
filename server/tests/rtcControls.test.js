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
    const instance = app.listen(0, '127.0.0.1', function () {
      resolve(instance);
    });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
    return { status: response.status, body: data, text: text };
  }

  try {
    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app',
      password: 'mathify-demo',
    });
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app',
      password: 'mathify-demo',
    });
    const trainer = trainerLogin.body.token;
    const student = studentLogin.body.token;
    check(Boolean(trainer && student), 'demo roles sign in for the control tests');

    /* Students start with control; a poor connection still blocks the class. */
    const initial = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(
      initial.body.state.permissions.canStudentToggleMedia === true,
      'students have camera/audio controls by default'
    );
    check(
      initial.body.state.mediaPermissions.forceMicOn === false &&
        initial.body.state.mediaPermissions.forceCameraOn === false,
      'no media is forced on without an explicit revoke'
    );
    check(
      initial.body.state.network.canStartCall === false,
      'the class stays closed before the connection check'
    );

    const studentPost = await request(
      'POST',
      '/api/sessions/ses_math_001/media-permission',
      {
        studentCanToggleMedia: false,
      },
      student
    );
    check(studentPost.status === 403, 'a student cannot revoke their own media permission');

    const grant = await request(
      'POST',
      '/api/sessions/ses_math_001/media-permission',
      {
        studentCanToggleMedia: true,
      },
      trainer
    );
    check(
      grant.status === 200 && grant.body.mediaPermissions.studentCanToggleMedia === true,
      'trainer can affirm student media access'
    );

    const revoke = await request(
      'POST',
      '/api/sessions/ses_math_001/media-permission',
      {
        studentCanToggleMedia: false,
      },
      trainer
    );
    check(
      revoke.status === 200 && revoke.body.mediaPermissions.studentCanToggleMedia === false,
      'trainer can revoke student media access'
    );
    check(
      revoke.body.mediaPermissions.forceMicOn === true &&
        revoke.body.mediaPermissions.forceCameraOn === true,
      'revoke marks microphone and camera as forced on'
    );
    check(
      revoke.body.mediaPermissions.version > grant.body.mediaPermissions.version,
      'media permission versions advance on every change'
    );

    const afterRevoke = await request(
      'GET',
      '/api/sessions/ses_math_001/state',
      undefined,
      student
    );
    check(
      afterRevoke.body.state.permissions.canToggleMedia === false &&
        afterRevoke.body.state.permissions.canStudentToggleMedia === false,
      'student state locks the controls after revoke'
    );

    const mediaEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const mediaEvent = mediaEvents.body.events
      .filter(function (event) {
        return event.event === 'rtc.media.control.changed';
      })
      .pop();
    check(Boolean(mediaEvent), 'media permission change reaches the student event stream');
    check(
      mediaEvent.payload.studentCanToggleMedia === false &&
        mediaEvent.payload.forceMicOn === true &&
        mediaEvent.payload.forceCameraOn === true,
      'media event carries the force-on-before-lock instruction'
    );
    check(
      !/answer|correct|hint|trainer|instruction|misconception|key/i.test(
        JSON.stringify(mediaEvent)
      ),
      'media event carries no trainer-only or correctness fields'
    );

    const regrant = await request(
      'POST',
      '/api/sessions/ses_math_001/media-permission',
      {
        studentCanToggleMedia: true,
      },
      trainer
    );
    check(
      regrant.body.mediaPermissions.forceMicOn === false &&
        regrant.body.mediaPermissions.forceCameraOn === false,
      'granting access clears the force flags'
    );

    /* Quiz scratch is granted by default, but a trainer revoke is sticky for
       the whole session, including later questions. */
    const sketchInitial = await request(
      'GET',
      '/api/sessions/ses_math_001/state',
      undefined,
      student
    );
    check(
      sketchInitial.body.state.sketchPermissions.studentCanSketch === true &&
        sketchInitial.body.state.sketchPermissions.version === 0,
      'quiz scratch tools are granted by default'
    );
    const studentSketchSet = await request(
      'POST',
      '/api/sessions/ses_math_001/sketch-permission',
      {
        studentCanSketch: false,
      },
      student
    );
    check(studentSketchSet.status === 403, 'a student cannot revoke their own scratch tools');

    const launch = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/launch',
      {},
      trainer
    );
    const quizSession = launch.body && launch.body.session;
    const question =
      quizSession &&
      quizSession.quiz &&
      quizSession.quiz.questions &&
      quizSession.quiz.questions.find(function (item) {
        return item.id === quizSession.quiz.currentQuestionId;
      });
    check(
      launch.status === 200 && Boolean(question),
      'a live question is available for the scratch permission check'
    );

    const stroke = {
      questionId: question && question.id,
      action: 'stroke',
      stroke: {
        tool: 'pen',
        color: 'coral',
        weight: 'normal',
        points: [
          [0.1, 0.1],
          [0.2, 0.2],
        ],
      },
    };
    check(
      (await request('POST', '/api/sessions/ses_math_001/quiz/sketch', stroke, student)).status ===
        200,
      'the child may sketch while the permission is granted'
    );

    const unsafeSketch = await request(
      'POST',
      '/api/sessions/ses_math_001/quiz/sketch',
      {
        questionId: question && question.id,
        action: 'stroke',
        stroke: {
          id: 'sketch_unsafe',
          tool: 'laser',
          color: 'amber',
          weight: 'bold',
          points: [
            [0.4, 0.4],
            [0.5, 0.5],
          ],
          answer: 2,
          hint: 'do not leak me',
        },
      },
      student
    );
    check(
      unsafeSketch.status === 200,
      'an unsafe sketch payload is accepted only after server sanitising'
    );
    const earlySketchEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const lastSketch = earlySketchEvents.body.events
      .filter(function (event) {
        return event.event === 'quiz.sketch.changed';
      })
      .pop();
    check(
      Boolean(lastSketch) &&
        lastSketch.payload.stroke.tool === 'pen' &&
        lastSketch.payload.stroke.color === 'ink' &&
        !/answer|correct|hint|why|explain|trainer|instruction|misconception|key/i.test(
          JSON.stringify(lastSketch)
        ),
      'sketch events allow only the kid tools, three colours and safe fields'
    );
    const boardInkDenied = await request(
      'POST',
      '/api/sessions/ses_math_001/board/ink',
      {
        page: 1,
        stroke: {
          tool: 'pen',
          color: 'ink',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      },
      student
    );
    check(
      boardInkDenied.status === 403,
      'quiz scratch permission never grants full whiteboard ink access'
    );

    const sketchRevoke = await request(
      'POST',
      '/api/sessions/ses_math_001/sketch-permission',
      {
        studentCanSketch: false,
      },
      trainer
    );
    check(
      sketchRevoke.status === 200 &&
        sketchRevoke.body.sketchPermissions.studentCanSketch === false &&
        sketchRevoke.body.sketchPermissions.version > 0,
      'trainer can revoke quiz scratch tools'
    );
    const afterSketchRevoke = await request(
      'GET',
      '/api/sessions/ses_math_001/state',
      undefined,
      student
    );
    check(
      afterSketchRevoke.body.state.sketchPermissions.studentCanSketch === false &&
        afterSketchRevoke.body.state.permissions.canStudentSketch === false,
      'child state keeps the scratch tools revoked'
    );
    check(
      (
        await request(
          'POST',
          '/api/sessions/ses_math_001/quiz/sketch',
          {
            questionId: question && question.id,
            action: 'clear',
          },
          student
        )
      ).status === 403,
      'the server rejects scratch writes after revoke'
    );

    const nextQuestionResponse = await request(
      'POST',
      '/api/trainer/sessions/ses_math_001/quiz/next',
      {
        force: true,
      },
      trainer
    );
    const nextSession = nextQuestionResponse.body && nextQuestionResponse.body.session;
    const nextQuestion =
      nextSession &&
      nextSession.quiz &&
      nextSession.quiz.questions &&
      nextSession.quiz.questions.find(function (item) {
        return item.id === nextSession.quiz.currentQuestionId;
      });
    const stickyState = await request(
      'GET',
      '/api/sessions/ses_math_001/state',
      undefined,
      student
    );
    check(
      stickyState.body.state.sketchPermissions.studentCanSketch === false,
      'revocation survives the next question'
    );

    const sketchGrant = await request(
      'POST',
      '/api/sessions/ses_math_001/sketch-permission',
      {
        studentCanSketch: true,
      },
      trainer
    );
    check(
      sketchGrant.status === 200 &&
        sketchGrant.body.sketchPermissions.studentCanSketch === true &&
        sketchGrant.body.sketchPermissions.version > sketchRevoke.body.sketchPermissions.version,
      'only an explicit trainer grant restores the scratch tools'
    );

    const sketchEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const sketchEvent = sketchEvents.body.events
      .filter(function (event) {
        return event.event === 'sketch.permission.changed';
      })
      .pop();
    check(
      Boolean(sketchEvent) &&
        sketchEvent.payload.studentCanSketch === true &&
        !/answer|correct|hint|trainer|instruction|misconception|key/i.test(
          JSON.stringify(sketchEvent)
        ),
      'scratch permission events are versioned, safe and visible to the child'
    );

    /* Live option mirroring carries the selected index but never correctness. */
    const selection = await request(
      'POST',
      '/api/student/sessions/ses_math_001/quiz/selection',
      {
        questionId: (nextQuestion || question) && (nextQuestion || question).id,
        optionIndex: 0,
      },
      student
    );
    check(
      selection.status === 200 &&
        selection.body.selected.optionIndex === 0 &&
        selection.body.selected.correct === undefined,
      'the child can mirror an option choice without revealing correctness'
    );

    /* Both sides must pass. A student cannot submit for the trainer role. */
    const low = await request(
      'POST',
      '/api/sessions/ses_math_001/network-check',
      {
        downloadMbps: 4,
        uploadMbps: 3,
        latencyMs: 90,
      },
      trainer
    );
    check(
      low.status === 200 && low.body.ok === false && low.body.network.canStartCall === false,
      'a low-bandwidth result fails the gate'
    );

    const blockedToken = await request(
      'POST',
      '/api/sessions/ses_math_001/rtc-token',
      {
        channel: 'attacker-channel',
      },
      trainer
    );
    check(
      blockedToken.status === 409 && blockedToken.body.error === 'NETWORK_BELOW_MINIMUM',
      'no RTC token is issued while either participant fails the check'
    );

    await request(
      'POST',
      '/api/sessions/ses_math_001/network-check',
      {
        downloadMbps: 30,
        uploadMbps: 20,
        latencyMs: 80,
      },
      trainer
    );
    const oneSided = await request('POST', '/api/sessions/ses_math_001/rtc-token', {}, trainer);
    check(oneSided.status === 409, 'one passing participant is not enough to start class');

    await request(
      'POST',
      '/api/sessions/ses_math_001/network-check',
      {
        downloadMbps: 22,
        uploadMbps: 14,
        latencyMs: 110,
      },
      student
    );
    const trainerToken = await request(
      'POST',
      '/api/sessions/ses_math_001/rtc-token',
      {
        channel: 'attacker-channel',
        uid: 7,
        role: 'subscriber',
      },
      trainer
    );
    const studentToken = await request('POST', '/api/sessions/ses_math_001/rtc-token', {}, student);
    check(
      trainerToken.status === 200 && studentToken.status === 200,
      'the class opens only after both participants pass'
    );
    check(
      trainerToken.body.rtc.roomName !== 'attacker-channel',
      'browser-supplied room name is still ignored after the gate passes'
    );

    const readyState = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(
      readyState.body.state.network.canStartCall === true,
      'session state reports both connections ready'
    );
    check(
      typeof readyState.body.state.network.student.downloadMbps === 'number' &&
        readyState.body.state.network.trainer.downloadMbps === undefined,
      'a student sees their own speed but not the trainer speed'
    );

    const networkEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const networkEvent = networkEvents.body.events
      .filter(function (event) {
        return event.event === 'network.check.completed';
      })
      .pop();
    check(
      Boolean(networkEvent && networkEvent.payload.canStartCall !== undefined),
      'connection gate changes reach the browser event stream'
    );
    check(
      networkEvent.payload.downloadMbps === undefined &&
        networkEvent.payload.uploadMbps === undefined,
      'connection events do not broadcast raw speed measurements'
    );

    const publicConfig = await request('GET', '/api/public/config');
    check(
      publicConfig.body.network.minDownloadMbps === 15 &&
        publicConfig.body.network.minUploadMbps === 10,
      'public policy advertises the 15/10 Mbps connection floor'
    );
    check(
      Array.isArray(publicConfig.body.badges) && publicConfig.body.badges.length >= 5,
      'badge catalog is available to the trainer UI'
    );

    /* Reward badges: fixed catalog, server-owned points, student-safe trophies. */
    const studentBadge = await request(
      'POST',
      '/api/sessions/ses_math_001/badges',
      {
        badgeId: 'focus_star',
      },
      student
    );
    check(studentBadge.status === 403, 'a student cannot award their own badge');

    const unknownBadge = await request(
      'POST',
      '/api/sessions/ses_math_001/badges',
      {
        badgeId: 'free_text',
        label: 'Custom',
        points: 9999,
      },
      trainer
    );
    check(unknownBadge.status === 400, 'unknown or invented badges are rejected');

    const awarded = await request(
      'POST',
      '/api/sessions/ses_math_001/badges',
      {
        badgeId: 'sharp_thinking',
        label: 'Custom',
        points: 9999,
      },
      trainer
    );
    check(
      awarded.status === 201 &&
        awarded.body.badge.label === 'Sharp Thinking' &&
        awarded.body.badge.points === 20,
      'trainer picks a badge while policy owns label and points'
    );
    check(
      awarded.body.badge.awardedBy === undefined && awarded.body.badge.trainerId === undefined,
      'trophy response hides the awarding trainer identity'
    );

    const dashboard = await request('GET', '/api/student/dashboard', undefined, student);
    check(
      dashboard.status === 200 && dashboard.body.dashboard.trophyPoints >= 20,
      'student dashboard includes accumulated reward points'
    );
    check(
      dashboard.body.dashboard.badges.some(function (badge) {
        return badge.badgeId === 'sharp_thinking';
      }),
      'awarded badge appears on the student dashboard'
    );
    check(
      !/awardedBy|trainerId|trainerNotes/.test(dashboard.text),
      'dashboard trophy payload carries no trainer identity or notes'
    );

    const badgeEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const badgeEvent = badgeEvents.body.events
      .filter(function (event) {
        return event.event === 'badge.awarded';
      })
      .pop();
    check(
      Boolean(badgeEvent && badgeEvent.payload.label === 'Sharp Thinking'),
      'student receives a safe badge award notification'
    );

    /* Browser contract: ordered revoke, persistent media, visible trophy UI. */
    const classroomApp = read('classroom/app.js');
    const livekit = read('classroom/livekit.js');
    const sessionLayer = read('classroom/session.js');
    const sessionCss = read('classroom/session.css');
    const classroomHtml = read('classroom/index.html');
    const trainerHtml = read('trainer/index.html');
    const studentHtml = read('student/index.html');
    const studentApp = read('student/app.js');
    const cameraHtml = read('classroom/connect.html');
    const cameraJs = read('classroom/connect.js');
    const cameraCss = read('classroom/connect.css');
    const cameraLookModule = read('classroom/camera-background.js');
    const mediaUiJs = read('shared/rtcMediaUi.js');
    const sharedLookCss = read('shared/cameraLook.css');

    check(
      /id="cameraLook"/.test(cameraHtml) &&
        /id="cameraBackground"/.test(cameraHtml) &&
        /id="cameraLighting"/.test(cameraHtml) &&
        /id="cameraLookReset"/.test(cameraHtml),
      'the camera check exposes compact background, lighting and reset controls'
    );
    check(
      /id="audioVisual"/.test(cameraHtml) &&
        /class="audio-visual-bars"/.test(cameraHtml) &&
        /id="selfAudioPulse"/.test(cameraHtml) &&
        /id="peerAudioVisual"/.test(cameraHtml) &&
        /id="audioResumeBtn"/.test(cameraHtml),
      'the camera deck carries local, remote and resumable mic-evidence indicators'
    );
    check(
      !/<iframe\b/i.test(cameraHtml) && !/href=["']#["']/.test(cameraHtml),
      'the camera deck still has no iframe or empty anchor'
    );
    check(
      /AudioContext/.test(cameraLookModule) &&
        /createAnalyser\(/.test(cameraLookModule) &&
        !/(api\.|fetch\(|XMLHttpRequest|sendBeacon|sessionId|presence|clock|pay|console\.)/.test(
          cameraLookModule
        ),
      'audio analysis stays local and never calls a lesson, pay or network surface'
    );
    const activeAudioBlock = (cameraCss.match(
      /\[data-audio-state=["']active["']\][\s\S]{0,220}?\}/
    ) || [''])[0];
    check(
      /data-audio-state=["']active["']/.test(cameraCss) &&
        /var\(--teal/.test(cameraCss) &&
        /@keyframes audioVisualBar/.test(cameraCss) &&
        Boolean(activeAudioBlock) &&
        !/var\(--coral/.test(activeAudioBlock),
      'active audio bars animate in teal, not coral'
    );
    check(
      /function audioVisualMode\(\)/.test(cameraJs) &&
        /studentCanToggleMedia !== true/.test(cameraJs) &&
        /setAudioAvailability\('idle'\)/.test(cameraJs) &&
        /button\.disabled = !allowed/.test(cameraJs),
      'revoked student controls keep mic evidence and existing media buttons idle/locked'
    );
    check(
      /getRemoteSource: remoteAudioSource/.test(cameraJs) &&
        /Local mic only/.test(cameraLookModule),
      'remote evidence is used only from an exposed stream and is otherwise local-only'
    );

    /* The in-session PiP is the third camera surface: it mirrors the same
       LiveKit audio levels and the same local, role-scoped camera look. */
    check(
      /shared\/rtcMediaUi\.css/.test(classroomHtml) &&
        classroomHtml.indexOf('shared/rtcMediaUi.js') !== -1 &&
        classroomHtml.indexOf('shared/rtcMediaUi.js') < classroomHtml.indexOf('livekit.js'),
      'the whiteboard deck loads the shared audio-level helper before the call client'
    );
    check(
      /id="selfPipLevel"/.test(classroomHtml) &&
        /id="peerPipLevel"/.test(classroomHtml) &&
        /id="selfPipSpeaking"/.test(classroomHtml) &&
        /id="peerPipSpeaking"/.test(classroomHtml) &&
        (classroomHtml.match(/data-media-frame/g) || []).length >= 2,
      'both in-session camera tiles expose teal level bars and speaking badges'
    );
    check(
      /helper\.bind\(state\.room/.test(livekit) &&
        /participant\.audioLevel/.test(mediaUiJs) &&
        /state\.mediaUi/.test(livekit) &&
        /setMediaControlsLocked/.test(livekit),
      'in-session audio animation follows LiveKit levels and survives control updates'
    );
    check(
      /viewerRole: isStudentViewer\(\) \? 'student' : 'trainer'/.test(classroomApp) &&
        /resolveViewerRole/.test(livekit) &&
        /state\.viewerRole/.test(livekit),
      'PiP camera look uses the same role as the signed-in session viewer'
    );
    check(
      ['pipLookBtn', 'pipLookPanel', 'pipBackground', 'pipLighting', 'pipLookReset'].every(
        function (id) {
          return new RegExp('id="' + id + '"').test(classroomHtml);
        }
      ) &&
        /data-camera-look-layer/.test(classroomHtml) &&
        /shared\/cameraLook\.css/.test(classroomHtml),
      'the in-session deck exposes the opt-in background, lighting and reset panel'
    );
    check(
      /function bindPipCameraLook\(\)/.test(livekit) &&
        /function syncPipCameraLook\(\)/.test(livekit) &&
        /state\.controlsLocked/.test(livekit) &&
        /helper\.init/.test(livekit),
      'PiP camera look disables itself while student controls are revoked'
    );
    check(
      /mathify-paper\.svg/.test(sharedLookCss) &&
        /mathify-ink\.svg/.test(sharedLookCss) &&
        /mathify-coral\.svg/.test(sharedLookCss) &&
        /blur\(7px\)/.test(sharedLookCss),
      'the shared look stylesheet uses the generated brand assets and radial blur'
    );

    check(
      !/livekit-client@/.test(trainerHtml) &&
        trainerHtml.indexOf('src="livekit.js"') === -1 &&
        trainerHtml.indexOf('mathify-call-toggle') === -1,
      'the trainer desk has no second live-call panel or duplicated SDK'
    );
    const observerRoleAt = livekit.indexOf("rtc.role === 'subscriber'");
    const observerGuardAt = livekit.search(
      /if \(state\.observer \|\| !state\.room \|\| !state\.room\.localParticipant\)\s*return Promise\.resolve\(false\);/
    );
    const publishAt = livekit.indexOf('setCameraEnabled(Boolean(enabled))');
    check(
      observerRoleAt !== -1 && observerGuardAt !== -1 && publishAt !== -1,
      'the LiveKit observer role, local-track guard and publish path are present'
    );
    check(
      observerGuardAt < publishAt &&
        /if \(state\.observer[\s\S]{0,220}setCameraEnabled\(Boolean\(enabled\)\)/.test(livekit),
      'the observer guard precedes local camera publication'
    );
    check(
      /Observing the 1:1 call/.test(livekit),
      'the observer status text says the user is observing'
    );
    check(
      !/if \(!keepAliveTimer\)/.test(livekit),
      'local-track keepalive is not started unconditionally'
    );

    check(
      /forceStudentMediaOn\(\)[\s\S]*setMediaButtonsLocked\(true\)/.test(classroomApp),
      'student media is forced on before the controls are locked'
    );
    check(
      /studentCanToggleMedia: true/.test(classroomApp),
      'students start with media controls enabled in the classroom'
    );
    check(
      /id="studentMediaAccessBtn"/.test(classroomHtml),
      'trainer media access control is present'
    );
    check(
      /id="scSketchBtn"/.test(classroomHtml) && /studentCanSketch: true/.test(classroomApp),
      'trainer sheet exposes sticky quiz scratch permission'
    );
    check(
      /id="quizSketchCanvas"/.test(classroomHtml) &&
        /data-quiz-tool="pen"/.test(classroomHtml) &&
        /data-quiz-tool="highlighter"/.test(classroomHtml) &&
        /data-quiz-tool="eraser"/.test(classroomHtml) &&
        /id="quizSketchClear"/.test(classroomHtml) &&
        ['ink', 'coral', 'teal'].every(function (color) {
          return new RegExp('data-quiz-color="' + color + '"').test(classroomHtml);
        }),
      'quiz popup exposes pen, highlighter, eraser, clear and exactly three colours'
    );
    check(
      /id="trainerQuizPopup"/.test(classroomHtml) &&
        /id="quizMirrorOptions"/.test(classroomHtml) &&
        /quiz\.option\.selected/.test(sessionLayer) &&
        /paintMirrorSelection/.test(sessionLayer) &&
        !/paintReveal\(\)[\s\S]{0,120}quiz\.option\.selected/.test(sessionLayer),
      'trainer sees a correctness-free paired question mirror'
    );
    check(
      /function syncTrainerReadiness\(\)/.test(sessionLayer) &&
        /paintReveal\(\);\s*syncTrainerReadiness\(\)/.test(sessionLayer) &&
        /if\s*\(isTrainer\)\s*syncTrainerReadiness\(\)/.test(sessionLayer) &&
        /quizState\.chosen\s*=\s*optionIndex/.test(sessionLayer),
      'trainer reveal uses the child mirror and saved attempts for readiness'
    );
    check(
      /sketch\.permission\.changed/.test(sessionLayer) &&
        /quizSketchTools\.classList\.toggle\('is-disabled'/.test(sessionLayer) &&
        /\.quiz-sketch-tools\.is-disabled button/.test(sessionCss) &&
        /\.is-sketch-disabled \.quiz-sketch-canvas/.test(sessionCss),
      'revoked scratch tools stay visible but dull and non-interactive'
    );
    check(
      /id="networkCheckBtn"/.test(classroomHtml),
      'connection check control is present in the call panel'
    );
    check(
      /function reaffirmMedia\(\)/.test(livekit) &&
        /visibilitychange/.test(livekit) &&
        /setInterval/.test(livekit),
      'local tracks are reaffirmed on focus and while the call stays live'
    );
    check(
      /launchQuiz\(\)[\s\S]*reaffirmCallMedia\(\)/.test(sessionLayer),
      'quiz launch reaffirms camera and microphone instead of switching them off'
    );
    check(
      /Open the safe event channel on load[\s\S]{0,80}initRealtime\(\)/.test(sessionLayer),
      'media control events reach a participant even when no quiz is running'
    );
    check(
      /id="trophyList"/.test(studentHtml) && /id="trophyPoints"/.test(studentHtml),
      'student dashboard renders trophies and reward points'
    );
    check(
      /renderTrophies\(data && data\.dashboard\)/.test(studentApp),
      'student dashboard fills trophies from the server response'
    );
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
}

main()
  .then(function () {
    console.log('rtcControls: ' + assertions + ' assertions passed');
  })
  .catch(function (error) {
    console.error(error);
    process.exitCode = 1;
  });
