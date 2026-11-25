/* ==========================================================================
   MATHIFY — classroom
   Vanilla JS. Whiteboard ink, session timer, panels, chat and quick checks.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ toast */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  $$('[data-toast]').forEach(function (el) {
    el.addEventListener('click', function () { toast(el.getAttribute('data-toast')); });
  });

  /* ----------------------------------------------------------------- timers */
  var recTime = $('#recTime');
  var sessionSeconds = 42 * 60 + 18;
  var ended = false;

  function clock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var stepSeconds = 12 * 60 + 40;
  var stepTime = $('#stepTime');
  function paintStepTime() {
    if (stepTime) stepTime.textContent = clock(Math.max(0, stepSeconds)) + ' left';
  }
  paintStepTime();

  setInterval(function () {
    if (ended) return;
    sessionSeconds += 1;
    if (recTime) recTime.textContent = clock(sessionSeconds);
    if (stepSeconds > 0) {
      stepSeconds -= 1;
      paintStepTime();
    }
  }, 1000);

  /* ------------------------------------------------------------------- chat */
  var messages = [
    { who: 'Ishaan', text: 'Can we do one more bar model?', time: '5:09' },
    { who: 'You', text: 'After this one — page 2.', time: '5:09', me: true },
    { who: 'Ishaan', text: 'Got it — 1 part is 6 cm.', time: '5:10' }
  ];

  function nowTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m;
  }

  function renderChat() {
    $$('[data-chat-log]').forEach(function (log) {
      log.innerHTML = '';
      messages.forEach(function (m) {
        var wrap = document.createElement('div');
        wrap.className = 'chat-msg' + (m.me ? ' me' : '');
        var who = document.createElement('span');
        who.className = 'cm-who';
        who.appendChild(document.createTextNode(m.who));
        var time = document.createElement('time');
        time.textContent = m.time;
        who.appendChild(time);
        var p = document.createElement('p');
        p.textContent = m.text;
        wrap.appendChild(who);
        wrap.appendChild(p);
        log.appendChild(wrap);
      });
      log.scrollTop = log.scrollHeight;
    });
  }

  function clearUnread() {
    var side = $('#sideUnread');
    var count = $('#chatCount');
    if (side) side.hidden = true;
    if (count) count.hidden = true;
  }

  $$('[data-chat-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('input', form);
      var value = input ? input.value.trim() : '';
      if (!value) return;
      messages.push({ who: 'You', text: value, time: nowTime(), me: true });
      renderChat();
      $$('[data-chat-form] input').forEach(function (field) { field.value = ''; });
      clearUnread();
      var status = $('#chatStatus');
      if (status) status.textContent = 'Message sent to Ishaan.';
      input && input.focus();
    });
    $('input', form) && $('input', form).addEventListener('focus', clearUnread);
  });

  renderChat();

  /* ----------------------------------------------------------------- panels */
  var sheetLayer = $('#layer');
  var sheets = $$('.sheet');
  var lastTrigger = null;
  var activeSheet = null;

  function openSheet(id, trigger) {
    var sheet = document.getElementById(id);
    if (!sheet || !sheetLayer) return;
    if (sheetLayer.hidden) {
      lastTrigger = trigger || document.activeElement;
      sheetLayer.hidden = false;
    }
    sheets.forEach(function (s) { s.hidden = s !== sheet; });
    activeSheet = sheet;
    if (id === 'sheet-chat') clearUnread();
    var focusTarget = id === 'sheet-chat' ? $('input', sheet) : $('.sheet-x', sheet);
    setTimeout(function () {
      if (focusTarget && focusTarget.offsetParent !== null) focusTarget.focus();
    }, 30);
  }

  function closeSheet() {
    if (!sheetLayer || sheetLayer.hidden) return;
    sheetLayer.hidden = true;
    sheets.forEach(function (s) { s.hidden = true; });
    activeSheet = null;
    if (lastTrigger && lastTrigger.offsetParent !== null && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus();
    }
  }

  $$('[data-sheet]').forEach(function (button) {
    button.addEventListener('click', function () {
      openSheet(button.getAttribute('data-sheet'), button);
    });
  });

  if (sheetLayer) {
    sheetLayer.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-sheet]')) closeSheet();
    });

    sheetLayer.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== 'Tab' || !activeSheet) return;
      var focusables = $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', activeSheet)
        .filter(function (el) { return el.getClientRects().length > 0; });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  var peopleBtn = $('#peopleBtn');
  var openPeople = $('#openPeople');
  var handBtn = $('#handBtn');
  var chatBtn = $('#chatBtn');
  var endBtn = $('#endBtn');

  peopleBtn && peopleBtn.addEventListener('click', function () { openSheet('sheet-people', peopleBtn); });
  openPeople && openPeople.addEventListener('click', function () { openSheet('sheet-people', openPeople); });
  handBtn && handBtn.addEventListener('click', function () { openSheet('sheet-people', handBtn); });

  chatBtn && chatBtn.addEventListener('click', function () {
    openSheet('sheet-chat', chatBtn);
  });

  endBtn && endBtn.addEventListener('click', function () {
    openSheet('sheet-end', endBtn);
  });

  /* --------------------------------------------------------------- end class */
  var confirmEnd = $('#confirmEnd');
  var liveWord = $('#liveWord');
  var recapStatus = $('#recapStatus');
  var recapSaved = $('#recapSaved');

  function endClass() {
    if (ended) return;
    ended = true;
    document.body.classList.add('is-ended');
    if (liveWord) liveWord.textContent = 'Ended';
    if (endBtn) {
      endBtn.disabled = true;
      endBtn.textContent = 'Ended';
    }
    if (recapStatus) recapStatus.textContent = 'Session · saved';
    if (recapSaved) recapSaved.textContent = 'Saved just now';
    closeSheet();
    toast('Session ended · recap saved to Ishaan’s profile.');
    setTimeout(function () {
      openSheet('sheet-recap', endBtn);
    }, 160);
  }

  confirmEnd && confirmEnd.addEventListener('click', endClass);

  var sendRecap = $('#sendRecap');
  sendRecap && sendRecap.addEventListener('click', function () {
    sendRecap.disabled = true;
    sendRecap.textContent = 'Sent to parent';
    toast('Recap sent to Ishaan’s parent.');
  });

  /* -------------------------------------------------------------- media bar */
  var micBtn = $('#micBtn');
  var camBtn = $('#camBtn');
  var shareBtn = $('#shareBtn');
  var selfTile = $('#selfTile');

  function setIcon(button, id) {
    var use = button && button.querySelector('use');
    if (use) use.setAttribute('href', id);
  }

  var micOn = true;
  micBtn && micBtn.addEventListener('click', function () {
    micOn = !micOn;
    micBtn.classList.toggle('is-off', !micOn);
    micBtn.setAttribute('aria-pressed', String(!micOn));
    micBtn.setAttribute('aria-label', micOn ? 'Mute microphone' : 'Unmute microphone');
    micBtn.title = micOn ? 'Mute microphone' : 'Unmute microphone';
    setIcon(micBtn, micOn ? '#i-mic' : '#i-mic-off');
    var mic = selfTile && $('.t-mic', selfTile);
    if (mic) {
      mic.classList.toggle('is-muted', !micOn);
      setIcon(mic, micOn ? '#i-mic' : '#i-mic-off');
    }
    $$('.dock-trainer .dock-mic').forEach(function (dockMic) {
      dockMic.classList.toggle('is-muted', !micOn);
      setIcon(dockMic, micOn ? '#i-mic' : '#i-mic-off');
    });
    toast(micOn ? 'Microphone on.' : 'Microphone muted.');
  });

  var camOn = false;
  camBtn && camBtn.addEventListener('click', function () {
    camOn = !camOn;
    camBtn.classList.toggle('is-off', !camOn);
    camBtn.setAttribute('aria-pressed', String(!camOn));
    camBtn.setAttribute('aria-label', camOn ? 'Turn off camera' : 'Turn on camera');
    camBtn.title = camOn ? 'Turn off camera' : 'Turn on camera';
    setIcon(camBtn, camOn ? '#i-cam' : '#i-cam-off');
    selfTile && selfTile.classList.toggle('cam-on', camOn);
    $$('.dock-trainer').forEach(function (dockTile) {
      dockTile.classList.toggle('cam-on', camOn);
    });
    toast(camOn ? 'Camera on.' : 'Camera off.');
  });

  var sharing = false;
  shareBtn && shareBtn.addEventListener('click', function () {
    sharing = !sharing;
    shareBtn.classList.toggle('is-on', sharing);
    shareBtn.setAttribute('aria-pressed', String(sharing));
    shareBtn.setAttribute('aria-label', sharing ? 'Stop sharing board' : 'Share board');
    shareBtn.title = sharing ? 'Stop sharing board' : 'Share board';
    toast(sharing ? 'Board shared with Ishaan.' : 'Board share stopped.');
    $$('.call-pip').forEach(function (pip) { pip.classList.toggle('is-sharing', sharing); });
  });

  /* Quiz mode is handled in session.js so the board can be hidden cleanly. */

  /* ---------------------------------------------------------------- planner */
  var planSteps = $('#planSteps');
  var plannerMeta = $('#plannerMeta');
  var nowStep = $('#nowStep');

  function countDone() {
    return planSteps ? $$('#planSteps li.done').length : 0;
  }

  function updatePlannerMeta() {
    if (!plannerMeta) return;
    var current = planSteps && $('#planSteps li.current');
    if (current) plannerMeta.textContent = 'Step ' + (countDone() + 1) + ' of 5';
    else plannerMeta.textContent = 'Wrap-up';
  }

  function activateStep(li) {
    if (!li) return;
    li.classList.add('current');
    li.classList.remove('done');
    var state = $('.step-state', li);
    if (state) state.remove();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-btn';
    btn.setAttribute('data-done-step', '');
    btn.textContent = 'Mark done';
    li.appendChild(btn);
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-done-step]');
    if (!btn || !planSteps) return;
    var li = btn.closest('li');
    if (!li) return;
    li.classList.remove('current');
    li.classList.add('done');
    var mark = $('.step-mark', li);
    if (mark) mark.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>';
    btn.remove();
    var done = document.createElement('span');
    done.className = 'step-state';
    done.textContent = 'Done';
    li.appendChild(done);

    var next = li.nextElementSibling;
    if (next) {
      activateStep(next);
      if (nowStep) nowStep.textContent = next.getAttribute('data-step') || 'Next step';
      stepSeconds = (Number(next.getAttribute('data-min')) || 10) * 60;
      paintStepTime();
      toast('Step marked done · ' + (next.getAttribute('data-step') || 'next step') + ' is up.');
    } else {
      if (nowStep) nowStep.textContent = 'Lesson complete';
      if (stepTime) stepTime.textContent = '0:00 left';
      toast('All five steps are done. Nice pace.');
    }
    updatePlannerMeta();
  });

  updatePlannerMeta();

  /* -------------------------------------------------------------- whiteboard */
  var paper = $('#paper');
  var canvas = $('#ink');
  var ctx = canvas && canvas.getContext('2d');
  var pageEls = $$('.sheet-page');
  var pageNow = $('#pageNow');
  var pagePrev = $('#pagePrev');
  var pageNext = $('#pageNext');
  var saveChip = $('#saveChip');
  var saveText = saveChip && $('span', saveChip);
  var boardHint = $('#boardHint');
  var brush = $('#brush');

  var COLORS = { ink: '#0E1420', coral: '#FF5B2E', teal: '#12968C', amber: '#B4740B' };
  var WIDTHS = { pen: 2.6, marker: 17, eraser: 26 };
  var ALPHA = { pen: 1, marker: 0.26, eraser: 1 };

  var layers = {
    1: { strokes: [], undo: [], redo: [] },
    2: { strokes: [], undo: [], redo: [] },
    3: { strokes: [], undo: [], redo: [] }
  };
  var page = 1;
  var tool = 'pen';
  var color = 'ink';
  var drawing = false;
  var activePointer = null;
  var savedTimer = null;

  function layer() { return layers[page]; }

  function cloneStrokes(list) {
    return list.map(function (s) {
      return {
        tool: s.tool,
        color: s.color,
        points: s.points.map(function (p) { return [p[0], p[1]]; })
      };
    });
  }

  function touchBoard() {
    if (!saveChip) return;
    saveChip.classList.add('is-saving');
    if (saveText) saveText.textContent = 'Saving…';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      saveChip.classList.remove('is-saving');
      if (saveText) saveText.textContent = 'Saved';
    }, 620);
  }

  function styleStroke(s) {
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = ALPHA[s.tool] || 1;
    ctx.strokeStyle = COLORS[s.color] || COLORS.ink;
    ctx.fillStyle = COLORS[s.color] || COLORS.ink;
    ctx.lineWidth = WIDTHS[s.tool] || WIDTHS.pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawDot(s) {
    if (!ctx || !s.points.length) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var p = s.points[s.points.length - 1];
    ctx.save();
    styleStroke(s);
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, (WIDTHS[s.tool] || 2.6) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSegment(s, a, b) {
    if (!ctx) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.save();
    styleStroke(s);
    ctx.beginPath();
    ctx.moveTo(a[0] * w, a[1] * h);
    ctx.lineTo(b[0] * w, b[1] * h);
    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    layer().strokes.forEach(function (s) {
      if (s.points.length === 1) {
        drawDot(s);
        return;
      }
      ctx.save();
      styleStroke(s);
      ctx.beginPath();
      ctx.moveTo(s.points[0][0] * canvas.clientWidth, s.points[0][1] * canvas.clientHeight);
      for (var i = 1; i < s.points.length; i += 1) {
        ctx.lineTo(s.points[i][0] * canvas.clientWidth, s.points[i][1] * canvas.clientHeight);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  function fitCanvas() {
    if (!canvas || !paper || !ctx) return;
    var rect = paper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width;
    var y = (event.clientY - rect.top) / rect.height;
    return [
      Math.min(Math.max(x, 0), 1),
      Math.min(Math.max(y, 0), 1)
    ];
  }

  function setTool(next) {
    tool = next;
    $$('[data-tool]').forEach(function (btn) {
      var on = btn.getAttribute('data-tool') === next;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    paper && paper.classList.toggle('tool-eraser', next === 'eraser');
    paper && paper.classList.toggle('tool-marker', next === 'marker');
    if (brush) brush.style.opacity = '0';
  }

  function setColor(next) {
    color = next;
    $$('[data-color]').forEach(function (btn) {
      var on = btn.getAttribute('data-color') === next;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function setPage(next) {
    page = next;
    pageEls.forEach(function (el) {
      el.hidden = Number(el.getAttribute('data-page')) !== next;
    });
    if (pageNow) pageNow.textContent = String(next);
    if (pagePrev) pagePrev.disabled = next <= 1;
    if (pageNext) pageNext.disabled = next >= pageEls.length;
    redraw();
  }

  function undo() {
    var l = layer();
    if (!l.undo.length) {
      toast('Nothing to undo on this page.');
      return;
    }
    l.redo.push(cloneStrokes(l.strokes));
    l.strokes = l.undo.pop();
    redraw();
    touchBoard();
  }

  function redo() {
    var l = layer();
    if (!l.redo.length) {
      toast('Nothing to redo on this page.');
      return;
    }
    l.undo.push(cloneStrokes(l.strokes));
    l.strokes = l.redo.pop();
    redraw();
    touchBoard();
  }

  function clearPage() {
    var l = layer();
    if (!l.strokes.length) {
      toast('This page is already clear.');
      return;
    }
    l.undo.push(cloneStrokes(l.strokes));
    if (l.undo.length > 40) l.undo.shift();
    l.strokes = [];
    l.redo = [];
    redraw();
    touchBoard();
    toast('Page cleared · Undo to restore.');
  }

  $$('[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () { setTool(btn.getAttribute('data-tool')); });
  });

  $$('[data-color]').forEach(function (btn) {
    btn.addEventListener('click', function () { setColor(btn.getAttribute('data-color')); });
  });

  $$('[data-act]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var act = btn.getAttribute('data-act');
      if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'clear') clearPage();
    });
  });

  pagePrev && pagePrev.addEventListener('click', function () { if (page > 1) setPage(page - 1); });
  pageNext && pageNext.addEventListener('click', function () { if (page < pageEls.length) setPage(page + 1); });

  if (canvas && ctx && paper) {
    function interactiveTarget(target) {
      return target && target.closest && target.closest('button, a, input, select, textarea, [data-expand], .trainer-panel');
    }

    paper.addEventListener('pointerdown', function (event) {
      if (interactiveTarget(event.target)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (drawing) return;
      event.preventDefault();
      drawing = true;
      activePointer = event.pointerId;
      try { paper.setPointerCapture(event.pointerId); } catch (e) {}
      var l = layer();
      l.undo.push(cloneStrokes(l.strokes));
      if (l.undo.length > 40) l.undo.shift();
      l.redo = [];
      var stroke = { tool: tool, color: color, points: [pointFromEvent(event)] };
      l.strokes.push(stroke);
      drawDot(stroke);
      if (boardHint) boardHint.classList.add('is-gone');
      touchBoard();
    });

    paper.addEventListener('pointermove', function (event) {
      if (brush && (tool === 'eraser' || tool === 'marker')) {
        var rect = paper.getBoundingClientRect();
        brush.style.left = (event.clientX - rect.left) + 'px';
        brush.style.top = (event.clientY - rect.top) + 'px';
        brush.style.opacity = '1';
      }
      if (!drawing || event.pointerId !== activePointer) return;
      event.preventDefault();
      var l = layer();
      var stroke = l.strokes[l.strokes.length - 1];
      if (!stroke) return;
      var p = pointFromEvent(event);
      var last = stroke.points[stroke.points.length - 1];
      var rect = canvas.getBoundingClientRect();
      var dx = (p[0] - last[0]) * rect.width;
      var dy = (p[1] - last[1]) * rect.height;
      if (Math.sqrt(dx * dx + dy * dy) < 1.4) return;
      stroke.points.push(p);
      drawSegment(stroke, last, p);
    });

    function stopDraw(event) {
      if (event && activePointer !== null && event.pointerId !== activePointer) return;
      if (!drawing) return;
      drawing = false;
      activePointer = null;
      touchBoard();
    }

    paper.addEventListener('pointerup', stopDraw);
    paper.addEventListener('pointercancel', stopDraw);
    paper.addEventListener('pointerleave', function () {
      if (brush) brush.style.opacity = '0';
    });
    paper.addEventListener('pointerenter', function (event) {
      if (brush && (tool === 'eraser' || tool === 'marker')) {
        var rect = paper.getBoundingClientRect();
        brush.style.left = (event.clientX - rect.left) + 'px';
        brush.style.top = (event.clientY - rect.top) + 'px';
        brush.style.opacity = '1';
      }
    });
  }

  window.addEventListener('resize', fitCanvas);
  if (window.ResizeObserver && paper) {
    new ResizeObserver(function () { fitCanvas(); }).observe(paper);
  }

  /* ---------------------------------------------------------------- shortcuts */
  document.addEventListener('keydown', function (event) {
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;
    if (typing) return;
    if (sheetLayer && !sheetLayer.hidden) return;
    if (document.body.classList.contains('quiz-live')) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.key.toLowerCase() === 'p') setTool('pen');
    if (event.key.toLowerCase() === 'h') setTool('marker');
    if (event.key.toLowerCase() === 'e') setTool('eraser');
  });

  /* -------------------------------------------------------------------- init */
  setTool('pen');
  setColor('ink');
  setPage(1);

  var params = new URLSearchParams(window.location.search);
  var startPage = Number(params.get('page'));
  if (startPage >= 1 && startPage <= 3) setPage(startPage);
  var startSheet = params.get('sheet');
  if (startSheet) {
    setTimeout(function () { openSheet('sheet-' + startSheet, null); }, 80);
  }

  requestAnimationFrame(function () {
    fitCanvas();
    renderChat();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fitCanvas(); });
  }

  /* Shared hooks for the 1:1 session layer in session.js. */
  window.classroomSession = {
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    fitCanvas: fitCanvas,
    setPage: setPage,
    currentPage: function () { return page; }
  };

})();
