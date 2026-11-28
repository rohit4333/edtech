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
  const connectCss = read('classroom/connect.css');
  const cameraLookJs = read('classroom/camera-background.js');
  const mediaUiJs = read('shared/rtcMediaUi.js');
  const mediaUiCss = read('shared/rtcMediaUi.css');
  const sharedLookCss = read('shared/cameraLook.css');
  check(
    /id="selfVideo"/.test(connectHtml) && /id="peerVideo"/.test(connectHtml),
    'the camera-check page has exactly the two participant feeds'
  );
  check(
    /id="startSessionBtn"/.test(connectHtml) && /Open whiteboard/.test(connectHtml),
    'the trainer has an explicit Open whiteboard handoff'
  );
  check(
    /id="peerAccessBtn"/.test(connectHtml) &&
      /id="peerAccessMenu"/.test(connectHtml) &&
      ['paMediaBtn', 'paMicBtn', 'paCamBtn', 'paReactBtn', 'paSketchBtn'].every(function (id) {
        return new RegExp('id="' + id + '"').test(connectHtml);
      }),
    'the trainer camera deck has a three-dot access menu for every student right'
  );
  check(
    /applyMediaPermission\(state\.mediaPermissions\)/.test(connectJs) &&
      /applySketchPermission\(state\.sketchPermissions\)/.test(connectJs) &&
      /rtc\.media\.control\.changed/.test(connectJs),
    'the camera page applies persisted permissions instead of URL intent'
  );
  check(
    /button\.querySelector\('\[data-control-label\]'\)/.test(connectJs) &&
      !/\$\('\[data-control-label\]', button\)/.test(connectJs) &&
      /mediaPermission\.studentMuted\s*\?\s*'Off'\s*:\s*'On'/.test(connectJs) &&
      /mediaPermission\.studentCameraOff\s*\?\s*'Off'\s*:\s*'On'/.test(connectJs),
    'each access-menu row labels its own control and reports the real mic/camera state'
  );
  check(
    !/session\.js|app\.js|livekit\.js|cursorRelay\.js/.test(connectHtml),
    'the camera-check page never loads the classroom session layer'
  );
  check(!/presence['"]/.test(connectJs), 'the camera-check client never writes presence');
  check(
    /getPreviewToken/.test(connectJs) && /getSessionPresence/.test(connectJs),
    'the camera-check client uses only preview tokens and the safe handoff signal'
  );
  check(
    /board\/open/.test(connectJs) &&
      /board\.opened/.test(connectJs) &&
      /getSessionEvents/.test(connectJs),
    'the trainer publishes board.opened and the child waits for that explicit handoff'
  );
  check(
    !/classroomOpen === true[\s\S]{0,200}window\.location\.assign/.test(connectJs),
    'trainer presence alone never pushes the child out of the shared camera feed'
  );

  check(
    connectHtml.indexOf('shared/rtcMediaUi.js') !== -1 &&
      connectHtml.indexOf('shared/rtcMediaUi.js') < connectHtml.indexOf('connect.js'),
    'the camera-check page loads the shared media UI helper before its own client'
  );
  check(
    /shared\/rtcMediaUi\.css/.test(connectHtml) &&
      /data-media-frame/.test(connectHtml) &&
      /data-speaking/.test(connectHtml) &&
      /data-muted/.test(connectHtml),
    'both camera frames opt into the shared speaking/muted border states'
  );
  ['peerMic', 'selfSpeaking', 'peerSpeaking', 'micLevel', 'selfLevel', 'peerLevel'].forEach(
    function (id) {
      check(
        new RegExp('id="' + id + '"').test(connectHtml),
        'the camera frame exposes the ' + id + ' overlay or level indicator'
      );
    }
  );

  check(
    /window\.mathifyRtcMediaUi\s*=/.test(mediaUiJs),
    'the shared media helper is exposed globally for every camera deck'
  );
  [
    'ActiveSpeakersChanged',
    'TrackMuted',
    'TrackUnmuted',
    'ParticipantDisconnected',
    'Disconnected',
  ].forEach(function (name) {
    check(
      new RegExp('listen\\([\'"]' + name + '[\'"]').test(mediaUiJs),
      'the shared helper follows LiveKit ' + name
    );
  });
  check(
    /participant\.audioLevel/.test(mediaUiJs) &&
      /requestAnimationFrame/.test(mediaUiJs) &&
      /0\.82/.test(mediaUiJs),
    'audio levels are throttled through animation frames and decay towards zero'
  );
  check(
    /--mic-level/.test(mediaUiJs) &&
      /--mic-level/.test(mediaUiCss) &&
      /--teal/.test(mediaUiCss) &&
      /--coral/.test(mediaUiCss),
    'level bars use the project teal/coral tokens through --mic-level'
  );

  check(
    /mathifyRtcMediaUi/.test(connectJs),
    'the camera-check client delegates frame overlays to the shared helper'
  );
  check(
    /renderMediaState\(\);\s*setLocalMedia\('mic'/.test(connectJs) &&
      /renderMediaState\(\);\s*setLocalMedia\('camera'/.test(connectJs),
    'mic and camera controls render optimistically before the SDK promise'
  );
  check(
    /isMicrophoneEnabled/.test(connectJs) &&
      /isCameraEnabled/.test(connectJs) &&
      /could not be changed/.test(connectJs),
    'SDK results are reconciled from real flags and failures restore the prior state'
  );

  /* Camera look + mic evidence are local presentation only. These assertions
     keep the new controls away from the handoff, pay and presence surfaces. */
  [
    'cameraLook',
    'cameraLookLabel',
    'cameraLookHint',
    'cameraBackground',
    'cameraLighting',
    'cameraLookReset',
    'cameraLookLayer',
    'audioVisual',
    'peerAudioVisual',
    'audioSourceHint',
    'audioResumeBtn',
    'selfAudioPulse',
    'peerAudioPulse',
  ].forEach(function (id) {
    check(
      new RegExp('id="' + id + '"').test(connectHtml),
      'the camera deck exposes the ' + id + ' control or indicator'
    );
  });
  [
    'Off',
    'Blur',
    'Mathify paper',
    'Mathify ink',
    'Mathify coral',
    'Auto',
    'Brighter',
    'Softer',
  ].forEach(function (label) {
    check(
      connectHtml.indexOf('>' + label + '</option>') !== -1,
      'camera look offers the ' + label + ' preset'
    );
  });
  check(
    /id="cameraLookReset"[\s\S]{0,200}?>\s*Reset\s*<\/button>/.test(connectHtml),
    'camera look has a visible Reset control'
  );
  check(
    connectHtml.indexOf('camera-background.js') !== -1 &&
      connectHtml.indexOf('camera-background.js') < connectHtml.indexOf('connect.js'),
    'the local camera-look helper loads before the camera client'
  );
  check(
    /shared\/cameraLook\.css/.test(connectHtml) &&
      /data-camera-look-layer/.test(connectHtml) &&
      /data-camera-video/.test(connectHtml),
    'the camera deck uses the shared camera-look layer and video target'
  );
  ['mathify-paper.svg', 'mathify-ink.svg', 'mathify-coral.svg'].forEach(function (name) {
    const image = read('assets/camera-backgrounds/' + name);
    check(
      /viewBox="0 0 1600 900"/.test(image) && /Mathify/.test(image),
      'the branded ' + name + ' camera background is a local versioned asset'
    );
    check(
      sharedLookCss.indexOf('camera-backgrounds/' + name) !== -1,
      'the shared camera-look stylesheet offers ' + name
    );
  });
  check(
    /backdrop-filter: blur/.test(sharedLookCss) &&
      /segmentation or ML model is bundled/.test(sharedLookCss),
    'blur stays an honest radial soft-focus with no segmentation claim'
  );
  check(
    !/<iframe\b/i.test(connectHtml) && !/href=["']#["']/.test(connectHtml),
    'the camera deck adds no iframe and no empty anchor'
  );
  check(
    /localStorage|getStorage/.test(cameraLookJs) &&
      /getItem/.test(cameraLookJs) &&
      /setItem/.test(cameraLookJs) &&
      /removeItem/.test(cameraLookJs),
    'camera look persists its choices only through local storage'
  );
  check(
    !/(api\.|fetch\(|XMLHttpRequest|sendBeacon|sessionId|presence|clock|pay|console\.)/.test(
      cameraLookJs
    ),
    'the local helper exposes no lesson, pay or network surface'
  );
  check(
    /AudioContext/.test(cameraLookJs) &&
      /createAnalyser\(/.test(cameraLookJs) &&
      /getByteTimeDomainData/.test(cameraLookJs) &&
      /getByteFrequencyData/.test(cameraLookJs),
    'mic evidence uses AudioContext and AnalyserNode energy with a frequency fallback'
  );
  check(
    /data-audio-state=["']active["']/.test(connectCss) &&
      /var\(--teal/.test(connectCss) &&
      /@keyframes audioVisualBar/.test(connectCss) &&
      /@keyframes audioPulse/.test(connectCss),
    'active mic evidence animates in teal rather than coral'
  );
  check(
    /object-fit: contain/.test(connectCss) &&
      !/transform:\s*scale\([^)]*\)\s*;[\s\S]{0,80}#selfVideo/.test(connectCss),
    'the camera preview keeps its natural aspect ratio'
  );

  const bindLook = connectJs.match(/function bindCameraLook\(\)\s*\{[\s\S]*?\n {2}\}/);
  check(
    Boolean(bindLook) &&
      /mathifyCameraLook\.init/.test(bindLook[0]) &&
      /mathifyCameraLook\.initAudio/.test(bindLook[0]) &&
      !/(api\.|presence|clock|pay|getPreviewToken|publishBoardOpen|startSessionBtn)/.test(
        bindLook[0]
      ),
    'binding camera look and mic evidence never reaches presence, pay or the handoff'
  );
  const audioMode = connectJs.match(/function audioVisualMode\(\)\s*\{[\s\S]*?\n {2}\}/);
  check(
    Boolean(audioMode) &&
      /studentCanToggleMedia !== true/.test(audioMode[0]) &&
      /if \(!micOn\) return 'muted'/.test(audioMode[0]) &&
      /localMicrophoneTrack\(\)/.test(audioMode[0]),
    'revoked controls and an absent mic fall back to an idle indicator'
  );
  check(
    /setAudioAvailability\('idle'\)/.test(connectJs) &&
      /getRemoteSource: remoteAudioSource/.test(connectJs),
    'preview shutdown stops analysis and a remote level is used only from a real source'
  );

  const cameraLook = require(path.join(workspaceRoot, 'classroom', 'camera-background.js'));
  function lookNode() {
    return {
      value: '',
      disabled: false,
      hidden: false,
      title: '',
      textContent: '',
      dataset: {},
      handlers: {},
      style: {
        values: {},
        setProperty: function (key, value) {
          this.values[key] = value;
        },
      },
      addEventListener: function (name, handler) {
        this.handlers[name] = handler;
      },
      setAttribute: function (name, value) {
        this.dataset['attr_' + name] = value;
      },
      querySelector: function () {
        return null;
      },
      click: function () {
        if (this.handlers.click) this.handlers.click();
      },
      change: function () {
        if (this.handlers.change) this.handlers.change();
      },
    };
  }
  function lookStorage(initial) {
    const values = Object.assign({}, initial || {});
    return {
      values: values,
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
      setItem: function (key, value) {
        values[key] = String(value);
      },
      removeItem: function (key) {
        delete values[key];
      },
    };
  }

  const applyCalls = [];
  const fakeTrack = {
    applyConstraints: function (constraints) {
      applyCalls.push(constraints);
      return Promise.resolve();
    },
  };
  const storedKey = 'mathify.cameraLook.student';
  const storage = lookStorage({
    [storedKey]: JSON.stringify({
      background: 'ink',
      lighting: 'brighter',
      sessionId: 'should-not-survive',
    }),
  });
  const lookTile = lookNode();
  const backgroundSelect = lookNode();
  const lightingSelect = lookNode();
  const resetButton = lookNode();
  const sourceHint = lookNode();
  const audioVisual = lookNode();
  const peerVisual = lookNode();
  check(
    cameraLook.storageKey('student') === storedKey &&
      cameraLook.storageKey('trainer') === 'mathify.cameraLook.trainer',
    'camera look storage is namespaced by role only'
  );
  cameraLook.init({
    role: 'student',
    storage: storage,
    tile: lookTile,
    backgroundSelect: backgroundSelect,
    lightingSelect: lightingSelect,
    resetButton: resetButton,
    getTrack: function () {
      return fakeTrack;
    },
  });
  cameraLook.initAudio({
    audioVisual: audioVisual,
    peerAudioVisual: peerVisual,
    audioSourceHint: sourceHint,
    getTrack: function () {
      return null;
    },
    getRemoteSource: function () {
      return null;
    },
    AudioContext: null,
  });
  check(
    backgroundSelect.value === 'ink' && lightingSelect.value === 'brighter',
    'camera look restores valid stored choices and drops unknown fields'
  );
  check(
    lookTile.dataset.cameraLookReady === 'false' && backgroundSelect.disabled === true,
    'camera look stays disabled until a live feed is attached'
  );
  check(
    applyCalls.length === 0,
    'no capture constraint is attempted before the camera feed is live'
  );
  check(
    audioVisual.dataset.audioState === 'idle' &&
      peerVisual.dataset.audioState === 'idle' &&
      sourceHint.textContent.indexOf('Local mic only') === 0,
    'a missing mic and remote source leave both indicators idle and local-only'
  );
  cameraLook.setFeedAvailable(true);
  check(
    backgroundSelect.disabled === false &&
      lookTile.dataset.cameraLookReady === 'true' &&
      applyCalls.length === 1 &&
      applyCalls[0].exposureCompensation === 0.5 &&
      applyCalls[0].whiteBalanceMode === 'continuous',
    'a live feed enables the controls and applies best-effort capture settings'
  );
  const attempts = cameraLook.constraintAttempts('softer');
  check(
    attempts.length >= 2 &&
      attempts[1].whiteBalanceMode === undefined &&
      attempts[1].exposureCompensation === -0.35,
    'unsupported advanced constraints fall back to compensation only'
  );
  backgroundSelect.value = 'coral';
  backgroundSelect.change();
  check(
    storage.values[storedKey] === JSON.stringify({ background: 'coral', lighting: 'brighter' }) &&
      !/sessionId|token/.test(storage.values[storedKey]),
    'changing background writes only background and lighting locally'
  );
  resetButton.click();
  check(
    !Object.prototype.hasOwnProperty.call(storage.values, storedKey) &&
      backgroundSelect.value === 'off' &&
      lightingSelect.value === 'auto',
    'Reset clears the local key and restores both defaults'
  );
  cameraLook.setFeedAvailable(false);
  check(
    backgroundSelect.disabled === true && lookTile.dataset.cameraLookReady === 'false',
    'camera look disables again when the feed is revoked'
  );
  cameraLook.setAudioAvailability('muted');
  check(
    audioVisual.dataset.audioState === 'muted',
    'an actually muted mic is shown as muted rather than active'
  );
  cameraLook.setAudioAvailability('idle');
  check(
    audioVisual.dataset.audioState === 'idle' && backgroundSelect.disabled === true,
    'revoked controls leave both camera look and mic evidence idle'
  );
  const rmsMonitor = {
    analyser: {
      getByteTimeDomainData: function (samples) {
        for (let i = 0; i < samples.length; i += 1) samples[i] = i % 2 === 0 ? 255 : 1;
      },
    },
    samples: new Uint8Array(8),
  };
  check(
    cameraLook.measure(rmsMonitor) > 0.5,
    'mic level follows real RMS energy from analyser samples'
  );

  [
    'trainer/app.js',
    'trainer/subjectPanels.js',
    'student/app.js',
    'student/subjectPanels.js',
    'unified/shell.js',
    'server/services/notificationService.js',
    'server/services/parentReminderService.js',
  ].forEach(function (relative) {
    const source = read(relative);
    check(
      /classroom\/preflight\.html/.test(source),
      relative + ' sends participants to the readiness gate before the camera page'
    );
  });
  check(
    !/classroom\/index\.html/.test(read('student/app.js')) &&
      !/classroom\/index\.html/.test(read('unified/shell.js')),
    'student desk links no longer bypass the camera check'
  );

  const start = Date.parse('2026-12-01T10:00:00.000Z');
  const session = {
    id: 'preview_unit',
    scheduledAt: new Date(start).toISOString(),
    startsAt: new Date(start).toISOString(),
    status: 'live',
  };
  const joined = new Date(start - MINUTE).toISOString();
  const pausedTiming = sessionTiming.clock(
    session,
    new Date(start + 20 * MINUTE).toISOString(),
    joined,
    { trainerActiveSeconds: 20 * 60, timerRunning: false }
  );
  const resumedTiming = sessionTiming.clock(
    session,
    new Date(start + 35 * MINUTE).toISOString(),
    joined,
    { trainerActiveSeconds: 30 * 60, timerRunning: true }
  );
  check(
    pausedTiming.timerSeconds === 20 * 60 && pausedTiming.timerRunning === false,
    'the visible clock follows counted active minutes and freezes when the trainer leaves'
  );
  check(
    resumedTiming.timerSeconds === 30 * 60 && resumedTiming.timerRunning === true,
    'a rejoin continues from the counted total instead of restarting the class'
  );
  check(
    pausedTiming.activeSecondsInWindow === 20 * 60 &&
      resumedTiming.activeSecondsInWindow === 30 * 60,
    'the pay window keeps the full summed active total across reconnects'
  );

  const lateJoinAt = new Date(start + 5 * MINUTE).toISOString();
  const lateTiming = sessionTiming.clock(
    session,
    new Date(start + 25 * MINUTE).toISOString(),
    lateJoinAt,
    { trainerActiveSeconds: 20 * 60, timerRunning: true }
  );
  check(
    lateTiming.timerSeconds === 20 * 60,
    'a late trainer does not lose the pre-join gap twice on the teaching clock'
  );

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
    return { status: response.status, body: data };
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
    check(Boolean(trainer && student), 'both participants sign in for the camera-check test');

    const before = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      trainer
    );
    const preview = await request('POST', '/api/sessions/ses_math_001/preview-token', {}, trainer);
    check(
      preview.status === 200 &&
        preview.body.rtc &&
        preview.body.rtc.roomName === 'mathify-preview-ses_math_001',
      'the preview token uses a server-owned room outside the session room'
    );
    check(
      preview.body.rtc.roomName !== 'mathify-ses_math_001',
      'the camera check can never join the teaching room'
    );
    const after = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      trainer
    );
    check(
      before.body.events.length === after.body.events.length,
      'issuing a preview token publishes no presence or teaching event'
    );

    const studentPreview = await request(
      'POST',
      '/api/sessions/ses_math_001/preview-token',
      {},
      student
    );
    check(
      studentPreview.status === 200 && studentPreview.body.rtc.identity.indexOf('student-') === 0,
      'the student receives their own server-derived preview identity'
    );

    const studentPresence = await request(
      'GET',
      '/api/sessions/ses_math_001/presence',
      undefined,
      student
    );
    check(
      studentPresence.status === 200 &&
        typeof studentPresence.body.presence.classroomOpen === 'boolean',
      'the child receives a boolean handoff signal'
    );
    check(
      !Object.prototype.hasOwnProperty.call(studentPresence.body.presence, 'trainerJoinedAt') &&
        !Object.prototype.hasOwnProperty.call(studentPresence.body.presence, 'payoutRequirement'),
      'the child presence view exposes no trainer timing or pay data'
    );

    const studentState = await request(
      'GET',
      '/api/sessions/ses_math_001/state',
      undefined,
      student
    );
    check(
      studentState.status === 200 && studentState.body.state.payoutRequirement === null,
      'the student session state carries no trainer pay requirement'
    );
    check(
      studentState.body.state.studentAttendance &&
        typeof studentState.body.state.studentAttendance.activeMinutes === 'number',
      'the child dashboard receives only its own attendance minutes'
    );

    const deniedBoardOpen = await request(
      'POST',
      '/api/sessions/ses_math_001/board/open',
      {},
      student
    );
    check(deniedBoardOpen.status === 403, 'the child cannot publish the whiteboard handoff');

    const boardOpen = await request('POST', '/api/sessions/ses_math_001/board/open', {}, trainer);
    check(
      boardOpen.status === 200 &&
        boardOpen.body.opened === true &&
        Number.isFinite(boardOpen.body.seq),
      'the trainer publishes an explicit board.opened handoff'
    );

    const boardEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const openedEvent = boardEvents.body.events.find(function (event) {
      return event.event === 'board.opened';
    });
    check(
      Boolean(openedEvent) &&
        openedEvent.payload.opened === true &&
        Object.keys(openedEvent.payload).every(function (key) {
          return !/answer|correct|hint|trainer|pay|clock|note/i.test(key);
        }),
      'the child sees a content-free board.opened notification'
    );

    const http = await new Promise(function (resolve) {
      const client = require('http').get(base + '/classroom/connect.html', function (response) {
        let text = '';
        response.on('data', function (chunk) {
          text += chunk;
        });
        response.on('end', function () {
          resolve({ status: response.statusCode, text: text });
        });
      });
      client.on('error', function () {
        resolve({ status: 0, text: '' });
      });
    });
    check(
      http.status === 200 && /connect\.js/.test(http.text),
      'the shared camera-check page is served from the existing public classroom directory'
    );
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }

  console.log('cameraConnect: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
