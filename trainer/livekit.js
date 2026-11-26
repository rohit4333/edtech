/* Mathify trainer live-call module — LiveKit edition.
 *
 * All LiveKit room, ink data and media state lives here; app.js only calls
 * window.MathifyAgora (kept as the compatibility global) or MathifyLiveKit.
 * Room, identity and grants are issued by /api/get-token from the verified
 * session; this page never creates a room or supplies credentials. */
(function () {
  'use strict';

  var state = {
    room: null,
    rtc: null,
    joined: false,
    listeners: [],
    channelName: '',
    uid: '',
    peerUid: '',
    remoteAudio: null,
    remoteAudioElement: null,
    recording: null,
    drawing: false,
    strokeId: null,
    lastInk: null,
    canvas: null,
    context: null
  };

  function params() { return new URLSearchParams(window.location.search); }

  function sessionId() {
    return window.MATHIFY_SESSION_ID || params().get('sessionId') || 'ses_math_001';
  }

  function apiBase() {
    return (window.mathifyTrainerApi && window.mathifyTrainerApi.base) ||
      window.MATHIFY_API_BASE || '/api';
  }

  function status(message) {
    var node = document.getElementById('mc-status');
    if (node) node.textContent = message || '';
  }

  function setRecordingButtons(canStart) {
    var start = document.getElementById('mc-rec-start');
    var stop = document.getElementById('mc-rec-stop');
    if (start) start.disabled = canStart !== true || Boolean(state.recording);
    if (stop) stop.disabled = !state.recording;
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
        try { data = text ? JSON.parse(text) : null; } catch (error) { /* empty body */ }
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
      '<label>Room<input id="mc-channel" value="" readonly></label>',
      '<label>Trainer ID<input id="mc-uid" value="" readonly></label>',
      '<label>Student ID<input id="mc-peer" value="" readonly></label>',
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
    window.addEventListener('mouseup', function () { state.drawing = false; });
    sizeCanvas();
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
    if (!state.room || !state.joined || !state.room.localParticipant) return Promise.resolve(false);
    try {
      var encoded = new TextEncoder().encode(JSON.stringify(payload));
      return Promise.resolve(state.room.localParticipant.publishData(encoded, { reliable: true }))
        .then(function () { return true; }).catch(function () { return false; });
    } catch (error) { return Promise.resolve(false); }
  }

  function clearInk() {
    if (state.context && state.canvas) {
      state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
    return broadcast({ type: 'ink.clear', roomName: state.channelName, from: state.uid });
  }

  function on(room, event, handler) {
    room.on(event, handler);
    state.listeners.push([event, handler]);
  }

  function wireRoomEvents() {
    var room = state.room;
    if (!room) return;
    var events = window.LivekitClient.RoomEvent;

    on(room, events.TrackSubscribed, function (track, publication, participant) {
      if (state.peerUid && String(participant.identity) !== String(state.peerUid)) return;
      var remote = document.getElementById('remote-video');
      if (track.kind === 'video' && remote) {
        remote.innerHTML = '';
        track.attach(remote);
      } else if (track.kind === 'audio') {
        clearRemoteAudio();
        var element = document.createElement('audio');
        element.autoplay = true;
        element.playsInline = true;
        element.setAttribute('hidden', 'hidden');
        document.body.appendChild(element);
        state.remoteAudioElement = element;
        state.remoteAudio = track;
        track.attach(element);
      }
    });

    on(room, events.TrackUnsubscribed, function (track) {
      if (track.kind === 'video') {
        var remote = document.getElementById('remote-video');
        if (remote) {
          track.detach(remote);
          remote.innerHTML = '';
        }
      } else clearRemoteAudio();
    });

    on(room, events.DataReceived, function (payload) {
      var message = null;
      try { message = JSON.parse(new TextDecoder().decode(payload)); } catch (error) { return; }
      if (!message || !message.type) return;
      if (!state.context) return;
      if (message.type === 'ink.clear') {
        clearInkCanvasOnly();
        state.lastInk = null;
        return;
      }
      if (typeof message.x !== 'number' || typeof message.y !== 'number') return;
      state.context.beginPath();
      state.context.moveTo(
        state.lastInk ? state.lastInk.px : message.px,
        state.lastInk ? state.lastInk.py : message.py
      );
      state.context.lineTo(message.px, message.py);
      state.context.stroke();
      state.lastInk = { px: message.px, py: message.py };
      if (message.type === 'ink.start') state.lastInk = { px: message.px, py: message.py };
    });

    on(room, events.ParticipantDisconnected, function (participant) {
      if (!state.peerUid || String(participant.identity) !== String(state.peerUid)) return;
      var remote = document.getElementById('remote-video');
      if (remote) remote.innerHTML = '';
      status('Student left the call.');
    });

    on(room, events.Disconnected, function () { cleanup(); });
  }

  function clearInkCanvasOnly() {
    if (state.context && state.canvas) {
      state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
  }

  function clearRemoteAudio() {
    if (state.remoteAudio && state.remoteAudioElement) {
      try { state.remoteAudio.detach(state.remoteAudioElement); } catch (error) { /* closed */ }
    }
    if (state.remoteAudioElement) {
      try { state.remoteAudioElement.pause(); } catch (error) { /* paused */ }
      if (state.remoteAudioElement.parentNode) {
        state.remoteAudioElement.parentNode.removeChild(state.remoteAudioElement);
      }
    }
    state.remoteAudio = null;
    state.remoteAudioElement = null;
  }

  function join() {
    var activeSessionId = sessionId();
    if (!activeSessionId) {
      status('Open a session before joining a call.');
      return Promise.resolve(null);
    }
    var client = window.LivekitClient;
    if (!client || typeof client.Room !== 'function' || !client.RoomEvent) {
      status('The video SDK could not load. Check your connection and try again.');
      return Promise.resolve(null);
    }

    status('Getting a call token…');
    return apiRequest('/get-token', {
      method: 'POST',
      body: { sessionId: activeSessionId }
    }).then(function (data) {
      var rtc = data && (data.rtc || data);
      if (!rtc || typeof rtc.token !== 'string' || !rtc.token ||
          typeof rtc.url !== 'string' || !rtc.url ||
          rtc.provider !== 'livekit') {
        throw new Error('Token endpoint did not return a LiveKit token.');
      }
      state.rtc = rtc;
      state.channelName = rtc.roomName;
      state.uid = rtc.identity;
      state.peerUid = rtc.peerIdentity || '';

      var channelField = document.getElementById('mc-channel');
      var uidField = document.getElementById('mc-uid');
      var peerField = document.getElementById('mc-peer');
      if (channelField) channelField.value = state.channelName;
      if (uidField) uidField.value = state.uid;
      if (peerField) peerField.value = state.peerUid;

      if (rtc.mock === true || rtc.mode === 'mock') {
        state.joined = true;
        document.getElementById('mc-join').disabled = true;
        document.getElementById('mc-leave').disabled = false;
        setRecordingButtons(false);
        status('Connected in mock mode. No media is sent.');
        return null;
      }

      state.room = new client.Room({ autoSubscribe: true });
      wireRoomEvents();
      status('Joining…');
      return state.room.connect(rtc.url, rtc.token, { autoSubscribe: true })
        .then(function () {
          if (typeof state.room.startAudio === 'function') {
            return Promise.resolve(state.room.startAudio()).catch(function () { return undefined; });
          }
          return undefined;
        })
        .then(function () {
          return Promise.resolve(state.room.localParticipant.enableCameraAndMicrophone());
        })
        .then(function () {
          state.joined = true;
          document.getElementById('mc-join').disabled = true;
          document.getElementById('mc-leave').disabled = false;
          setRecordingButtons(true);
          status('Connected. Ink reaches the student in this 1:1 room.');
          return state.room;
        });
    }).catch(function (error) {
      cleanup();
      status(error.message || 'Could not join the room.');
      return null;
    });
  }

  /* Leaving the room must not abandon the server-side Egress. The API is the
     owner of the recording row, so stop it before local state is discarded. */
  function stopActiveRecording() {
    var active = state.recording;
    if (!active || !active.id) return Promise.resolve(null);
    state.recording = null;
    return apiRequest('/livekit/recording/stop', {
      method: 'POST',
      body: { recordingId: active.id }
    }).then(function (data) {
      setRecordingButtons(false);
      return data && data.recording;
    }).catch(function () {
      setRecordingButtons(false);
      return null;
    });
  }

  function cleanup() {
    if (state.recording) stopActiveRecording();
    var room = state.room;
    if (room) {
      state.listeners.forEach(function (pair) {
        try { room.off(pair[0], pair[1]); } catch (error) { /* closed */ }
      });
      if (typeof room.disconnect === 'function') {
        try { Promise.resolve(room.disconnect(true)).catch(function () {}); } catch (error) { /* closed */ }
      }
    }
    state.listeners = [];
    state.room = null;
    state.rtc = null;
    state.joined = false;
    clearRemoteAudio();
    ['remote-video', 'local-video'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.innerHTML = '';
    });
    document.getElementById('mc-join').disabled = false;
    document.getElementById('mc-leave').disabled = true;
    state.recording = null;
    setRecordingButtons(false);
  }

  function leave() {
    return stopActiveRecording().then(function () {
      cleanup();
      status('Left the call. The recording is stored privately when processing finishes.');
      return true;
    });
  }

  /* LiveKit Egress is started server-side from the verified session id. The
     browser never sends a room name or a storage credential. */
  function startRecording() {
    if (!state.joined || !state.rtc || state.rtc.mock === true || state.rtc.mode === 'mock') {
      status('Join a live 1:1 room before starting a recording.');
      return Promise.resolve(null);
    }
    status('Starting recording…');
    return apiRequest('/livekit/recording/start', {
      method: 'POST',
      body: { sessionId: sessionId() }
    }).then(function (data) {
      state.recording = data && data.recording;
      setRecordingButtons(true);
      status('Recording started. Stop it before leaving the call.');
      return state.recording;
    }).catch(function (error) {
      status(error.message || 'Recording could not start.');
      return null;
    });
  }

  function stopRecording() {
    if (!state.recording || !state.recording.id) {
      status('No active recording to stop.');
      return Promise.resolve(null);
    }
    status('Stopping recording…');
    return apiRequest('/livekit/recording/stop', {
      method: 'POST',
      body: { recordingId: state.recording.id }
    }).then(function (data) {
      state.recording = null;
      setRecordingButtons(true);
      status('Recording stopped. It appears in the student desk when processing finishes.');
      return data && data.recording;
    }).catch(function (error) {
      status(error.message || 'Recording could not stop.');
      return null;
    });
  }

  /* Best effort on tab close; the server also stops any active recording when
     the session is ended, so an aborted browser request cannot strand it. */
  if (window.addEventListener) {
    window.addEventListener('pagehide', function () {
      if (state.recording) stopActiveRecording();
    });
  }

  function ready() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensurePanel);
    } else ensurePanel();
  }

  var api = {
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
        roomName: state.channelName,
        uid: state.uid,
        peerUid: state.peerUid,
        recordingId: state.recording && state.recording.id
      };
    }
  };

  window.MathifyLiveKit = api;
  window.MathifyAgora = api;
  ready();
})();
