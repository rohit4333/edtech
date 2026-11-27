/* ==========================================================================
   MATHIFY — visible ink pointer + live trainer pointer relay

   Mouse, stylus (Wacom) and touch ink surfaces keep a black cross visible at
   all times, including eraser mode. The verified trainer's pointer position is
   relayed separately from board content so the child can follow where the
   trainer is working, on the shared board and on the quiz sketch surface.

   Only normalised coordinates and an allowlisted surface label cross the wire;
   no text, answer key, hint or trainer note is ever part of this channel.
   ========================================================================== */
(function () {
  'use strict';

  var SEND_MS = 60;
  var POLL_MS = 350;
  var STALE_MS = 2600;

  var params = new URLSearchParams(window.location.search);
  var client = window.mathifyClassroomApi || {};
  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') ||
    params.get('sessionId') || null;
  var role = client.role || params.get('role') ||
    (window.MATHIFY_USER && window.MATHIFY_USER.role) || null;
  var isStudent = role === 'student' || params.get('view') === 'student';
  var isStaff = role === 'trainer' || role === 'founder' || (!isStudent && !!role);
  var watcher = null;
  var sources = [];

  function point(event, element) {
    if (!element || !event) return null;
    var rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function samePoint(a, b) {
    return Boolean(a && b && Math.abs(a.x - b.x) < 0.002 && Math.abs(a.y - b.y) < 0.002);
  }

  /* Trainer side. Pointer move, pen hover and stylus contact all report. The
     throttle is deliberately small enough to feel live without flooding the
     server; the server enforces a second, hard floor. */
  function attachSource(options) {
    var settings = options || {};
    var element = settings.element;
    var surface = settings.surface;
    if (!element || !surface || !isStaff || !sessionId ||
        !client || typeof client.pushCursor !== 'function') {
      return function () {};
    }

    var lastSent = 0;
    var lastPoint = null;
    var hidden = settings.hidden || function () { return false; };

    function send(active, event, force) {
      if (!force && hidden()) return;
      var now = Date.now();
      var p = active ? point(event, element) : null;
      if (active && !p) return;
      if (active && now - lastSent < SEND_MS && samePoint(p, lastPoint)) return;
      if (!active && !force && now - lastSent < SEND_MS) return;
      lastSent = now;
      if (active) lastPoint = p;
      client.pushCursor(sessionId, {
        surface: surface,
        x: p ? Math.round(p.x * 10000) / 10000 : 0,
        y: p ? Math.round(p.y * 10000) / 10000 : 0,
        active: active
      }).catch(function () { /* offline: the next move retries */ });
    }

    function move(event) { send(true, event); }
    function leave() { send(false); }
    var source = {
      surface: surface,
      hide: function () { send(false, null, true); },
      detach: function () {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerdown', move);
        element.removeEventListener('pointerenter', move);
        element.removeEventListener('pointerleave', leave);
        element.removeEventListener('pointercancel', leave);
        var index = sources.indexOf(source);
        if (index >= 0) sources.splice(index, 1);
      }
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerdown', move);
    element.addEventListener('pointerenter', move);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('pointercancel', leave);
    sources.push(source);
    return source;
  }

  function asList(entry) {
    if (!entry) return [];
    return Array.isArray(entry) ? entry : [entry];
  }

  /* Student side. A single poll drives the board and sketch overlays so a
     child never needs more than one request at a time. */
  function watchRemote(options) {
    var settings = options || {};
    var targets = settings.targets || {};
    var overlays = {};
    var since = 0;
    var lastAt = 0;
    var stopped = false;
    var inFlight = false;

    function overlayFor(surface, index, descriptor) {
      var key = surface + ':' + index;
      var container = descriptor.container;
      if (!container) return null;
      if (!overlays[key]) {
        var style = window.getComputedStyle(container);
        if (style.position === 'static') container.style.position = 'relative';
        var node = document.createElement('span');
        node.className = 'remote-pointer';
        node.setAttribute('aria-hidden', 'true');
        node.hidden = true;
        container.appendChild(node);
        overlays[key] = { node: node, descriptor: descriptor };
      }
      return overlays[key];
    }

    function hideAll() {
      Object.keys(overlays).forEach(function (key) { overlays[key].node.hidden = true; });
    }

    function place(record) {
      var descriptors = asList(targets[record.surface]);
      var shown = false;
      descriptors.forEach(function (descriptor, index) {
        var entry = overlayFor(record.surface, index, descriptor);
        if (!entry) return;
        var visible = !descriptor.visible || descriptor.visible();
        var surface = descriptor.element || descriptor.container;
        if (!visible || !surface) {
          entry.node.hidden = true;
          return;
        }
        var surfaceRect = surface.getBoundingClientRect();
        var containerRect = entry.node.parentNode.getBoundingClientRect();
        if (!surfaceRect.width || !surfaceRect.height) {
          entry.node.hidden = true;
          return;
        }
        entry.node.style.left = (surfaceRect.left - containerRect.left +
          record.x * surfaceRect.width) + 'px';
        entry.node.style.top = (surfaceRect.top - containerRect.top +
          record.y * surfaceRect.height) + 'px';
        entry.node.hidden = false;
        shown = true;
      });
      if (shown) lastAt = Date.now();
    }

    function tick() {
      if (stopped || inFlight || !sessionId || !client ||
          typeof client.getCursor !== 'function') return;
      inFlight = true;
      client.getCursor(sessionId, since).then(function (cursor) {
        if (cursor && Number(cursor.seq) > since) {
          since = Number(cursor.seq);
          if (cursor.active === false) hideAll();
          else place(cursor);
        }
        if (lastAt && Date.now() - lastAt > STALE_MS) hideAll();
      }).catch(function () {
        if (lastAt && Date.now() - lastAt > STALE_MS) hideAll();
      }).then(function () { inFlight = false; }, function () { inFlight = false; });
    }

    function stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      hideAll();
      if (watcher && watcher.stop === stop) watcher = null;
    }

    var timer = null;
    if (isStudent) {
      timer = setInterval(tick, POLL_MS);
      watcher = { hideAll: hideAll, stop: stop };
      tick();
    }

    return watcher || { hideAll: hideAll, stop: stop };
  }

  function hideSource(surface) {
    sources.slice().forEach(function (source) {
      if (!surface || source.surface === surface) {
        if (source && typeof source.hide === 'function') source.hide();
      }
    });
  }

  window.MathifyCursor = {
    attachSource: attachSource,
    watchRemote: watchRemote,
    hide: hideSource,
    hideAll: function () { if (watcher) watcher.hideAll(); },
    sessionId: sessionId,
    role: role
  };
})();
