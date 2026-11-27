/* ==========================================================================
   MATHIFY — 1-on-1 teaching whiteboard

   The verified trainer keeps the planner private and works on an edge-to-edge
   board with a floating, draggable tool palette. When the trainer presses
   Share, the board opens full-screen for the student and only board content is
   relayed over the session-scoped /board/ink endpoint. A trainer can paste a
   screenshot from the planner (or choose an image file), so practice questions
   can be shown without exposing the private planner, answer keys, hints or
   trainer notes. Leaving full screen always closes the board completely.
   ========================================================================== */
(function () {
  'use strict';

  var overlay = document.getElementById('fullBoard');
  var canvas = document.getElementById('fullBoardCanvas');
  if (!overlay || !canvas) return;

  var ctx = canvas.getContext('2d');
  var toggle = document.getElementById('fullBoardToggle') ||
    document.getElementById('fullBoardToggleStudent');
  var shareBtn = document.getElementById('fullBoardShare');
  var pasteBtn = document.getElementById('fullBoardPaste');
  var fileInput = document.getElementById('fullBoardFile');
  var fullscreenBtn = document.getElementById('fullBoardFullscreen');
  var undoBtn = document.getElementById('fullBoardUndo');
  var redoBtn = document.getElementById('fullBoardRedo');
  var clearBtn = document.getElementById('fullBoardClear');
  var statusNode = document.getElementById('fullBoardStatus');
  var toolPalette = overlay.querySelector('.full-board-tools');
  var toolHandle = document.getElementById('fullBoardToolHandle');

  var params = new URLSearchParams(window.location.search);
  var client = window.mathifyClassroomApi || {};
  var studentView = params.get('view') === 'student' || params.get('role') === 'student' ||
    client.role === 'student';
  var role = studentView ? 'student' :
    (client.role || params.get('role') ||
      (window.MATHIFY_USER && window.MATHIFY_USER.role) || null);
  var trainer = role === 'trainer' || role === 'founder';
  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') ||
    params.get('sessionId') || null;
  var api = window.mathifyClassroomApi;

  var COLORS = {
    ink: '#0E1420', coral: '#FF5B2E', teal: '#12968C', amber: '#B4740B',
    blue: '#2563EB', paper: '#FFFFFF'
  };
  var SHAPES = ['line', 'arrow', 'rectangle', 'circle', 'triangle'];
  var WIDTHS = { pen: 2.6, marker: 17, eraser: 26 };
  var items = [];
  var redoStack = [];
  var imageCache = {};
  var active = null;
  var pointerId = null;
  var tool = 'pen';
  var color = 'ink';
  var sharing = false;
  var since = 0;
  var imageCount = 0;

  function say(message) {
    if (!statusNode) return;
    statusNode.textContent = message || '';
    statusNode.hidden = !message;
  }

  function fit() {
    if (!ctx) return;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function drawShape(stroke, points) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var a = points[0];
    var b = points[points.length - 1];
    var x1 = a[0] * w;
    var y1 = a[1] * h;
    var x2 = b[0] * w;
    var y2 = b[1] * h;
    ctx.beginPath();
    if (stroke.tool === 'line' || stroke.tool === 'arrow') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (stroke.tool === 'arrow') {
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var head = Math.min(18, Math.max(9, ctx.lineWidth * 5));
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
        ctx.stroke();
      }
      return;
    }
    var left = Math.min(x1, x2);
    var right = Math.max(x1, x2);
    var top = Math.min(y1, y2);
    var bottom = Math.max(y1, y2);
    if (stroke.tool === 'rectangle') {
      ctx.rect(left, top, right - left, bottom - top);
    } else if (stroke.tool === 'circle') {
      ctx.ellipse((left + right) / 2, (top + bottom) / 2,
        (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2);
    } else if (stroke.tool === 'triangle') {
      ctx.moveTo((left + right) / 2, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
      ctx.closePath();
    }
    ctx.stroke();
  }

  function drawStroke(stroke) {
    if (!stroke || !stroke.points || !stroke.points.length) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.lineWidth = WIDTHS[stroke.tool] || WIDTHS.pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS[stroke.tool === 'eraser' ? 'paper' : (stroke.color || 'ink')] || COLORS.ink;
    ctx.fillStyle = ctx.strokeStyle;
    if (SHAPES.indexOf(stroke.tool) !== -1 && stroke.points.length > 1) {
      drawShape(stroke, stroke.points);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
    for (var i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i][0] * w, stroke.points[i][1] * h);
    }
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0][0] * w + 0.01, stroke.points[0][1] * h + 0.01);
    }
    ctx.stroke();
  }

  function drawImage(image) {
    if (!image || !image.data) return;
    var bitmap = imageCache[image.id];
    if (!bitmap) {
      bitmap = new Image();
      bitmap.onload = redraw;
      imageCache[image.id] = bitmap;
      bitmap.src = image.data;
    }
    if (!bitmap.complete || !bitmap.naturalWidth) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.drawImage(bitmap, image.x * w, image.y * h, image.w * w, image.h * h);
  }

  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    items.forEach(function (item) {
      if (!item) return;
      if (item.kind === 'image') drawImage(item.image || item);
      else drawStroke(item.ink || item);
    });
    if (active) drawStroke(active);
  }

  function point(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    ];
  }

  /* Only a verified trainer can write. Content is only sent after Share is on,
     and the server re-checks the session and role on every request. */
  function push(type, extra) {
    if (!trainer || !sharing || !sessionId || !api || typeof api.pushBoardInk !== 'function') {
      return Promise.resolve(false);
    }
    return api.pushBoardInk(sessionId, Object.assign({ type: type }, extra || {}))
      .then(function () { return true; })
      .catch(function (error) {
        say('Sharing failed: ' + (error && error.message ? error.message : 'offline'));
        return false;
      });
  }

  function snapshotPayload() {
    return {
      items: items,
      strokes: items.filter(function (item) { return item.kind !== 'image'; })
        .map(function (item) { return item.ink || item; })
    };
  }

  canvas.addEventListener('pointerdown', function (event) {
    if (!trainer || !ctx || overlay.hidden) return;
    var p = point(event);
    if (!p) return;
    pointerId = event.pointerId;
    active = { kind: 'stroke', tool: tool, color: color, points: [p] };
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(pointerId); } catch (error) { /* synthetic pointer */ }
    }
    redraw();
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!active || event.pointerId !== pointerId) return;
    var p = point(event);
    if (!p) return;
    var last = active.points[active.points.length - 1];
    if (Math.abs(p[0] - last[0]) < 0.001 && Math.abs(p[1] - last[1]) < 0.001) return;
    if (SHAPES.indexOf(active.tool) !== -1) {
      /* A maths shape is defined by its start and end, never a long ink trail. */
      active.points = [active.points[0], p];
    } else {
      if (active.points.length >= 2000) return;
      active.points.push(p);
    }
    redraw();
  });

  function finish(event) {
    if (!active || (event && event.pointerId !== pointerId)) return;
    var completed = active;
    active = null;
    pointerId = null;
    items.push(completed);
    redoStack = [];
    redraw();
    push('stroke', { ink: completed, page: 1 });
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  overlay.querySelectorAll('[data-board-tool]').forEach(function (button) {
    button.addEventListener('click', function () {
      tool = button.getAttribute('data-board-tool');
      overlay.querySelectorAll('[data-board-tool]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });
  overlay.querySelectorAll('[data-board-color]').forEach(function (button) {
    button.addEventListener('click', function () {
      color = button.getAttribute('data-board-color');
      overlay.querySelectorAll('[data-board-color]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });

  /* The palette floats above the canvas and can be dragged anywhere on the
     board. Pointer capture keeps the drag alive when the cursor leaves it. */
  var paletteDrag = null;
  function clampPalette() {
    if (!toolPalette || overlay.hidden || !toolPalette.style.left || !toolPalette.style.top) return;
    var bounds = overlay.getBoundingClientRect();
    var size = toolPalette.getBoundingClientRect();
    var x = Math.min(Math.max(0, parseFloat(toolPalette.style.left) || 0),
      Math.max(0, bounds.width - size.width));
    var y = Math.min(Math.max(0, parseFloat(toolPalette.style.top) || 0),
      Math.max(0, bounds.height - size.height));
    toolPalette.style.left = x + 'px';
    toolPalette.style.top = y + 'px';
  }
  if (toolPalette) {
    toolPalette.addEventListener('pointerdown', function (event) {
      if (!trainer || overlay.hidden || event.button !== 0) return;
      if (event.target !== toolPalette && event.target !== toolHandle &&
          !(toolHandle && toolHandle.contains(event.target))) return;
      var size = toolPalette.getBoundingClientRect();
      paletteDrag = { id: event.pointerId, dx: event.clientX - size.left, dy: event.clientY - size.top };
      toolPalette.classList.add('is-dragging');
      if (toolPalette.setPointerCapture) {
        try { toolPalette.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      }
      event.preventDefault();
    });
    toolPalette.addEventListener('pointermove', function (event) {
      if (!paletteDrag || event.pointerId !== paletteDrag.id) return;
      var bounds = overlay.getBoundingClientRect();
      var size = toolPalette.getBoundingClientRect();
      var x = Math.min(Math.max(0, event.clientX - bounds.left - paletteDrag.dx),
        Math.max(0, bounds.width - size.width));
      var y = Math.min(Math.max(0, event.clientY - bounds.top - paletteDrag.dy),
        Math.max(0, bounds.height - size.height));
      toolPalette.style.left = x + 'px';
      toolPalette.style.top = y + 'px';
      toolPalette.style.transform = 'none';
    });
    function endPaletteDrag(event) {
      if (!paletteDrag || (event && event.pointerId !== paletteDrag.id)) return;
      paletteDrag = null;
      toolPalette.classList.remove('is-dragging');
      if (event && toolPalette.hasPointerCapture && toolPalette.hasPointerCapture(event.pointerId)) {
        toolPalette.releasePointerCapture(event.pointerId);
      }
    }
    toolPalette.addEventListener('pointerup', endPaletteDrag);
    toolPalette.addEventListener('pointercancel', endPaletteDrag);
  }

  if (undoBtn) undoBtn.addEventListener('click', function () {
    if (!trainer) return;
    var removed = items.pop();
    if (removed) redoStack.push(removed);
    redraw();
    push('snapshot', Object.assign({ page: 1 }, snapshotPayload()));
  });
  if (redoBtn) redoBtn.addEventListener('click', function () {
    if (!trainer) return;
    var restored = redoStack.pop();
    if (!restored) return;
    items.push(restored);
    redraw();
    push('snapshot', Object.assign({ page: 1 }, snapshotPayload()));
  });
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (!trainer) return;
    items = [];
    redoStack = [];
    imageCache = {};
    imageCount = 0;
    redraw();
    push('clear', { page: 1 });
  });

  /* -------------------------------------------------------- screenshots */
  function loadBitmap(dataUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('That image could not be read.')); };
      image.src = dataUrl;
    });
  }

  function compactImage(dataUrl) {
    return loadBitmap(dataUrl).then(function (image) {
      var longest = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
      if (!longest) throw new Error('That image is empty.');
      var base = Math.min(1, 1600 / longest);
      var tries = [
        { scale: base, type: 'image/webp', quality: 0.86 },
        { scale: base, type: 'image/jpeg', quality: 0.84 },
        { scale: base * 0.78, type: 'image/jpeg', quality: 0.78 },
        { scale: base * 0.55, type: 'image/jpeg', quality: 0.7 }
      ];
      for (var i = 0; i < tries.length; i += 1) {
        var attempt = tries[i];
        var staging = document.createElement('canvas');
        staging.width = Math.max(1, Math.round((image.naturalWidth || 1) * attempt.scale));
        staging.height = Math.max(1, Math.round((image.naturalHeight || 1) * attempt.scale));
        var pen = staging.getContext('2d');
        pen.fillStyle = '#FFFFFF';
        pen.fillRect(0, 0, staging.width, staging.height);
        pen.drawImage(image, 0, 0, staging.width, staging.height);
        var output = staging.toDataURL(attempt.type, attempt.quality);
        if (output.length <= 1450000) return output;
      }
      throw new Error('That screenshot is too large for a 1-on-1 board.');
    });
  }

  function addImage(dataUrl, sourceLabel) {
    if (!trainer || !dataUrl) return Promise.resolve(false);
    return compactImage(dataUrl).then(function (compact) {
      return loadBitmap(compact).then(function (image) {
        var ratio = (image.naturalWidth || 16) / (image.naturalHeight || 9);
        var w = 0.72;
        var h = w / ratio;
        if (h > 0.78) { h = 0.78; w = h * ratio; }
        var offset = imageCount % 4;
        var record = {
          kind: 'image',
          image: {
            id: 'img_' + Date.now() + '_' + imageCount,
            data: compact,
            x: Math.min(0.28, (1 - w) / 2 + offset * 0.015),
            y: Math.min(0.2, 0.08 + offset * 0.025),
            w: w,
            h: h
          }
        };
        imageCount += 1;
        items.push(record);
        redoStack = [];
        redraw();
        say(sourceLabel + ' added' + (sharing ? ' and shared with your student.' : ' to your board.'));
        return push('image', { image: record.image, page: 1 });
      });
    }).catch(function (error) {
      say((error && error.message) || 'That image could not be added.');
      return false;
    });
  }

  function readFile(file) {
    if (!file || String(file.type || '').indexOf('image/') !== 0) {
      say('Choose a PNG, JPEG or WEBP screenshot.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { addImage(String(reader.result), 'Screenshot'); };
    reader.onerror = function () { say('That file could not be read.'); };
    reader.readAsDataURL(file);
  }

  if (fileInput) fileInput.addEventListener('change', function () {
    readFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });

  document.addEventListener('paste', function (event) {
    if (!trainer || overlay.hidden) return;
    var clipboard = event.clipboardData;
    var entries = clipboard && clipboard.items ? Array.prototype.slice.call(clipboard.items) : [];
    var imageEntry = entries.find(function (entry) {
      return String(entry.type || '').indexOf('image/') === 0;
    });
    if (!imageEntry) return;
    var file = imageEntry.getAsFile && imageEntry.getAsFile();
    if (!file) return;
    event.preventDefault();
    readFile(file);
  });

  if (pasteBtn) pasteBtn.addEventListener('click', function () {
    if (!trainer) return;
    /* Browsers gate clipboard reads behind a user gesture and permission; the
       file picker is the honest fallback when that permission is unavailable. */
    if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
      navigator.clipboard.read().then(function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var types = entries[i].types || [];
          var imageType = types.find(function (type) { return String(type).indexOf('image/') === 0; });
          if (!imageType) continue;
          return entries[i].getType(imageType).then(function (blob) {
            readFile(blob);
          });
        }
        fileInput && fileInput.click();
      }).catch(function () { fileInput && fileInput.click(); });
    } else if (fileInput) {
      fileInput.click();
    }
  });

  overlay.addEventListener('dragover', function (event) {
    if (!trainer) return;
    event.preventDefault();
  });
  overlay.addEventListener('drop', function (event) {
    if (!trainer) return;
    event.preventDefault();
    readFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  function hideTrainerPointer() {
    if (window.MathifyCursor && typeof window.MathifyCursor.hide === 'function') {
      window.MathifyCursor.hide('board');
    }
  }

  if (shareBtn) shareBtn.addEventListener('click', function () {
    if (!trainer) return;
    sharing = !sharing;
    if (!sharing) hideTrainerPointer();
    var state = api && typeof api.shareBoard === 'function' && sessionId
      ? api.shareBoard(sessionId, sharing)
      : Promise.resolve();
    state.then(function () {
      if (sharing) return push('snapshot', Object.assign({ page: 1 }, snapshotPayload()));
      return false;
    }).catch(function (error) {
      say('Share state could not be saved: ' + error.message);
    });
    shareBtn.setAttribute('aria-pressed', String(sharing));
    shareBtn.classList.toggle('is-sharing', sharing);
    shareBtn.setAttribute('aria-label', sharing ? 'Stop sharing with student' : 'Share with student');
    shareBtn.setAttribute('title', sharing ? 'Stop sharing with student' : 'Share with student');
    say(sharing ? 'Board is shared with your student. The planner stays private.' : 'Board is private again.');
  });

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', function () {
    /* Close the board outright. Returning to a docked board in the dashboard
       made it look like the whiteboard stayed open after leaving full screen. */
    close();
  });
  document.addEventListener('fullscreenchange', function () {
    /* Native full-screen exit (Esc or the browser control) must also close the
       board for the trainer, not leave a half-open board behind. */
    if (!document.fullscreenElement && !overlay.hidden) close();
  });
  if (toggle) toggle.addEventListener('click', function () {
    if (!overlay.hidden) {
      close();
      return;
    }
    /* One click opens the board edge-to-edge; no second in-board click. */
    open();
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () { /* CSS full view still applies */ });
    }
  });

  function open() {
    overlay.hidden = false;
    overlay.classList.add('full');
    document.body.classList.add('board-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (requestAnimationFrame) requestAnimationFrame(function () { fit(); clampPalette(); });
    else { fit(); clampPalette(); }
  }
  function close() {
    hideTrainerPointer();
    overlay.hidden = true;
    document.body.classList.remove('board-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }

  /* The student board is read-only and follows the trainer's share state. */
  function applyInk(event) {
    var payload = event.payload || {};
    if (payload.page && payload.page !== 1) return;
    if (payload.type === 'stroke' && payload.ink) {
      items.push({ kind: 'stroke', ink: payload.ink });
    } else if (payload.type === 'image' && payload.image) {
      items.push({ kind: 'image', image: payload.image });
      imageCount += 1;
    } else if (payload.type === 'snapshot') {
      if (Array.isArray(payload.items)) {
        items = payload.items.slice(0, 300);
        imageCount = items.filter(function (item) { return item.kind === 'image'; }).length;
      } else if (Array.isArray(payload.strokes)) {
        items = payload.strokes.slice(0, 300).map(function (ink) {
          return { kind: 'stroke', ink: ink };
        });
      }
    } else if (payload.type === 'clear') {
      items = [];
      imageCache = {};
      imageCount = 0;
    } else return;
    redraw();
  }

  function poll() {
    if (!sessionId || !api || typeof api.getSessionEvents !== 'function') return;
    api.getSessionEvents(sessionId, since).then(function (events) {
      (events || []).forEach(function (event) {
        if (!event || typeof event.seq !== 'number' || event.seq <= since) return;
        since = event.seq;
        if (event.event === 'board.shared') {
          var shared = Boolean(event.payload && event.payload.shared);
          if (!trainer) {
            document.body.classList.toggle('board-shared', shared);
            if (shared) open();
            else close();
            say(shared
              ? 'Your trainer is sharing the board. The planner is hidden; only the whiteboard is shown.'
              : 'Board sharing stopped.');
          }
        } else if (event.event === 'board.ink' && !trainer) {
          applyInk(event);
        }
      });
    }).catch(function () { /* retry on the next tick */ });
  }

  if (trainer && params.get('board') === 'full') open();
  setInterval(poll, 1200);
  poll();
  window.addEventListener('resize', function () { fit(); clampPalette(); });
}());
