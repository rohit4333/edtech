/* Mathify trainer live-call module.
   All Agora RTC, RTM, ink and recording state lives here; app.js only calls window.MathifyAgora. */
(function () {
  'use strict';

  var state = {
    client: null,
    AgoraRTC: null,
    rtmClient: null,
    localTracks: [],
    channelName: '',
    uid: null,
    peerUid: '',
    appId: '',
    rtcToken: '',
    recording: null,
    joined: false,
    drawing: false,
    strokeId: null,
    canvas: null,
    context: null
  };

  var RTC_CDN = 'https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4/+esm';
  var RTM_CDN = 'https://cdn.jsdelivr.net/npm/agora-rtm-sdk@1/+esm';

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function apiBase() {
    return (window.mathifyTrainerApi && window.mathifyTrainerApi.base) ||
      window.MATHIFY_API_BASE || 'http://localhost:4000/api';
  }

  function status(message) {
    var node = document.getElementById('mc-status');
    if (node) node.textContent = message || '';
  }

  function authHeaders() {
    if (!window.mathifyTrainerApi || !window.mathifyTrainerApi.ensureAuth) {
      return Promise.resolve({});
    }
    return window.mathifyTrainerApi.ensureAuth().then(function (tokenValue) {
      return tokenValue ? { Authorization: 'Bearer ' + tokenValue } : {};
    }).catch(function () { return {}; });
  }

  function apiRequest(path, options) {
    var opts = options || {};
    return authHeaders().then(function (headers) {
      headers.Accept = 'application/json';
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      return fetch(apiBase() + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      });
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) {}
        if (!response.ok) {
          throw new Error((data && data.message) || 'Request failed (' + response.status + ').');
        }
        return data;
      });
    });
  }

  function ensurePanel() {
    if (document.getElementById('mathify-call')) return;

    var style = document.createElement('style');
    style.textContent = [
      '.mathify-call-toggle{position:fixed;right:18px;bottom:18px;z-index:1200;border:1px solid #0E1420;',
      'background:#FDFAF3;color:#0E1420;border-radius:999px;padding:10px 16px;font:600 12px/1 Poppins,sans-serif;',
      'letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 8px 24px rgba(14,20,32,.12)}',
      '.mathify-call{position:fixed;right:18px;bottom:64px;z-index:1201;width:min(390px,calc(100vw - 36px));',
      'background:#FDFAF3;border:1px solid #0E1420;border-radius:8px;box-shadow:0 18px 48px rgba(14,20,32,.2);',
      'font-family:Poppins,sans-serif;color:#0E1420;overflow:hidden}',
      '.mathify-call[hidden]{display:none}',
      '.mc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(14,20,32,.14)}',
      '.mc-head .mono{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.09em;text-transform:uppercase}',
      '.mc-close{border:0;background:none;color:#0E1420;font-size:18px;cursor:pointer;line-height:1}',
      '.mc-body{padding:14px}',
      '.mc-stage{position:relative;aspect-ratio:16/9;background:#0E1420;border-radius:4px;overflow:hidden}',
      '#remote-video{position:absolute;inset:0;width:100%;height:100%}',
      '#remote-video video{width:100%!important;height:100%!important;object-fit:cover}',
      '#ink-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}',
      '#local-video{position:absolute;right:8px;bottom:8px;width:28%;aspect-ratio:4/3;background:#1b2333;',
      'border:1px solid rgba(253,250,243,.7);border-radius:3px;overflow:hidden;z-index:2}',
      '#local-video video{width:100%!important;height:100%!important;object-fit:cover}',
      '.mc-fields{display:grid;grid-template-columns:1fr 88px 88px;gap:8px;margin-top:12px}',
      '.mc-fields label{display:block;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:rgba(14,20,32,.65)}',
      '.mc-fields input{display:block;width:100%;margin-top:4px;padding:7px 8px;border:1px solid rgba(14,20,32,.22);',
      'border-radius:4px;background:transparent;color:#0E1420;font:500 12px/1.2 ui-monospace,Menlo,monospace}',
      '.mc-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}',
      '.mc-actions button{padding:8px 10px;border:1px solid #0E1420;border-radius:4px;background:transparent;',
      'color:#0E1420;font:600 11px/1 Poppins,sans-serif;cursor:pointer}',
      '.mc-actions .coral{background:#FF5B2E;border-color:#FF5B2E;color:#0E1420}',
      '.mc-actions button:disabled{opacity:.4;cursor:not-allowed}',
      '#mc-status{min-height:16px;margin:10px 0 0;font-size:11px;color:rgba(14,20,32,.72)}'
    ].join('');
    document.head.appendChild(style);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'mathify-call-toggle';
    toggle.className = 'mathify-call-toggle';
    toggle.textContent = 'Live 1:1 call';
    document.body.appendChild(toggle);

    var panel = document.createElement('aside');
    panel.id = 'mathify-call';
    panel.className = 'mathify-call';
    panel.setAttribute('aria-label', 'Mathify live 1:1 call');
    panel.hidden = true;
    panel.innerHTML = [
      '<div class="mc-head"><span class="mono">Live 1:1 call</span>',
      '<button type="button" class="mc-close" id="mc-close" aria-label="Close live call">×</button></div>',
      '<div class="mc-body">',
      '<div class="mc-stage"><div id="remote-video"></div><canvas id="ink-canvas"></canvas><div id="local-video"></div></div>',
      '<div class="mc-fields">',
      '<label>Channel<input id="mc-channel" value="', params().get('channel') || 'mathify-ses_math_001', '"></label>',
      '<label>Trainer UID<input id="mc-uid" type="number" min="0" value="', params().get('uid') || '1001', '"></label>',
      '<label>Student UID<input id="mc-peer" type="number" min="0" value="', params().get('peerUid') || '2002', '"></label>',
      '</div>',
      '<div class="mc-actions">',
      '<button type="button" id="mc-join" class="coral">Join</button>',
      '<button type="button" id="mc-leave" disabled>Leave</button>',
      '<button type="button" id="mc-rec-start" disabled>Start recording</button>',
      '<button type="button" id="mc-rec-stop" disabled>Stop recording</button>',
      '<button type="button" id="mc-clear">Clear ink</button>',
      '</div>',
      '<p id="mc-status" role="status" aria-live="polite"></p>',
      '</div>'
    ].join('');
    document.body.appendChild(panel);
    bindPanel();
  }

  function bindPanel() {
    document.getElementById('mathify-call-toggle').addEventListener('click', function () {
      var panel = document.getElementById('mathify-call');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) sizeCanvas();
    });
    document.getElementById('mc-close').addEventListener('click', function () {
      document.getElementById('mathify-call').hidden = true;
    });
    document.getElementById('mc-join').addEventListener('click', function () { join(); });
    document.getElementById('mc-leave').addEventListener('click', function () { leave(); });
    document.getElementById('mc-rec-start').addEventListener('click', function () { startRecording(); });
    document.getElementById('mc-rec-stop').addEventListener('click', function () { stopRecording(); });
    document.getElementById('mc-clear').addEventListener('click', function () { clearInk(); });

    state.canvas = document.getElementById('ink-canvas');
    state.context = state.canvas.getContext('2d');
    bindInk();
  }

  function sizeCanvas() {
    if (!state.canvas) return;
    var rect = state.canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    state.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    state.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    state.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.context.lineCap = 'round';
    state.context.lineJoin = 'round';
    state.context.strokeStyle = '#FF5B2E';
    state.context.lineWidth = 2;
  }

  function inkPoint(event) {
    var rect = state.canvas.getBoundingClientRect();
    var source = event.touches && event.touches[0] ? event.touches[0] : event;
    return {
      x: Math.min(1, Math.max(0, (source.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (source.clientY - rect.top) / rect.height)),
      px: source.clientX - rect.left,
      py: source.clientY - rect.top
    };
  }

  function broadcast(payload) {
    if (!state.rtmClient || !state.peerUid) return Promise.resolve(false);
    return state.rtmClient.sendMessageToPeer(
      { text: JSON.stringify(payload) },
      String(state.peerUid)
    ).then(function () { return true; }).catch(function () { return false; });
  }

  function bindInk() {
    if (!state.canvas) return;

    state.canvas.addEventListener('mousedown', function (event) {
      sizeCanvas();
      state.drawing = true;
      state.strokeId = 'ink_' + Date.now();
      var point = inkPoint(event);
      state.context.beginPath();
      state.context.moveTo(point.px, point.py);
      broadcast({ type: 'ink.start', strokeId: state.strokeId, channelName: state.channelName,
        x: point.x, y: point.y, color: '#FF5B2E', width: 2, from: state.uid });
    });

    state.canvas.addEventListener('mousemove', function (event) {
      if (!state.drawing) return;
      var point = inkPoint(event);
      state.context.lineTo(point.px, point.py);
      state.context.stroke();
      broadcast({ type: 'ink.point', strokeId: state.strokeId, channelName: state.channelName,
        x: point.x, y: point.y, color: '#FF5B2E', width: 2, from: state.uid });
    });

    window.addEventListener('mouseup', function () {
      if (!state.drawing) return;
      state.drawing = false;
      broadcast({ type: 'ink.end', strokeId: state.strokeId, channelName: state.channelName, from: state.uid });
      state.strokeId = null;
    });

    state.canvas.addEventListener('touchstart', function (event) {
      event.preventDefault();
      sizeCanvas();
      state.drawing = true;
      state.strokeId = 'ink_' + Date.now();
      var point = inkPoint(event);
      state.context.beginPath();
      state.context.moveTo(point.px, point.py);
      broadcast({ type: 'ink.start', strokeId: state.strokeId, channelName: state.channelName,
        x: point.x, y: point.y, color: '#FF5B2E', width: 2, from: state.uid });
    }, { passive: false });

    state.canvas.addEventListener('touchmove', function (event) {
      event.preventDefault();
      if (!state.drawing) return;
      var point = inkPoint(event);
      state.context.lineTo(point.px, point.py);
      state.context.stroke();
      broadcast({ type: 'ink.point', strokeId: state.strokeId, channelName: state.channelName,
        x: point.x, y: point.y, color: '#FF5B2E', width: 2, from: state.uid });
    }, { passive: false });

    state.canvas.addEventListener('touchend', function (event) {
      event.preventDefault();
      if (!state.drawing) return;
      state.drawing = false;
      broadcast({ type: 'ink.end', strokeId: state.strokeId, channelName: state.channelName, from: state.uid });
      state.strokeId = null;
    }, { passive: false });
  }

  function clearInk() {
    if (state.context && state.canvas) state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    return broadcast({ type: 'ink.clear', channelName: state.channelName, from: state.uid });
  }

  function wireRtcEvents() {
    var client = state.client;
    var remote = document.getElementById('remote-video');

    client.on('user-published', function (user, mediaType) {
      return client.subscribe(user, mediaType).then(function () {
        if (mediaType === 'video') {
          remote.innerHTML = '';
          user.videoTrack.play(remote);
          sizeCanvas();
        }
        if (mediaType === 'audio') user.audioTrack.play();
      }).catch(function (error) {
        status('Could not subscribe: ' + error.message);
      });
    });

    client.on('user-unpublished', function (user, mediaType) {
      if (mediaType === 'video') remote.innerHTML = '';
    });

    client.on('user-left', function () {
      remote.innerHTML = '';
      status('Student left the channel.');
    });

    client.on('token-privilege-will-expire', function () {
      status('Token expires soon. Rejoin with a fresh token.');
    });
  }

  function initRtm(AgoraRTM, appId, uid, rtmToken) {
    if (!AgoraRTM || !AgoraRTM.createInstance) return Promise.resolve(null);
    state.rtmClient = AgoraRTM.createInstance(appId, { enableLogUpload: false });
    var options = { uid: String(uid) };
    if (rtmToken) options.token = rtmToken;
    return state.rtmClient.login(options).then(function () {
      return state.rtmClient;
    }).catch(function () {
      state.rtmClient = null;
      return null;
    });
  }

  function join() {
    state.channelName = document.getElementById('mc-channel').value.trim();
    state.uid = Number(document.getElementById('mc-uid').value);
    state.peerUid = document.getElementById('mc-peer').value.trim();

    if (!state.channelName || !Number.isInteger(state.uid)) {
      status('Enter a channel and trainer UID.');
      return Promise.resolve(null);
    }

    status('Loading Agora SDK…');

    return Promise.all([
      import(RTC_CDN),
      import(RTM_CDN)
    ]).then(function (modules) {
      state.AgoraRTC = modules[0].default || modules[0];
      var AgoraRTM = modules[1].default || modules[1];

      status('Fetching token…');
      return apiRequest('/agora/token?channelName=' + encodeURIComponent(state.channelName) +
        '&uid=' + encodeURIComponent(state.uid))
        .then(function (data) {
          if (!data || !data.rtcToken) throw new Error('Token endpoint did not return a token.');
          state.appId = data.appId;
          state.rtcToken = data.rtcToken;

          state.client = state.AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
          wireRtcEvents();
          status('Joining…');

          return state.client.join(state.appId, state.channelName, state.rtcToken, state.uid)
            .then(function () {
              return state.AgoraRTC.createMicrophoneAndCameraTracks();
            })
            .then(function (tracks) {
              state.localTracks = tracks;
              tracks[1].play(document.getElementById('local-video'));
              return state.client.publish(tracks);
            })
            .then(function () {
              return initRtm(AgoraRTM, state.appId, state.uid, data.rtmToken);
            })
            .then(function (rtm) {
              state.joined = true;
              document.getElementById('mc-join').disabled = true;
              document.getElementById('mc-leave').disabled = false;
              document.getElementById('mc-rec-start').disabled = false;
              status(rtm ? 'Connected. Ink will reach student UID ' + state.peerUid + '.' :
                'Connected. RTM unavailable — ink stays local.');
              return state.client;
            });
        });
    }).catch(function (error) {
      status(error.message || 'Could not join the channel.');
      return null;
    });
  }

  function leave() {
    var local = document.getElementById('local-video');
    var remote = document.getElementById('remote-video');
    state.localTracks.forEach(function (track) { track.stop(); });
    state.localTracks = [];

    var rtmDone = state.rtmClient ? state.rtmClient.logout().catch(function () {}) : Promise.resolve();
    var leaveDone = state.client ? state.client.leave().catch(function () {}) : Promise.resolve();

    return Promise.all([rtmDone, leaveDone]).then(function () {
      state.rtmClient = null;
      state.client = null;
      state.joined = false;
      if (local) local.innerHTML = '';
      if (remote) remote.innerHTML = '';
      document.getElementById('mc-join').disabled = false;
      document.getElementById('mc-leave').disabled = true;
      document.getElementById('mc-rec-start').disabled = true;
      document.getElementById('mc-rec-stop').disabled = true;
      status('Left the channel.');
    });
  }

  function sessionId() {
    return window.MATHIFY_SESSION_ID || params().get('sessionId') || 'ses_math_001';
  }

  function startRecording() {
    status('Starting recording…');
    return apiRequest('/agora/recording/start', {
      method: 'POST',
      body: {
        sessionId: sessionId(),
        channelName: state.channelName,
        uid: state.uid,
        token: state.rtcToken
      }
    }).then(function (data) {
      state.recording = data.recording;
      document.getElementById('mc-rec-start').disabled = true;
      document.getElementById('mc-rec-stop').disabled = false;
      status('Recording started (' + state.recording.mode + ').');
      return state.recording;
    }).catch(function (error) {
      status(error.message || 'Recording could not start.');
      return null;
    });
  }

  function stopRecording() {
    if (!state.recording) return Promise.resolve(null);
    status('Stopping recording…');
    return apiRequest('/agora/recording/stop', {
      method: 'POST',
      body: { recordingId: state.recording.id, sessionId: sessionId() }
    }).then(function (data) {
      state.recording = data.recording;
      document.getElementById('mc-rec-start').disabled = false;
      document.getElementById('mc-rec-stop').disabled = true;
      status('Recording stopped.');
      return state.recording;
    }).catch(function (error) {
      status(error.message || 'Recording could not stop.');
      return null;
    });
  }

  function ready() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensurePanel);
    } else {
      ensurePanel();
    }
  }

  window.MathifyAgora = {
    join: join,
    leave: leave,
    startRecording: startRecording,
    stopRecording: stopRecording,
    sendInk: broadcast,
    clearInk: clearInk,
    getState: function () {
      return {
        joined: state.joined,
        channelName: state.channelName,
        uid: state.uid,
        peerUid: state.peerUid,
        recordingId: state.recording && state.recording.id
      };
    }
  };

  ready();
})();
