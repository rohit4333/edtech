/* Mathify camera check.
 *
 * Both people land here before the lesson. The two feeds use a server-owned
 * preview room, never the session room: LiveKit presence webhooks ignore that
 * room, so this page cannot start the teaching clock, write attendance or
 * change pay. The trainer's handoff opens the existing classroom unchanged.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') || params.get('sessionId') || null;
  var api = window.mathifyClassroomApi;
  var role = 'trainer';
  var room = null;
  var selfTrackAttached = false;
  var remoteTrackAttached = false;
  var remoteAudio = null;
  var micOn = true;
  var cameraOn = true;
  var ended = false;
  var ready = false;
  var presenceTimer = null;
  var stateTimer = null;
  var networkMessage = 'Checking your connection…';
  var cameraMessage = 'Connecting cameras…';

  var SUBJECT_LABELS = {
    math: 'Mathematics',
    coding: 'Coding',
    english: 'Communication'
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''))
      .toUpperCase();
  }

  function setText(selector, value) {
    var node = $(selector);
    if (node) node.textContent = value;
  }

  function renderStatus() {
    var parts = [];
    if (cameraMessage) parts.push(cameraMessage);
    if (networkMessage && networkMessage !== cameraMessage) parts.push(networkMessage);
    setText('#connectStatus', parts.join(' ') || 'Preparing your camera check…');
  }

  function applyRole() {
    var explicitStudent = params.get('view') === 'student' || params.get('role') === 'student';
    var detected = api && typeof api.viewerRole === 'function' ? api.viewerRole() : (api && api.role);
    var resolved = explicitStudent ? 'student' : (detected || 'trainer');
    role = resolved === 'student' ? 'student' : 'trainer';
    document.body.setAttribute('data-role', role);

    var trainerOnly = document.querySelectorAll('.trainer-only');
    var studentOnly = document.querySelectorAll('.student-only');
    Array.prototype.forEach.call(trainerOnly, function (node) { node.hidden = role !== 'trainer'; });
    Array.prototype.forEach.call(studentOnly, function (node) { node.hidden = role !== 'student'; });

    setText('#roleChip', role === 'student' ? 'Student' : 'Trainer');
    setText('#selfName', role === 'student' ? 'You' : 'You');
    setText('#peerName', role === 'student' ? 'Trainer' : 'Student');

    if (role === 'student') {
      cameraMessage = 'Waiting for your trainer to connect the cameras.';
      renderStatus();
    }
  }

  function renderMeter(value) {
    var meter = $('#netMeter');
    if (!meter) return;
    var own = (value && value[role]) || {};
    var required = (value && value.required) || {};
    var bars = 0;
    var level = 'idle';
    var label = 'Connection not checked';

    if (value && own.status && own.status !== 'not_checked') {
      var down = Number(own.downloadMbps);
      var up = Number(own.uploadMbps);
      var latency = Number(own.latencyMs);
      var needDown = Number(required.downloadMbps) || 15;
      var needUp = Number(required.uploadMbps) || 10;
      var maxLatency = Number(required.maxLatencyMs) || 250;
      if (Number.isFinite(down) && Number.isFinite(up) && Number.isFinite(latency) &&
          down > 0 && up > 0) {
        var ratio = Math.min(down / needDown, up / needUp,
          maxLatency / Math.max(1, latency));
        bars = Math.max(1, Math.min(5, Math.ceil(ratio * 5)));
        level = ['', 'poor', 'fair', 'good', 'strong', 'excellent'][bars];
        label = 'Connection ' + level + ' · ' + down + ' Mbps down, ' + up +
          ' Mbps up, ' + latency + ' ms';
      } else if (own.ok === false || own.status === 'expired') {
        bars = 1;
        level = 'poor';
        label = 'Connection below the minimum for a private class';
      }
    }

    meter.setAttribute('data-bars', String(bars));
    meter.setAttribute('data-level', level);
    meter.setAttribute('aria-label', label);
    meter.title = label;
  }

  function syncStart(value) {
    renderMeter(value);
    ready = Boolean(value && value.canStartCall === true) && !ended;
    var button = $('#startSessionBtn');
    if (button) {
      button.disabled = !ready || role !== 'trainer';
      button.title = ready
        ? 'Open the lesson desk and start the class clock'
        : 'Both people need a ready connection before the lesson opens';
    }
    if (!value || value.canStartCall !== true) {
      networkMessage = role === 'trainer'
        ? 'Your camera is ready. Waiting for both connections to pass.'
        : 'Waiting for both connections to pass.';
    } else {
      networkMessage = 'Connection ready for a private 1:1 class.';
    }
    renderStatus();
  }

  function applyState(state) {
    if (!state) return;
    if (state.status === 'ended') {
      ended = true;
      var button = $('#startSessionBtn');
      if (button) button.disabled = true;
    }
    var key = state.subject === 'coding' || state.subject === 'english' ? state.subject : 'math';
    setText('#connectSubject', '1:1 · ' + SUBJECT_LABELS[key]);

    var trainerName = state.participants && state.participants.trainer &&
      state.participants.trainer.name;
    var studentName = state.participants && state.participants.student &&
      state.participants.student.name;
    var peerName = role === 'student' ? trainerName : studentName;
    if (peerName) {
      setText('#peerName', peerName);
      setText('#peerInitials', initials(peerName));
    }
    syncStart(state.network);
  }

  function loadState() {
    if (!api || typeof api.getSessionState !== 'function') return;
    api.getSessionState(sessionId).then(applyState).catch(function () {
      networkMessage = 'Session details could not be loaded. Recheck your connection.';
      renderStatus();
    });
  }

  function initNetwork() {
    if (!window.mathifyNetworkCheck || typeof window.mathifyNetworkCheck.init !== 'function') return;
    window.mathifyNetworkCheck.init({
      api: api,
      sessionId: sessionId,
      button: null,
      onState: function (network) { syncStart(network); }
    });
    window.mathifyNetworkCheck.run().catch(function () {});
  }

  function on(roomInstance, event, handler) {
    if (!roomInstance || !event) return;
    try { roomInstance.on(event, handler); } catch (error) { /* SDK mismatch */ }
  }

  function attachLocalVideo(publication) {
    if (!publication || !publication.videoTrack || selfTrackAttached) return;
    var video = $('#selfVideo');
    if (!video) return;
    try { publication.videoTrack.attach(video); } catch (error) { return; }
    selfTrackAttached = true;
    var placeholder = $('#selfPlaceholder');
    if (placeholder) placeholder.hidden = true;
  }

  function attachRemoteVideo(track) {
    if (!track || remoteTrackAttached) return;
    var video = $('#peerVideo');
    if (!video) return;
    try { track.attach(video); } catch (error) { return; }
    remoteTrackAttached = true;
    var placeholder = $('#peerPlaceholder');
    var wait = $('#peerWait');
    if (placeholder) placeholder.hidden = true;
    if (wait) wait.hidden = true;
  }

  function attachRemoteAudio(track) {
    if (!track || remoteAudio) return;
    remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.setAttribute('hidden', 'hidden');
    remoteAudio.setAttribute('aria-hidden', 'true');
    document.body.appendChild(remoteAudio);
    try { track.attach(remoteAudio); } catch (error) { remoteAudio = null; }
  }

  function updateControl(button, on, iconOn, iconOff, label) {
    if (!button) return;
    var use = button.querySelector('use');
    if (use) use.setAttribute('href', on ? iconOn : iconOff);
    button.setAttribute('aria-pressed', String(!on));
    button.setAttribute('aria-label', 'Turn ' + label + (on ? ' off' : ' on'));
  }

  function bindControls() {
    var mic = $('#connectMicBtn');
    var cam = $('#connectCamBtn');
    if (mic) mic.addEventListener('click', function () {
      micOn = !micOn;
      if (room && room.localParticipant) {
        Promise.resolve(room.localParticipant.setMicrophoneEnabled(micOn)).catch(function () {});
      }
      updateControl(mic, micOn, '#i-mic', '#i-mic-off', 'microphone');
      var badge = $('#selfMic');
      if (badge) badge.setAttribute('aria-label', micOn ? 'Microphone on' : 'Microphone off');
    });
    if (cam) cam.addEventListener('click', function () {
      cameraOn = !cameraOn;
      if (room && room.localParticipant) {
        Promise.resolve(room.localParticipant.setCameraEnabled(cameraOn)).catch(function () {});
      }
      updateControl(cam, cameraOn, '#i-cam', '#i-cam-off', 'camera');
      var placeholder = $('#selfPlaceholder');
      if (placeholder) placeholder.hidden = cameraOn && selfTrackAttached;
    });
  }

  function connectRoom(rtc) {
    var LivekitClient = window.LivekitClient;
    if (!LivekitClient || typeof LivekitClient.Room !== 'function' || !rtc) {
      cameraMessage = 'Live video is not available on this browser.';
      renderStatus();
      return;
    }
    var url = rtc.url || rtc.livekitUrl;
    if (!url || !rtc.token) {
      cameraMessage = 'No camera-check room was issued. Please refresh the page.';
      renderStatus();
      return;
    }

    room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
    var events = LivekitClient.RoomEvent || {};

    on(room, events.LocalTrackPublished, function (publication, participant) {
      if (participant && participant.isLocal && publication.kind === 'video') {
        attachLocalVideo(publication);
      }
    });
    on(room, events.TrackSubscribed, function (track, publication, participant) {
      if (!participant || participant.isLocal) return;
      if (track.kind === 'video') attachRemoteVideo(track);
      if (track.kind === 'audio') attachRemoteAudio(track);
    });
    on(room, events.TrackUnsubscribed, function (track) {
      if (!track) return;
      var video = $('#peerVideo');
      if (track.kind === 'video' && video && video.srcObject) {
        try { video.srcObject = null; } catch (error) { /* detached */ }
      }
      remoteTrackAttached = false;
    });
    on(room, events.ParticipantConnected, function () {
      cameraMessage = 'The other person joined the camera check.';
      renderStatus();
    });
    on(room, events.ParticipantDisconnected, function () {
      cameraMessage = 'The other person left the camera check.';
      renderStatus();
    });
    on(room, events.Disconnected, function () {
      cameraMessage = 'Camera check disconnected. Refresh to try again.';
      renderStatus();
    });

    room.connect(url, rtc.token, { autoSubscribe: true })
      .then(function () {
        if (!room || !room.localParticipant) return undefined;
        return Promise.resolve(room.localParticipant.enableCameraAndMicrophone())
          .then(function () {
            return Promise.all([
              room.localParticipant.setMicrophoneEnabled(micOn),
              room.localParticipant.setCameraEnabled(cameraOn)
            ]);
          })
          .then(function () {
            var publication = room.localParticipant.getTrackPublication &&
              room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
            attachLocalVideo(publication);
          });
      })
      .then(function () {
        cameraMessage = role === 'trainer'
          ? 'Cameras connected. Start the session when both people are ready.'
          : 'Cameras connected. Waiting for your trainer to start the lesson.';
        renderStatus();
      })
      .catch(function () {
        cameraMessage = 'Camera access was blocked. Allow the camera and microphone, then refresh.';
        renderStatus();
      });
  }

  function initPreview() {
    if (!api || typeof api.getPreviewToken !== 'function') {
      cameraMessage = 'Camera check is unavailable for this session.';
      renderStatus();
      return;
    }
    api.getPreviewToken(sessionId).then(connectRoom).catch(function () {
      cameraMessage = 'Camera check could not be opened. Please refresh the page.';
      renderStatus();
    });
  }

  function stopPreview() {
    if (presenceTimer) window.clearInterval(presenceTimer);
    if (stateTimer) window.clearInterval(stateTimer);
    if (room) {
      try { room.disconnect(); } catch (error) { /* already gone */ }
      room = null;
    }
    if (remoteAudio && remoteAudio.parentNode) remoteAudio.parentNode.removeChild(remoteAudio);
    remoteAudio = null;
  }

  function classroomUrl() {
    var search = new URLSearchParams();
    search.set('sessionId', sessionId);
    search.set('role', role);
    if (role === 'student') search.set('view', 'student');
    var state = params.get('state');
    if (state) search.set('state', state);
    return 'index.html?' + search.toString();
  }

  function enterClassroom() {
    if (!sessionId || !ready || role !== 'trainer') return;
    stopPreview();
    window.location.assign(classroomUrl());
  }

  function watchForTrainer() {
    if (role !== 'student' || !api || typeof api.getSessionPresence !== 'function') return;
    function check() {
      api.getSessionPresence(sessionId).then(function (presence) {
        if (!presence) return;
        /* The server exposes only a boolean handoff signal to a child. No
           join timestamp, attendance total, pay state or trainer note crosses
           this boundary. */
        if (presence.classroomOpen === true) {
          stopPreview();
          window.location.assign(classroomUrl());
        }
      }).catch(function () {});
    }
    check();
    presenceTimer = window.setInterval(check, 3000);
  }

  function init() {
    applyRole();
    bindControls();
    if (!sessionId) {
      networkMessage = 'Open a session from your dashboard first.';
      cameraMessage = 'No session selected.';
      renderStatus();
      return;
    }
    loadState();
    stateTimer = window.setInterval(loadState, 4000);
    initNetwork();
    initPreview();
    watchForTrainer();
    var start = $('#startSessionBtn');
    if (start) start.addEventListener('click', enterClassroom);
    window.addEventListener('pagehide', stopPreview);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
