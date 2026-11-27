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

  /* Participant names come from the session state DTO (name-only by design).
     Never fall back to a hardcoded student identity. */
  function studentLabel() {
    return typeof api.studentName === 'function' ? api.studentName() : 'Student';
  }

  var params = new URLSearchParams(window.location.search);
  var user = Object.assign({}, window.MATHIFY_USER || window.currentUser || api.user || {});
  var roleParam = params.get('role');
  if (roleParam) user.role = roleParam;
  else if (!user.role && window.mathifyClassroomApi && window.mathifyClassroomApi.role) {
    /* api.js defaults to the trainer desk unless the URL asks for student view. */
    user.role = window.mathifyClassroomApi.role;
  }

  var studentView = params.get('view') === 'student' || user.role === 'student';
  var isTrainer = (user.role === 'trainer' || user.role === 'founder') && !studentView;

  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') || params.get('sessionId') || null;
  var accessToken = window.MATHIFY_SUPABASE_ACCESS_TOKEN || null;
  var realtimeLink = null;
  var strokeId = null;
  var strokeSeq = 0;

  function authToken() {
    return window.MATHIFY_ACCESS_TOKEN || accessToken || null;
  }

  function classroomApi() {
    return api.api || window.mathifyClassroomApi || null;
  }

  /* Quiz and whiteboard transitions never switch local media off; they simply
     reaffirm the state the participant already chose. This covers mobile tab
     suspension and browser quirks without overriding an intentional mute. */
  function reaffirmCallMedia() {
    var call = api.agora || window.mathifyClassroomAgora;
    if (call && typeof call.reaffirmMedia === 'function') call.reaffirmMedia();
  }

  /* classroom/api.js owns token acquisition. When it is present, every session
     call goes through ensureAuth() so a page without an injected token still
     authenticates with the role-correct demo account. */
  function hasApiAccess() {
    var client = classroomApi();
    return Boolean((client && typeof client.request === 'function') || authToken());
  }

  function apiRequest(path, options) {
    var client = classroomApi();
    if (client && typeof client.request === 'function') {
      return client.request(path.charAt(0) === '/' ? path : '/' + path, options);
    }

    /* Raw fallback for pages that deliberately omit the API client. */
    var settings = options || {};
    var headers = { Accept: 'application/json' };
    var token = authToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch('/api' + path, {
      method: settings.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      return response.text().then(function (textValue) {
        var data = null;
        try { data = textValue ? JSON.parse(textValue) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var problem = new Error((data && data.message) || 'Request failed.');
          problem.status = response.status;
          problem.code = data && data.error;
          throw problem;
        }
        return data;
      });
    });
  }

  function hideTrainerUi() {
    document.body.classList.add('view-student');
    /* Remove hidden instruction payloads and trainer controls from the DOM entirely. */
    $$('[data-instruction]').forEach(function (el) { el.removeAttribute('data-instruction'); });
    $$('.trainer-only').forEach(function (el) { el.remove(); });
  }

  if (studentView || !isTrainer) hideTrainerUi();

  /* The server state DTO is authoritative about who is viewing. An explicit
     ?role= QA override wins, but a normal page load adopts the JWT role so a
     student can never inherit trainer controls just because the HTML is shared. */
  function applyViewerRole(nextRole) {
    var next = String(nextRole || '').toLowerCase();
    if (next !== 'student' && next !== 'trainer' && next !== 'founder') return false;
    var changed = user.role !== next;
    user.role = next;
    studentView = params.get('view') === 'student' || next === 'student';
    isTrainer = (next === 'trainer' || next === 'founder') && !studentView;
    if (studentView || !isTrainer) hideTrainerUi();
    return changed;
  }

  function syncViewerRoleFromState() {
    if (!sessionId || roleParam) return Promise.resolve(false);
    var client = classroomApi();
    if (!client || typeof client.getSessionState !== 'function') return Promise.resolve(false);
    return client.getSessionState(sessionId).then(function (state) {
      if (!state || !state.viewerRole) return false;
      return applyViewerRole(state.viewerRole);
    }).catch(function () { return false; });
  }

  /* ------------------------------------------ trainer-only notes sidebar */
  var trainerPanel = $('#trainerPanel');
  var trainerLayerBtn = $('#trainerLayerBtn');
  var trainerPanelClose = $('#trainerPanelClose');
  var trainerInstructions = $('#trainerInstructions');
  var trainerSession = null;
  var notesLoaded = false;

  function currentPageNumber() {
    var page = api.currentPage && api.currentPage();
    if (Number.isFinite(Number(page)) && Number(page) > 0) return Number(page);
    var visible = $('.sheet-page:not([hidden])') || $('.sheet-page');
    return visible ? Number(visible.getAttribute('data-page') || 1) : 1;
  }

  function noteText(note) {
    if (!note || typeof note !== 'object') return '';
    if (typeof note.body === 'string') return note.body;
    if (typeof note.text === 'string') return note.text;
    if (typeof note.instruction === 'string') return note.instruction;
    return '';
  }

  function noteTitle(note, index) {
    if (note && typeof note.title === 'string' && note.title.trim()) return note.title;
    return 'Trainer note ' + (index + 1);
  }

  function renderInstructions() {
    if (!isTrainer || !trainerInstructions) return;

    var pageNo = currentPageNumber();
    var pages = trainerSession && Array.isArray(trainerSession.pages) ? trainerSession.pages : [];
    var page = null;

    for (var i = 0; i < pages.length; i += 1) {
      if (Number(pages[i].page) === pageNo) { page = pages[i]; break; }
    }
    if (!page && pages[pageNo - 1]) page = pages[pageNo - 1];

    var notes = page && Array.isArray(page.trainer_instructions) ? page.trainer_instructions : [];
    trainerInstructions.textContent = '';

    var label = document.createElement('span');
    label.className = 'mono';
    label.textContent = 'Page ' + pageNo + ' · trainer only · never shown to the student';
    trainerInstructions.appendChild(label);

    if (!notesLoaded) {
      var loading = document.createElement('div');
      loading.className = 'ti-empty';
      loading.textContent = 'Loading Trainer Notes from the planner API…';
      trainerInstructions.appendChild(loading);
      return;
    }

    if (!notes.length) {
      var empty = document.createElement('div');
      empty.className = 'ti-empty';
      empty.textContent = 'No trainer instructions on this page.';
      trainerInstructions.appendChild(empty);
      return;
    }

    notes.forEach(function (note, index) {
      var body = noteText(note);
      if (!body) return;
      var card = document.createElement('div');
      card.className = 'ti';
      var title = document.createElement('b');
      title.textContent = noteTitle(note, index);
      var copy = document.createElement('p');
      copy.textContent = body;
      card.appendChild(title);
      card.appendChild(copy);
      trainerInstructions.appendChild(card);
    });
  }

  function setNotes(open) {
    if (!trainerPanel || !isTrainer) return;
    trainerPanel.hidden = !open;
    document.body.classList.toggle('notes-open', open);
    if (trainerLayerBtn) {
      trainerLayerBtn.setAttribute('aria-pressed', String(open));
      trainerLayerBtn.setAttribute('aria-expanded', String(open));
    }
    if (open) renderInstructions();
  }

  function loadTrainerSession() {
    if (!isTrainer) return Promise.resolve(false);

    var injected = window.MATHIFY_SESSION_DATA || window.MATHIFY_SESSION || null;
    if (injected && injected.pages) {
      trainerSession = injected.session || injected;
      notesLoaded = true;
      renderInstructions();
      return Promise.resolve(true);
    }

    if (!sessionId) {
      notesLoaded = true;
      renderInstructions();
      return Promise.resolve(false);
    }

    return apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId))
      .then(function (data) {
        trainerSession = data.session || data;
        notesLoaded = true;
        renderInstructions();
        return true;
      }).catch(function (error) {
        notesLoaded = true;
        renderInstructions();
        console.warn('[mathify] Trainer Notes unavailable:', error.message);
        return false;
      });
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
  var quizPracticeBadge = $('#quizPracticeBadge');
  var quizForceNext = $('#quizForceNext');
  var quizReveal = $('#quizReveal');
  var quizReteach = $('#quizReteach');
  var quizAnswerState = $('#quizAnswerState');
  var quizPhaseLabel = $('#quizPhaseLabel');
  var quizStageTimer = $('#quizStageTimer');
  var quizDoubtBtn = $('#quizDoubtBtn');
  var doubtMenu = $('#doubtMenu');
  var quizActionHint = $('#quizActionHint');
  var quizActionSkip = $('#quizActionSkip');
  var quizActionExplain = $('#quizActionExplain');
  var studentInkMode = $('#studentInkMode');
  var scratchOverlay = $('#scratchOverlay');
  var scratchClose = $('#scratchClose');
  var scratchCanvas = $('#scratchCanvas');
  var scratchShare = $('#scratchShare');
  var scratchClear = $('#scratchClear');
  var studentInk = $('#studentInk');
  var studentInkCanvas = $('#studentInkCanvas');
  var readinessText = $('#readinessText');
  var readinessBar = $('#readinessBar');
  var readinessNote = $('.readiness small');

  /* Static classroom assets contain academic prompts only. Answer keys,
     explanations and trainer hints are loaded at runtime from the role-scoped
     session API; a student bundle never ships them. */
  var localQuestions = [
    {
      q: 'Which ratio is equivalent to 3 : 5?',
      options: ['6 : 10', '5 : 3', '9 : 12', '3 : 8']
    },
    {
      q: 'In a 3 : 5 ribbon, the shorter piece is 12 cm. How long is the longer piece?',
      options: ['15 cm', '20 cm', '24 cm', '30 cm']
    },
    {
      q: 'Red : blue beads are 4 : 7. There are 44 beads in all. How many are blue?',
      options: ['16', '24', '28', '32']
    }
  ];

  var questions = localQuestions.map(function (question, index) {
    return Object.assign({}, question, {
      id: 'q_base_' + (index + 1),
      options: question.options.slice(),
      localPreview: true
    });
  });

  var baseQuestions = questions.map(function (question) {
    return Object.assign({}, question, { options: question.options.slice() });
  });

  var recheckBank = [
    {
      q: 'Which ratio is equivalent to 4 : 7?',
      options: ['8 : 14', '7 : 4', '12 : 14', '4 : 10'],
      recheck: true,
      requiresCorrectAnswer: true
    },
    {
      q: 'A 3 : 4 mix uses 9 red beads. How many blue beads are needed?',
      options: ['4', '12', '16', '21'],
      recheck: true,
      requiresCorrectAnswer: true
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
    timer: null,
    attemptId: null,
    revealRecorded: false,
    parallelSolved: false,
    pollTimer: null
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

  function currentQuizItem() {
    return questions[quizState.index] || null;
  }

  function mapQuizQuestion(source, index) {
    var options = Array.isArray(source.options) ? source.options.map(function (option) {
      return typeof option === 'string' ? option : option && option.text ? option.text : '';
    }) : [];
    var mapped = {
      id: source.id || 'q_runtime_' + index,
      q: source.prompt || source.stem || source.q || '',
      options: options,
      requiresCorrectAnswer: source.requiresCorrectAnswer === true,
      recheck: source.recheck === true
    };
    /* Only an authenticated trainer view receives answer material. */
    if (isTrainer && Number.isInteger(source.answerIndex)) mapped.answer = source.answerIndex;
    if (isTrainer && typeof source.explanation === 'string' && source.explanation) {
      mapped.why = source.explanation;
    }
    /* On the student path this field exists only after a trainer grants it. */
    if (typeof source.hint === 'string' && source.hint) mapped.hint = source.hint;
    return mapped;
  }

  function loadQuizQuestions() {
    if (!sessionId) return Promise.resolve(false);
    var client = classroomApi();
    if (!client || typeof client.request !== 'function') return Promise.resolve(false);

    var path = (isTrainer ? '/trainer' : '/student') +
      '/sessions/' + encodeURIComponent(sessionId);
    return client.request(path).then(function (data) {
      var session = data && (data.session || data);
      var source = session && session.quiz && session.quiz.questions;
      if (!Array.isArray(source) || !source.length) return false;
      questions = source.map(mapQuizQuestion);
      baseQuestions = questions.map(function (question) {
        return Object.assign({}, question, { options: question.options.slice() });
      });
      return true;
    }).catch(function (error) {
      console.warn('[mathify] Quiz questions unavailable · local preview only:', error.message);
      return false;
    });
  }

  function isRequiredQuestion(item) {
    return Boolean(item && item.requiresCorrectAnswer === true);
  }

  /* Progression stays locked until the server confirms a correct attempt for
     that specific question. The trainer override is the only other exit. */
  function syncPracticeControls(item) {
    var required = isRequiredQuestion(item || currentQuizItem());
    var blocked = required && quizState.parallelSolved !== true;

    if (quizPracticeBadge) quizPracticeBadge.hidden = !required;
    if (quizSkip) quizSkip.disabled = !isAnswerable() || quizState.answered || blocked;
    if (quizActionSkip) quizActionSkip.disabled = !quizLive() || !isAnswerable() ||
      quizState.answered || blocked;
    if (quizNext) {
      quizNext.disabled = studentView || quizState.phase === 'complete' || blocked;
    }
    if (quizForceNext) {
      quizForceNext.hidden = !required || !isTrainer;
      quizForceNext.disabled = !blocked;
    }
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

  function showQuizHint() {
    if (!isAnswerable() || quizState.answered) return;
    var item = currentQuizItem();
    if (!item) return;
    var hint = typeof item.hint === 'string' ? item.hint.trim() : '';
    setFeedback(hint ? 'Hint: ' + hint : 'No trainer hint has been granted for this question yet.', '');
  }

  function requestHint() {
    if (!isAnswerable() || quizState.answered) return;
    var item = currentQuizItem();
    if (!item || !item.id || !isTrainer || !sessionId) {
      showQuizHint();
      return;
    }
    var client = classroomApi();
    if (!client || typeof client.grantHint !== 'function') {
      showQuizHint();
      return;
    }
    client.grantHint(sessionId, item.id, 1).then(function (data) {
      if (data && typeof data.hint === 'string') item.hint = data.hint;
      showQuizHint();
      toast('Hint granted to ' + studentLabel() + '.');
    }).catch(function (error) {
      toast('Could not grant the hint: ' + error.message);
    });
  }

  function setTrainerActions() {
    var answerable = quizLive() && isAnswerable() && !quizState.answered;
    if (quizActionHint) quizActionHint.disabled = !answerable;
    if (quizActionSkip) quizActionSkip.disabled = !answerable;
    if (quizActionExplain) quizActionExplain.disabled = !quizLive();
  }

  function setQuizPhase(phase) {
    quizState.phase = phase;
    document.body.classList.toggle('quiz-reteach', phase === 'reteach');
    if (quizPhaseLabel) quizPhaseLabel.textContent = phaseLabels[phase] || 'Assessment · quiz live';

    var locked = !isAnswerable() || quizState.answered;
    if (quizHint) quizHint.disabled = locked;
    if (quizReveal) quizReveal.disabled = studentView || phase === 'complete';
    if (quizReteach) quizReteach.disabled = studentView || phase === 'complete';
    setTrainerActions();
    syncPracticeControls(currentQuizItem());
  }

  function lockOptions(reveal) {
    var item = questions[quizState.index];
    $$('button', quizOptions).forEach(function (option, i) {
      option.disabled = true;
      if (!reveal || !item) return;
      /* Student-side questions carry no answer index. Correctness is fetched
         from the server after the trainer reveals it. */
      if (typeof item.answer !== 'number') return;
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
      else readinessNote.textContent = 'Level 1 unlocks at 80% · Level 2 at 50% · practice checks must be solved.';
    }
  }

  function renderQuiz() {
    var item = questions[quizState.index];
    if (!item) return;
    quizState.answered = false;
    quizState.chosen = null;
    quizState.revealed = false;
    quizState.attemptId = null;
    quizState.revealRecorded = false;
    quizState.parallelSolved = false;
    clearQuizInk(false);

    if (quizQuestion) quizQuestion.textContent = item.q;
    if (isRequiredQuestion(item)) {
      setFeedback("Practice question · let's work through it together. You cannot skip this one.", '');
    } else {
      setFeedback(item.recheck ? 'Recheck · choose one answer.' : 'Choose one answer.', '');
    }
    setAnswerState('Waiting for ' + studentLabel() + '’s answer.');
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
        if (isTrainer && typeof item.answer === 'number') {
          btn.setAttribute('data-correct', i === item.answer ? '1' : '0');
        }

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
    /* Students never score locally. Correctness is released by the server after
       the trainer reveals; only the authenticated trainer view may pre-score. */
    if (isTrainer && typeof item.answer === 'number' && chosen === item.answer) {
      quizState.correct += 1;
    }

    $$('button', quizOptions).forEach(function (option, i) {
      option.disabled = true;
      if (i === chosen) option.classList.add('is-picked');
    });

    setFeedback('Answer saved. Your trainer will reveal feedback.', 'is-waiting');
    if (isTrainer && typeof item.answer === 'number') {
      setAnswerState(studentLabel() + ' chose ' + 'ABCD'.charAt(chosen) +
        ' · key ' + 'ABCD'.charAt(item.answer) + '.');
    } else {
      setAnswerState(studentLabel() + ' chose ' + 'ABCD'.charAt(chosen) +
        '. Trainer feedback is pending.');
    }
    setQuizPhase('awaiting_reveal');
    updateReadiness();

    /* The server owns attempt ids and releases correctness only after reveal. */
    if (sessionId && hasApiAccess() && item.id) {
      apiRequest('/student/sessions/' + encodeURIComponent(sessionId) + '/quiz/answers', {
        method: 'POST',
        body: { questionId: item.id, optionIndex: chosen }
      }).then(function (data) {
        if (data && data.attemptId) quizState.attemptId = data.attemptId;
        /* Reveal can land before the answer POST finishes. Re-check as soon as
           the attempt id exists so a correct required check unlocks promptly. */
        if (quizState.revealed) refreshParallelResult();
      }).catch(function (error) {
        setFeedback('Answer could not be saved: ' + error.message, 'is-wrong');
      });
    }
  }

  function refreshParallelResult() {
    var item = currentQuizItem();
    if (!isRequiredQuestion(item)) return Promise.resolve(false);
    if (!sessionId || !hasApiAccess() || !quizState.attemptId) return Promise.resolve(false);

    return apiRequest('/student/sessions/' + encodeURIComponent(sessionId) +
      '/quiz/attempts/' + encodeURIComponent(quizState.attemptId)).then(function (data) {
      if (data && data.correct === true) {
        quizState.parallelSolved = true;
        syncPracticeControls(item);
        setFeedback('Parallel check solved. Your trainer can move on.', 'is-correct');
        return true;
      }
      return false;
    }).catch(function () {
      return false;
    });
  }

  function refreshRevealResult(attemptId) {
    if (!sessionId || !hasApiAccess() || !attemptId) return Promise.resolve(null);
    return apiRequest('/student/sessions/' + encodeURIComponent(sessionId) +
      '/quiz/attempts/' + encodeURIComponent(attemptId)).then(function (data) {
      if (!data.revealed || quizState.attemptId !== attemptId) return null;
      if (typeof data.correct === 'boolean' && !quizState.revealRecorded) {
        quizState.revealRecorded = true;
        if (data.correct) quizState.correct += 1;
        updateReadiness();
      }
      $$('button', quizOptions).forEach(function (option, index) {
        if (index === quizState.chosen) option.classList.toggle('is-correct', data.correct === true);
      });
      setFeedback(data.correct
        ? 'Correct — well done.'
        : 'Not quite — your trainer will go over it.',
      data.correct ? 'is-correct' : 'is-wrong');
      setAnswerState(data.correct ? 'Correct.' : 'Review with trainer.');
      return data;
    }).catch(function () { return null; });
  }

  function paintReveal() {
    var item = questions[quizState.index];
    if (!item) return;
    quizState.revealed = true;
    lockOptions(true);
    if (typeof item.answer !== 'number') {
      setFeedback('Answer key unavailable in local preview · connect the session API.', 'is-waiting');
      setAnswerState('Reveal recorded · key withheld until the session API loads.');
      setQuizPhase('revealed');
      return;
    }
    var right = quizState.chosen === item.answer;
    var key = 'ABCD'.charAt(item.answer);
    var why = typeof item.why === 'string' ? item.why : '';
    if (quizState.chosen === null) {
      setFeedback('The key is ' + key + '. ' + why, '');
      setAnswerState('Revealed · skipped.');
    } else {
      setFeedback((right ? 'Correct. ' : 'Not quite. ') + why, right ? 'is-correct' : 'is-wrong');
      setAnswerState('Revealed · ' + studentLabel() + ' chose ' + 'ABCD'.charAt(quizState.chosen) + '.');
    }
    setQuizPhase('revealed');
    toast('Answer revealed for ' + studentLabel() + '.');
    refreshParallelResult();
  }

  function revealQuizAnswer() {
    if (studentView || quizState.phase === 'reteach' || quizState.phase === 'complete') return;
    var item = questions[quizState.index];
    if (!item) return;

    if (!sessionId || !hasApiAccess()) {
      paintReveal();
      publishQuizEvent('quiz.answer.revealed', { questionIds: [item.id] });
      return;
    }

    var client = api.api || window.mathifyClassroomApi;
    var task = client && typeof client.revealQuestion === 'function'
      ? client.revealQuestion(sessionId, item.id)
      : apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/reveal', {
        method: 'POST', body: { questionId: item.id }
      });

    task.then(paintReveal).catch(function (error) {
      toast('Could not sync the reveal: ' + error.message);
    });
  }

  function skipQuiz() {
    if (!isAnswerable() || quizState.answered) return;
    var item = questions[quizState.index];
    quizState.answered = true;
    quizState.chosen = null;
    quizState.seen += 1;
    lockOptions(false);
    setFeedback('Skipped. Your trainer controls feedback.', 'is-waiting');
    if (isTrainer && typeof item.answer === 'number') {
      setAnswerState('Skipped · key ' + 'ABCD'.charAt(item.answer) + '.');
    } else {
      setAnswerState('Skipped · trainer feedback is pending.');
    }
    setQuizPhase('awaiting_reveal');
    updateReadiness();
  }

  function paintReteach() {
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

  function reteachQuiz() {
    if (studentView || quizState.phase === 'complete') return;
    if (quizState.reteachArmed) {
      addRecheckQuestion();
      return;
    }

    if (!sessionId || !hasApiAccess()) {
      paintReteach();
      publishQuizEvent('quiz.reteach.started', {
        questionId: currentQuizItem() ? currentQuizItem().id : null
      });
      return;
    }

    var client = api.api || window.mathifyClassroomApi;
    var task = client && typeof client.startReteach === 'function'
      ? client.startReteach(sessionId, 'trainer reteach')
      : apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/reteach', {
        method: 'POST', body: { reason: 'trainer reteach' }
      });
    task.then(paintReteach).catch(function (error) {
      toast('Could not sync the reteach: ' + error.message);
    });
  }

  function installParallelQuestion(next) {
    questions.push(next);
    quizState.index = questions.length - 1;
    quizState.reteachArmed = false;
    startQuizClock();
    renderQuiz();
    toast('Fresh parallel check added from the same concept.');
  }

  function addLocalRecheckQuestion() {
    toast('AI check unavailable · using the local practice scaffold.');
    var bankItem = recheckBank[quizState.recheckCount % recheckBank.length];
    quizState.recheckCount += 1;
    installParallelQuestion(Object.assign({}, bankItem, {
      id: 'q_recheck_' + quizState.recheckCount,
      options: bankItem.options.slice(),
      recheck: true,
      requiresCorrectAnswer: true
    }));
  }

  function addRecheckQuestion() {
    var failed = currentQuizItem();
    if (!sessionId || !hasApiAccess()) {
      addLocalRecheckQuestion();
      return;
    }

    apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/new-check', {
      method: 'POST',
      body: {
        questionId: failed && failed.id ? failed.id : undefined,
        concept: failed && (failed.concept || failed.q) ? (failed.concept || failed.q) : undefined,
        difficulty: failed && failed.difficultyLevel ? failed.difficultyLevel : 'medium'
      }
    }).then(function (data) {
      var session = data.session || {};
      var quiz = session.quiz || {};
      var generated = (quiz.questions || []).find(function (question) {
        return question.id === (data.questionId || quiz.currentQuestionId);
      });
      if (!generated) throw new Error('New check was not returned.');
      installParallelQuestion(Object.assign(mapQuizQuestion(generated, questions.length), {
        recheck: true,
        requiresCorrectAnswer: true
      }));
    }).catch(function (error) {
      toast('Parallel check unavailable (' + error.message + '). Using local check.');
      addLocalRecheckQuestion();
    });
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

  /* Subject-specific practice stays inside the shared quiz launcher. Coding
     uses the IDE/check endpoints; English uses reading/listening/vocabulary
     prompts. Mathematics keeps the existing static bank as its fallback. */
  function subjectQuizPreflight() {
    var info = api.subject && typeof api.subject === 'function' ? api.subject() : null;
    if (!info || info.subject === 'math') return true;
    if (info.subject === 'coding') {
      if (window.classroomCoding && typeof window.classroomCoding.launchQuizChallenge === 'function') {
        window.classroomCoding.launchQuizChallenge();
      }
      return false;
    }
    if (info.subject === 'english' && window.classroomEnglish &&
        typeof window.classroomEnglish.prepareQuizBank === 'function') {
      var bank = window.classroomEnglish.prepareQuizBank();
      if (Array.isArray(bank) && bank.length) {
        questions = bank;
        baseQuestions = bank.map(function (question) {
          return Object.assign({}, question, { options: question.options.slice() });
        });
      }
    }
    return true;
  }

  function launchQuiz() {
    if (!quizStage || document.body.classList.contains('quiz-live')) return false;
    if (!subjectQuizPreflight()) return false;
    setNotes(false);
    closeSheet();
    initRealtime();
    document.body.classList.add('quiz-live');
    reaffirmCallMedia();
    if (studentInk) studentInk.hidden = false;
    clearQuizInk(true);
    requestAnimationFrame(fitStudentInk);
    if (board) {
      board.hidden = true;
      if (studentView) board.setAttribute('aria-hidden', 'true');
    }
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
    startQuestionSync();
    toast(studentView ? 'Quiz launched · whiteboard hidden.' : 'Quiz launched · trainer controls ready.');
    var first = $('button', quizOptions);
    if (first) setTimeout(function () { first.focus(); }, 30);
    return true;
  }

  function exitQuiz() {
    if (!quizStage || !document.body.classList.contains('quiz-live')) return;
    clearInterval(quizState.timer);
    quizState.timer = null;
    clearInterval(quizState.pollTimer);
    quizState.pollTimer = null;
    document.body.classList.remove('quiz-live');
    document.body.classList.remove('quiz-reteach');
    reaffirmCallMedia();
    setTrainerActions();
    quizStage.hidden = true;
    closeScratchOverlay();
    if (realtimeLink) {
      realtimeLink.close();
      realtimeLink = null;
    }
    if (studentInk) studentInk.hidden = true;
    if (board) {
      board.hidden = false;
      board.removeAttribute('aria-hidden');
    }
    toast('Back to the board · quiz responses saved.');
  }

  quizLaunch && quizLaunch.addEventListener('click', launchQuiz);
  quizExit && quizExit.addEventListener('click', exitQuiz);
  quizReveal && quizReveal.addEventListener('click', revealQuizAnswer);
  quizReteach && quizReteach.addEventListener('click', reteachQuiz);

  quizHint && quizHint.addEventListener('click', requestHint);

  quizSkip && quizSkip.addEventListener('click', skipQuiz);

  function finishAdvance() {
    if (quizState.index >= questions.length - 1) {
      completeQuiz();
      return;
    }
    quizState.index += 1;
    renderQuiz();
    startQuizClock();
    toast('Next question ready.');
  }

  function advanceQuiz(force) {
    if (studentView || quizState.phase === 'complete') return;
    var item = currentQuizItem();
    if (isRequiredQuestion(item) && quizState.parallelSolved !== true && force !== true) {
      toast('Solve the practice question first, or use trainer override.');
      return;
    }
    if (!sessionId || !hasApiAccess()) {
      finishAdvance();
      return;
    }
    apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/next', {
      method: 'POST',
      body: force === true ? { force: true } : {}
    }).then(finishAdvance).catch(function (error) {
      if (error.status === 409) {
        toast('Backend requires a correct parallel check before proceeding.');
      } else {
        toast('Could not sync the next question: ' + error.message);
      }
    });
  }

  quizNext && quizNext.addEventListener('click', function () { advanceQuiz(false); });
  quizForceNext && quizForceNext.addEventListener('click', function () { advanceQuiz(true); });

  function applyStudentQuizState(data) {
    var quiz = data && data.session && data.session.quiz;
    if (!quiz || !quiz.currentQuestionId) return;

    var found = (quiz.questions || []).find(function (question) {
      return question.id === quiz.currentQuestionId;
    });
    if (!found) return;

    var current = currentQuizItem();
    if (current && current.id === found.id) {
      var granted = typeof found.hint === 'string' ? found.hint.trim() : '';
      if (granted && granted !== current.hint) {
        current.hint = granted;
        if (!quizState.answered) setFeedback('Hint: ' + granted, '');
      }
      return;
    }

    /* mapQuizQuestion never copies answer or explanation for a student view. */
    questions.push(mapQuizQuestion(found, questions.length));
    quizState.index = questions.length - 1;
    startQuizClock();
    renderQuiz();
    toast('New practice question ready.');
  }

  function syncStudentQuestion() {
    if (!studentView || !sessionId || !hasApiAccess()) return Promise.resolve(false);
    return apiRequest('/student/sessions/' + encodeURIComponent(sessionId))
      .then(function (data) {
        if (quizLive()) applyStudentQuizState(data);
        return true;
      })
      .catch(function () { return false; });
  }

  function startQuestionSync() {
    if (!studentView || !sessionId || !hasApiAccess()) return;
    clearInterval(quizState.pollTimer);
    quizState.pollTimer = setInterval(syncStudentQuestion, 2000);
  }

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

  function newStrokeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'wacom_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  }

  function sendStroke(type, point) {
    if (!realtimeLink || !realtimeLink.enabled || !isTrainer) return;
    var payload = { stroke_id: strokeId || newStrokeId(), type: type };

    if (point && scratchCanvas) {
      var rect = scratchCanvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        payload.x = Number(Math.min(1, Math.max(0, point.x / rect.width)).toFixed(6));
        payload.y = Number(Math.min(1, Math.max(0, point.y / rect.height)).toFixed(6));
        payload.color = '#FF5B2E';
        payload.width = 2.6;
      }
    }

    realtimeLink.send(payload).catch(function (error) {
      console.warn('[mathify-realtime] stroke sync failed:', error.message);
    });
  }

  var studentInkCtx = studentInkCanvas && studentInkCanvas.getContext('2d');
  var remoteLast = {};

  function clearQuizInk(broadcast) {
    if (studentInkCtx && studentInkCanvas) {
      studentInkCtx.clearRect(0, 0, studentInkCanvas.width, studentInkCanvas.height);
    }
    remoteLast = {};
    if (studentInkMode && quizLive()) studentInkMode.textContent = 'Ready for trainer sketch';
    if (broadcast !== false) sendStroke('clear', null);
  }

  function fitStudentInk() {
    if (!studentInkCanvas || !studentInkCtx) return;
    var rect = studentInkCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    studentInkCanvas.width = Math.round(rect.width * dpr);
    studentInkCanvas.height = Math.round(rect.height * dpr);
    studentInkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    studentInkCtx.clearRect(0, 0, rect.width, rect.height);
  }

  function drawRemoteStroke(row) {
    if (!studentInkCanvas || !studentInkCtx || !row) return;
    if (studentInk) studentInk.hidden = false;
    if (!studentInkCanvas.width) fitStudentInk();

    var key = row.stroke_id || 'remote';
    if (row.type === 'clear') {
      studentInkCtx.clearRect(0, 0, studentInkCanvas.clientWidth, studentInkCanvas.clientHeight);
      remoteLast = {};
      return;
    }

    var x = Number(row.x);
    var y = Number(row.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    var rect = studentInkCanvas.getBoundingClientRect();
    var px = x * rect.width;
    var py = y * rect.height;

    studentInkCtx.save();
    studentInkCtx.strokeStyle = row.color || '#FF5B2E';
    studentInkCtx.lineWidth = Number(row.width) || 2.6;
    studentInkCtx.lineCap = 'round';
    studentInkCtx.lineJoin = 'round';

    if (row.type === 'start' || !remoteLast[key]) {
      studentInkCtx.fillStyle = row.color || '#FF5B2E';
      studentInkCtx.beginPath();
      studentInkCtx.arc(px, py, 1.4, 0, Math.PI * 2);
      studentInkCtx.fill();
    } else {
      studentInkCtx.beginPath();
      studentInkCtx.moveTo(remoteLast[key].x, remoteLast[key].y);
      studentInkCtx.lineTo(px, py);
      studentInkCtx.stroke();
    }
    studentInkCtx.restore();
    remoteLast[key] = { x: px, y: py };
  }

  var localInkDrawing = false;
  var localInkPointer = null;
  var localInkLast = null;

  function studentInkPoint(event) {
    var rect = studentInkCanvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    };
  }

  if (studentView && studentInkCanvas && studentInkCtx) {
    studentInkCanvas.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      localInkDrawing = true;
      localInkPointer = event.pointerId;
      localInkLast = studentInkPoint(event);
      if (studentInkMode) studentInkMode.textContent = 'Local scratchpad';
      try { studentInkCanvas.setPointerCapture(event.pointerId); } catch (e) {}
      studentInkCtx.save();
      studentInkCtx.fillStyle = '#0E1420';
      studentInkCtx.beginPath();
      studentInkCtx.arc(localInkLast.x, localInkLast.y, 1.2, 0, Math.PI * 2);
      studentInkCtx.fill();
      studentInkCtx.restore();
    });

    studentInkCanvas.addEventListener('pointermove', function (event) {
      if (!localInkDrawing || event.pointerId !== localInkPointer) return;
      event.preventDefault();
      var point = studentInkPoint(event);
      studentInkCtx.save();
      studentInkCtx.strokeStyle = '#0E1420';
      studentInkCtx.lineWidth = 1.8;
      studentInkCtx.lineCap = 'round';
      studentInkCtx.lineJoin = 'round';
      studentInkCtx.beginPath();
      studentInkCtx.moveTo(localInkLast.x, localInkLast.y);
      studentInkCtx.lineTo(point.x, point.y);
      studentInkCtx.stroke();
      studentInkCtx.restore();
      localInkLast = point;
    });

    function stopStudentInk(event) {
      if (event && event.pointerId !== localInkPointer) return;
      localInkDrawing = false;
      localInkPointer = null;
      localInkLast = null;
      if (event) { try { studentInkCanvas.releasePointerCapture(event.pointerId); } catch (e) {} }
    }
    studentInkCanvas.addEventListener('pointerup', stopStudentInk);
    studentInkCanvas.addEventListener('pointercancel', stopStudentInk);
  }

  var localQuizChannel = null;
  var localEventKey = 'mathify.quiz.event';

  /* Same-browser fallback when the realtime bridge or server is unavailable.
     Payloads never contain an answer key or correctness. */
  function publishQuizEvent(event, payload) {
    if (!sessionId) return;
    var message = { event: event, payload: payload || {}, at: new Date().toISOString() };
    if (window.BroadcastChannel) {
      try {
        var channel = new BroadcastChannel('mathify:session:' + sessionId);
        channel.postMessage(message);
        channel.close();
      } catch (error) { /* private mode */ }
    }
    if (window.localStorage) {
      try { window.localStorage.setItem(localEventKey, JSON.stringify(message)); } catch (error) {}
    }
  }

  function applyRevealEvent(event) {
    if (!quizLive()) return;
    var ids = (event.payload && event.payload.questionIds) || [];
    var current = currentQuizItem();
    if (!current || (ids.length && ids.indexOf(current.id) === -1)) return;
    if (quizState.revealed) return;

    quizState.revealed = true;
    reaffirmCallMedia();
    lockOptions(true);
    setQuizPhase('revealed');
    if (studentView) {
      setFeedback('Trainer feedback is ready.', 'is-waiting');
      setAnswerState('Answer revealed by trainer.');
      refreshRevealResult(quizState.attemptId);
    }
  }

  function handleSessionEvent(event) {
    if (!event || !event.event) return;
    if (event.event === 'quiz.launched' && studentView) {
      /* The server launch is authoritative. Without this branch a student tab
         would keep showing the board and would not suppress celebrations. */
      if (!quizLive()) launchQuiz();
      syncStudentQuestion();
    } else if (event.event === 'quiz.answer.revealed') applyRevealEvent(event);
    else if (event.event === 'quiz.reteach.started' && studentView && quizLive()) {
      setQuizPhase('reteach');
      setFeedback('Your trainer is going over this once more.', 'is-waiting');
    } else if ((event.event === 'quiz.question.changed' || event.event === 'quiz.check.added') && studentView) {
      startQuestionSync();
    } else if (event.event === 'quiz.assistance.granted' && studentView) {
      /* The event carries no hint text. Fetch the granted hint from the safe state. */
      syncStudentQuestion();
    } else if (event.event === 'board.shared' && studentView) {
      toast(event.payload && event.payload.shared ? 'Your trainer shared the board with you.' : 'Board sharing stopped.');
    } else if (event.event === 'rtc.media.control.changed') {
      if (api.applyMediaPermission) api.applyMediaPermission(event.payload || {});
      reaffirmCallMedia();
    } else if (event.event === 'network.check.completed') {
      /* The event is only a signal. The full, role-safe connection state is
         read back from the server so both peers see accurate status. */
      var client = classroomApi();
      if (sessionId && client && typeof client.getSessionState === 'function') {
        client.getSessionState(sessionId).then(function (state) {
          if (api.applyNetworkState && state && state.network) api.applyNetworkState(state.network);
        }).catch(function () {});
      } else if (api.applyNetworkState) {
        api.applyNetworkState(event.payload || {});
      }
      if (studentView && event.payload) {
        toast(event.payload.ok ? 'Connection check passed.' : 'Connection check failed. Please improve your internet.');
      }
    } else if (event.event === 'founder.observer.changed') {
      /* Read the shared observer state back from the server. The event payload
         is a signal only and never carries private identity fields. */
      var observerClient = classroomApi();
      if (sessionId && observerClient && typeof observerClient.getSessionState === 'function') {
        observerClient.getSessionState(sessionId).then(function (state) {
          if (api.applyObserverState && state) api.applyObserverState(state);
        }).catch(function () {});
      }
      toast(event.payload && event.payload.active
        ? 'The founder has joined openly as an observer.'
        : 'The founder observer has left the room.');
    } else if (event.event === 'badge.awarded' && studentView) {
      var badge = event.payload || {};
      toast((badge.label || 'Badge') + ' earned · ' + (badge.points || 0) + ' reward points.');
    } else if (event.event === 'reaction.permission.changed') {
      if (api.applyReactionPermission) api.applyReactionPermission(event.payload || {});
    } else if (event.event === 'reaction.sent') {
      /* Reactions never share the celebration layer. */
      if (window.classroomEngagement && typeof window.classroomEngagement.onReaction === 'function') {
        window.classroomEngagement.onReaction(event.payload || {});
      }
    } else if (event.event === 'shared.celebration') {
      /* Client-side guard in addition to the server's quiz-active check. */
      if (!quizLive() && window.classroomEngagement &&
          typeof window.classroomEngagement.onCelebration === 'function') {
        window.classroomEngagement.onCelebration(event.payload || {});
      }
    } else if (event.event === 'session.ended') {
      document.body.classList.add('is-ended');
      var word = $('#liveWord');
      var button = $('#endBtn');
      if (word) word.textContent = 'Ended';
      if (button) { button.disabled = true; button.textContent = 'Ended'; }
    }
  }

  function initLocalQuizEvents() {
    if (!sessionId) return;
    if (window.BroadcastChannel) {
      try {
        localQuizChannel = new BroadcastChannel('mathify:session:' + sessionId);
        localQuizChannel.onmessage = function (message) { handleSessionEvent(message.data); };
      } catch (error) { localQuizChannel = null; }
    }
    if (window.localStorage) {
      window.addEventListener('storage', function (event) {
        if (event.key !== localEventKey || !event.newValue) return;
        try { handleSessionEvent(JSON.parse(event.newValue)); } catch (error) {}
      });
    }
  }

  function initRealtime() {
    if (realtimeLink || !sessionId) return;
    initLocalQuizEvents();

    var bridge = window.classroomRealtime;
    if (!bridge || typeof bridge.connect !== 'function') {
      console.warn('[mathify] Realtime bridge unavailable · using local quiz events.');
      return;
    }
    realtimeLink = bridge.connect({
      sessionId: sessionId,
      accessToken: accessToken,
      onStroke: drawRemoteStroke,
      onEvent: handleSessionEvent,
      onStatus: function (status) {
        if (status === 'live' && studentView) toast('Live trainer sketch connected.');
      }
    });
  }

  if (scratchCanvas && scratchCtx) {
    scratchCanvas.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      scratchDrawing = true;
      scratchPointer = event.pointerId;
      try { scratchCanvas.setPointerCapture(event.pointerId); } catch (e) {}
      var p = scratchPoint(event);
      strokeId = newStrokeId();
      sendStroke('start', p);
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
      sendStroke('point', p);
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
      if (scratchDrawing && event) sendStroke('end', scratchPoint(event));
      scratchDrawing = false;
      scratchPointer = null;
      strokeId = null;
    }
    scratchCanvas.addEventListener('pointerup', stopScratch);
    scratchCanvas.addEventListener('pointercancel', stopScratch);
  }

  function quizLive() {
    return document.body.classList.contains('quiz-live');
  }

  function setDoubtMenu(open) {
    if (!doubtMenu) return;
    doubtMenu.hidden = !open;
    if (quizDoubtBtn) quizDoubtBtn.setAttribute('aria-expanded', String(open));
  }

  function openScratchOverlay() {
    if (!isTrainer) return;
    if (!quizLive()) {
      toast('Launch the quiz before opening the explanation overlay.');
      return;
    }
    setDoubtMenu(false);
    clearQuizInk(true);
    if (studentInkMode) studentInkMode.textContent = 'Trainer explaining · sketch live';
    if (scratchOverlay) scratchOverlay.hidden = false;
    requestAnimationFrame(fitScratch);
    toast('Explain overlay open · quiz stays live.');
  }

  function closeScratchOverlay() {
    if (scratchOverlay) scratchOverlay.hidden = true;
    if (studentInkMode && quizLive()) studentInkMode.textContent = 'Ready for trainer sketch';
    setDoubtMenu(false);
  }

  quizDoubtBtn && quizDoubtBtn.addEventListener('click', function () {
    if (!isTrainer) return;
    setDoubtMenu(doubtMenu && doubtMenu.hidden);
  });
  quizActionHint && quizActionHint.addEventListener('click', function () {
    if (quizActionHint.disabled) return;
    setDoubtMenu(false);
    requestHint();
  });
  quizActionSkip && quizActionSkip.addEventListener('click', function () {
    if (quizActionSkip.disabled) return;
    setDoubtMenu(false);
    skipQuiz();
    toast('Question skipped · quiz stays live.');
  });
  quizActionExplain && quizActionExplain.addEventListener('click', function () {
    if (quizActionExplain.disabled) return;
    openScratchOverlay();
  });
  scratchClose && scratchClose.addEventListener('click', closeScratchOverlay);

  document.addEventListener('click', function (event) {
    if (!doubtMenu || doubtMenu.hidden) return;
    if (event.target.closest('.doubt-dropdown')) return;
    setDoubtMenu(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (scratchOverlay && !scratchOverlay.hidden) closeScratchOverlay();
    else if (trainerPanel && !trainerPanel.hidden) setNotes(false);
  });

  scratchShare && scratchShare.addEventListener('click', function () {
    toast('Sketch captured for the student.');
  });
  scratchClear && scratchClear.addEventListener('click', function () {
    if (scratchCtx && scratchCanvas) scratchCtx.clearRect(0, 0, scratchCanvas.clientWidth, scratchCanvas.clientHeight);
    sendStroke('clear', null);
    if (studentInkMode) studentInkMode.textContent = 'Cleared · ready for trainer sketch';
    toast('Explain overlay cleared.');
  });
  window.addEventListener('resize', function () {
    if (scratchOverlay && !scratchOverlay.hidden) fitScratch();
    if (studentInk && !studentInk.hidden) fitStudentInk();
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
  var roleReady = syncViewerRoleFromState();
  var quizReady = roleReady.then(function () {
    if (isTrainer) loadTrainerSession();
    return loadQuizQuestions();
  }).then(function () {
    if (document.body.classList.contains('quiz-live')) renderQuiz();
    return true;
  });
  updateReadiness();
  paintQuizClock();

  if (params.get('notes') === '1') setNotes(true);

  var quizQA = params.get('quiz');
  if (quizQA === '1') {
    quizReady.then(function () { setTimeout(launchQuiz, 120); });
  } else if (quizQA) {
    quizReady.then(function () {
      setTimeout(function () {
        if (!launchQuiz()) return;
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
    });
  }
  if (params.get('state') === 'ended') {
    document.body.classList.add('is-ended');
    var liveWord = $('#liveWord');
    var endBtn = $('#endBtn');
    if (liveWord) liveWord.textContent = 'Ended';
    if (endBtn) { endBtn.disabled = true; endBtn.textContent = 'Ended'; }
  }

  /* --------------------------------------------- automated presence beacon */
  var presenceInterval = null;
  var learningEvents = 0;
  var lastInteraction = Date.now();

  function noteInteraction() {
    lastInteraction = Date.now();
    learningEvents += 1;
  }
  document.addEventListener('pointerdown', noteInteraction, true);
  document.addEventListener('keydown', noteInteraction, true);

  function sendPresence(leaving) {
    if (!sessionId || (!isTrainer && !studentView)) return Promise.resolve(null);
    return apiRequest('/sessions/' + encodeURIComponent(sessionId) + '/presence', {
      method: 'POST',
      keepalive: true,
      body: {
        active: !leaving && document.visibilityState === 'visible' && Date.now() - lastInteraction < 60000,
        learningEvents: learningEvents,
        leaving: Boolean(leaving)
      }
    }).catch(function () { return null; });
  }

  if (sessionId && (isTrainer || studentView)) {
    sendPresence(false);
    presenceInterval = window.setInterval(function () { sendPresence(false); }, 20000);
    window.addEventListener('pagehide', function () { sendPresence(true); });
    /* Media control, connection and reward events must reach a participant
       even when no quiz is running. Open the safe event channel on load. */
    initRealtime();
  }

  /* Expose quiz controls for QA and future real-time wiring. */
  api.openQuiz = launchQuiz;
  api.isTrainer = function () { return isTrainer; };
  api.sendPresence = sendPresence;
  api.closeQuiz = exitQuiz;
  api.renderInstructions = renderInstructions;
  api.loadTrainerSession = loadTrainerSession;
  api.loadQuizQuestions = loadQuizQuestions;
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
