/* Mathify pre-lesson readiness gate.
 *
 * This page checks camera, microphone and connection before the camera page.
 * It never joins a LiveKit room. The trainer's Join action writes an active
 * presence heartbeat, which is the server-owned signal that starts the class
 * clock; the same clock keeps running across the camera page and whiteboard
 * until End session finalizes presence.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') ||
    params.get('sessionId') || null;
  var api = window.mathifyClassroomApi;
  var role = 'trainer';
  var localStream = null;
  var mediaChecked = false;
  var networkChecked = false;
  var joining = false;
  var ended = false;
  var stateTimer = null;
  var enterMicOn = true;
  var enterCameraOn = true;

  var SUBJECT_LABELS = {
    math: 'Mathematics',
    coding: 'Coding',
    english: 'Communication'
  };

  function $(selector) { return document.querySelector(selector); }

  function setText(selector, value) {
    var node = $(selector);
    if (node) node.textContent = value;
  }

  function setCheck(row, result, text, pill) {
    var node = $(row);
    if (node) node.setAttribute('data-result', result);
    setText(row + 'Text', text);
    setText(row + 'Pill', pill);
  }

  function status(text) {
    setText('#preflightStatus', text);
    var live = $('#preflightLive');
    if (live) live.textContent = text;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'AR';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''))
      .toUpperCase();
  }

  function forwardedParams() {
    var search = new URLSearchParams();
    search.set('sessionId', sessionId || '');
    search.set('role', role);
    if (role === 'student') search.set('view', 'student');
    ['state', 'review', 'live', 'devLabel'].forEach(function (key) {
      var value = params.get(key);
      if (value) search.set(key, value);
    });
    search.set('mic', enterMicOn ? 'on' : 'off');
    search.set('cam', enterCameraOn ? 'on' : 'off');
    return search;
  }

  function cameraUrl(clockStarted) {
    var search = forwardedParams();
    search.set('clock', clockStarted ? 'started' : 'check');
    return 'connect.html?' + search.toString();
  }

  function applyRole() {
    var explicitStudent = params.get('view') === 'student' || params.get('role') === 'student';
    var detected = api && typeof api.viewerRole === 'function' ? api.viewerRole() : (api && api.role);
    var resolved = explicitStudent ? 'student' : (detected || 'trainer');
    role = resolved === 'student' ? 'student' : 'trainer';
    document.body.setAttribute('data-role', role);

    Array.prototype.forEach.call(document.querySelectorAll('.trainer-only'), function (node) {
      node.hidden = role !== 'trainer';
    });
    Array.prototype.forEach.call(document.querySelectorAll('.student-only'), function (node) {
      node.hidden = role !== 'student';
    });
    setText('#preflightRole', role === 'student' ? 'Student' : 'Trainer');
    setText('#preflightWaiting', role === 'student'
      ? 'Your shared camera page opens as soon as these checks finish.'
      : '');
  }

  function applyState(state) {
    if (!state) return;
    if (state.status === 'ended') {
      ended = true;
      var join = $('#preflightJoin');
      if (join) join.disabled = true;
      status('This session has ended. Ask your trainer to schedule a new one.');
    }
    var key = state.subject === 'coding' || state.subject === 'english' ? state.subject : 'math';
    setText('#preflightSubject', '1:1 · ' + SUBJECT_LABELS[key]);
    var studentName = state.participants && state.participants.student &&
      state.participants.student.name;
    if (studentName) setText('#preflightInitials', initials(studentName));
  }

  function loadState() {
    if (ended || !api || typeof api.getSessionState !== 'function') return;
    api.getSessionState(sessionId).then(applyState).catch(function () {
      status('Session details could not be loaded. You can still check your camera.');
    });
  }

  function renderMeter(value) {
    var meter = $('#preflightNet');
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
    return { bars: bars, level: level };
  }

  function readyToJoin() {
    var canJoin = !ended && mediaChecked && networkChecked && !joining && Boolean(sessionId);
    var join = $('#preflightJoin');
    if (join) {
      join.disabled = !canJoin;
      join.title = !sessionId
        ? 'Open this page from a session first'
        : ended ? 'This session has ended'
        : canJoin ? 'Start the class clock and open the camera page'
        : 'Waiting for camera and connection checks';
    }
    /* A child has no second button. Once the local checks finish, the shared
       camera page opens automatically with clock=check; the trainer alone
       starts the clock from this gate. */
    if (role === 'student' && canJoin) {
      joining = true;
      status('Checks complete. Opening the shared camera…');
      openCameraPage(false);
    }
  }

  function runMediaChecks() {
    var preview = $('#preflightPreview');
    var note = $('#preflightPreviewNote');
    var media = navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') {
      setCheck('#checkCamera', 'blocked', 'Camera API is unavailable in this browser.', 'Unavailable');
      setCheck('#checkMic', 'blocked', 'Microphone API is unavailable in this browser.', 'Unavailable');
      if (note) note.textContent = 'Camera unavailable';
      mediaChecked = true;
      readyToJoin();
      return;
    }
    media.getUserMedia({ video: true, audio: true }).then(function (stream) {
      if (localStream) stopStream();
      localStream = stream;
      var video = $('#preflightVideo');
      if (video) {
        try { video.srcObject = stream; } catch (error) { /* preview only */ }
      }
      setCheck('#checkCamera', 'ready', 'Camera is working.', 'Ready');
      setCheck('#checkMic', 'ready', 'Microphone is working.', 'Ready');
      if (preview) preview.setAttribute('data-state', 'ready');
      mediaChecked = true;
      readyToJoin();
      status('Camera and microphone are ready.');
    }).catch(function (error) {
      var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      var text = denied
        ? 'Access blocked. Allow it in your browser for the best lesson.'
        : 'No camera or microphone was found on this device.';
      setCheck('#checkCamera', 'blocked', text, denied ? 'Blocked' : 'Missing');
      setCheck('#checkMic', 'blocked', text, denied ? 'Blocked' : 'Missing');
      if (note) note.textContent = denied ? 'Camera access blocked' : 'No camera found';
      if (preview) preview.setAttribute('data-state', 'denied');
      mediaChecked = true;
      readyToJoin();
      status(text + ' You can still join; your trainer will see the camera check state.');
    });
  }

  function stopStream() {
    if (!localStream) return;
    if (typeof localStream.getTracks === 'function') {
      localStream.getTracks().forEach(function (track) { track.stop(); });
    }
    localStream = null;
  }

  function runNetworkCheck() {
    if (!window.mathifyNetworkCheck || typeof window.mathifyNetworkCheck.init !== 'function') {
      setCheck('#checkNetwork', 'blocked', 'Connection check is unavailable on this page.', 'Skipped');
      networkChecked = true;
      readyToJoin();
      return;
    }
    var result = null;
    window.mathifyNetworkCheck.init({
      api: api,
      sessionId: sessionId,
      button: null,
      onState: function (network) {
        result = renderMeter(network);
        var own = (network && network[role]) || {};
        var ok = Boolean(network && network.canStartCall === true) ||
          (own.status && own.status !== 'not_checked' && own.ok !== false);
        setCheck('#checkNetwork', ok ? 'ready' : 'blocked',
          ok ? 'Connection checked for a private 1:1 class.'
            : 'Connection is below the class minimum; you can still continue.',
          ok ? 'Ready' : 'Low');
        networkChecked = true;
        readyToJoin();
      }
    });
    window.mathifyNetworkCheck.run().catch(function () {
      if (!result) {
        setCheck('#checkNetwork', 'blocked', 'Connection could not be measured.', 'Skipped');
        networkChecked = true;
        readyToJoin();
      }
    });
  }

  function startClock() {
    if (!api || typeof api.request !== 'function' || !sessionId) return Promise.resolve(null);
    return api.request('/sessions/' + encodeURIComponent(sessionId) + '/presence', {
      method: 'POST',
      body: { active: true, learningEvents: 0 }
    });
  }

  function openCameraPage(clockStarted) {
    stopStream();
    /* The clock is server-owned; this flag only stops a page transition from
       being mistaken for leaving the meeting. */
    window.MATHIFY_STAY_PRESENT = true;
    window.location.assign(cameraUrl(clockStarted === true));
  }

  function enterCameraPage() {
    if (joining || ended || !sessionId || !api || role !== 'trainer') return;
    joining = true;
    readyToJoin();
    var button = $('#preflightJoin');
    if (button) button.textContent = 'Starting the class clock…';
    status('Starting your class clock and opening the camera page…');
    startClock().then(function () {
      openCameraPage(true);
    }).catch(function (error) {
      joining = false;
      if (button) button.textContent = 'Join the session';
      readyToJoin();
      status('The class clock could not start: ' + (error && error.message || 'try again') + '.');
    });
  }

  function bindPresets() {
    [['#presetMic', '#presetMicValue', 'mic'],
      ['#presetCam', '#presetCamValue', 'cam']].forEach(function (entry) {
      var button = $(entry[0]);
      if (!button) return;
      button.addEventListener('click', function () {
        var nextOn = button.getAttribute('data-on') !== 'true';
        button.setAttribute('data-on', String(nextOn));
        button.setAttribute('aria-pressed', String(!nextOn));
        setText(entry[1], nextOn ? 'On' : 'Off');
        if (entry[2] === 'mic') enterMicOn = nextOn; else enterCameraOn = nextOn;
      });
    });
  }

  function runChecks() {
    mediaChecked = false;
    networkChecked = false;
    setCheck('#checkCamera', 'checking', 'Checking access…', 'Checking');
    setCheck('#checkMic', 'checking', 'Checking access…', 'Checking');
    setCheck('#checkNetwork', 'checking', 'Checking your connection…', 'Checking');
    var preview = $('#preflightPreview');
    if (preview) preview.setAttribute('data-state', 'checking');
    readyToJoin();
    status('Checking your camera, microphone and connection…');
    runMediaChecks();
    runNetworkCheck();
  }

  function init() {
    applyRole();
    bindPresets();
    loadState();
    if (sessionId) stateTimer = window.setInterval(loadState, 5000);
    var join = $('#preflightJoin');
    if (join) join.addEventListener('click', enterCameraPage);
    var retry = $('#preflightRetry');
    if (retry) retry.addEventListener('click', function () {
      stopStream();
      var video = $('#preflightVideo');
      if (video) {
        try { video.srcObject = null; } catch (error) { /* detached */ }
      }
      runChecks();
    });
    window.addEventListener('pagehide', function () {
      if (window.MATHIFY_STAY_PRESENT !== true) stopStream();
    });
    if (!sessionId) {
      status('Open this page from your dashboard to join a session.');
      mediaChecked = true;
      networkChecked = true;
      readyToJoin();
      return;
    }
    runChecks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
