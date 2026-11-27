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
  var SHAPE_TOOLS = [
    'square', 'rectangle', 'circle', 'triangle', 'diamond',
    'pentagon', 'hexagon', 'star', 'parallelogram'
  ];
  var LINE_TOOLS = ['line', 'arrow', 'double-arrow', 'dashed', 'dotted'];
  var SHAPES = SHAPE_TOOLS.concat(LINE_TOOLS);
  var WIDTHS = { pen: 2.6, highlighter: 18, marker: 17, eraser: 26, laser: 4 };
  var items = [];
  var redoStack = [];
  var deleteUndo = [];
  var deleteRedo = [];
  var selection = [];
  var pan = { x: 0, y: 0 };
  var panDrag = null;
  var moveDrag = null;
  var resizeDrag = null;
  var laserItems = [];
  var laserFrame = null;
  var zoom = 1;
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
    /* Use layout size, not the transformed bounding rect: Ctrl+plus zoom must
       scale the rendered board without resizing its drawing buffer. */
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }

  function setZoom(next, announce) {
    var value = Math.min(2.5, Math.max(0.5, Math.round(next * 10) / 10));
    if (value === zoom) return;
    zoom = value;
    canvas.style.transform = 'scale(' + zoom + ')';
    if (announce) say('Whiteboard zoom ' + Math.round(zoom * 100) + '% · Ctrl+0 resets.');
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
    ctx.lineWidth = WIDTHS[stroke.tool] || WIDTHS.pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS[stroke.tool === 'eraser' ? 'paper' : (stroke.color || 'ink')] || COLORS.ink;
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
    /* A single selected image gets four solid corner grips. They are drawn on
       the same canvas as the ink, so they zoom and pan with the board. */
    if (selection.length === 1) {
      var only = selection[0];
      var onlyBounds = itemBounds(only);
      if (only.kind === 'image' && onlyBounds) {
        var corners = [
          [onlyBounds.left, onlyBounds.top],
          [onlyBounds.right, onlyBounds.top],
          [onlyBounds.left, onlyBounds.bottom],
          [onlyBounds.right, onlyBounds.bottom]
        ];
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = COLORS.coral;
        ctx.lineWidth = 1.5;
        corners.forEach(function (corner) {
          var hx = corner[0] * width;
          var hy = corner[1] * height;
          ctx.fillRect(hx - 7, hy - 7, 14, 14);
          ctx.strokeRect(hx - 7, hy - 7, 14, 14);
        });
      }
    }
    ctx.restore();
  }

  function drawLaser(trail, now) {
    if (!trail || !trail.points || !trail.points.length) return false;
    var remaining = (trail.expires - now) / trail.duration;
    if (remaining <= 0) return false;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, remaining));
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = WIDTHS.laser;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,59,48,.95)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(trail.points[0][0] * w, trail.points[0][1] * h);
    for (var i = 1; i < trail.points.length; i += 1) {
      ctx.lineTo(trail.points[i][0] * w, trail.points[i][1] * h);
    }
    if (trail.points.length === 1) {
      ctx.lineTo(trail.points[0][0] * w + 0.01, trail.points[0][1] * h + 0.01);
    }
    ctx.stroke();
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

  function limit(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function resizeCursor(handle) {
    return handle === 'top-right' || handle === 'bottom-left'
      ? 'nesw-resize' : 'nwse-resize';
  }

  function resizeHandleAt(p) {
    if (tool !== 'select' || selection.length !== 1) return null;
    var item = selection[0];
    if (!item || item.kind !== 'image') return null;
    var bounds = itemBounds(item);
    if (!bounds) return null;
    var padX = 14 / (canvas.clientWidth || 1);
    var padY = 14 / (canvas.clientHeight || 1);
    var corners = [
      ['top-left', bounds.left, bounds.top],
      ['top-right', bounds.right, bounds.top],
      ['bottom-left', bounds.left, bounds.bottom],
      ['bottom-right', bounds.right, bounds.bottom]
    ];
    for (var i = 0; i < corners.length; i += 1) {
      if (Math.abs(p[0] - corners[i][1]) <= padX &&
          Math.abs(p[1] - corners[i][2]) <= padY) return corners[i][0];
    }
    return null;
  }

  function clonePoints(points) {
    return points.map(function (p) { return [p[0], p[1]]; });
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

    if (tool === 'select') {
      var handle = resizeHandleAt(p);
      if (handle) {
        var image = selection[0].image || selection[0];
        var imageBounds = itemBounds(selection[0]);
        resizeDrag = {
          id: event.pointerId, origin: p, image: image, handle: handle,
          bounds: imageBounds,
          ratio: image.w / Math.max(image.h, 0.001), changed: false
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
        if (selection.indexOf(hit) !== -1 && !event.shiftKey) {
          var bounds = itemBounds(hit);
          var inner = hit.image || hit.ink || hit;
          moveDrag = {
            id: event.pointerId, origin: p, item: hit,
            x: typeof inner.x === 'number' ? inner.x : 0,
            y: typeof inner.y === 'number' ? inner.y : 0,
            points: inner.points ? clonePoints(inner.points) : null,
            bounds: bounds, changed: false
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
    active = { kind: 'stroke', tool: tool, color: color, points: [p] };
    capturePointer(event);
    redraw();
  });

  canvas.addEventListener('pointermove', function (event) {
    if (panDrag && event.pointerId === panDrag.id) {
      pan.x = panDrag.panX + (event.clientX - panDrag.x) / zoom;
      pan.y = panDrag.panY + (event.clientY - panDrag.y) / zoom;
      redraw();
      return;
    }
    if (resizeDrag && event.pointerId === resizeDrag.id) {
      var resizePoint = point(event);
      if (!resizePoint || !resizeDrag.bounds) return;
      var image = resizeDrag.image;
      var bounds = resizeDrag.bounds;
      var dx = resizePoint[0] - resizeDrag.origin[0];
      var dy = resizePoint[1] - resizeDrag.origin[1];
      var dragLeft = resizeDrag.handle.indexOf('left') !== -1;
      var dragTop = resizeDrag.handle.indexOf('top') !== -1;
      /* The opposite corner stays pinned. Horizontal and vertical drags are
         both considered so a corner responds naturally however the trainer
         moves the pointer; the image ratio decides the final size. */
      var anchorX = dragLeft ? bounds.right : bounds.left;
      var anchorY = dragTop ? bounds.bottom : bounds.top;
      var desiredW = dragLeft
        ? anchorX - (bounds.left + dx) : (bounds.right + dx) - anchorX;
      var desiredH = dragTop
        ? anchorY - (bounds.top + dy) : (bounds.bottom + dy) - anchorY;
      var ratio = resizeDrag.ratio;
      var startW = Math.max(bounds.right - bounds.left, 0.001);
      var startH = Math.max(bounds.bottom - bounds.top, 0.001);
      var wDelta = Math.abs(desiredW - startW) / startW;
      var hDelta = Math.abs(desiredH - startH) / startH;
      var maxW = Math.min(
        dragLeft ? anchorX : 1 - anchorX,
        (dragTop ? anchorY : 1 - anchorY) * ratio
      );
      var minW = Math.min(maxW, Math.max(0.04, 0.05 * ratio));
      var width = limit(hDelta > wDelta ? desiredH * ratio : desiredW, minW, maxW);
      var height = width / ratio;
      var x = dragLeft ? anchorX - width : anchorX;
      var y = dragTop ? anchorY - height : anchorY;
      if (Math.abs(image.w - width) > 0.0001 ||
          Math.abs(image.h - height) > 0.0001 ||
          Math.abs(image.x - x) > 0.0001 ||
          Math.abs(image.y - y) > 0.0001) resizeDrag.changed = true;
      image.x = x;
      image.y = y;
      image.w = width;
      image.h = height;
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
      var inner = moveDrag.item.image || moveDrag.item.ink || moveDrag.item;
      if (typeof inner.x === 'number') {
        inner.x = limit(moveDrag.x + dx, 0, 1 - (inner.w || 0));
        inner.y = limit(moveDrag.y + dy, 0, 1 - (inner.h || 0));
      } else if (moveDrag.points && inner.points) {
        moveDrag.points.forEach(function (start, index) {
          inner.points[index][0] = limit(start[0] + dx, 0, 1);
          inner.points[index][1] = limit(start[1] + dy, 0, 1);
        });
      }
      if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) moveDrag.changed = true;
      redraw();
      return;
    }
    if (tool === 'select') {
      var hoverPoint = point(event);
      if (!hoverPoint) return;
      var hoverHandle = resizeHandleAt(hoverPoint);
      canvas.style.cursor = hoverHandle ? resizeCursor(hoverHandle)
        : (hitTest(hoverPoint) ? 'grab' : 'default');
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
        say('Image resized · Undo restores the board state.');
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
    if (active && active.tool === 'laser' && (!event || event.pointerId === pointerId)) {
      /* A laser trail is a pointer, not ink: it fades out and is never sent to
         the server or to the student's board. */
      var trail = {
        points: clonePoints(active.points),
        expires: Date.now() + 1500,
        duration: 1500
      };
      active = null;
      pointerId = null;
      laserItems.push(trail);
      redraw();
      if (!laserFrame) laserFrame = requestAnimationFrame(fadeLasers);
      releasePointer(event);
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
    overlay.querySelectorAll('[data-group-menu]').forEach(function (menu) {
      menu.hidden = true;
    });
    overlay.querySelectorAll('[data-tool-group]').forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function setTool(name) {
    var button = overlay.querySelector('[data-board-tool="' + name + '"]');
    if (!button) return;
    closeToolGroups();
    tool = name;
    selection = [];
    moveDrag = null;
    resizeDrag = null;
    canvas.style.cursor = '';
    overlay.classList.toggle('tool-hand', tool === 'hand');
    overlay.classList.toggle('tool-select', tool === 'select');
    overlay.querySelectorAll('[data-board-tool]').forEach(function (item) {
      item.setAttribute('aria-pressed', String(item === button));
    });
    overlay.querySelectorAll('[data-tool-group]').forEach(function (groupButton) {
      var group = groupButton.getAttribute('data-tool-group');
      var active = group === 'shapes'
        ? SHAPE_TOOLS.indexOf(tool) !== -1
        : LINE_TOOLS.indexOf(tool) !== -1;
      groupButton.classList.toggle('is-active', active);
      groupButton.setAttribute('aria-pressed', String(active));
    });
    redraw();
  }

  overlay.querySelectorAll('[data-board-tool]').forEach(function (button) {
    button.addEventListener('click', function () {
      setTool(button.getAttribute('data-board-tool'));
    });
  });
  overlay.querySelectorAll('[data-tool-group]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var group = button.getAttribute('data-tool-group');
      var menu = overlay.querySelector('[data-group-menu="' + group + '"]');
      if (!menu) return;
      var wasOpen = !menu.hidden;
      closeToolGroups();
      if (!wasOpen) {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
      }
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
    if (requestAnimationFrame) requestAnimationFrame(function () { fit(); clampPalette(); });
    else { fit(); clampPalette(); }
  }
  function close() {
    laserItems = [];
    if (laserFrame) cancelAnimationFrame(laserFrame);
    laserFrame = null;
    hideTrainerPointer();
    /* Closing the board must also stop sharing, or the child stays locked in
       a hidden whiteboard and their session desk never comes back. */
    if (trainer && sharing) setSharing(false, false);
    overlay.hidden = true;
    document.body.classList.remove('board-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }

  /* Keyboard-first board editing. The capture phase keeps these shortcuts on
     the open whiteboard instead of letting the desk board handle them first. */
  document.addEventListener('keydown', function (event) {
    if (overlay.hidden || !trainer) return;
    var target = event.target;
    var tag = (target && target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (target && target.isContentEditable)) return;
    var key = (event.key || '').toLowerCase();
    var command = event.ctrlKey || event.metaKey;

    if (command && key === 'a') {
      event.preventDefault();
      event.stopPropagation();
      selectAll();
      return;
    }
    if (command && (key === '=' || key === '+' || event.code === 'NumpadAdd')) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(zoom + 0.1, true);
      return;
    }
    if (command && (key === '-' || key === '_' || event.code === 'NumpadSubtract')) {
      event.preventDefault();
      event.stopPropagation();
      setZoom(zoom - 0.1, true);
      return;
    }
    if (command && key === '0') {
      event.preventDefault();
      event.stopPropagation();
      setZoom(1, true);
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
  window.addEventListener('resize', function () { fit(); clampPalette(); });
}());
