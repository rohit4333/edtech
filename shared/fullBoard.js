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
  var zoomInBtn = document.getElementById('fullBoardZoomIn');
  var zoomOutBtn = document.getElementById('fullBoardZoomOut');
  var zoomResetBtn = document.getElementById('fullBoardZoomReset');
  var zoomValue = document.getElementById('fullBoardZoomValue');
  var statusNode = document.getElementById('fullBoardStatus');
  var inkPanel = document.getElementById('fullBoardInkPanel');
  var toolPalette = overlay.querySelector('.full-board-tools');
  var inkCarets = toolPalette ? toolPalette.querySelectorAll('[data-ink-toggle]') : [];
  var topRow = document.querySelector('.top .top-r');
  var sessionDeck = document.querySelector('.board-session-deck');
  var paletteHome = toolPalette && toolPalette.parentNode;

  /* The board has three floating decks in one row: REC, editing tools and
     session controls. The palette mounts between the first and the last. */
  function mountPalette() {
    if (!toolPalette || !topRow) return;
    if (toolPalette.parentNode !== topRow) {
      topRow.insertBefore(toolPalette, sessionDeck || shareBtn || null);
    }
  }
  function unmountPalette() {
    if (!toolPalette) return;
    if (paletteHome && toolPalette.parentNode !== paletteHome) paletteHome.appendChild(toolPalette);
  }

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
    blue: '#2563EB', violet: '#7C3AED', green: '#15803D', pink: '#DB2777',
    orange: '#EA580C', slate: '#475569', paper: '#FFFFFF'
  };
  var SHAPE_TOOLS = [
    'square', 'rectangle', 'circle', 'triangle', 'diamond',
    'pentagon', 'hexagon', 'star', 'parallelogram'
  ];
  var LINE_TOOLS = ['line', 'arrow', 'double-arrow', 'dashed', 'dotted'];
  var SHAPES = SHAPE_TOOLS.concat(LINE_TOOLS);
  var WIDTHS = { pen: 2.6, highlighter: 18, marker: 17, eraser: 26, laser: 4 };
  var WEIGHTS = { thin: 0.55, normal: 1, bold: 1.9 };
  var items = [];
  var redoStack = [];
  var deleteUndo = [];
  var deleteRedo = [];
  var selection = [];
  var pan = { x: 0, y: 0 };
  var layoutSize = { w: 0, h: 0 };
  var lastViewPush = 0;
  var panDrag = null;
  var moveDrag = null;
  var resizeDrag = null;
  var eraseDrag = null;
  var laserItems = [];
  var laserFrame = null;
  var zoom = 1;
  var imageCache = {};
  var active = null;
  var pointerId = null;
  /* Select is the safe default: opening the board never starts sketching.
     Non-sketching tools keep the compact arrow cursor. */
  var tool = 'select';
  var color = 'ink';
  var weight = 'normal';
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
    /* Use layout size, not the transformed bounding rect: Ctrl+plus zoom must
       scale the rendered board without resizing its drawing buffer. */
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;
    /* Keep the visible point of the board steady when the window changes size;
       the view sent to the student is stored as a fraction of these dimensions. */
    if (layoutSize.w && layoutSize.h) {
      pan.x *= width / layoutSize.w;
      pan.y *= height / layoutSize.h;
    }
    layoutSize.w = width;
    layoutSize.h = height;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function setZoom(next, announce) {
    var value = Math.min(2.5, Math.max(0.5, Math.round(next * 10) / 10));
    zoom = value;
    canvas.style.transform = 'scale(' + zoom + ')';
    if (zoomValue) zoomValue.textContent = Math.round(zoom * 100) + '%';
    if (announce) say('Whiteboard zoom ' + Math.round(zoom * 100) + '% · Ctrl+0 resets.');
    pushView(true);
  }

  function drawArrowHead(x, y, angle, head) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - head * Math.cos(angle - Math.PI / 7), y - head * Math.sin(angle - Math.PI / 7));
    ctx.moveTo(x, y);
    ctx.lineTo(x - head * Math.cos(angle + Math.PI / 7), y - head * Math.sin(angle + Math.PI / 7));
    ctx.stroke();
  }

  function drawPolygon(vertices) {
    ctx.beginPath();
    vertices.forEach(function (vertex, index) {
      if (!index) ctx.moveTo(vertex[0], vertex[1]);
      else ctx.lineTo(vertex[0], vertex[1]);
    });
    ctx.closePath();
    ctx.stroke();
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
    var dash = stroke.tool === 'dashed' ? [10, 7]
      : (stroke.tool === 'dotted' ? [1, 7] : []);
    ctx.setLineDash(dash);
    ctx.beginPath();
    if (LINE_TOOLS.indexOf(stroke.tool) !== -1) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (stroke.tool === 'arrow' || stroke.tool === 'double-arrow') {
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var head = Math.min(18, Math.max(9, ctx.lineWidth * 5));
        drawArrowHead(x2, y2, angle, head);
        if (stroke.tool === 'double-arrow') {
          drawArrowHead(x1, y1, angle + Math.PI, head);
        }
      }
      ctx.setLineDash([]);
      return;
    }

    var left = Math.min(x1, x2);
    var right = Math.max(x1, x2);
    var top = Math.min(y1, y2);
    var bottom = Math.max(y1, y2);
    var cx = (left + right) / 2;
    var cy = (top + bottom) / 2;
    var bw = right - left;
    var bh = bottom - top;

    if (stroke.tool === 'square') {
      var side = Math.min(bw, bh);
      ctx.rect(cx - side / 2, cy - side / 2, side, side);
    } else if (stroke.tool === 'rectangle') {
      ctx.rect(left, top, bw, bh);
    } else if (stroke.tool === 'circle') {
      ctx.ellipse(cx, cy, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    } else if (stroke.tool === 'triangle') {
      drawPolygon([[cx, top], [right, bottom], [left, bottom]]);
      ctx.setLineDash([]);
      return;
    } else if (stroke.tool === 'diamond') {
      drawPolygon([[cx, top], [right, cy], [cx, bottom], [left, cy]]);
      ctx.setLineDash([]);
      return;
    } else if (stroke.tool === 'parallelogram') {
      var skew = bw * 0.22;
      drawPolygon([[left + skew, top], [right, top], [right - skew, bottom], [left, bottom]]);
      ctx.setLineDash([]);
      return;
    } else if (stroke.tool === 'pentagon' || stroke.tool === 'hexagon' || stroke.tool === 'star') {
      var count = stroke.tool === 'pentagon' ? 5 : (stroke.tool === 'hexagon' ? 6 : 10);
      var rotation = stroke.tool === 'hexagon' ? Math.PI / 6 : -Math.PI / 2;
      var vertices = [];
      for (var i = 0; i < count; i += 1) {
        var angle = rotation + i * Math.PI * 2 / count;
        var radius = stroke.tool === 'star' && i % 2 ? 0.45 : 1;
        vertices.push([cx + Math.cos(angle) * bw / 2 * radius,
          cy + Math.sin(angle) * bh / 2 * radius]);
      }
      drawPolygon(vertices);
      ctx.setLineDash([]);
      return;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawStroke(stroke) {
    if (!stroke || !stroke.points || !stroke.points.length) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var highlighter = stroke.tool === 'highlighter' || stroke.tool === 'marker';
    ctx.save();
    if (highlighter) {
      ctx.globalAlpha = 0.34;
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.lineWidth = (WIDTHS[stroke.tool] || WIDTHS.pen) * (WEIGHTS[stroke.weight] || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS[stroke.color || 'ink'] || COLORS.ink;
    ctx.fillStyle = ctx.strokeStyle;
    if (SHAPES.indexOf(stroke.tool) !== -1 && stroke.points.length > 1) {
      drawShape(stroke, stroke.points);
      ctx.restore();
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
    ctx.restore();
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

  function itemBounds(item) {
    if (!item) return null;
    if (item.kind === 'image') {
      var image = item.image || item;
      if (!image || typeof image.x !== 'number') return null;
      return {
        left: image.x, top: image.y,
        right: image.x + (image.w || 0), bottom: image.y + (image.h || 0)
      };
    }
    var ink = item.ink || item;
    if (!ink || !ink.points || !ink.points.length) return null;
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    ink.points.forEach(function (p) {
      left = Math.min(left, p[0]);
      top = Math.min(top, p[1]);
      right = Math.max(right, p[0]);
      bottom = Math.max(bottom, p[1]);
    });
    return { left: left, top: top, right: right, bottom: bottom };
  }

  function selectionBounds() {
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    selection.forEach(function (item) {
      var bounds = itemBounds(item);
      if (!bounds) return;
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);
    });
    if (left === Infinity) return null;
    return { left: left, top: top, right: right, bottom: bottom };
  }

  function selectionCorners(bounds) {
    if (!bounds) return [];
    return [
      ['top-left', bounds.left, bounds.top],
      ['top-right', bounds.right, bounds.top],
      ['bottom-left', bounds.left, bounds.bottom],
      ['bottom-right', bounds.right, bounds.bottom]
    ];
  }

  function drawSelectionOutlines(width, height) {
    if (!selection.length) return;
    ctx.save();
    ctx.strokeStyle = COLORS.coral;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    selection.forEach(function (item) {
      var bounds = itemBounds(item);
      if (!bounds) return;
      var pad = 0.008;
      ctx.strokeRect(
        (bounds.left - pad) * width, (bounds.top - pad) * height,
        (bounds.right - bounds.left + pad * 2) * width,
        (bounds.bottom - bounds.top + pad * 2) * height
      );
    });
    /* Every selected item — ink, shape, line, image or a group — shares one
       bounding box, so the same four solid corner grips resize all of them.
       They are drawn on the canvas, so they zoom and pan with the board. */
    var bounds = selectionBounds();
    if (bounds) {
      ctx.setLineDash([]);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = COLORS.coral;
      ctx.lineWidth = 1.5;
      selectionCorners(bounds).forEach(function (corner) {
        var hx = corner[1] * width;
        var hy = corner[2] * height;
        ctx.fillRect(hx - 7, hy - 7, 14, 14);
        ctx.strokeRect(hx - 7, hy - 7, 14, 14);
      });
    }
    ctx.restore();
  }

  function drawLaser(trail, now) {
    if (!trail || !trail.points || !trail.points.length) return false;
    var remaining = (trail.expires - now) / trail.duration;
    if (!isFinite(remaining)) remaining = 1;
    if (remaining <= 0) return false;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var points = trail.points;
    ctx.save();
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = WIDTHS.laser;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,59,48,.95)';
    ctx.shadowBlur = 16;
    if (points.length === 1) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(points[0][0] * w, points[0][1] * h);
      ctx.lineTo(points[0][0] * w + 0.01, points[0][1] * h + 0.01);
      ctx.stroke();
      ctx.restore();
      return true;
    }
    /* The cutoff travels from the first point to the last, so an old tail
       goes dark before the newest part of the laser stroke. */
    var fadeEdge = 1 - remaining;
    var last = points.length - 1;
    for (var i = 0; i < last; i += 1) {
      var t = (i + 0.5) / last;
      if (t < fadeEdge) continue;
      var alpha = Math.min(1, (t - fadeEdge) / 0.18);
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(points[i][0] * w, points[i][1] * h);
      ctx.lineTo(points[i + 1][0] * w, points[i + 1][1] * h);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function fadeLasers() {
    laserFrame = null;
    if (!laserItems.length || overlay.hidden) return;
    redraw();
    laserFrame = requestAnimationFrame(fadeLasers);
  }

  function redraw() {
    if (!ctx) return;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    items.forEach(function (item) {
      if (!item) return;
      if (item.kind === 'image') drawImage(item.image || item);
      else drawStroke(item.ink || item);
    });
    if (active && active.tool === 'laser') {
      drawLaser({ points: active.points, expires: Infinity, duration: 1 }, Date.now());
    } else if (active) drawStroke(active);
    var now = Date.now();
    var living = laserItems.filter(function (trail) { return drawLaser(trail, now); });
    if (living.length !== laserItems.length) laserItems = living;
    drawSelectionOutlines(width, height);
    ctx.restore();
  }

  function point(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    /* Undo the visual zoom first, then the hand pan, then normalise against the
       unscaled drawing buffer so ink, selection and resize stay accurate. */
    return [
      ((event.clientX - rect.left) / zoom - pan.x) / canvas.clientWidth,
      ((event.clientY - rect.top) / zoom - pan.y) / canvas.clientHeight
    ];
  }

  function hitTest(p) {
    var pad = 0.012;
    for (var i = items.length - 1; i >= 0; i -= 1) {
      var bounds = itemBounds(items[i]);
      if (!bounds) continue;
      if (p[0] >= bounds.left - pad && p[0] <= bounds.right + pad &&
          p[1] >= bounds.top - pad && p[1] <= bounds.bottom + pad) return items[i];
    }
    return null;
  }

  /* The eraser removes complete ink items rather than laying paper-coloured ink
     over them. Distance is measured in unzoomed canvas pixels so the hit area
     matches the drawn stroke at every board zoom level. */
  function eraserRadius() {
    return (WIDTHS.eraser * 0.5) + 5;
  }

  function distanceSqToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var lengthSq = dx * dx + dy * dy;
    if (!lengthSq) {
      var pointDx = px - ax;
      var pointDy = py - ay;
      return pointDx * pointDx + pointDy * pointDy;
    }
    var t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    var nearestX = ax + t * dx;
    var nearestY = ay + t * dy;
    return (px - nearestX) * (px - nearestX) + (py - nearestY) * (py - nearestY);
  }

  function eraserTouches(item, p) {
    var stroke = item.ink || item;
    if (!p || !stroke || !stroke.points || !stroke.points.length) return false;
    var width = canvas.clientWidth || 1;
    var height = canvas.clientHeight || 1;
    var radius = eraserRadius();
    var px = p[0] * width;
    var py = p[1] * height;
    if (SHAPES.indexOf(stroke.tool) !== -1) {
      var bounds = itemBounds(item);
      if (!bounds) return false;
      return px >= bounds.left * width - radius && px <= bounds.right * width + radius &&
        py >= bounds.top * height - radius && py <= bounds.bottom * height + radius;
    }
    var radiusSq = radius * radius;
    for (var i = 0; i < stroke.points.length - 1; i += 1) {
      if (distanceSqToSegment(
        px, py,
        stroke.points[i][0] * width, stroke.points[i][1] * height,
        stroke.points[i + 1][0] * width, stroke.points[i + 1][1] * height
      ) <= radiusSq) return true;
    }
    var only = stroke.points[0];
    return distanceSqToSegment(px, py, only[0] * width, only[1] * height,
      only[0] * width, only[1] * height) <= radiusSq;
  }

  function eraseAt(p) {
    var removed = [];
    for (var i = items.length - 1; i >= 0; i -= 1) {
      if (!eraserTouches(items[i], p)) continue;
      removed.push({ index: i, item: items[i] });
      items.splice(i, 1);
    }
    return removed;
  }

  function limit(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function resizeCursor(handle) {
    return handle === 'top-right' || handle === 'bottom-left'
      ? 'nesw-resize' : 'nwse-resize';
  }

  function resizeHandleAt(p) {
    if (tool !== 'select' || !selection.length) return null;
    var bounds = selectionBounds();
    if (!bounds) return null;
    /* The point() helper already removes the visual zoom, so convert the
       on-screen grip size back into the same normalised, unzoomed space. */
    var padX = 14 / ((canvas.clientWidth || 1) * zoom);
    var padY = 14 / ((canvas.clientHeight || 1) * zoom);
    var corners = selectionCorners(bounds);
    for (var i = 0; i < corners.length; i += 1) {
      if (Math.abs(p[0] - corners[i][1]) <= padX &&
          Math.abs(p[1] - corners[i][2]) <= padY) return corners[i][0];
    }
    return null;
  }

  function clonePoints(points) {
    return points.map(function (p) { return [p[0], p[1]]; });
  }

  function selectionEntries() {
    return selection.map(function (item) {
      var inner = item.image || item.ink || item;
      return {
        item: item,
        inner: inner,
        x: typeof inner.x === 'number' ? inner.x : null,
        y: typeof inner.y === 'number' ? inner.y : null,
        w: inner.w,
        h: inner.h,
        points: inner.points ? clonePoints(inner.points) : null
      };
    });
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

  function viewPayload() {
    return {
      zoom: zoom,
      /* Normalised pan keeps the same part of the board in view on a phone and
         on a desktop, while pointer maths still works in local CSS pixels. */
      pan: {
        x: pan.x / (canvas.clientWidth || 1),
        y: pan.y / (canvas.clientHeight || 1)
      }
    };
  }

  function pushView(force) {
    if (!trainer) return;
    var now = Date.now();
    if (!force && now - lastViewPush < 180) return;
    lastViewPush = now;
    push('view', { view: viewPayload(), page: 1 });
  }

  function snapshotPayload() {
    return {
      items: items,
      strokes: items.filter(function (item) { return item.kind !== 'image'; })
        .map(function (item) { return item.ink || item; }),
      view: viewPayload()
    };
  }

  function capturePointer(event) {
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
    }
  }

  function releasePointer(event) {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
    }
  }

  canvas.addEventListener('pointerdown', function (event) {
    if (!trainer || !ctx || overlay.hidden) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    var p = point(event);
    if (!p) return;

    if (tool === 'hand') {
      panDrag = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        panX: pan.x, panY: pan.y
      };
      overlay.classList.add('is-panning');
      capturePointer(event);
      event.preventDefault();
      return;
    }

    if (tool === 'eraser') {
      selection = [];
      eraseDrag = { id: event.pointerId, last: p, removed: eraseAt(p) };
      pointerId = event.pointerId;
      capturePointer(event);
      if (eraseDrag.removed.length) {
        redraw();
        say('Drawn stroke erased · Undo restores it.');
      }
      event.preventDefault();
      return;
    }

    if (tool === 'select') {
      var handle = resizeHandleAt(p);
      if (handle) {
        resizeDrag = {
          id: event.pointerId, origin: p, handle: handle,
          bounds: selectionBounds(), entries: selectionEntries(),
          changed: false
        };
        canvas.style.cursor = resizeCursor(handle);
        capturePointer(event);
        event.preventDefault();
        return;
      }

      var hit = hitTest(p);
      if (!event.shiftKey && (!hit || selection.indexOf(hit) === -1)) selection = [];
      if (hit) {
        var at = selection.indexOf(hit);
        if (at === -1) selection.push(hit);
        else if (event.shiftKey) selection.splice(at, 1);
        if (selection.indexOf(hit) !== -1) {
          /* A click on any member of a multi-selection moves the whole group. */
          moveDrag = {
            id: event.pointerId, origin: p,
            bounds: selectionBounds(), entries: selectionEntries(),
            changed: false
          };
          canvas.style.cursor = 'grabbing';
        }
      }
      capturePointer(event);
      redraw();
      say(selection.length
        ? selection.length + (selection.length === 1 ? ' item' : ' items') + ' selected · drag to move, use a corner grip to resize, press Delete to remove.'
        : '');
      event.preventDefault();
      return;
    }

    selection = [];
    pointerId = event.pointerId;
    active = { kind: 'stroke', tool: tool, color: color, weight: weight, points: [p] };
    capturePointer(event);
    redraw();
  });

  canvas.addEventListener('pointermove', function (event) {
    if (panDrag && event.pointerId === panDrag.id) {
      pan.x = panDrag.panX + (event.clientX - panDrag.x) / zoom;
      pan.y = panDrag.panY + (event.clientY - panDrag.y) / zoom;
      redraw();
      pushView(false);
      return;
    }
    if (resizeDrag && event.pointerId === resizeDrag.id) {
      var resizePoint = point(event);
      if (!resizePoint || !resizeDrag.bounds) return;
      var bounds = resizeDrag.bounds;
      var dragLeft = resizeDrag.handle.indexOf('left') !== -1;
      var dragTop = resizeDrag.handle.indexOf('top') !== -1;
      /* One bounding box for every selected item. The opposite corner is the
         fixed anchor, and a single scale keeps images, ink, shapes, lines and
         groups in proportion while the pointer can use either axis. */
      var anchorX = dragLeft ? bounds.right : bounds.left;
      var anchorY = dragTop ? bounds.bottom : bounds.top;
      var startW = Math.max(bounds.right - bounds.left, 0);
      var startH = Math.max(bounds.bottom - bounds.top, 0);
      var safeW = Math.max(startW, 0.001);
      var safeH = Math.max(startH, 0.001);
      var desiredW = Math.max(dragLeft
        ? anchorX - resizePoint[0] : resizePoint[0] - anchorX, 0.001);
      var desiredH = Math.max(dragTop
        ? anchorY - resizePoint[1] : resizePoint[1] - anchorY, 0.001);
      var scaleX = desiredW / safeW;
      var scaleY = startH < 0.001 ? scaleX : desiredH / safeH;
      if (startW < 0.001) scaleX = scaleY;
      var scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      var maxScale = Math.min(
        (dragLeft ? anchorX : 1 - anchorX) / safeW,
        (dragTop ? anchorY : 1 - anchorY) / safeH,
        12
      );
      var minScale = Math.min(0.02, maxScale);
      scale = limit(scale, minScale, maxScale);
      resizeDrag.entries.forEach(function (entry) {
        var inner = entry.inner;
        if (typeof entry.x === 'number') {
          inner.x = limit(anchorX + (entry.x - anchorX) * scale, 0, 1);
          inner.y = limit(anchorY + (entry.y - anchorY) * scale, 0, 1);
          inner.w = Math.max(entry.w * scale, 0.001);
          inner.h = Math.max(entry.h * scale, 0.001);
        } else if (entry.points) {
          entry.points.forEach(function (start, index) {
            inner.points[index][0] = limit(anchorX + (start[0] - anchorX) * scale, 0, 1);
            inner.points[index][1] = limit(anchorY + (start[1] - anchorY) * scale, 0, 1);
          });
        }
      });
      resizeDrag.changed = Math.abs(scale - 1) > 0.001;
      redraw();
      return;
    }
    if (moveDrag && event.pointerId === moveDrag.id) {
      var movePoint = point(event);
      if (!movePoint) return;
      var dx = movePoint[0] - moveDrag.origin[0];
      var dy = movePoint[1] - moveDrag.origin[1];
      if (moveDrag.bounds) {
        dx = limit(dx, -moveDrag.bounds.left, 1 - moveDrag.bounds.right);
        dy = limit(dy, -moveDrag.bounds.top, 1 - moveDrag.bounds.bottom);
      }
      moveDrag.entries.forEach(function (entry) {
        var inner = entry.inner;
        if (typeof entry.x === 'number') {
          inner.x = limit(entry.x + dx, 0, 1 - (inner.w || 0));
          inner.y = limit(entry.y + dy, 0, 1 - (inner.h || 0));
        } else if (entry.points) {
          entry.points.forEach(function (start, index) {
            inner.points[index][0] = limit(start[0] + dx, 0, 1);
            inner.points[index][1] = limit(start[1] + dy, 0, 1);
          });
        }
      });
      if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) moveDrag.changed = true;
      redraw();
      return;
    }
    if (eraseDrag && event.pointerId === eraseDrag.id) {
      var erasePoint = point(event);
      if (!erasePoint) return;
      var eraseWidth = canvas.clientWidth || 1;
      var eraseHeight = canvas.clientHeight || 1;
      var travel = Math.sqrt(
        Math.pow((erasePoint[0] - eraseDrag.last[0]) * eraseWidth, 2) +
        Math.pow((erasePoint[1] - eraseDrag.last[1]) * eraseHeight, 2)
      );
      /* Sample between events so a fast swipe cannot skip a thin stroke. */
      var steps = Math.max(1, Math.ceil(travel / Math.max(eraserRadius() * 0.6, 1)));
      var alreadyErased = eraseDrag.removed.length;
      for (var step = 1; step <= steps; step += 1) {
        var ratio = step / steps;
        eraseDrag.removed = eraseDrag.removed.concat(eraseAt([
          eraseDrag.last[0] + (erasePoint[0] - eraseDrag.last[0]) * ratio,
          eraseDrag.last[1] + (erasePoint[1] - eraseDrag.last[1]) * ratio
        ]));
      }
      eraseDrag.last = erasePoint;
      if (eraseDrag.removed.length !== alreadyErased) {
        redraw();
        say(eraseDrag.removed.length + ' drawn stroke' +
          (eraseDrag.removed.length === 1 ? '' : 's') + ' erased · Undo restores them.');
      }
      return;
    }
    if (tool === 'select') {
      var hoverPoint = point(event);
      if (!hoverPoint) return;
      var hoverHandle = resizeHandleAt(hoverPoint);
      canvas.style.cursor = hoverHandle ? resizeCursor(hoverHandle)
        : (hitTest(hoverPoint) ? 'grab' : '');
      return;
    }
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
    if (panDrag && event.pointerId === panDrag.id) {
      panDrag = null;
      overlay.classList.remove('is-panning');
      releasePointer(event);
      pushView(true);
      return;
    }
    if (resizeDrag && (!event || event.pointerId === resizeDrag.id)) {
      var resized = resizeDrag.changed;
      var finishedCursor = resizeCursor(resizeDrag.handle);
      resizeDrag = null;
      canvas.style.cursor = finishedCursor;
      releasePointer(event);
      if (resized) {
        pushBoardSnapshot();
        say('Selection resized · Undo restores the board state.');
      }
      return;
    }
    if (moveDrag && (!event || event.pointerId === moveDrag.id)) {
      var moved = moveDrag.changed;
      moveDrag = null;
      canvas.style.cursor = 'grab';
      releasePointer(event);
      if (moved) {
        pushBoardSnapshot();
        say('Selection moved · Undo restores the board state.');
      }
      return;
    }
    if (eraseDrag && (!event || event.pointerId === eraseDrag.id)) {
      var erased = eraseDrag.removed;
      eraseDrag = null;
      pointerId = null;
      releasePointer(event);
      if (erased.length) {
        deleteUndo.push(erased);
        deleteRedo = [];
        redoStack = [];
        redraw();
        pushBoardSnapshot();
        say(erased.length + ' drawn stroke' + (erased.length === 1 ? '' : 's') +
          ' erased · Undo restores them.');
      }
      return;
    }
    if (active && active.tool === 'laser' && (!event || event.pointerId === pointerId)) {
      /* A laser trail is a live pointer cue, not saved ink. The child sees the
         same fading trail while sharing, but never gets a laser tool. */
      var trail = {
        points: clonePoints(active.points),
        expires: Date.now() + 2400,
        duration: 2400
      };
      active = null;
      pointerId = null;
      laserItems.push(trail);
      redraw();
      if (!laserFrame) laserFrame = requestAnimationFrame(fadeLasers);
      releasePointer(event);
      push('laser', { laser: { points: trail.points, duration: trail.duration }, page: 1 });
      return;
    }
    if (!active || (event && event.pointerId !== pointerId)) return;
    var completed = active;
    active = null;
    pointerId = null;
    items.push(completed);
    redoStack = [];
    deleteUndo = [];
    deleteRedo = [];
    redraw();
    releasePointer(event);
    push('stroke', { ink: completed, page: 1 });
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  function closeToolGroups() {
    toolPalette.querySelectorAll('[data-group-menu]').forEach(function (menu) {
      menu.hidden = true;
    });
    toolPalette.querySelectorAll('[data-tool-group]').forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  /* The ink row is the popover owned by the pen/highlighter carets. It lives
     inside the whiteboard-controls deck, never as a fourth floating surface. */
  function closeInkPanel() {
    if (!inkPanel) return;
    inkPanel.hidden = true;
    Array.prototype.forEach.call(inkCarets, function (caret) {
      caret.setAttribute('aria-expanded', 'false');
    });
  }

  function anchorInkPanel(caret) {
    if (!toolPalette || !inkPanel || !caret) return;
    var paletteRect = toolPalette.getBoundingClientRect();
    var caretRect = caret.getBoundingClientRect();
    var border = toolPalette.clientLeft || 0;
    var left = caretRect.left - paletteRect.left - border;
    var widest = toolPalette.clientWidth - inkPanel.offsetWidth;
    if (widest >= 0) left = Math.min(Math.max(left, 0), widest);
    else left = Math.max(left, 0);
    inkPanel.style.left = Math.round(left) + 'px';
  }

  function openInkPanel(caret) {
    if (!inkPanel || !caret || !toolPalette) return;
    closeToolGroups();
    inkPanel.hidden = false;
    Array.prototype.forEach.call(inkCarets, function (item) {
      item.setAttribute('aria-expanded', String(item === caret));
    });
    anchorInkPanel(caret);
  }

  function setTool(name) {
    var button = toolPalette.querySelector('[data-board-tool="' + name + '"]');
    if (!button) return;
    closeToolGroups();
    /* Colour and thickness stay in the caret popover; switching tools always
       dismisses it so no stale ink row floats above a different tool. */
    closeInkPanel();
    tool = name;
    selection = [];
    moveDrag = null;
    resizeDrag = null;
    canvas.style.cursor = '';
    overlay.classList.remove('is-panning');
    /* Only drawing tools change the pointer icon. Shapes, lines and every
       other non-sketching tool inherit the compact arrow in fullBoard.css. */
    ['select', 'hand', 'pen', 'highlighter', 'marker', 'eraser', 'laser']
      .forEach(function (cursorTool) {
        overlay.classList.toggle('tool-' + cursorTool, tool === cursorTool);
      });
    toolPalette.querySelectorAll('[data-board-tool]').forEach(function (item) {
      item.setAttribute('aria-pressed', String(item === button));
    });
    toolPalette.querySelectorAll('[data-tool-group]').forEach(function (groupButton) {
      var group = groupButton.getAttribute('data-tool-group');
      var active = group === 'shapes'
        ? SHAPE_TOOLS.indexOf(tool) !== -1
        : LINE_TOOLS.indexOf(tool) !== -1;
      groupButton.classList.toggle('is-active', active);
      groupButton.setAttribute('aria-pressed', String(active));
    });
    redraw();
  }

  toolPalette.querySelectorAll('[data-board-tool]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTool(button.getAttribute('data-board-tool'));
    });
  });
  Array.prototype.forEach.call(inkCarets, function (caret) {
    caret.addEventListener('click', function (event) {
      if (!inkPanel) return;
      event.stopPropagation();
      var name = caret.getAttribute('data-ink-toggle');
      var wasOpen = !inkPanel.hidden && caret.getAttribute('aria-expanded') === 'true';
      if (wasOpen) {
        closeInkPanel();
        return;
      }
      setTool(name);
      openInkPanel(caret);
    });
  });
  toolPalette.querySelectorAll('[data-tool-group]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      closeInkPanel();
      var group = button.getAttribute('data-tool-group');
      var menu = toolPalette.querySelector('[data-group-menu="' + group + '"]');
      if (!menu) return;
      var wasOpen = !menu.hidden;
      closeToolGroups();
      if (!wasOpen) {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
  toolPalette.querySelectorAll('[data-board-color]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      color = button.getAttribute('data-board-color');
      toolPalette.querySelectorAll('[data-board-color]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      closeInkPanel();
    });
  });
  toolPalette.querySelectorAll('[data-board-weight]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      weight = button.getAttribute('data-board-weight');
      toolPalette.querySelectorAll('[data-board-weight]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      say('Stroke thickness set to ' + weight + '.');
      closeInkPanel();
    });
  });

  /* A click anywhere else on the page dismisses the ink popover. */
  document.addEventListener('click', function (event) {
    if (!inkPanel || inkPanel.hidden) return;
    var target = event.target;
    if (inkPanel.contains(target)) return;
    if (target && target.closest && target.closest('[data-ink-toggle]')) return;
    closeInkPanel();
  });

  function pushBoardSnapshot() {
    push('snapshot', Object.assign({ page: 1 }, snapshotPayload()));
  }

  function undoBoard() {
    if (!trainer) return;
    /* A Delete is its own undo step, so Ctrl+Z restores exactly what was
       removed instead of silently undoing an older stroke. */
    var deleted = deleteUndo.pop();
    if (deleted) {
      deleted.slice().sort(function (a, b) { return a.index - b.index; })
        .forEach(function (entry) {
          items.splice(Math.min(entry.index, items.length), 0, entry.item);
        });
      deleteRedo.push(deleted);
      selection = deleted.map(function (entry) { return entry.item; });
      redraw();
      pushBoardSnapshot();
      say('Deleted items restored · Redo to remove them again.');
      return;
    }
    var removed = items.pop();
    if (!removed) return;
    selection = selection.filter(function (item) { return item !== removed; });
    redoStack.push(removed);
    redraw();
    pushBoardSnapshot();
  }

  function redoBoard() {
    if (!trainer) return;
    var deleted = deleteRedo.pop();
    if (deleted) {
      var restored = deleted.map(function (entry) { return entry.item; });
      items = items.filter(function (item) { return restored.indexOf(item) === -1; });
      deleteUndo.push(deleted);
      selection = [];
      redraw();
      pushBoardSnapshot();
      say('Deleted items removed again · Undo to restore.');
      return;
    }
    var restoredItem = redoStack.pop();
    if (!restoredItem) return;
    selection = [];
    items.push(restoredItem);
    redraw();
    pushBoardSnapshot();
  }

  function selectAll() {
    if (!trainer || !items.length) return;
    selection = items.slice();
    redraw();
    say('All board items selected · press Delete to remove them.');
  }

  function deleteSelection() {
    if (!trainer || !selection.length) return;
    var removed = selection.filter(function (item) { return items.indexOf(item) !== -1; })
      .map(function (item) { return { index: items.indexOf(item), item: item }; });
    if (!removed.length) return;
    var removedItems = removed.map(function (entry) { return entry.item; });
    items = items.filter(function (item) { return removedItems.indexOf(item) === -1; });
    deleteUndo.push(removed);
    deleteRedo = [];
    redoStack = [];
    selection = [];
    redraw();
    pushBoardSnapshot();
    say(removed.length + (removed.length === 1 ? ' item' : ' items') + ' deleted · Undo to restore.');
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(zoom + 0.1, true); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(zoom - 0.1, true); });
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', function () { setZoom(1, true); });

  /* Ctrl+scroll and Safari pinch over the board change the canvas scale only.
     Without these handlers the browser zooms the whole classroom — camera deck,
     side panels and lower controls included. */
  overlay.addEventListener('wheel', function (event) {
    if (overlay.hidden || !trainer || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1), true);
  }, { passive: false, capture: true });
  overlay.addEventListener('gesturestart', function (event) {
    if (overlay.hidden || !trainer) return;
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false, capture: true });

  if (undoBtn) undoBtn.addEventListener('click', undoBoard);
  if (redoBtn) redoBtn.addEventListener('click', redoBoard);
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (!trainer) return;
    items = [];
    selection = [];
    redoStack = [];
    deleteUndo = [];
    deleteRedo = [];
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
        deleteUndo = [];
        deleteRedo = [];
        redraw();
        say(sourceLabel + ' added' + (sharing ? ' and shared with your student.' : ' to your board.'));
        return push('image', { image: record.image, page: 1 });
      });
    }).catch(function (error) {
      say((error && error.message) || 'That image could not be added.');
      return false;
    });
  }

  /* A planner or quiz question is pushed as question-only pixels: no options,
     answer, hint or trainer note ever enters the board event. Image questions
     bring only their own attached image. The card uses the Paper & Ink CSS
     tokens, sits top-right, and travels through the existing snapshot event. */
  function themeToken(name, fallback) {
    var styles = window.getComputedStyle(document.documentElement);
    return (styles.getPropertyValue(name) || '').trim() || fallback;
  }

  function roundRect(pen, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    pen.beginPath();
    pen.moveTo(x + r, y);
    pen.arcTo(x + width, y, x + width, y + height, r);
    pen.arcTo(x + width, y + height, x, y + height, r);
    pen.arcTo(x, y + height, x, y, r);
    pen.arcTo(x, y, x + width, y, r);
    pen.closePath();
  }

  function wrapLines(measure, value, maxWidth) {
    var lines = [];
    var line = '';
    String(value).split(/\s+/).forEach(function (word) {
      var next = line ? line + ' ' + word : word;
      if (line && measure.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  function questionImageSource(value) {
    if (!value) return Promise.resolve(null);
    var source = typeof value === 'string' ? value :
      (value.data || value.dataUrl || value.src || value.url || '');
    source = String(source || '').trim();
    if (!source) return Promise.resolve(null);
    if (source.indexOf('data:image/') === 0) return Promise.resolve(source);
    if (/^https?:\/\//.test(source) || source.charAt(0) === '/') {
      return fetch(source).then(function (response) { return response.blob(); })
        .then(function (blob) {
          return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { resolve(null); };
            reader.readAsDataURL(blob);
          });
        }).catch(function () { return null; });
    }
    if (value && typeof value === 'object' && value.mime &&
        /^image\//.test(value.mime) && /^[A-Za-z0-9+/=\s]+$/.test(source)) {
      return Promise.resolve('data:' + value.mime + ';base64,' + source.replace(/\s+/g, ''));
    }
    return Promise.resolve(null);
  }

  function questionCard(question) {
    var text = String((question && (question.q || question.text || question.prompt || question.stem)) || '').trim();
    if (!text) return Promise.resolve(null);
    var width = 1400;
    var pad = 56;
    var measure = document.createElement('canvas').getContext('2d');
    if (!measure) return Promise.resolve(null);
    var font = '600 56px Poppins, Arial, sans-serif';
    measure.font = font;
    var maxWidth = width - pad * 2;
    var lines = wrapLines(measure, text, maxWidth);
    var lineHeight = 78;
    var imageValue = question && (question.image || question.imageUrl ||
      question.image_url || question.imageData || question.image_data ||
      question.photo || question.attachment);
    return questionImageSource(imageValue).then(function (source) {
      if (!source) return null;
      return loadBitmap(source).then(function (bitmap) {
        return { source: source, bitmap: bitmap };
      }).catch(function () { return null; });
    }).then(function (image) {
      var paper = themeToken('--paper', '#FDFAF3');
      var ink = themeToken('--ink', '#0E1420');
      var accent = themeToken('--coral-deep', '#B83A16');
      var line = themeToken('--line', 'rgba(14,20,32,.14)');
      var imageWidth = 0;
      var imageHeight = 0;
      if (image) {
        var ratio = (image.bitmap.naturalWidth || 16) / (image.bitmap.naturalHeight || 9);
        imageWidth = maxWidth;
        imageHeight = imageWidth / ratio;
        if (imageHeight > 520) { imageHeight = 520; imageWidth = imageHeight * ratio; }
        /* A very wide question must never be stretched taller just to meet the
           minimum height: the uploaded ratio always wins. */
        if (imageHeight < 180 && imageHeight * ratio <= maxWidth) {
          imageHeight = 180;
          imageWidth = imageHeight * ratio;
        }
        if (imageWidth > maxWidth) {
          imageWidth = maxWidth;
          imageHeight = imageWidth / ratio;
        }
      }
      var textTop = pad + 52;
      var height = textTop + lines.length * lineHeight +
        (image ? 34 + imageHeight : 0) + pad;
      var stage = document.createElement('canvas');
      stage.width = width;
      stage.height = Math.ceil(height);
      var pen = stage.getContext('2d');
      if (!pen) return null;
      pen.save();
      pen.fillStyle = 'rgba(14,20,32,.12)';
      roundRect(pen, 18, 24, width - 36, stage.height - 36, 28);
      pen.fill();
      pen.restore();
      pen.fillStyle = paper;
      roundRect(pen, 8, 8, width - 16, stage.height - 24, 28);
      pen.fill();
      pen.lineWidth = 2;
      pen.strokeStyle = line;
      pen.stroke();
      pen.fillStyle = accent;
      pen.beginPath();
      pen.arc(pad + 6, pad + 9, 7, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = ink;
      pen.font = '600 26px Poppins, Arial, sans-serif';
      pen.textBaseline = 'top';
      pen.fillText('QUESTION', pad + 26, pad - 3);
      pen.font = font;
      lines.forEach(function (value, index) {
        pen.fillText(value, pad, textTop + index * lineHeight);
      });
      if (image) {
        var imageY = textTop + lines.length * lineHeight + 34;
        var imageX = pad + Math.max(0, (maxWidth - imageWidth) / 2);
        pen.fillStyle = '#FFFFFF';
        roundRect(pen, imageX - 10, imageY - 10, imageWidth + 20, imageHeight + 20, 18);
        pen.fill();
        pen.lineWidth = 2;
        pen.strokeStyle = line;
        pen.stroke();
        pen.save();
        roundRect(pen, imageX, imageY, imageWidth, imageHeight, 12);
        pen.clip();
        pen.drawImage(image.bitmap, imageX, imageY, imageWidth, imageHeight);
        pen.restore();
      }
      return {
        data: stage.toDataURL('image/webp', 0.92) || stage.toDataURL('image/png'),
        hasImage: Boolean(image)
      };
    });
  }

  function shiftItemsUp(delta) {
    if (!(delta > 0)) return;
    items.forEach(function (item) {
      if (item.kind === 'image' && item.image && typeof item.image.y === 'number') {
        item.image.y = Math.max(0, Math.min(1, item.image.y - delta));
        return;
      }
      var ink = item.ink || item;
      if (ink && Array.isArray(ink.points)) {
        ink.points.forEach(function (point) {
          if (Array.isArray(point) && typeof point[1] === 'number') {
            point[1] = Math.max(0, Math.min(1, point[1] - delta));
          }
        });
      }
    });
  }

  /* Keep old writing visible under the upward shift, then move any item that
     would collide with the reserved top-right question card below that card. */
  function clearQuestionZone(box) {
    items.forEach(function (item) {
      var bounds = itemBounds(item);
      if (!bounds || bounds.right < box.x || bounds.left > box.x + box.w ||
          bounds.bottom < box.y || bounds.top > box.y + box.h) return;
      var delta = box.y + box.h + 0.02 - bounds.top;
      if (!(delta > 0)) return;
      if (item.kind === 'image' && item.image && typeof item.image.y === 'number') {
        item.image.y = Math.min(1, item.image.y + delta);
        return;
      }
      var ink = item.ink || item;
      if (ink && Array.isArray(ink.points)) {
        ink.points.forEach(function (point) {
          if (Array.isArray(point) && typeof point[1] === 'number') {
            point[1] = Math.min(1, point[1] + delta);
          }
        });
      }
    });
  }

  /* Automatic question transfer queues the question on the same board without
     stealing the quiz stage. A trainer-initiated push still opens the board. */
  function showQuestionText(question, options) {
    var opts = options || {};
    if (!trainer || !overlay || !canvas) return Promise.resolve(false);
    return questionCard(question).then(function (card) {
      if (!card || !card.data) {
        if (!opts.silent) say('There is no question to push.');
        return false;
      }
      if (opts.open !== false) open();
      return compactImage(card.data).then(function (compact) {
        return loadBitmap(compact).then(function (bitmap) {
          var ratio = (bitmap.naturalWidth || 16) / (bitmap.naturalHeight || 9);
          var w = card.hasImage ? 0.42 : 0.36;
          var h = w / ratio;
          var maxH = card.hasImage ? 0.46 : 0.34;
          var maxW = card.hasImage ? 0.62 : 0.52;
          if (h > maxH) { h = maxH; w = h * ratio; }
          /* The card is fitted, never stretched: a wide image stays wide. */
          if (w > maxW) {
            w = maxW;
            h = w / ratio;
          }
          var box = {
            x: Math.max(0, 0.97 - w),
            y: 0.035,
            w: w,
            h: Math.min(h, 0.9 - 0.035)
          };
          var bottom = 0;
          items.forEach(function (item) {
            var bounds = itemBounds(item);
            if (bounds) bottom = Math.max(bottom, bounds.bottom);
          });
          shiftItemsUp(Math.min(0.85, Math.max(0.03, bottom - 0.78 + 0.02)));
          clearQuestionZone(box);
          var record = {
            kind: 'image',
            image: {
              id: 'question_' + Date.now() + '_' + imageCount,
              data: compact,
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h
            }
          };
          imageCount += 1;
          items.push(record);
          selection = [];
          redoStack = [];
          deleteUndo = [];
          deleteRedo = [];
          redraw();
          if (!opts.silent) {
            say(sharing
              ? 'Question placed on the shared board.'
              : 'Question placed on your board; it will share when Share is on.');
          }
          return push('snapshot', Object.assign({ page: 1 }, snapshotPayload())).then(function () {
            return true;
          });
        });
      });
    }).catch(function (error) {
      if (!opts.silent) say((error && error.message) || 'The question could not be placed.');
      return false;
    });
  }

  window.MathifyFullBoard = {
    showQuestionText: showQuestionText,
    pushQuestion: showQuestionText,
    queueQuestionText: function (question) {
      return showQuestionText(question, { open: false, silent: true });
    },
    isSharing: function () { return sharing; },
    isOpen: function () { return !overlay.hidden; }
  };
  /* session.js loads before this file, so a quiz launched during bootstrap can
     leave the question queued until the board helper is available. */
  window.dispatchEvent(new Event('mathify:fullboard-ready'));

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

  function syncShareButton() {
    if (!shareBtn) return;
    shareBtn.setAttribute('aria-pressed', String(sharing));
    shareBtn.classList.toggle('is-sharing', sharing);
    shareBtn.setAttribute('aria-label', sharing ? 'Stop sharing with student' : 'Share with student');
    shareBtn.setAttribute('title', sharing ? 'Stop sharing with student' : 'Share with student');
  }

  function setSharing(next, announce) {
    if (!trainer || sharing === next) return Promise.resolve();
    sharing = next;
    if (!sharing) hideTrainerPointer();
    syncShareButton();
    var state = api && typeof api.shareBoard === 'function' && sessionId
      ? api.shareBoard(sessionId, sharing)
      : Promise.resolve();
    return state.then(function () {
      if (sharing) return push('snapshot', Object.assign({ page: 1 }, snapshotPayload()));
      return false;
    }).catch(function (error) {
      if (announce) say('Share state could not be saved: ' + error.message);
      return false;
    });
  }

  if (shareBtn) shareBtn.addEventListener('click', function () {
    if (!trainer) return;
    setSharing(!sharing, true).then(function () {
      say(sharing ? 'Board is shared with your student. The planner stays private.' : 'Board is private again.');
    });
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
    mountPalette();
    setTool(tool);
    fit();
  }
  function close() {
    laserItems = [];
    if (laserFrame) cancelAnimationFrame(laserFrame);
    laserFrame = null;
    hideTrainerPointer();
    closeInkPanel();
    /* Closing the board must also stop sharing, or the child stays locked in
       a hidden whiteboard and their session desk never comes back. */
    if (trainer && sharing) setSharing(false, false);
    overlay.hidden = true;
    document.body.classList.remove('board-open');
    unmountPalette();
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }

  /* Keyboard-first board editing. The capture phase keeps these shortcuts on
     the open whiteboard instead of letting the desk board handle them first. */
  document.addEventListener('keydown', function (event) {
    if (overlay.hidden || !trainer) return;
    var target = event.target;
    var tag = (target && target.tagName || '').toLowerCase();
    var key = (event.key || '').toLowerCase();
    var command = event.ctrlKey || event.metaKey;
    if (key === 'escape') closeInkPanel();
    var zoomIn = command && (key === '=' || key === '+' || event.key === 'Equal' ||
      event.code === 'Equal' || event.code === 'NumpadAdd');
    var zoomOut = command && (key === '-' || key === '_' || event.key === 'Minus' ||
      event.code === 'Minus' || event.code === 'NumpadSubtract');
    var zoomReset = command && (key === '0' || event.code === 'Numpad0');
    /* Handle zoom before the editable-field guard: the browser's own Ctrl+zoom
       must never fire while this board is open, even if focus is in a field. */
    if (zoomIn || zoomOut || zoomReset) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(zoomIn ? zoom + 0.1 : (zoomOut ? zoom - 0.1 : 1), true);
      return;
    }
    if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (target && target.isContentEditable)) return;

    if (command && key === 'a') {
      event.preventDefault();
      event.stopPropagation();
      selectAll();
      return;
    }
    if (command && (key === 'z' || key === 'y')) {
      event.preventDefault();
      event.stopPropagation();
      if (key === 'y' || event.shiftKey) redoBoard();
      else undoBoard();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      event.stopPropagation();
      deleteSelection();
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      closeInkPanel();
      closeToolGroups();
      if (selection.length) {
        selection = [];
        redraw();
        say('Selection cleared.');
      }
      return;
    }
    if (!command && !event.altKey && key === 'v') {
      event.preventDefault();
      event.stopPropagation();
      setTool('select');
      return;
    }
    if (!command && !event.altKey && key === 'h') {
      event.preventDefault();
      event.stopPropagation();
      setTool('hand');
      return;
    }
    if (!command && !event.altKey && key === 'p') {
      event.preventDefault();
      event.stopPropagation();
      setTool('pen');
      return;
    }
    if (!command && !event.altKey && key === 'm') {
      event.preventDefault();
      event.stopPropagation();
      setTool('highlighter');
      return;
    }
    if (!command && !event.altKey && key === 'e') {
      event.preventDefault();
      event.stopPropagation();
      setTool('eraser');
      return;
    }
    if (!command && !event.altKey && key === 'r') {
      event.preventDefault();
      event.stopPropagation();
      setTool('laser');
    }
  }, true);

  /* The student board is read-only and follows the trainer's share state. */
  function applyView(view) {
    if (!view || typeof view !== 'object') return;
    setZoom(Number(view.zoom) || 1, false);
    var nextPan = view.pan || {};
    var px = Number(nextPan.x);
    var py = Number(nextPan.y);
    pan.x = (Number.isFinite(px) ? px : 0) * (canvas.clientWidth || 1);
    pan.y = (Number.isFinite(py) ? py : 0) * (canvas.clientHeight || 1);
    redraw();
  }

  function showRemoteLaser(laser, at) {
    if (!laser || !Array.isArray(laser.points) || !laser.points.length) return;
    /* A cached replay must not flash a trail the trainer drew minutes ago. */
    if (at && Date.now() - Date.parse(at) > 6000) return;
    var duration = Number(laser.duration);
    if (!Number.isFinite(duration) || duration < 400) duration = 2400;
    laserItems.push({
      points: laser.points,
      expires: Date.now() + duration,
      duration: duration
    });
    redraw();
    if (!laserFrame) laserFrame = requestAnimationFrame(fadeLasers);
  }

  function applyInk(event) {
    var payload = event.payload || {};
    if (payload.page && payload.page !== 1) return;
    if (payload.type === 'view') {
      applyView(payload.view);
      return;
    }
    if (payload.type === 'laser') {
      showRemoteLaser(payload.laser, event.at);
      return;
    }
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
      selection = [];
      redoStack = [];
      deleteUndo = [];
      deleteRedo = [];
      if (payload.view) applyView(payload.view);
      else redraw();
      return;
    } else if (payload.type === 'clear') {
      items = [];
      imageCache = {};
      imageCount = 0;
    } else return;
    selection = [];
    redoStack = [];
    deleteUndo = [];
    deleteRedo = [];
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
  window.addEventListener('resize', function () { fit(); });
}());
