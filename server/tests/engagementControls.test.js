/* Regression suite for brand-safe celebrations, kid reactions and the single
   Student Control surface that holds every trainer permission. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const celebrations = require('../services/celebrationService');
const reactionService = require('../services/reactionService');
const reactionPermission = require('../services/reactionPermissionService');
const mediaPermission = require('../services/mediaPermissionService');

const workspaceRoot = path.join(__dirname, '..', '..');

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}
function read(relative) {
  return fs.readFileSync(path.join(workspaceRoot, relative), 'utf8');
}
function forbidden(text) {
  return /answer|correct|hint|why|explain|trainer|instruction|misconception|key/i.test(text);
}
/* Role words are legitimate values (a kid applauds the trainer), so the
   privacy contract is checked against keys, not against every string value. */
function forbiddenKeys(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(forbiddenKeys);
  return Object.keys(value).some(function (key) {
    return forbidden(key) || forbiddenKeys(value[key]);
  });
}

async function main() {
  celebrations.reset();

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
    check(Boolean(trainer && student), 'demo roles sign in for engagement tests');

    /* ------------------------------------------------ reactions + permissions */
    const initial = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(
      initial.body.state.permissions.canStudentApplaud === true &&
        initial.body.state.permissions.canStudentReact === true,
      'kid emoji and applause are enabled by default'
    );
    check(
      initial.body.state.reactionPermissions.version === 0,
      'reaction permissions start at version zero'
    );

    const applaud = await request(
      'POST',
      '/api/sessions/ses_math_001/reactions',
      { emoji: '👏' },
      student
    );
    check(applaud.status === 201, 'kid can applaud the trainer');
    const insight = await request(
      'POST',
      '/api/sessions/ses_math_001/reactions',
      { emoji: '💡' },
      student
    );
    check(insight.status === 201, 'kid can send an emoji reaction');
    const stolen = await request(
      'POST',
      '/api/sessions/ses_math_001/reactions',
      { emoji: '⭐' },
      student
    );
    check(
      stolen.status === 400 && stolen.body.error === 'INVALID_REACTION',
      'a kid cannot send a trainer-only reaction'
    );

    const pauseApplause = await request(
      'POST',
      '/api/sessions/ses_math_001/reaction-permission',
      {
        studentCanApplaud: false,
      },
      trainer
    );
    check(
      pauseApplause.status === 200 &&
        pauseApplause.body.reactionPermissions.studentCanApplaud === false &&
        pauseApplause.body.reactionPermissions.studentCanReact === true,
      'trainer can pause applause without pausing emoji'
    );
    check(
      (await request('POST', '/api/sessions/ses_math_001/reactions', { emoji: '👏' }, student))
        .status === 403,
      'paused applause is rejected at the server'
    );
    check(
      (await request('POST', '/api/sessions/ses_math_001/reactions', { emoji: '🤔' }, student))
        .status === 201,
      'emoji still works while applause is paused'
    );

    const pauseEmoji = await request(
      'POST',
      '/api/sessions/ses_math_001/reaction-permission',
      {
        studentCanReact: false,
      },
      trainer
    );
    check(
      pauseEmoji.status === 200 &&
        pauseEmoji.body.reactionPermissions.studentCanReact === false &&
        pauseEmoji.body.reactionPermissions.studentCanApplaud === false,
      'pausing emoji leaves the applause pause untouched'
    );
    check(
      pauseEmoji.body.reactionPermissions.version > pauseApplause.body.reactionPermissions.version,
      'each permission change advances the version'
    );
    check(
      (await request('POST', '/api/sessions/ses_math_001/reactions', { emoji: '✅' }, student))
        .status === 403,
      'paused emoji reactions are rejected at the server'
    );
    check(
      (
        await request(
          'POST',
          '/api/sessions/ses_math_001/reaction-permission',
          {
            studentCanApplaud: true,
          },
          student
        )
      ).status === 403,
      'a student cannot change engagement permissions'
    );

    const restore = await request(
      'POST',
      '/api/sessions/ses_math_001/reaction-permission',
      {
        studentCanReact: true,
        studentCanApplaud: true,
      },
      trainer
    );
    check(
      restore.status === 200 &&
        restore.body.reactionPermissions.studentCanReact === true &&
        restore.body.reactionPermissions.studentCanApplaud === true,
      'trainer can restore both kid gestures together'
    );
    check(
      (await request('POST', '/api/sessions/ses_math_001/reactions', { emoji: '👏' }, student))
        .status === 201,
      'applause works again after restore'
    );

    for (const emoji of ['🎉', '🥳', '❤️']) {
      const celebrationReaction = await request(
        'POST',
        '/api/sessions/ses_math_001/reactions',
        {
          emoji: emoji,
        },
        student
      );
      check(celebrationReaction.status === 201, 'student can send the celebration emoji ' + emoji);
    }
    const trainerFire = await request(
      'POST',
      '/api/sessions/ses_math_001/reactions',
      { emoji: '🔥' },
      trainer
    );
    check(trainerFire.status === 201, 'trainer can send 🔥');
    check(
      (await request('POST', '/api/sessions/ses_math_001/reactions', { emoji: '⭐' }, student))
        .status === 400,
      '⭐ stays trainer/founder-only after the emoji expansion'
    );

    const reactionEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    const sent = reactionEvents.body.events.filter(function (event) {
      return event.event === 'reaction.sent';
    });
    const permissionEvents = reactionEvents.body.events.filter(function (event) {
      return event.event === 'reaction.permission.changed';
    });
    check(
      sent.some(function (event) {
        return (
          event.payload.emoji === '👏' &&
          event.payload.fromRole === 'student' &&
          event.payload.toRole === 'trainer'
        );
      }),
      'kid applause is explicitly addressed to the trainer'
    );
    check(
      permissionEvents.length >= 3 && !forbiddenKeys(permissionEvents),
      'permission events are versioned and scrubbed'
    );
    check(!forbiddenKeys(sent), 'reaction events carry no trainer-only fields');
    check(
      reactionService.allowedFor('student').indexOf('👏') >= 0 &&
        reactionService.allowedFor('student').indexOf('⭐') < 0 &&
        reactionService.allowedFor('trainer').indexOf('🎯') >= 0,
      'reaction roles are allowlisted from the JWT role'
    );
    check(
      ['💡', '🤔', '✅', '👏', '🎉', '🥳', '❤️'].every(function (emoji) {
        return reactionService.allowedFor('student').indexOf(emoji) >= 0;
      }) &&
        reactionService.allowedFor('student').indexOf('🔥') < 0 &&
        ['👏', '⭐', '🎯', '🎉', '🥳', '🔥'].every(function (emoji) {
          return (
            reactionService.allowedFor('trainer').indexOf(emoji) >= 0 &&
            reactionService.allowedFor('founder').indexOf(emoji) >= 0
          );
        }),
      'the expanded reaction lists still separate student and trainer roles'
    );
    check(
      reactionService.summarise([{ emoji: '👏', minute: 2 }]).applausePct === 100,
      'engagement summary counts trainer-directed applause'
    );
    const mixed = reactionService.summarise([
      { emoji: '👏', minute: 2 },
      { emoji: '🎉', minute: 2 },
      { emoji: '🥳', minute: 2 },
    ]);
    check(
      mixed.applausePct === 100 &&
        mixed.counts['🎉'] === 1 &&
        mixed.counts['🥳'] === 1 &&
        mixed.counts['❤️'] === 0 &&
        mixed.counts['🔥'] === 0,
      'celebration emojis are counted without diluting the five-signal score'
    );
    check(
      reactionPermission.normalize({}).studentCanReact === true &&
        reactionPermission.normalize({}).studentCanApplaud === true,
      'permission service defaults both gestures to enabled'
    );

    /* ---------------------------------------------------- camera / microphone */
    const mediaOff = await request(
      'POST',
      '/api/sessions/ses_math_001/media-state',
      {
        micOn: false,
        cameraOn: false,
      },
      trainer
    );
    check(
      mediaOff.status === 200 &&
        mediaOff.body.mediaPermissions.studentMuted === true &&
        mediaOff.body.mediaPermissions.studentCameraOff === true,
      'trainer can intentionally mute the kid and switch the camera off'
    );
    check(
      (
        await request(
          'POST',
          '/api/sessions/ses_math_001/media-state',
          {
            micOn: true,
          },
          student
        )
      ).status === 403,
      'a student cannot set trainer media state'
    );
    check(
      (await request('POST', '/api/sessions/ses_math_001/media-state', {}, trainer)).status === 400,
      'media state rejects an empty patch'
    );

    const mediaState = await request('GET', '/api/sessions/ses_math_001/state', undefined, student);
    check(
      mediaState.body.state.mediaPermissions.studentMuted === true &&
        mediaState.body.state.mediaPermissions.studentCameraOff === true,
      'student state reflects the trainer media decision'
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
      revoke.body.mediaPermissions.forceMicOn === true &&
        revoke.body.mediaPermissions.forceCameraOn === true &&
        revoke.body.mediaPermissions.studentMuted === true &&
        revoke.body.mediaPermissions.studentCameraOff === true,
      'Access revoke keeps force-on flags without undoing an explicit off'
    );
    check(
      revoke.body.mediaPermissions.version > mediaOff.body.mediaPermissions.version,
      'explicit media state and Access each advance the version'
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
    check(
      mediaEvent &&
        mediaEvent.payload.studentMuted === true &&
        mediaEvent.payload.studentCameraOff === true &&
        !forbiddenKeys(mediaEvent),
      'media events carry the honest off state and no forbidden fields'
    );

    const mediaGrant = await request(
      'POST',
      '/api/sessions/ses_math_001/media-permission',
      {
        studentCanToggleMedia: true,
      },
      trainer
    );
    const unmute = await request(
      'POST',
      '/api/sessions/ses_math_001/media-state',
      {
        micOn: true,
        cameraOn: true,
      },
      trainer
    );
    check(
      mediaGrant.body.mediaPermissions.forceMicOn === false &&
        unmute.body.mediaPermissions.studentMuted === false &&
        unmute.body.mediaPermissions.studentCameraOff === false,
      'trainer can restore microphone and camera together'
    );
    check(
      mediaPermission.normalize(mediaPermission.setRemoteState({ version: 2 }, { micOn: false }))
        .studentMuted === true,
      'media state service records an explicit mute'
    );

    /* --------------------------------------------------------- celebrations */
    const publicConfig = await request('GET', '/api/public/config');
    const cfg = publicConfig.body.celebrations;
    check(
      cfg.types.length === 6 && cfg.palette.join(',') === 'coral,ink,paper',
      'six celebration types use only paper, ink and coral token keys'
    );
    check(
      cfg.types.every(function (item) {
        return item.durationMs >= 250 && item.durationMs <= 4000 && item.sound;
      }),
      'every celebration has a bounded duration and a mapped sound'
    );
    check(
      !/#[0-9a-f]{3,8}|linear-gradient|radial-gradient/i.test(JSON.stringify(cfg)),
      'public celebration config contains no raw colors or gradients'
    );
    check(
      cfg.preferences.priority.join(',') === 'student,trainer,default' &&
        cfg.throttle.maxPerSession === 5 &&
        cfg.throttle.minGapBetweenMs === 3000,
      'preference priority and throttle match policy'
    );

    const rawCelebrations = JSON.parse(read('server/config/celebrations.json'));
    const ALL_SIX = [
      'paper_ribbons',
      'origami_balloons',
      'drum_pulse',
      'star_shower',
      'torn_confetti',
      'milestone_seal',
    ];
    check(
      cfg.accessibility.localMuteAllowed === false &&
        rawCelebrations.accessibility.localMuteAllowed === false &&
        rawCelebrations.sharedCelebration.soundPlayback === 'local_client_side_always_on',
      'sound playback is always on in public config, with no local mute'
    );
    check(
      ALL_SIX.every(function (id) {
        return cfg.preferences.allowedOverrides.indexOf(id) >= 0;
      }) &&
        ALL_SIX.every(function (id) {
          return (
            celebrations.selectType('mastery_gate_crossed', id, '', function () {
              return 0.99;
            }) === id
          );
        }),
      'all six celebration types are selectable overrides'
    );

    check(
      celebrations.selectType(
        'mastery_gate_crossed',
        'torn_confetti',
        'paper_ribbons',
        function () {
          return 0.99;
        }
      ) === 'torn_confetti',
      'student preference wins'
    );
    check(
      celebrations.selectType('mastery_gate_crossed', '', 'paper_ribbons', function () {
        return 0.99;
      }) === 'paper_ribbons',
      'trainer preference is next'
    );
    check(
      celebrations.selectType('mastery_gate_crossed', 'invented', 'invented', function () {
        return 0.99;
      }) === 'paper_ribbons',
      'invalid preferences fall back to policy'
    );
    const poolPicks = [0, 0.5, 0.99].map(function (value) {
      return celebrations.selectType('session_complete', '', '', function () {
        return value;
      });
    });
    check(
      poolPicks.every(function (id) {
        return ['origami_balloons', 'paper_ribbons', 'torn_confetti'].indexOf(id) >= 0;
      }),
      'session complete randomizes within the approved pool'
    );

    const studentCelebrate = await request(
      'POST',
      '/api/sessions/ses_math_001/celebrate',
      {
        trigger: 'trainer_kudos',
      },
      student
    );
    check(studentCelebrate.status === 403, 'students cannot start celebrations');
    const unknown = await request(
      'POST',
      '/api/sessions/ses_math_001/celebrate',
      {
        trigger: 'anything_else',
      },
      trainer
    );
    check(
      unknown.status === 400 && unknown.body.error === 'UNKNOWN_TRIGGER',
      'clients can only request the configured classroom trigger'
    );

    const kudos = await request(
      'POST',
      '/api/sessions/ses_math_001/celebrate',
      {
        trigger: 'trainer_kudos',
        trainerPref: 'invented',
        studentPref: 'invented',
      },
      trainer
    );
    check(
      kudos.status === 200 && kudos.body.fired === true,
      'trainer can send a shared celebration'
    );
    const payload = kudos.body.celebration;
    check(
      payload.event === 'shared.celebration' &&
        payload.audience.join(',') === 'trainer,student' &&
        payload.spotlight.target === 'student',
      'celebration is shared and spotlights the student'
    );
    check(
      payload.sound.volume <= 0.6 &&
        payload.animation.durationMs >= 250 &&
        payload.animation.durationMs <= 4000 &&
        !forbiddenKeys(payload),
      'celebration payload caps sound, bounds motion and stays scrubbed'
    );
    check(
      (
        await request(
          'POST',
          '/api/sessions/ses_math_001/celebrate',
          {
            trigger: 'trainer_kudos',
          },
          trainer
        )
      ).body.fired === false,
      'celebrations respect the three-second gap'
    );

    const celebrationEvents = await request(
      'GET',
      '/api/sessions/ses_math_001/events?limit=200',
      undefined,
      student
    );
    check(
      celebrationEvents.body.events.some(function (event) {
        return event.event === 'shared.celebration' && !forbiddenKeys(event);
      }),
      'celebration reaches the student-safe event stream'
    );

    /* -------------------------------------------------------- browser contract */
    const html = read('classroom/index.html');
    const appJs = read('classroom/app.js');
    const css = read('classroom/engagement.css');
    const engagement = read('classroom/engagement.js');
    const sessionLayer = read('classroom/session.js');
    const livekit = read('classroom/livekit.js');

    check(
      html.indexOf('id="sheet-student-control"') >= 0 && html.indexOf('Student Control') >= 0,
      'Student Control is one dedicated permissions section'
    );
    ['scMediaBtn', 'scMuteMicBtn', 'scCameraOffBtn', 'scReactBtn', 'scApplauseBtn'].forEach(
      function (id) {
        check(html.indexOf('id="' + id + '"') >= 0, id + ' lives inside Student Control');
      }
    );

    const frontStart = html.indexOf('id="trainerFrontCard"');
    const frontEnd = html.indexOf('</section>', frontStart);
    const frontDesk = html.slice(frontStart, frontEnd);
    ['shareBoardBtn', 'badgeSelect', 'awardBadgeBtn', 'sendKudosBtn', 'openProgressBtn'].forEach(
      function (id) {
        check(
          frontDesk.indexOf('id="' + id + '"') >= 0,
          id + ' is visible on the front trainer desk'
        );
      }
    );
    const sheetStart = html.indexOf('id="sheet-student-control"');
    const sheetEnd = html.indexOf('</section>', sheetStart);
    const controlSheet = html.slice(sheetStart, sheetEnd);
    check(
      ['shareBoardBtn', 'badgeSelect', 'awardBadgeBtn', 'sendKudosBtn'].every(function (id) {
        return controlSheet.indexOf('id="' + id + '"') === -1;
      }) &&
        controlSheet.indexOf('Quick links') === -1 &&
        controlSheet.indexOf('Open quiz controls') === -1 &&
        controlSheet.indexOf('End session') === -1,
      'recognition actions and ambiguous quick links are no longer buried in Student Control'
    );
    const roomCss = read('classroom/room.css');
    const sessionCss = read('classroom/session.css');
    check(
      /\.foot\s*\{[\s\S]*?z-index:\s*40/.test(roomCss) &&
        /@media\s*\(max-width:\s*1240px\)\s*\{[\s\S]*?\.engagement-shell\s*\{\s*bottom:\s*140px/.test(
          sessionCss
        ),
      'the footer stays above the reaction deck and the deck clears the compact front card'
    );
    check(
      /\.side\{display:contents\}/.test(css) &&
        /\.trainer-front-card\{[^}]*position:fixed/.test(css) &&
        /@media \(max-width:1240px\)/.test(css),
      'the front desk stays docked when the side rail folds away on tablets and phones'
    );
    check(
      html.indexOf('aria-label="Applaud your trainer"') >= 0 &&
        html.indexOf('data-reaction="💡"') >= 0,
      'kid emoji and applause controls are present'
    );
    check(
      /id="celebrationLayer"[^>]*hidden/.test(html) && /id="reactionLayer"[^>]*hidden/.test(html),
      'celebration and reaction layers are separate and start hidden'
    );
    check(
      /activeLayer === 'celebration'/.test(engagement) &&
        /pendingReaction/.test(engagement) &&
        /flushPendingReaction/.test(engagement),
      'reactions arriving during a celebration are queued, never drawn over it'
    );
    check(
      /prefers-reduced-motion/.test(css) &&
        /reducedMotion\(\)/.test(engagement) &&
        /static_badge|engagement-badge/.test(engagement + css),
      'reduced motion shows a static badge and drops animation'
    );
    check(
      html.indexOf('id="engagementSoundBtn"') === -1 && html.indexOf('id="celebrationPref"') === -1,
      'sound toggle and celebration-style dropdown are removed from the classroom UI'
    );
    check(
      !/mathify\.engagement\.sound|STORE_SOUND/.test(engagement) &&
        !/renderSoundButton|toggleSound/.test(engagement),
      'the client keeps no sound toggle or stored mute preference'
    );
    check(
      /(?:var|let|const)\s+soundOn\s*=\s*true/.test(engagement) &&
        /isSoundOn[\s\S]{0,100}return\s+(?:true|soundOn)\s*;/.test(engagement),
      'sound is always on and isSoundOn() reports true'
    );
    check(/Math\.min\(0\.6/.test(engagement), 'celebration sound stays volume-capped at 0.6');
    const playSoundAt = engagement.indexOf('function playSound');
    const playSoundTail = playSoundAt >= 0 ? engagement.slice(playSoundAt) : '';
    const playSoundEnd = playSoundTail.indexOf('\n  }');
    const playSoundBody =
      playSoundEnd === -1 ? playSoundTail : playSoundTail.slice(0, playSoundEnd + 4);
    check(
      playSoundAt >= 0 && !/screenSharing/.test(playSoundBody) && !/!soundOn/.test(playSoundBody),
      'screen sharing and mute state no longer suppress celebration sound'
    );
    check(
      !/setMicEnabled\(true\)[\s\S]{0,80}onReaction/.test(engagement),
      'engagement never auto-enables a camera or microphone'
    );
    check(
      /quizLive\(\)/.test(sessionLayer) && /shared\.celebration/.test(sessionLayer),
      'celebrations are suppressed while a quiz is active'
    );
    check(
      /reaction\.sent[\s\S]{0,240}onReaction/.test(sessionLayer) &&
        !/reaction\.sent[\s\S]{0,240}quizLive/.test(sessionLayer),
      'kid reactions still render while the quiz is active'
    );
    check(
      /quiz\.launched/.test(sessionLayer) && /launchQuiz\(\)/.test(sessionLayer),
      'a server quiz launch also puts the student tab into quiz mode'
    );
    check(
      /applyTrainerMediaState/.test(livekit) && /applyTrainerMediaState/.test(appJs),
      'trainer mute and camera-off reach the live local tracks'
    );
    check(
      /forceStudentMediaOn\(\)[\s\S]*setMediaButtonsLocked\(true\)/.test(appJs),
      'Access revocation still forces tracks on before locking'
    );
    check(
      /applyReactionPermission/.test(appJs) && /reaction\.permission\.changed/.test(sessionLayer),
      'permission changes reach an open classroom live'
    );
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
}

main()
  .then(function () {
    console.log('engagementControls: ' + assertions + ' assertions passed');
  })
  .catch(function (error) {
    console.error(error);
    process.exitCode = 1;
  });
