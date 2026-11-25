/* ==========================================================================
   MATHIFY — 1:1 session layer
   Hidden trainer notes, expandable sketch zones and quiz mode.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var api = window.classroomSession || {};
  var toast = api.toast || function () {};
  var closeSheet = api.closeSheet || function () {};

  var params = new URLSearchParams(window.location.search);
  var studentView = params.get('view') === 'student';

  if (studentView) {
    document.body.classList.add('view-student');
    /* Remove hidden instruction payloads from the student DOM entirely. */
    $$('[data-instruction]').forEach(function (el) { el.removeAttribute('data-instruction'); });
    $$('.trainer-only').forEach(function (el) { el.setAttribute('hidden', ''); });
  }

  /* ------------------------------------------------------ trainer notes */
  var trainerPanel = $('#trainerPanel');
  var trainerLayerBtn = $('#trainerLayerBtn');
  var trainerPanelClose = $('#trainerPanelClose');
  var trainerInstructions = $('#trainerInstructions');

  function titleFor(el) {
    if (el.classList.contains('p-head')) return 'Opening prompt';
    if (el.classList.contains('bar-fig')) return 'Bar model';
    if (el.classList.contains('ratio-wrap')) return 'Ratio table';
    if (el.classList.contains('dline-fig')) return 'Number line';
    if (el.classList.contains('workspace')) return 'Sketch zone';
    if (el.classList.contains('sketch-strip')) return 'Sketch prompt';
    return 'Trainer note';
  }

  function renderInstructions() {
    if (!trainerInstructions) return;
    var pageEl = $('.sheet-page:not([hidden])') || $('.sheet-page');
    var pageNo = pageEl ? pageEl.getAttribute('data-page') : '1';
    var items = pageEl ? $$('[data-instruction]', pageEl) : [];
    trainerInstructions.innerHTML = '';

    var label = document.createElement('span');
    label.className = 'mono';
    label.textContent = 'Page ' + pageNo + ' · never shown to the student';
    trainerInstructions.appendChild(label);

    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'ti-empty';
      empty.textContent = studentView
        ? 'Trainer notes are disabled in student view.'
        : 'No notes on this page. Add guidance in Curriculum.';
      trainerInstructions.appendChild(empty);
      return;
    }

    items.forEach(function (el) {
      var card = document.createElement('div');
      card.className = 'ti';
      var b = document.createElement('b');
      b.textContent = titleFor(el);
      var p = document.createElement('p');
      p.textContent = el.getAttribute('data-instruction');
      card.appendChild(b);
      card.appendChild(p);
      trainerInstructions.appendChild(card);
    });
  }

  function setNotes(open) {
    if (!trainerPanel || studentView) return;
    trainerPanel.hidden = !open;
    document.body.classList.toggle('notes-open', open);
    if (trainerLayerBtn) trainerLayerBtn.setAttribute('aria-pressed', String(open));
    if (open) renderInstructions();
  }

  trainerLayerBtn && trainerLayerBtn.addEventListener('click', function () {
    setNotes(trainerPanel && trainerPanel.hidden);
  });
  trainerPanelClose && trainerPanelClose.addEventListener('click', function () { setNotes(false); });

  ['#pagePrev', '#pageNext'].forEach(function (sel) {
    var btn = $(sel);
    btn && btn.addEventListener('click', function () {
      setTimeout(renderInstructions, 40);
    });
  });

  /* ------------------------------------------ expandable, resizable sketch */
  function setZoneExpanded(zone, expanded, announce) {
    var btn = $('[data-expand]', zone);
    if (!zone || !btn) return;

    if (!expanded) {
      zone.style.height = '';
      zone.style.minHeight = '';
    }

    btn.setAttribute('aria-expanded', String(expanded));
    zone.classList.toggle('is-expanded', expanded);

    var page = zone.closest('.sheet-page');
    if (page) page.classList.toggle('sketch-open', expanded);

    var label = $('span', btn);
    if (label) {
      label.textContent = expanded
        ? (zone.classList.contains('workspace') ? 'Collapse sketch' : 'Collapse')
        : (zone.classList.contains('workspace') ? 'Expand sketch' : 'Expand');
    }

    if (expanded) {
      var bounds = zoneBounds(zone);
      var handle = $('[data-zone-resize]', zone);
      if (handle) {
        handle.setAttribute('aria-valuemin', String(bounds.min));
        handle.setAttribute('aria-valuemax', String(bounds.max));
        handle.setAttribute('aria-valuenow', String(Math.round(zone.getBoundingClientRect().height)));
      }
    }

    window.dispatchEvent(new Event('resize'));
    if (api.fitCanvas) setTimeout(api.fitCanvas, 40);
    if (announce !== false) {
      toast(expanded
        ? 'Sketch space expanded · drag the corner arrows to stretch it.'
        : 'Sketch space collapsed.');
    }
  }

  function zoneBounds(zone) {
    var rect = zone.getBoundingClientRect();
    var isWorkspace = zone.classList.contains('workspace');
    var style = window.getComputedStyle(zone);
    var min = parseFloat(style.minHeight) || 0;
    min = Math.max(min, isWorkspace ? 180 : 90);

    var page = zone.closest('.sheet-page');
    var body = isWorkspace ? zone.closest('.p-body') : (page && page.querySelector('.p-body'));
    var max;

    if (body) {
      var bodyHeight = body.getBoundingClientRect().height;
      if (isWorkspace) {
        max = bodyHeight - 8;
      } else {
        var minBody = Math.max(120, Math.min(180, bodyHeight * 0.38));
        max = rect.height + Math.max(0, bodyHeight - minBody);
      }
    } else {
      max = rect.height + 180;
    }

    min = Math.round(min);
    max = Math.max(min + 24, Math.round(max));
    return { min: min, max: max };
  }

  function applyZoneHeight(zone, height, min, max) {
    var h = Math.round(clamp(height, min, max));
    zone.style.height = h + 'px';
    zone.style.minHeight = min + 'px';

    var handle = $('[data-zone-resize]', zone);
    if (handle) {
      handle.setAttribute('aria-valuemin', String(min));
      handle.setAttribute('aria-valuemax', String(max));
      handle.setAttribute('aria-valuenow', String(h));
    }
    return h;
  }

  $$('[data-expand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var zone = btn.closest('.sketch-strip, .workspace');
      if (!zone) return;
      setZoneExpanded(zone, btn.getAttribute('aria-expanded') !== 'true', true);
    });
  });

  $$('[data-zone-resize]').forEach(function (handle) {
    var zone = handle.closest('.sketch-strip, .workspace');
    if (!zone) return;

    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-orientation', 'vertical');

    var drag = null;

    handle.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      if (!zone.classList.contains('is-expanded')) setZoneExpanded(zone, true, false);
      var rect = zone.getBoundingClientRect();
      var bounds = zoneBounds(zone);

      drag = {
        id: event.pointerId,
        startY: event.clientY,
        startHeight: rect.height,
        min: bounds.min,
        max: bounds.max,
        changed: false
      };
      applyZoneHeight(zone, rect.height, bounds.min, bounds.max);
      handle.classList.add('is-resizing');
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
    });

    handle.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      event.stopPropagation();
      var next = drag.startHeight + (drag.startY - event.clientY);
      var h = applyZoneHeight(zone, next, drag.min, drag.max);
      if (Math.abs(h - drag.startHeight) > 2) drag.changed = true;
    });

    function stopZoneResize(event) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      var changed = drag.changed;
      drag = null;
      handle.classList.remove('is-resizing');
      if (event) { try { handle.releasePointerCapture(event.pointerId); } catch (e) {} }
      window.dispatchEvent(new Event('resize'));
      if (api.fitCanvas) setTimeout(api.fitCanvas, 40);
      if (changed) toast('Sketch space resized to ' + Math.round(zone.getBoundingClientRect().height) + 'px.');
    }
    handle.addEventListener('pointerup', stopZoneResize);
    handle.addEventListener('pointercancel', stopZoneResize);

    handle.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      event.stopPropagation();
      if (!zone.classList.contains('is-expanded')) setZoneExpanded(zone, true, false);
      var bounds = zoneBounds(zone);
      var delta = (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 64 : 24);
      var h = applyZoneHeight(zone, zone.getBoundingClientRect().height + delta, bounds.min, bounds.max);
      window.dispatchEvent(new Event('resize'));
      if (api.fitCanvas) setTimeout(api.fitCanvas, 40);
      toast('Sketch space ' + (delta > 0 ? 'enlarged' : 'reduced') + ' to ' + h + 'px.');
    });
  });

  /* ------------------------------------------------------------ quiz mode */
  var quizStage = $('#quizStage');
  var board = $('.board');
  var quizLaunch = $('#quizLaunch');
  var quizExit = $('#quizExit');
  var quizQuestion = $('#quizQuestion');
  var quizOptions = $('#quizOptions');
  var quizFeedback = $('#quizFeedback');
  var quizHint = $('#quizHint');
  var quizSkip = $('#quizSkip');
  var quizNext = $('#quizNext');
  var quizReveal = $('#quizReveal');
  var quizReteach = $('#quizReteach');
  var quizAnswerState = $('#quizAnswerState');
  var quizPhaseLabel = $('#quizPhaseLabel');
  var quizStageTimer = $('#quizStageTimer');
  var quizSelect = $('#quizSelect');
  var scratchWrap = $('#scratchWrap');
  var scratchCanvas = $('#scratchCanvas');
  var scratchShare = $('#scratchShare');
  var scratchClear = $('#scratchClear');
  var readinessText = $('#readinessText');
  var readinessBar = $('#readinessBar');
  var readinessNote = $('.readiness small');

  var questions = [
    {
      q: 'Which ratio is equivalent to 3 : 5?',
      options: ['6 : 10', '5 : 3', '9 : 12', '3 : 8'],
      answer: 0,
      hint: 'Multiply both parts by the same number.',
      why: 'Both parts were multiplied by 2.'
    },
    {
      q: 'In a 3 : 5 ribbon, the shorter piece is 12 cm. How long is the longer piece?',
      options: ['15 cm', '20 cm', '24 cm', '30 cm'],
      answer: 1,
      hint: 'One part is 12 ÷ 3 = 4 cm.',
      why: 'One part is 4 cm, so 5 parts are 20 cm.'
    },
    {
      q: 'Red : blue beads are 4 : 7. There are 44 beads in all. How many are blue?',
      options: ['16', '24', '28', '32'],
      answer: 2,
      hint: 'There are 11 parts in the whole.',
      why: 'One part is 4 beads, so blue is 7 × 4 = 28.'
    }
  ];

  var baseQuestions = questions.map(function (question) {
    return Object.assign({}, question, { options: question.options.slice() });
  });

  var recheckBank = [
    {
      q: 'Which ratio is equivalent to 4 : 7?',
      options: ['8 : 14', '7 : 4', '12 : 14', '4 : 10'],
      answer: 0,
      hint: 'Multiply both parts by the same number.',
      why: 'Both parts were multiplied by 2.',
      recheck: true
    },
    {
      q: 'A 3 : 4 mix uses 9 red beads. How many blue beads are needed?',
      options: ['4', '12', '16', '21'],
      answer: 1,
      hint: 'One part is 9 ÷ 3 = 3 beads.',
      why: 'One part is 3 beads, so 4 parts are 12 beads.',
      recheck: true
    }
  ];

  var phaseLabels = {
    answering: 'Assessment · answering',
    awaiting_reveal: 'Assessment · awaiting reveal',
    revealed: 'Assessment · revealed',
    reteach: 'Assessment · reteach',
    recheck: 'Assessment · recheck',
    complete: 'Assessment · complete'
  };

  var quizState = {
    index: 0,
    seen: 0,
    correct: 0,
    answered: false,
    chosen: null,
    phase: 'answering',
    revealed: false,
    reteachArmed: false,
    recheckCount: 0,
    seconds: 120,
    timer: null
  };

  function paintQuizClock() {
    if (!quizStageTimer) return;
    var m = Math.floor(Math.max(0, quizState.seconds) / 60);
    var s = Math.max(0, quizState.seconds) % 60;
    quizStageTimer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  }

  function isAnswerable() {
    return quizState.phase === 'answering' || quizState.phase === 'recheck';
  }

  function setFeedback(text, className) {
    if (!quizFeedback) return;
    quizFeedback.textContent = text;
    quizFeedback.className = 'quiz-feedback' + (className ? ' ' + className : '');
  }

  function setAnswerState(text) {
    if (!quizAnswerState) return;
    if (studentView && text.indexOf('key ') !== -1) {
      quizAnswerState.textContent = 'Trainer feedback is pending.';
      return;
    }
    quizAnswerState.textContent = text;
  }

  function setQuizPhase(phase) {
    quizState.phase = phase;
    document.body.classList.toggle('quiz-reteach', phase === 'reteach');
    if (quizPhaseLabel) quizPhaseLabel.textContent = phaseLabels[phase] || 'Assessment · quiz live';

    var locked = !isAnswerable() || quizState.answered;
    if (quizHint) quizHint.disabled = locked;
    if (quizSkip) quizSkip.disabled = locked;
    if (quizReveal) quizReveal.disabled = studentView || phase === 'complete';
    if (quizReteach) quizReteach.disabled = studentView || phase === 'complete';
    if (quizNext) quizNext.disabled = studentView || phase === 'complete';
  }

  function lockOptions(reveal) {
    var item = questions[quizState.index];
    $$('button', quizOptions).forEach(function (option, i) {
      option.disabled = true;
      if (!reveal || !item) return;
      if (i === item.answer) option.classList.add('is-correct');
      else if (i === quizState.chosen) option.classList.add('is-wrong');
    });
  }

  function startQuizClock() {
    clearInterval(quizState.timer);
    quizState.seconds = 120;
    paintQuizClock();
    quizState.timer = setInterval(function () {
      if (quizState.seconds <= 0) {
        clearInterval(quizState.timer);
        quizState.timer = null;
        setFeedback('Time is up. Your trainer has the responses.', 'is-waiting');
        if (isAnswerable()) setQuizPhase('awaiting_reveal');
        return;
      }
      quizState.seconds -= 1;
      paintQuizClock();
    }, 1000);
  }

  function updateReadiness() {
    var pct = quizState.seen ? Math.round((quizState.correct / quizState.seen) * 100) : 0;
    if (readinessText) readinessText.textContent = pct + '%';
    if (readinessBar) readinessBar.style.width = pct + '%';
    if (readinessNote) {
      if (!quizState.seen) readinessNote.textContent = 'Answer a question to see readiness.';
      else readinessNote.textContent = 'Readiness logged · unlock threshold is configurable.';
    }
  }

  function renderQuiz() {
    var item = questions[quizState.index];
    if (!item) return;
    quizState.answered = false;
    quizState.chosen = null;
    quizState.revealed = false;

    if (quizQuestion) quizQuestion.textContent = item.q;
    setFeedback(item.recheck ? 'Recheck · choose one answer.' : 'Choose one answer.', '');
    setAnswerState('Waiting for Ishaan’s answer.');
    if (quizReteach) {
      quizReteach.textContent = 'Reteach + new check';
      quizReteach.classList.remove('is-armed');
      quizReteach.disabled = studentView;
    }
    if (quizNext) {
      quizNext.textContent = 'Next question';
      quizNext.disabled = studentView;
    }

    if (quizOptions) {
      quizOptions.innerHTML = '';
      item.options.forEach(function (option, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-opt', String(i));
        if (!studentView) btn.setAttribute('data-correct', i === item.answer ? '1' : '0');

        var letter = document.createElement('span');
        letter.className = 'opt-letter';
        letter.textContent = 'ABCD'.charAt(i);
        var text = document.createElement('span');
        text.textContent = option;

        btn.appendChild(letter);
        btn.appendChild(text);
        btn.addEventListener('click', function () { answerQuiz(btn, item); });
        quizOptions.appendChild(btn);
      });
    }

    setQuizPhase(item.recheck ? 'recheck' : 'answering');
    updateReadiness();
  }

  function answerQuiz(btn, item) {
    if (!btn || !isAnswerable() || quizState.answered) return;
    quizState.answered = true;
    quizState.seen += 1;

    var chosen = Number(btn.getAttribute('data-opt'));
    quizState.chosen = chosen;
    if (chosen === item.answer) quizState.correct += 1;

    $$('button', quizOptions).forEach(function (option, i) {
      option.disabled = true;
      if (i === chosen) option.classList.add('is-picked');
    });

    setFeedback('Answer saved. Your trainer will reveal feedback.', 'is-waiting');
    setAnswerState('Ishaan chose ' + 'ABCD'.charAt(chosen) + ' · key ' + 'ABCD'.charAt(item.answer) + '.');
    setQuizPhase('awaiting_reveal');
    updateReadiness();
  }

  function revealQuizAnswer() {
    if (studentView || quizState.phase === 'reteach' || quizState.phase === 'complete') return;
    var item = questions[quizState.index];
    if (!item) return;

    quizState.revealed = true;
    lockOptions(true);
    var right = quizState.chosen === item.answer;
    if (quizState.chosen === null) {
      setFeedback('The key is ' + 'ABCD'.charAt(item.answer) + '. ' + item.why, '');
      setAnswerState('Revealed · skipped.');
    } else {
      setFeedback((right ? 'Correct. ' : 'Not quite. ') + item.why, right ? 'is-correct' : 'is-wrong');
      setAnswerState('Revealed · Ishaan chose ' + 'ABCD'.charAt(quizState.chosen) + '.');
    }
    setQuizPhase('revealed');
    toast('Answer revealed for Ishaan.');
  }

  function skipQuiz() {
    if (!isAnswerable() || quizState.answered) return;
    var item = questions[quizState.index];
    quizState.answered = true;
    quizState.chosen = null;
    quizState.seen += 1;
    lockOptions(false);
    setFeedback('Skipped. Your trainer controls feedback.', 'is-waiting');
    setAnswerState('Skipped · key ' + 'ABCD'.charAt(item.answer) + '.');
    setQuizPhase('awaiting_reveal');
    updateReadiness();
  }

  function reteachQuiz() {
    if (studentView || quizState.phase === 'complete') return;
    if (quizState.reteachArmed) {
      addRecheckQuestion();
      return;
    }

    quizState.reteachArmed = true;
    lockOptions(false);
    setQuizPhase('reteach');
    setFeedback('Your trainer is going over this once more.', 'is-waiting');
    setAnswerState('Quiz frozen for reteach.');
    if (quizReteach) {
      quizReteach.textContent = 'Add recheck question';
      quizReteach.classList.add('is-armed');
    }
    toast('Quiz frozen for reteach. Add a fresh check when ready.');
  }

  function addRecheckQuestion() {
    var bankItem = recheckBank[quizState.recheckCount % recheckBank.length];
    quizState.recheckCount += 1;
    var next = Object.assign({}, bankItem, { options: bankItem.options.slice(), recheck: true });
    questions.push(next);
    quizState.index = questions.length - 1;
    quizState.reteachArmed = false;
    startQuizClock();
    renderQuiz();
    toast('Fresh recheck question added from the same objective.');
  }

  function completeQuiz() {
    clearInterval(quizState.timer);
    quizState.timer = null;
    setQuizPhase('complete');
    setFeedback('Quiz complete. Your trainer will share the recap.', '');
    var pct = quizState.seen ? Math.round((quizState.correct / quizState.seen) * 100) : 0;
    setAnswerState('Complete · readiness ' + pct + '%.');
    toast('Quiz complete · responses saved.');
  }

  function launchQuiz() {
    if (!quizStage || document.body.classList.contains('quiz-live')) return;
    setNotes(false);
    closeSheet();
    document.body.classList.add('quiz-live');
    if (board) board.hidden = true;
    quizStage.hidden = false;

    questions = baseQuestions.map(function (question) {
      return Object.assign({}, question, { options: question.options.slice() });
    });
    quizState.index = 0;
    quizState.seen = 0;
    quizState.correct = 0;
    quizState.answered = false;
    quizState.chosen = null;
    quizState.revealed = false;
    quizState.reteachArmed = false;
    quizState.recheckCount = 0;
    renderQuiz();
    startQuizClock();
    toast('Quiz launched · whiteboard hidden for Ishaan.');
    var first = $('button', quizOptions);
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function exitQuiz() {
    if (!quizStage || !document.body.classList.contains('quiz-live')) return;
    clearInterval(quizState.timer);
    quizState.timer = null;
    document.body.classList.remove('quiz-live');
    document.body.classList.remove('quiz-reteach');
    quizStage.hidden = true;
    if (board) board.hidden = false;
    toast('Back to the board · quiz responses saved.');
  }

  quizLaunch && quizLaunch.addEventListener('click', launchQuiz);
  quizExit && quizExit.addEventListener('click', exitQuiz);
  quizReveal && quizReveal.addEventListener('click', revealQuizAnswer);
  quizReteach && quizReteach.addEventListener('click', reteachQuiz);

  quizHint && quizHint.addEventListener('click', function () {
    if (!isAnswerable() || quizState.answered) return;
    setFeedback('Hint: ' + questions[quizState.index].hint, '');
  });

  quizSkip && quizSkip.addEventListener('click', skipQuiz);

  quizNext && quizNext.addEventListener('click', function () {
    if (studentView || quizState.phase === 'complete') return;
    if (quizState.index >= questions.length - 1) {
      completeQuiz();
      return;
    }
    quizState.index += 1;
    renderQuiz();
    startQuizClock();
    toast('Next question ready.');
  });

  /* -------------------------------------------------- trainer scratchpad */
  var scratchCtx = scratchCanvas && scratchCanvas.getContext('2d');
  var scratchDrawing = false;
  var scratchPointer = null;

  function fitScratch() {
    if (!scratchCanvas || !scratchCtx) return;
    var rect = scratchCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    scratchCanvas.width = Math.round(rect.width * dpr);
    scratchCanvas.height = Math.round(rect.height * dpr);
    scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scratchCtx.clearRect(0, 0, rect.width, rect.height);
  }

  function scratchPoint(event) {
    var rect = scratchCanvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    };
  }

  if (scratchCanvas && scratchCtx) {
    scratchCanvas.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      scratchDrawing = true;
      scratchPointer = event.pointerId;
      try { scratchCanvas.setPointerCapture(event.pointerId); } catch (e) {}
      var p = scratchPoint(event);
      scratchCtx.save();
      scratchCtx.fillStyle = '#FF5B2E';
      scratchCtx.beginPath();
      scratchCtx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      scratchCtx.fill();
      scratchCtx.restore();
    });

    scratchCanvas.addEventListener('pointermove', function (event) {
      if (!scratchDrawing || event.pointerId !== scratchPointer) return;
      event.preventDefault();
      var p = scratchPoint(event);
      scratchCtx.save();
      scratchCtx.strokeStyle = '#FF5B2E';
      scratchCtx.lineWidth = 2.6;
      scratchCtx.lineCap = 'round';
      scratchCtx.lineJoin = 'round';
      scratchCtx.beginPath();
      scratchCtx.moveTo(p.x - 1, p.y - 1);
      scratchCtx.lineTo(p.x, p.y);
      scratchCtx.stroke();
      scratchCtx.restore();
    });

    function stopScratch(event) {
      if (event && scratchPointer !== null && event.pointerId !== scratchPointer) return;
      scratchDrawing = false;
      scratchPointer = null;
    }
    scratchCanvas.addEventListener('pointerup', stopScratch);
    scratchCanvas.addEventListener('pointercancel', stopScratch);
  }

  quizSelect && quizSelect.addEventListener('change', function () {
    var draw = quizSelect.value === 'draw';
    if (scratchWrap) scratchWrap.hidden = !draw;
    if (draw) {
      requestAnimationFrame(fitScratch);
      toast('Wacom scratchpad open · only you can see it.');
    } else {
      toast('Doubt support off.');
    }
  });

  scratchShare && scratchShare.addEventListener('click', function () {
    toast('Scratchpad sketch shared with Ishaan.');
  });
  scratchClear && scratchClear.addEventListener('click', function () {
    if (scratchCtx && scratchCanvas) scratchCtx.clearRect(0, 0, scratchCanvas.clientWidth, scratchCanvas.clientHeight);
    toast('Scratchpad cleared.');
  });
  window.addEventListener('resize', function () {
    if (scratchWrap && !scratchWrap.hidden) fitScratch();
  });

  /* ------------------------------------------------ floating camera window */
  var pip = $('#callPip');
  var pipHead = $('#pipHead');
  var pipResize = $('#pipResize');
  var pipCollapse = $('#pipCollapse');
  var pipDrag = null;
  var pipResizeState = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function clampPip() {
    if (!pip) return;
    var host = pip.parentElement;
    var rect = host.getBoundingClientRect();
    var left = parseFloat(pip.style.left);
    var top = parseFloat(pip.style.top);

    if (isNaN(left) || isNaN(top)) {
      pip.style.right = 'auto';
      pip.style.bottom = 'auto';
      left = rect.width - pip.offsetWidth - 24;
      top = 64;
    }

    pip.style.left = clamp(left, 8, rect.width - pip.offsetWidth - 8) + 'px';
    pip.style.top = clamp(top, 8, rect.height - pip.offsetHeight - 8) + 'px';
    pip.classList.toggle('is-compact', pip.offsetWidth < 210);
  }

  if (pipHead && pip) {
    pipHead.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      event.preventDefault();
      var rect = pip.getBoundingClientRect();
      pipDrag = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top
      };
      pip.classList.add('is-dragging');
      try { pipHead.setPointerCapture(event.pointerId); } catch (e) {}
    });

    pipHead.addEventListener('pointermove', function (event) {
      if (!pipDrag || event.pointerId !== pipDrag.id) return;
      var host = pip.parentElement.getBoundingClientRect();
      var left = event.clientX - host.left - pipDrag.dx;
      var top = event.clientY - host.top - pipDrag.dy;
      pip.style.left = clamp(left, 8, host.width - pip.offsetWidth - 8) + 'px';
      pip.style.top = clamp(top, 8, host.height - pip.offsetHeight - 8) + 'px';
    });

    function stopPipDrag(event) {
      if (!pipDrag || (event && event.pointerId !== pipDrag.id)) return;
      pipDrag = null;
      pip.classList.remove('is-dragging');
      if (event) { try { pipHead.releasePointerCapture(event.pointerId); } catch (e) {} }
    }
    pipHead.addEventListener('pointerup', stopPipDrag);
    pipHead.addEventListener('pointercancel', stopPipDrag);
  }

  if (pipResize && pip) {
    pipResize.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var rect = pip.getBoundingClientRect();
      pipResizeState = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        w: rect.width,
        h: rect.height
      };
      pip.classList.add('is-resizing');
      try { pipResize.setPointerCapture(event.pointerId); } catch (e) {}
    });

    pipResize.addEventListener('pointermove', function (event) {
      if (!pipResizeState || event.pointerId !== pipResizeState.id) return;
      var host = pip.parentElement.getBoundingClientRect();
      var maxW = Math.min(440, host.width - pip.offsetLeft - 8);
      var maxH = Math.min(340, host.height - pip.offsetTop - 8);
      var w = clamp(pipResizeState.w + (event.clientX - pipResizeState.x), 164, maxW);
      var h = clamp(pipResizeState.h + (event.clientY - pipResizeState.y), 120, maxH);
      pip.style.width = Math.round(w) + 'px';
      pip.style.height = Math.round(h) + 'px';
      pip.classList.toggle('is-compact', w < 210);
    });

    function stopPipResize(event) {
      if (!pipResizeState || (event && event.pointerId !== pipResizeState.id)) return;
      pipResizeState = null;
      pip.classList.remove('is-resizing');
      clampPip();
      if (event) { try { pipResize.releasePointerCapture(event.pointerId); } catch (e) {} }
    }
    pipResize.addEventListener('pointerup', stopPipResize);
    pipResize.addEventListener('pointercancel', stopPipResize);
  }

  pipCollapse && pipCollapse.addEventListener('click', function () {
    if (!pip) return;
    var collapsed = pip.classList.toggle('is-collapsed');
    pipCollapse.setAttribute('aria-expanded', String(!collapsed));
    pipCollapse.setAttribute('aria-label', collapsed ? 'Expand video window' : 'Collapse video window');
    pipCollapse.textContent = collapsed ? '+' : '−';
    requestAnimationFrame(clampPip);
    toast(collapsed ? 'Video window collapsed.' : 'Video window expanded.');
  });

  window.addEventListener('resize', clampPip);
  requestAnimationFrame(clampPip);

  /* ------------------------------------------------------------------ init */
  renderInstructions();
  updateReadiness();
  paintQuizClock();

  if (params.get('notes') === '1') setNotes(true);

  var quizQA = params.get('quiz');
  if (quizQA === '1') {
    setTimeout(launchQuiz, 120);
  } else if (quizQA) {
    setTimeout(function () {
      launchQuiz();
      var first = $('button[data-opt="0"]', quizOptions) || $('button', quizOptions);

      if (quizQA !== 'reteach' && quizQA !== 'recheck' && first) {
        answerQuiz(first, questions[quizState.index]);
      }
      if (!studentView && (quizQA === 'reveal' || quizQA === 'complete')) revealQuizAnswer();
      if (!studentView && quizQA === 'reteach') reteachQuiz();
      if (!studentView && quizQA === 'recheck') {
        reteachQuiz();
        addRecheckQuestion();
      }
      if (quizQA === 'complete') completeQuiz();
    }, 140);
  }
  if (params.get('state') === 'ended') {
    document.body.classList.add('is-ended');
    var liveWord = $('#liveWord');
    var endBtn = $('#endBtn');
    if (liveWord) liveWord.textContent = 'Ended';
    if (endBtn) { endBtn.disabled = true; endBtn.textContent = 'Ended'; }
  }

  /* Expose quiz controls for QA and future real-time wiring. */
  api.openQuiz = launchQuiz;
  api.closeQuiz = exitQuiz;
  api.renderInstructions = renderInstructions;
  api.answerQuiz = function (index) {
    var buttons = $$('button', quizOptions);
    var button = buttons[Number(index || 0)];
    if (button) answerQuiz(button, questions[quizState.index]);
  };
  api.revealQuizAnswer = revealQuizAnswer;
  api.reteachQuiz = reteachQuiz;
  api.addRecheckQuestion = addRecheckQuestion;
  api.completeQuiz = completeQuiz;
  api.quizState = quizState;
})();
