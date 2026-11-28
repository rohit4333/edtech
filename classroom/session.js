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
    var call = api.livekit || window.mathifyClassroomLiveKit;
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
      captureGuide(trainerSession);
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
        captureGuide(trainerSession);
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

  guideToggle && guideToggle.addEventListener('click', function () {
    if (!guideBody) return;
    var open = guideBody.hidden;
    guideBody.hidden = !open;
    guideToggle.setAttribute('aria-expanded', String(open));
    guideToggle.textContent = open ? 'Hide guide' : 'Show guide';
  });

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
  var quizQuestionImage = $('#quizQuestionImage');
  var quizStudentName = $('#quizStudentName');
  var quizSketchSurface = $('#quizSketchSurface');
  var quizSketchCanvas = $('#quizSketchCanvas');
  var quizSketchTools = $('#quizSketchTools');
  var quizSketchClear = $('#quizSketchClear');
  var quizSketchState = $('#quizSketchState');
  var quizMirrorQuestion = $('#quizMirrorQuestion');
  var quizMirrorImage = $('#quizMirrorImage');
  var quizMirrorCanvas = $('#quizMirrorSketchCanvas');
  var quizMirrorOptions = $('#quizMirrorOptions');
  var quizMirrorState = $('#quizMirrorState');
  var quizOptions = $('#quizOptions');
  var quizFeedback = $('#quizFeedback');
  var quizHint = $('#quizHint');
  var quizSkip = $('#quizSkip');
  var quizNext = $('#quizNext');
  var quizPracticeBadge = $('#quizPracticeBadge');
  var quizForceNext = $('#quizForceNext');
  var quizReveal = $('#quizReveal');
  var quizSubmit = $('#quizSubmit');
  var quizPushBoard = $('#quizPushBoard');
  var quizNewCheck = $('#quizNewCheck');
  var quizAnswerState = $('#quizAnswerState');
  var quizPhaseLabel = $('#quizPhaseLabel');
  var quizStageTimer = $('#quizStageTimer');
  var quizDoubtBtn = $('#quizDoubtBtn');
  var doubtMenu = $('#doubtMenu');
  var quizActionHint = $('#quizActionHint');
  var quizActionSkip = $('#quizActionSkip');
  var readinessText = $('#readinessText');
  var readinessBar = $('#readinessBar');
  var readinessNote = $('.readiness small');
  var quizRetest = $('#quizRetest');
  var quizSectionProgress = $('#quizSectionProgress');
  var quizSectionCount = $('#quizSectionCount');
  var quizSectionLock = $('#quizSectionLock');
  var shareBoardBtn = $('#shareBoardBtn');
  var fullBoardFullscreen = $('#fullBoardFullscreen');

  /* Temporary dev-fixture planner guide. This client only reads the payload;
     it never authors, generates or mutates planner content. */
  var trainerGuide = $('#trainerGuide');
  var guideToggle = $('#guideToggle');
  var guideBody = $('#guideBody');
  var guideStoryTitle = $('#guideStoryTitle');
  var guideStoryThread = $('#guideStoryThread');
  var guideBeatNarration = $('#guideBeatNarration');
  var guideCurrentConcept = $('#guideCurrentConcept');
  var guideCurrentQuestion = $('#guideCurrentQuestion');
  var guideCompleted = $('#guideCompleted');
  var guideSectionCount = $('#guideSectionCount');
  var guideSectionLock = $('#guideSectionLock');
  var guideConceptsList = $('#guideConcepts');
  var guideStoryClosing = $('#guideStoryClosing');
  var studentStory = $('#studentStory');
  var studentStoryChapter = $('#studentStoryChapter');
  var studentStoryTopic = $('#studentStoryTopic');
  var studentStoryNarration = $('#studentStoryNarration');
  var liveMeta = $('#liveMeta');
  var liveChapterDeck = $('#liveChapterDeck');
  var liveTopicDeck = $('#liveTopicDeck');
  var guideState = {
    guide: null,
    progress: null,
    quiz: null,
    sectionCorrect: 0,
    sectionRequired: 3,
    sectionComplete: true
  };

  /* ------------------------------- front-desk share state / camera hand-off */
  /* The front card is the single session-desk share action. app.js owns the
     classroomApi.shareBoard call; this only mirrors the server's board.shared
     event onto the Off/On chip, and starts honestly Off. */
  function setFrontBoardShareState(shared) {
    var on = shared === true;
    if (!shareBoardBtn) return;
    shareBoardBtn.classList.toggle('is-on', on);
    shareBoardBtn.setAttribute('aria-pressed', String(on));
    var label = $('[data-control-label]', shareBoardBtn);
    if (label) label.textContent = on ? 'On' : 'Off';
    shareBoardBtn.title = on
      ? 'Stop sharing the whiteboard with the child'
      : 'Share the whiteboard with the child';
  }
  setFrontBoardShareState(false);

  /* The whiteboard is the live lesson desk. Closing it returns the trainer to
     the camera page with the same session identity; devLabel, review, state
     and any other QA params are carried over untouched. */
  function cameraUrl() {
    var search = new URLSearchParams(window.location.search);
    if (sessionId) search.set('sessionId', sessionId);
    if (studentView) {
      search.set('role', 'student');
      search.set('view', 'student');
    } else if (!search.has('role')) {
      search.set('role', isTrainer && user.role ? user.role : 'trainer');
    }
    return 'connect.html?' + search.toString();
  }

  var returningToCamera = false;
  function backToCamera() {
    if (!isTrainer || returningToCamera) return;
    returningToCamera = true;
    /* Desk hand-off, not a session exit: the server clock and recording keep
       running. pagehide honours this flag and skips the leaving beacon; End
       session stays the only path that finalizes presence. */
    window.MATHIFY_STAY_PRESENT = true;
    window.location.assign(cameraUrl());
  }
  fullBoardFullscreen && fullBoardFullscreen.addEventListener('click', backToCamera);

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
    recheckCount: 0,
    seconds: 120,
    timer: null,
    attemptId: null,
    revealRecorded: false,
    parallelSolved: false,
    pollTimer: null
  };

  /* The quiz scratch tools are a separate session permission from the full
     whiteboard. The server owns the sticky flag; this is only the browser
     mirror, so a revoked child can never re-enable the surface locally. */
  var quizSketchPermission = { studentCanSketch: true, version: 0 };
  var quizSketchStrokes = [];
  var quizMirrorStrokes = [];
  var quizSketchActive = null;
  var quizSketchTool = 'pen';
  var quizSketchColor = 'ink';
  var QUIZ_SKETCH_COLORS = { ink: '#0E1420', coral: '#FF5B2E', teal: '#12968C' };

  /* Only the question stem and its attached image may cross to the board.
     Options, answer keys, hints and trainer notes stay in the quiz layer. A
     trainer must press Push to whiteboard; a render or state sync never does it. */
  function boardQuestionPayload(item) {
    if (!item) return null;
    var text = String(item.q || '').trim();
    if (!text) return null;
    return {
      q: text,
      image: quizImageSource(item.image || item.imageUrl ||
        item.image_url || item.imageData || item.image_data ||
        item.photo || item.attachment) || null
    };
  }

  function pushQuizQuestionToBoard() {
    if (!isTrainer) {
      toast('Only the trainer can push a question to the board.');
      return false;
    }
    var payload = boardQuestionPayload(currentQuizItem());
    if (!payload) {
      toast('There is no question to push.');
      return false;
    }
    var boardApi = window.MathifyFullBoard;
    var transfer = boardApi && (boardApi.pushQuestion || boardApi.showQuestionText);
    if (typeof transfer !== 'function') {
      toast('The whiteboard is not ready yet.');
      return false;
    }
    transfer.call(boardApi, payload);
    return true;
  }

  /* The planner designer hands a question over through local storage, then
     opens this classroom with board=full. Only the stem and image cross; the
     planner's trainer notes and answer material stay on the planner page. */
  function consumePlannerQuestion() {
    if (!isTrainer || params.get('plannerQuestion') !== '1') return;
    var handoff = null;
    try {
      handoff = JSON.parse(window.localStorage.getItem('mathify.planner.question') || 'null');
      window.localStorage.removeItem('mathify.planner.question');
    } catch (error) { handoff = null; }
    if (!handoff || !handoff.q) return;
    var payload = boardQuestionPayload({ q: handoff.q, image: handoff.image });
    var boardApi = window.MathifyFullBoard;
    if (payload && boardApi && typeof boardApi.pushQuestion === 'function') {
      boardApi.pushQuestion(payload);
    }
  }

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

  function setText(node, value) {
    if (node) node.textContent = typeof value === 'string' ? value : '';
  }

  function guideConcept(guide, id) {
    if (!guide || !Array.isArray(guide.concepts)) return null;
    var match = guide.concepts.find(function (item) { return item && item.id === id; });
    return match || guide.concepts[0] || null;
  }

  /* One beat per current concept. Locked future beats are never selected. */
  function guideBeat(guide, conceptId) {
    if (!guide || !guide.story || !Array.isArray(guide.story.beats)) return null;
    return guide.story.beats.find(function (beat) {
      return beat && beat.conceptId === conceptId;
    }) || null;
  }

  function guideConceptTitle() {
    var progress = guideState.progress || {};
    var concept = guideConcept(guideState.guide, progress.currentConceptId);
    return concept && typeof concept.title === 'string' ? concept.title : '';
  }

  function applySectionProgress(progress) {
    var required = Number(progress && progress.sectionRequired);
    if (!Number.isFinite(required) || required <= 0) required = 3;
    var correct = Number(progress && progress.sectionCorrect);
    if (!Number.isFinite(correct) || correct < 0) correct = 0;
    var complete = Boolean(guideState.guide) &&
      ((progress && progress.sectionComplete === true) || correct >= required);

    guideState.sectionRequired = required;
    guideState.sectionCorrect = correct;
    guideState.sectionComplete = complete;

    var count = correct + ' / ' + required;
    var lockText = complete
      ? 'Section complete · next section unlocked.'
      : 'Next section locked until ' + required + ' correct answers in this section (' +
        correct + ' so far).';

    setText(guideSectionCount, count);
    setText(guideSectionLock, lockText);
    if (guideSectionLock) guideSectionLock.classList.toggle('is-unlocked', complete);
    setText(quizSectionCount, count);
    setText(quizSectionLock, lockText);
    if (quizSectionProgress) {
      quizSectionProgress.classList.toggle('is-complete', complete);
      quizSectionProgress.hidden = !guideState.guide;
    }
    syncPracticeControls(currentQuizItem());
  }

  function clearGuide() {
    guideState.guide = null;
    guideState.progress = null;
    guideState.quiz = null;
    guideState.sectionCorrect = 0;
    guideState.sectionRequired = 3;
    guideState.sectionComplete = true;
    if (trainerGuide) trainerGuide.hidden = true;
    if (studentStory) studentStory.hidden = true;
    if (liveMeta) liveMeta.hidden = true;
    if (quizSectionProgress) quizSectionProgress.hidden = true;
    syncPracticeControls(currentQuizItem());
  }

  function renderGuideConcepts(guide, currentConcept, currentQuestionId, progress) {
    if (!guideConceptsList) return;
    guideConceptsList.innerHTML = '';
    var completed = Array.isArray(progress.completedQuestionIds) ? progress.completedQuestionIds : [];
    (guide.concepts || []).forEach(function (concept) {
      var item = document.createElement('li');
      if (currentConcept && concept.id === currentConcept.id) item.className = 'is-current';
      var title = document.createElement('b');
      title.textContent = concept.title || concept.id || '';
      item.appendChild(title);
      if (typeof concept.narration === 'string' && concept.narration) {
        var narration = document.createElement('p');
        narration.textContent = concept.narration;
        item.appendChild(narration);
      }
      var questionsList = document.createElement('ol');
      (concept.practiceQuestions || []).forEach(function (question) {
        var questionItem = document.createElement('li');
        if (question.id === currentQuestionId) questionItem.className = 'is-current';
        else if (completed.indexOf(question.id) !== -1) questionItem.className = 'is-complete';
        /* Stem only. Keys, hints, explanations, trainer instructions and
           misconceptions are never rendered in either role. */
        questionItem.textContent = question.stem || question.id || '';
        questionsList.appendChild(questionItem);
      });
      if (questionsList.childNodes.length) item.appendChild(questionsList);
      guideConceptsList.appendChild(item);
    });
  }

  function renderGuide() {
    var guide = guideState.guide;
    var showTrainer = Boolean(guide && isTrainer);
    var showStudent = Boolean(guide && studentView);
    if (trainerGuide) trainerGuide.hidden = !showTrainer;
    if (studentStory) studentStory.hidden = !showStudent;
    if (liveMeta) liveMeta.hidden = !showStudent;
    if (quizSectionProgress) quizSectionProgress.hidden = !guide;
    if (!guide) return;

    var story = guide.story || {};
    var progress = guideState.progress || {};
    var currentQuestionId = progress.currentQuestionId ||
      (guideState.quiz && guideState.quiz.currentQuestionId) || '';
    var concept = guideConcept(guide, progress.currentConceptId);
    if (!concept && currentQuestionId && Array.isArray(guide.concepts)) {
      concept = guide.concepts.find(function (item) {
        return item && Array.isArray(item.practiceQuestions) &&
          item.practiceQuestions.some(function (question) {
            return question && question.id === currentQuestionId;
          });
      }) || null;
    }
    var conceptTitle = concept && typeof concept.title === 'string' ? concept.title : '';
    var beat = guideBeat(guide, concept && concept.id);
    var storyTitle = typeof story.title === 'string' && story.title
      ? story.title
      : (typeof guide.label === 'string' ? guide.label : 'Dev planner guide');

    if (showTrainer) {
      setText(guideStoryTitle, storyTitle);
      setText(guideStoryThread, story.thread || '');
      setText(guideStoryClosing, story.closing || '');
      var beatText = beat && typeof beat.narration === 'string' ? beat.narration : '';
      var emoji = beat && typeof beat.emoji === 'string' ? beat.emoji : '';
      var trainerNarration = beatText
        ? (emoji ? emoji + ' ' : '') + beatText
        : (concept && typeof concept.narration === 'string' ? concept.narration : '');
      setText(guideBeatNarration, trainerNarration);
      setText(guideCurrentConcept, conceptTitle);
      setText(guideCurrentQuestion, currentQuestionId);
      var completed = Array.isArray(progress.completedQuestionIds) ? progress.completedQuestionIds.length : 0;
      setText(guideCompleted, completed + ' answered correctly');
      renderGuideConcepts(guide, concept, currentQuestionId, progress);
    }

    if (showStudent) {
      /* Only the current concept/beat is rendered. No guide index, answer key,
         hint, explanation, trainer note, misconception or future beat appears. */
      var studentLine = beat && typeof beat.narration === 'string' && beat.narration
        ? beat.narration
        : (concept && typeof concept.narration === 'string' ? concept.narration : '');
      setText(studentStoryChapter, storyTitle);
      setText(studentStoryTopic, conceptTitle);
      setText(studentStoryNarration, studentLine);
      setText(liveChapterDeck, storyTitle);
      setText(liveTopicDeck, conceptTitle);
    }
  }

  function captureGuide(session) {
    var guide = session && session.plannerGuide;
    if (!guide || typeof guide !== 'object') {
      if (guideState.guide) clearGuide();
      return false;
    }
    guideState.guide = guide;
    guideState.progress = guide.progress || {};
    if (session.quiz) guideState.quiz = session.quiz;
    renderGuide();
    applySectionProgress(guideState.progress);
    return true;
  }

  function refreshGuide() {
    if (!sessionId || !hasApiAccess()) return Promise.resolve(false);
    var path = (isTrainer ? '/trainer' : '/student') +
      '/sessions/' + encodeURIComponent(sessionId);
    return apiRequest(path).then(function (data) {
      return captureGuide(data && (data.session || data));
    }).catch(function () { return false; });
  }

  function quizImageSource(value) {
    if (!value) return '';
    var source = typeof value === 'string' ? value :
      (value.data || value.dataUrl || value.src || value.url || '');
    source = String(source || '').trim();
    if (!source) return '';
    if (source.indexOf('data:image/') === 0 ||
        /^https?:\/\//.test(source) || source.charAt(0) === '/') return source;
    if (value && typeof value === 'object' && value.mime &&
        /^image\//.test(value.mime) && /^[A-Za-z0-9+/=\s]+$/.test(source)) {
      return 'data:' + value.mime + ';base64,' + source.replace(/\s+/g, '');
    }
    return '';
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
    var image = quizImageSource(source.image || source.imageUrl ||
      source.image_url || source.imageData || source.image_data ||
      source.photo || source.attachment);
    if (image) mapped.image = image;
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
      captureGuide(session);
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

  /* The server owns which question is current. A launch or a Next transition
     replaces the local preview bank with the role-safe session payload and then
     renders that exact question; it never pushes it to the board. */
  function syncQuizFromServer(session) {
    captureGuide(session);
    var quiz = session && session.quiz;
    var source = quiz && quiz.questions;
    if (!Array.isArray(source) || !source.length) return false;
    questions = source.map(mapQuizQuestion);
    baseQuestions = questions.map(function (question) {
      return Object.assign({}, question, { options: question.options.slice() });
    });
    var index = questions.findIndex(function (question) {
      return question.id === quiz.currentQuestionId;
    });
    quizState.index = Math.max(0, index);
    renderQuiz();
    return true;
  }

  function syncLaunchWithServer() {
    if (!sessionId || !hasApiAccess()) return Promise.resolve(false);
    if (isTrainer) {
      return apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/launch', {
        method: 'POST'
      }).then(function (data) {
        return syncQuizFromServer(data && data.session);
      }).catch(function () { return false; });
    }
    if (studentView) {
      return apiRequest('/student/sessions/' + encodeURIComponent(sessionId))
        .then(function (data) {
          return syncQuizFromServer(data && data.session);
        })
        .catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function isRequiredQuestion(item) {
    return Boolean(item && item.requiresCorrectAnswer === true);
  }

  /* Progression stays locked until the server confirms a correct attempt for
     that specific question. The trainer override is the only other exit. */
  function syncPracticeControls(item) {
    var required = isRequiredQuestion(item || currentQuizItem());
    var blocked = required && quizState.parallelSolved !== true;
    /* The dev-fixture section rule mirrors server gating: the next section is
       locked until the required number of correct answers is reached. */
    var sectionLocked = Boolean(guideState.guide) && !guideState.sectionComplete;

    if (quizPracticeBadge) quizPracticeBadge.hidden = !required;
    if (quizSkip) quizSkip.disabled = !isAnswerable() || quizState.answered || blocked;
    if (quizActionSkip) quizActionSkip.disabled = !quizLive() || !isAnswerable() ||
      quizState.answered || blocked;
    if (quizNext) {
      quizNext.disabled = studentView || quizState.phase === 'complete' || blocked || sectionLocked;
      quizNext.title = sectionLocked
        ? 'Next section is locked until the required correct answers are recorded.'
        : '';
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
    /* Explain on board stays available after a wrong answer: a trainer can
       push this exact stem/image for explanation without releasing the key. */
    if (quizPushBoard) quizPushBoard.disabled = !quizLive() || !currentQuizItem();
    if (quizRetest) {
      quizRetest.disabled = studentView || !quizLive() || !currentQuizItem() ||
        quizState.phase === 'complete';
      quizRetest.title = 'Generate a fresh AI check for this concept and replace the failed question';
    }
    if (quizNewCheck) {
      quizNewCheck.disabled = !quizLive() || quizState.phase === 'complete';
    }
    if (quizSubmit) {
      quizSubmit.disabled = !answerable || typeof quizState.chosen !== 'number';
    }
  }

  function setQuizPhase(phase) {
    quizState.phase = phase;
    document.body.classList.toggle('quiz-reteach', phase === 'reteach');
    if (quizPhaseLabel) quizPhaseLabel.textContent = phaseLabels[phase] || 'Assessment · quiz live';

    var locked = !isAnswerable() || quizState.answered;
    if (quizHint) quizHint.disabled = locked;
    if (quizReveal) quizReveal.disabled = studentView || phase === 'complete';
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

  /* ------------------------------------------------ quiz scratch + mirror */
  function canQuizSketch() {
    return studentView && quizSketchPermission.studentCanSketch === true &&
      quizLive() && isAnswerable();
  }

  function quizStrokeId() {
    return 'qsk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function quizCanvasSurface(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx: ctx, rect: rect };
  }

  function drawQuizStroke(ctx, stroke, rect) {
    if (!ctx || !stroke || !Array.isArray(stroke.points) || !stroke.points.length) return;
    var points = stroke.points.filter(function (point) {
      return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
    });
    if (!points.length) return;
    ctx.save();
    ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.28 : 1;
    ctx.strokeStyle = QUIZ_SKETCH_COLORS[stroke.color] || QUIZ_SKETCH_COLORS.ink;
    ctx.lineWidth = stroke.tool === 'highlighter' ? 17 : 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = Math.min(1, Math.max(0, point[0])) * rect.width;
      var y = Math.min(1, Math.max(0, point[1])) * rect.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (points.length === 1) {
      ctx.lineTo(points[0][0] * rect.width + 0.01, points[0][1] * rect.height + 0.01);
    }
    ctx.stroke();
    ctx.restore();
  }

  function paintQuizSketchCanvases() {
    var studentSurface = quizCanvasSurface(quizSketchCanvas);
    var studentStrokes = quizSketchActive
      ? quizSketchStrokes.concat([quizSketchActive.stroke])
      : quizSketchStrokes;
    if (studentSurface) {
      studentStrokes.forEach(function (stroke) {
        drawQuizStroke(studentSurface.ctx, stroke, studentSurface.rect);
      });
    }
    var mirrorSurface = quizCanvasSurface(quizMirrorCanvas);
    if (mirrorSurface) {
      quizMirrorStrokes.forEach(function (stroke) {
        drawQuizStroke(mirrorSurface.ctx, stroke, mirrorSurface.rect);
      });
    }
  }

  function quizPointFromEvent(event) {
    if (!quizSketchCanvas) return null;
    var rect = quizSketchCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    ];
  }

  function publishQuizSketch(action) {
    var item = currentQuizItem();
    var client = classroomApi();
    if (!studentView || !sessionId || !item || !hasApiAccess() ||
        !client || typeof client.saveQuizSketch !== 'function') return;
    client.saveQuizSketch(sessionId, Object.assign({ questionId: item.id }, action))
      .catch(function () {
        toast('Sketch sync was unavailable. Your answer is still saved.');
      });
  }

  function upsertQuizStroke(list, stroke) {
    if (!stroke || typeof stroke.id !== 'string') return;
    var index = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === stroke.id) { index = i; break; }
    }
    var clean = {
      id: stroke.id,
      tool: stroke.tool === 'highlighter' ? 'highlighter' : 'pen',
      color: QUIZ_SKETCH_COLORS[stroke.color] ? stroke.color : 'ink',
      weight: 'normal',
      points: Array.isArray(stroke.points) ? stroke.points.slice(0, 2000) : []
    };
    if (index >= 0) list[index] = clean;
    else list.push(clean);
  }

  function applyQuizSketchEvent(payload) {
    if (!payload || typeof payload !== 'object') return;
    var item = currentQuizItem();
    if (!item || payload.questionId !== item.id) return;
    if (payload.action === 'clear') {
      quizSketchStrokes = [];
      quizMirrorStrokes = [];
      paintQuizSketchCanvases();
      return;
    }
    if (payload.action === 'erase' && Array.isArray(payload.strokeIds)) {
      var ids = payload.strokeIds.filter(function (id) { return typeof id === 'string'; });
      quizSketchStrokes = quizSketchStrokes.filter(function (stroke) {
        return ids.indexOf(stroke.id) === -1;
      });
      quizMirrorStrokes = quizMirrorStrokes.filter(function (stroke) {
        return ids.indexOf(stroke.id) === -1;
      });
      paintQuizSketchCanvases();
      return;
    }
    if (payload.action === 'stroke' && payload.stroke) {
      upsertQuizStroke(quizSketchStrokes, payload.stroke);
      upsertQuizStroke(quizMirrorStrokes, payload.stroke);
      paintQuizSketchCanvases();
    }
  }

  function applyQuizSketchPermission(value) {
    if (!value || typeof value !== 'object') return;
    var incoming = Math.max(0, Number(value.version) || 0);
    var current = Math.max(0, Number(quizSketchPermission.version) || 0);
    if (incoming && incoming < current) return;
    quizSketchPermission = {
      studentCanSketch: value.studentCanSketch !== false,
      version: incoming || current
    };
    var enabled = studentView && quizSketchPermission.studentCanSketch === true;
    if (quizSketchSurface) quizSketchSurface.classList.toggle('is-sketch-disabled', !enabled);
    if (quizSketchTools) quizSketchTools.classList.toggle('is-disabled', !enabled);
    $$('button', quizSketchTools).forEach(function (button) {
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', String(!enabled));
    });
    if (quizSketchState) {
      quizSketchState.textContent = enabled
        ? 'Ready'
        : (studentView ? 'Paused by trainer' : 'Student tools');
    }
    if (!enabled) {
      quizSketchActive = null;
      paintQuizSketchCanvases();
    }
  }

  function setQuizSketchTool(next) {
    if (['pen', 'highlighter', 'eraser'].indexOf(next) === -1) return;
    if (!canQuizSketch()) return;
    quizSketchTool = next;
    $$('[data-quiz-tool]', quizSketchTools).forEach(function (button) {
      var active = button.getAttribute('data-quiz-tool') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setQuizSketchColor(next) {
    if (!QUIZ_SKETCH_COLORS[next]) return;
    if (!canQuizSketch()) return;
    quizSketchColor = next;
    if (quizSketchTool === 'eraser') setQuizSketchTool('pen');
    $$('[data-quiz-color]', quizSketchTools).forEach(function (button) {
      var active = button.getAttribute('data-quiz-color') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function clearQuizSketch() {
    if (!canQuizSketch()) return;
    quizSketchStrokes = [];
    quizMirrorStrokes = [];
    quizSketchActive = null;
    paintQuizSketchCanvases();
    publishQuizSketch({ action: 'clear' });
  }

  function eraseQuizSketchAt(point) {
    if (!point || !canQuizSketch()) return;
    var found = '';
    for (var i = quizSketchStrokes.length - 1; i >= 0; i -= 1) {
      var points = quizSketchStrokes[i].points || [];
      var hit = points.some(function (candidate) {
        var dx = candidate[0] - point[0];
        var dy = candidate[1] - point[1];
        return Math.sqrt(dx * dx + dy * dy) < 0.045;
      });
      if (hit) { found = quizSketchStrokes[i].id; break; }
    }
    if (!found) return;
    quizSketchStrokes = quizSketchStrokes.filter(function (stroke) { return stroke.id !== found; });
    quizMirrorStrokes = quizMirrorStrokes.filter(function (stroke) { return stroke.id !== found; });
    paintQuizSketchCanvases();
    publishQuizSketch({ action: 'erase', strokeIds: [found] });
  }

  function bindQuizSketch() {
    if (quizSketchTools) {
      quizSketchTools.addEventListener('click', function (event) {
        var button = event.target && event.target.closest
          ? event.target.closest('button') : null;
        if (!button || button.disabled || !quizSketchTools.contains(button)) return;
        if (button.hasAttribute('data-quiz-tool')) {
          setQuizSketchTool(button.getAttribute('data-quiz-tool'));
        } else if (button.hasAttribute('data-quiz-color')) {
          setQuizSketchColor(button.getAttribute('data-quiz-color'));
        } else if (button === quizSketchClear) {
          clearQuizSketch();
        }
      });
    }
    if (quizSketchCanvas) {
      quizSketchCanvas.addEventListener('pointerdown', function (event) {
        if (!canQuizSketch()) return;
        event.preventDefault();
        var point = quizPointFromEvent(event);
        if (!point) return;
        if (quizSketchTool === 'eraser') {
          eraseQuizSketchAt(point);
          return;
        }
        quizSketchActive = {
          pointerId: event.pointerId,
          stroke: {
            id: quizStrokeId(),
            tool: quizSketchTool === 'highlighter' ? 'highlighter' : 'pen',
            color: quizSketchColor,
            weight: 'normal',
            points: [point]
          }
        };
        try { quizSketchCanvas.setPointerCapture(event.pointerId); } catch (error) {}
        paintQuizSketchCanvases();
      });
      quizSketchCanvas.addEventListener('pointermove', function (event) {
        if (!quizSketchActive || event.pointerId !== quizSketchActive.pointerId) return;
        event.preventDefault();
        var point = quizPointFromEvent(event);
        if (!point) return;
        var points = quizSketchActive.stroke.points;
        var last = points[points.length - 1];
        var dx = point[0] - last[0];
        var dy = point[1] - last[1];
        if (Math.sqrt(dx * dx + dy * dy) < 0.004) return;
        points.push(point);
        paintQuizSketchCanvases();
      });
      function finishQuizStroke(event) {
        if (!quizSketchActive || (event && event.pointerId !== quizSketchActive.pointerId)) return;
        var stroke = quizSketchActive.stroke;
        quizSketchActive = null;
        try { quizSketchCanvas.releasePointerCapture(event.pointerId); } catch (error) {}
        if (stroke.points.length === 1) {
          stroke.points.push([
            Math.min(1, stroke.points[0][0] + 0.002),
            Math.min(1, stroke.points[0][1] + 0.002)
          ]);
        }
        upsertQuizStroke(quizSketchStrokes, stroke);
        upsertQuizStroke(quizMirrorStrokes, stroke);
        paintQuizSketchCanvases();
        publishQuizSketch({ action: 'stroke', strokeId: stroke.id, stroke: stroke });
      }
      quizSketchCanvas.addEventListener('pointerup', finishQuizStroke);
      quizSketchCanvas.addEventListener('pointercancel', finishQuizStroke);
    }
    window.addEventListener('resize', function () {
      window.requestAnimationFrame(paintQuizSketchCanvases);
    });
  }

  function renderQuizMirror(item) {
    if (quizMirrorQuestion) quizMirrorQuestion.textContent = item.q || '';
    if (quizMirrorImage) {
      var imageSrc = quizImageSource(item.image);
      quizMirrorImage.hidden = !imageSrc;
      if (imageSrc && quizMirrorImage.getAttribute('src') !== imageSrc) {
        quizMirrorImage.src = imageSrc;
      }
      quizMirrorImage.alt = imageSrc ? 'Question image' : '';
    }
    if (quizMirrorOptions) {
      quizMirrorOptions.innerHTML = '';
      (item.options || []).forEach(function (option, i) {
        var row = document.createElement('div');
        row.className = 'mirror-opt';
        row.setAttribute('data-mirror-opt', String(i));
        var letter = document.createElement('span');
        letter.className = 'opt-letter';
        letter.textContent = 'ABCD'.charAt(i);
        var text = document.createElement('span');
        text.textContent = option;
        row.appendChild(letter);
        row.appendChild(text);
        quizMirrorOptions.appendChild(row);
      });
    }
    paintMirrorSelection(null);
  }

  function paintMirrorSelection(index) {
    if (!quizMirrorOptions) return;
    var valid = Number.isInteger(index);
    $$('[data-mirror-opt]', quizMirrorOptions).forEach(function (row, i) {
      row.classList.toggle('is-picked', valid && i === index);
      row.setAttribute('aria-pressed', String(valid && i === index));
    });
    if (quizMirrorState) {
      quizMirrorState.textContent = valid
        ? 'Selected option ' + 'ABCD'.charAt(index) + ' · feedback pending.'
        : 'Waiting for a choice.';
    }
  }

  function paintSelectedOption(index, announce) {
    if (!Number.isInteger(index)) return;
    quizState.chosen = index;
    $$('button', quizOptions).forEach(function (option, i) {
      option.classList.toggle('is-picked', i === index);
      option.setAttribute('aria-pressed', String(i === index));
    });
    paintMirrorSelection(index);
    if (announce !== false) {
      setFeedback('Option ' + 'ABCD'.charAt(index) + ' selected. Submit to save.', '');
      setAnswerState(studentLabel() + ' has not submitted yet.');
    }
    setTrainerActions();
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
    quizSketchStrokes = [];
    quizMirrorStrokes = [];
    quizSketchActive = null;
    if (quizStudentName) quizStudentName.textContent = studentLabel();

    if (quizQuestion) quizQuestion.textContent = item.q;
    if (quizQuestionImage) {
      var imageSrc = quizImageSource(item.image);
      quizQuestionImage.hidden = !imageSrc;
      if (imageSrc && quizQuestionImage.getAttribute('src') !== imageSrc) {
        quizQuestionImage.src = imageSrc;
      }
      quizQuestionImage.alt = imageSrc ? 'Question image' : '';
    }
    renderQuizMirror(item);
    applyQuizSketchPermission(quizSketchPermission);
    window.requestAnimationFrame(paintQuizSketchCanvases);

    if (isRequiredQuestion(item)) {
      setFeedback("Practice question · let's work through it together. You cannot skip this one.", '');
    } else {
      setFeedback(item.recheck
        ? 'New check · choose one answer, then submit.'
        : 'Choose one answer, then submit.', '');
    }
    setAnswerState('Waiting for ' + studentLabel() + '’s answer.');
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
        btn.setAttribute('aria-pressed', 'false');
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
        /* Selection is not submission. The server receives an attempt only
           after the student presses Submit. */
        btn.addEventListener('click', function () { selectQuizOption(btn, item); });
        quizOptions.appendChild(btn);
      });
    }

    setQuizPhase(item.recheck ? 'recheck' : 'answering');
    updateReadiness();
  }

  function selectQuizOption(btn, item) {
    if (!btn || !isAnswerable() || quizState.answered) return;
    var chosen = Number(btn.getAttribute('data-opt'));
    if (!Number.isInteger(chosen)) return;
    paintSelectedOption(chosen, true);

    /* Selection is still not submission. The server mirrors only the option
       index so the trainer's paired popup can show the choice live; no attempt
       is created and no correctness field exists on this channel. */
    if (studentView && sessionId && hasApiAccess() && item && item.id) {
      var client = classroomApi();
      if (client && typeof client.selectQuizOption === 'function') {
        client.selectQuizOption(sessionId, item.id, chosen).catch(function () {});
      }
    }
  }

  function submitQuizAnswer() {
    if (!quizLive() || !isAnswerable() || quizState.answered ||
        typeof quizState.chosen !== 'number') return;
    var item = currentQuizItem();
    if (!item) return;
    var chosen = quizState.chosen;

    quizState.answered = true;
    quizState.seen += 1;
    /* Students never score locally. Correctness is released by the server after
       the trainer reveals; only the authenticated trainer view may pre-score. */
    if (isTrainer && typeof item.answer === 'number' && chosen === item.answer) {
      quizState.correct += 1;
    }

    lockOptions(false);
    setFeedback('Answer submitted. Your trainer will reveal feedback.', 'is-waiting');
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
        refreshGuide();
      }).catch(function (error) {
        setFeedback('Answer could not be saved: ' + error.message, 'is-wrong');
      });
    }
  }

  /* QA hook: one call selects an option and submits it, matching the two-step
     surface without letting a click alone save an attempt. */
  function answerQuiz(btn, item) {
    selectQuizOption(btn, item || currentQuizItem());
    submitQuizAnswer();
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
      refreshGuide();
      publishQuizEvent('quiz.answer.revealed', { questionIds: [item.id] });
      return;
    }

    var client = api.api || window.mathifyClassroomApi;
    var task = client && typeof client.revealQuestion === 'function'
      ? client.revealQuestion(sessionId, item.id)
      : apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/reveal', {
        method: 'POST', body: { questionId: item.id }
      });

    task.then(function () {
      paintReveal();
      refreshGuide();
    }).catch(function (error) {
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

  function installParallelQuestion(next, replace) {
    if (replace === true && questions.length) {
      questions[quizState.index] = next;
    } else {
      questions.push(next);
      quizState.index = questions.length - 1;
    }
    startQuizClock();
    renderQuiz();
    refreshGuide();
  }

  function addLocalRecheckQuestion(replace) {
    toast('AI check unavailable · using the local practice scaffold.');
    var bank = recheckBank;
    var info = api.subject && typeof api.subject === 'function' ? api.subject() : null;
    if (window.mathifySubjectCopy && typeof window.mathifySubjectCopy.recheckFor === 'function') {
      var subjectBank = window.mathifySubjectCopy.recheckFor(info);
      if (subjectBank.length) bank = subjectBank;
    }
    var bankItem = bank[quizState.recheckCount % bank.length];
    quizState.recheckCount += 1;
    installParallelQuestion(Object.assign({}, bankItem, {
      id: 'q_recheck_' + quizState.recheckCount,
      options: bankItem.options.slice(),
      recheck: true,
      requiresCorrectAnswer: true
    }), replace === true);
  }

  /* Retest calls the existing AI endpoint. The server owns generation and the
     replacement; a local hand-written bank is used only when that call fails,
     and is always labelled as a scaffold rather than an AI result. */
  function addRecheckQuestion(options) {
    var settings = options || {};
    var replace = settings.replace === true;
    var failed = currentQuizItem();
    var concept = guideConceptTitle() ||
      (failed && (failed.concept || failed.q)) ||
      (guideState.quiz && guideState.quiz.title) || '';
    if (!sessionId || !hasApiAccess()) {
      addLocalRecheckQuestion(replace);
      return;
    }

    apiRequest('/trainer/sessions/' + encodeURIComponent(sessionId) + '/quiz/new-check', {
      method: 'POST',
      body: {
        questionId: failed && failed.id ? failed.id : undefined,
        concept: concept,
        topicId: guideState.progress && guideState.progress.currentConceptId || undefined,
        replace: replace,
        difficulty: failed && failed.difficultyLevel ? failed.difficultyLevel : 'medium'
      }
    }).then(function (data) {
      var session = (data && data.session) || {};
      var quiz = session.quiz || {};
      var generated = (quiz.questions || []).find(function (question) {
        return question.id === ((data && data.questionId) || quiz.currentQuestionId);
      });
      if (!generated) throw new Error('New check was not returned.');
      captureGuide(session);
      installParallelQuestion(Object.assign(mapQuizQuestion(generated, questions.length), {
        recheck: true,
        requiresCorrectAnswer: true
      }), replace);
      toast(data && data.generationMode === 'ai'
        ? 'Fresh AI retest added for this concept.'
        : 'Retest added · AI generation was unavailable (labelled fallback).');
    }).catch(function (error) {
      toast('AI check unavailable (' + error.message + '). Using local scaffold.');
      addLocalRecheckQuestion(replace);
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
     practice lives in the IDE/check endpoints, so the shared quiz does not open
     there. English uses the server-provided reading/communication questions —
     there is no invented client bank whose id the server would reject. Maths
     keeps the existing static bank. */
  function subjectQuizPreflight() {
    var info = api.subject && typeof api.subject === 'function' ? api.subject() : null;
    if (!info || info.subject === 'math' || info.subject === 'english') return true;
    if (info.subject === 'coding') {
      if (window.classroomCoding && typeof window.classroomCoding.launchQuizChallenge === 'function') {
        window.classroomCoding.launchQuizChallenge();
      }
      return false;
    }
    return true;
  }

  /* Exactly one workspace owns the stage: the whiteboard for maths, the IDE for
     coding, the communication workspace for English. A quiz temporarily hides
     whichever one is active, and exit restores it from server-owned subject. */
  function subjectStageVisibility() {
    var info = api.subject && typeof api.subject === 'function' ? api.subject() : null;
    var subject = info && info.subject;
    var coding = document.getElementById('codingStage');
    var english = document.getElementById('englishStage');
    [coding, english].forEach(function (panel) {
      if (!panel) return;
      panel.hidden = subject !== (panel === coding ? 'coding' : 'english');
      if (panel.hidden) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
    });
    if (board) {
      board.hidden = subject !== 'math';
      if (board.hidden) board.setAttribute('aria-hidden', 'true');
      else board.removeAttribute('aria-hidden');
    }
  }

  function launchQuiz() {
    if (!quizStage || document.body.classList.contains('quiz-live')) return false;
    if (!subjectQuizPreflight()) return false;
    setNotes(false);
    closeSheet();
    initRealtime();
    document.body.classList.add('quiz-live');
    reaffirmCallMedia();
    if (board) {
      board.hidden = true;
      board.setAttribute('aria-hidden', 'true');
    }
    [document.getElementById('codingStage'), document.getElementById('englishStage')]
      .forEach(function (panel) {
        if (!panel) return;
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      });
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
    quizState.recheckCount = 0;
    renderQuiz();
    startQuizClock();
    startQuestionSync();
    syncLaunchWithServer();
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
    if (realtimeLink) {
      realtimeLink.close();
      realtimeLink = null;
    }
    subjectStageVisibility();
    var backLabel = 'board';
    var info = api.subject && typeof api.subject === 'function' ? api.subject() : null;
    if (info && info.subject === 'coding') backLabel = 'editor';
    else if (info && info.subject === 'english') backLabel = 'workspace';
    toast('Back to the ' + backLabel + ' · quiz responses saved.');
  }

  quizLaunch && quizLaunch.addEventListener('click', launchQuiz);
  quizExit && quizExit.addEventListener('click', exitQuiz);
  quizReveal && quizReveal.addEventListener('click', revealQuizAnswer);
  quizPushBoard && quizPushBoard.addEventListener('click', pushQuizQuestionToBoard);
  quizRetest && quizRetest.addEventListener('click', function () {
    if (studentView || quizState.phase === 'complete') return;
    addRecheckQuestion({ replace: true });
  });
  quizNewCheck && quizNewCheck.addEventListener('click', function () {
    if (studentView || quizState.phase === 'complete') return;
    addRecheckQuestion();
  });
  quizSubmit && quizSubmit.addEventListener('click', submitQuizAnswer);

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

  function applyQuizAdvance(data) {
    var quiz = data && data.session && data.session.quiz;
    if (!quiz) {
      finishAdvance();
      return;
    }
    if (quiz.status === 'ended' || quiz.phase === 'complete') {
      completeQuiz();
      return;
    }
    var index = questions.findIndex(function (question) {
      return question.id === quiz.currentQuestionId;
    });
    if (index < 0) {
      finishAdvance();
      return;
    }
    quizState.index = index;
    renderQuiz();
    startQuizClock();
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
    }).then(applyQuizAdvance).catch(function (error) {
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
    captureGuide(data && data.session);
    var quiz = data && data.session && data.session.quiz;
    if (!quiz || !quiz.currentQuestionId) return;

    var found = (quiz.questions || []).find(function (question) {
      return question.id === quiz.currentQuestionId;
    });
    if (!found) return;

    /* mapQuizQuestion never copies answer or explanation for a student view.
       Replace the matching entry instead of appending a duplicate card. */
    var existing = questions.findIndex(function (question) { return question.id === found.id; });
    var mapped = mapQuizQuestion(found, existing >= 0 ? existing : questions.length);
    if (existing >= 0) questions[existing] = mapped;
    else questions.push(mapped);

    var nextIndex = existing >= 0 ? existing : questions.length - 1;
    var changed = nextIndex !== quizState.index;
    if (changed) {
      quizState.index = nextIndex;
      startQuizClock();
      renderQuiz();
      toast('New practice question ready.');
    } else {
      var same = currentQuizItem();
      if (same) same.hint = mapped.hint;
    }

    /* A reload or a late event can land after the student already submitted.
       Restore only their own saved choice; no correctness travels with it. */
    var saved = (quiz.attempts || []).find(function (attempt) {
      return attempt && attempt.questionId === found.id &&
        Number.isInteger(Number(attempt.optionIndex));
    });
    if (saved && !quizState.answered) {
      quizState.attemptId = saved.id || null;
      quizState.chosen = Number(saved.optionIndex);
      quizState.answered = true;
      quizState.seen += 1;
      $$('button', quizOptions).forEach(function (option, i) {
        option.classList.toggle('is-picked', i === quizState.chosen);
        option.setAttribute('aria-pressed', String(i === quizState.chosen));
      });
      lockOptions(false);
      setQuizPhase('awaiting_reveal');
      setFeedback('Answer saved. Your trainer will reveal feedback.', 'is-waiting');
    }

    var granted = typeof mapped.hint === 'string' ? mapped.hint.trim() : '';
    if (granted && !quizState.answered) setFeedback('Hint: ' + granted, '');

    var revealed = (quiz.revealedQuestionIds || []).indexOf(found.id) !== -1;
    if (revealed && !quizState.revealed) {
      applyRevealEvent({ payload: { questionIds: [found.id] } });
    }
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
    if (event.event === 'quiz.launched') {
      /* The server launch is authoritative. Without this branch a student tab
         would keep showing the board and would not suppress celebrations. */
      if (studentView) {
        if (!quizLive()) launchQuiz();
        syncStudentQuestion();
      }
      refreshGuide();
    } else if (event.event === 'quiz.answer.revealed') {
      applyRevealEvent(event);
      refreshGuide();
    } else if ((event.event === 'quiz.completed' || event.event === 'quiz.ended') && quizLive()) {
      completeQuiz();
      refreshGuide();
      if (event.event === 'quiz.completed') toast('Quiz complete.');
      else toast('Quiz ended with the class.');
    } else if (event.event === 'quiz.reteach.started' && studentView && quizLive()) {
      setFeedback('Your trainer is preparing a new check.', 'is-waiting');
      refreshGuide();
    } else if (event.event === 'quiz.question.changed' || event.event === 'quiz.check.added') {
      if (studentView) startQuestionSync();
      refreshGuide();
    } else if (event.event === 'quiz.assistance.granted' && studentView) {
      /* The event carries no hint text. Fetch the granted hint from the safe state. */
      syncStudentQuestion();
      refreshGuide();
    } else if ((event.event === 'quiz.option.selected' ||
                event.event === 'quiz.answer.saved') && isTrainer && quizLive()) {
      var mirror = event.payload || {};
      var item = currentQuizItem();
      var optionIndex = Number(mirror.optionIndex);
      if (item && mirror.questionId === item.id && Number.isInteger(optionIndex) &&
          optionIndex >= 0 && optionIndex < (item.options || []).length) {
        paintMirrorSelection(optionIndex);
        setAnswerState(studentLabel() + ' chose ' + 'ABCD'.charAt(optionIndex) +
          '. Trainer feedback is pending.');
      }
    } else if (event.event === 'quiz.sketch.changed' && quizLive()) {
      applyQuizSketchEvent(event.payload || {});
    } else if (event.event === 'sketch.permission.changed') {
      if (api.applySketchPermission) api.applySketchPermission(event.payload || {});
      applyQuizSketchPermission(event.payload || {});
      if (studentView) {
        toast(event.payload && event.payload.studentCanSketch === false
          ? 'Your trainer paused the quiz sketch tools.'
          : 'Your trainer restored the quiz sketch tools.');
      }
    } else if (event.event === 'board.shared') {
      var boardShared = Boolean(event.payload && event.payload.shared);
      if (isTrainer) setFrontBoardShareState(boardShared);
      if (studentView) {
        toast(boardShared ? 'Your trainer shared the board with you.' : 'Board sharing stopped.');
      }
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
    } else if (event.event === 'session.warning') {
      /* Staff-only server event: the browser only paints and plays the cue. */
      if (api.showSessionWarning) api.showSessionWarning(event.payload || {}, true);
    } else if (event.event === 'participant.joined' || event.event === 'participant.left') {
      var joining = event.event === 'participant.joined';
      if (window.MathifySessionAlerts) {
        window.MathifySessionAlerts.ping(joining ? 'join' : 'leave');
      }
      var who = (event.payload && event.payload.role) === 'student' ? 'Student' : 'Trainer';
      toast(who + (joining ? ' joined the room.' : ' left the room.'));
    } else if (event.event === 'session.ended') {
      document.body.classList.add('is-ended');
      var word = $('#liveWord');
      var button = $('#endBtn');
      if (word) word.textContent = 'Ended';
      if (button) { button.disabled = true; button.textContent = 'Ended'; }
      if (api.clearSessionWarning) api.clearSessionWarning();
      if (event.payload && event.payload.reason === 'auto_close') {
        toast('Session closed automatically at the scheduled end time.');
      }
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
      onEvent: handleSessionEvent,
      onStatus: function (status) {
        if (status === 'live' && studentView) toast('Live session events connected.');
      }
    });
  }

  function quizLive() {
    return document.body.classList.contains('quiz-live');
  }

  function setDoubtMenu(open) {
    if (!doubtMenu) return;
    doubtMenu.hidden = !open;
    if (quizDoubtBtn) quizDoubtBtn.setAttribute('aria-expanded', String(open));
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

  document.addEventListener('click', function (event) {
    if (!doubtMenu || doubtMenu.hidden) return;
    if (event.target.closest('.doubt-dropdown')) return;
    setDoubtMenu(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (trainerPanel && !trainerPanel.hidden) setNotes(false);
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

  /* The visible header is intentionally hidden so the deck contains only the
     two video feeds. The whole deck is therefore the drag surface. */
  var pipDragTarget = pip || pipHead;
  if (pipDragTarget && pip) {
    pipDragTarget.addEventListener('pointerdown', function (event) {
      if (event.target.closest && event.target.closest('button')) return;
      event.preventDefault();
      var rect = pip.getBoundingClientRect();
      pipDrag = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top
      };
      pip.classList.add('is-dragging');
      try { pipDragTarget.setPointerCapture(event.pointerId); } catch (e) {}
    });

    pipDragTarget.addEventListener('pointermove', function (event) {
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
      if (event) { try { pipDragTarget.releasePointerCapture(event.pointerId); } catch (e) {} }
    }
    pipDragTarget.addEventListener('pointerup', stopPipDrag);
    pipDragTarget.addEventListener('pointercancel', stopPipDrag);
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

  /* A reload must not lose the live choice or hand a revoked child fresh tools.
     The server state is authoritative; the shared event stream only updates it. */
  function restoreQuizMirrorState() {
    var client = classroomApi();
    if (!sessionId || !client || typeof client.getSessionState !== 'function') {
      return Promise.resolve(false);
    }
    return client.getSessionState(sessionId).then(function (state) {
      if (!state) return false;
      applyQuizSketchPermission(state.sketchPermissions);
      var live = state.liveQuizSelection;
      var item = currentQuizItem();
      var index = Number(live && live.optionIndex);
      if (live && item && live.questionId === item.id && Number.isInteger(index) &&
          index >= 0 && index < (item.options || []).length) {
        if (studentView) paintSelectedOption(index, false);
        else paintMirrorSelection(index);
      }
      return true;
    }).catch(function () { return false; });
  }

  /* ------------------------------------------------------------------ init */
  var roleReady = syncViewerRoleFromState().then(function () {
    applyQuizSketchPermission(api.sketchPermission ? api.sketchPermission() : null);
    bindQuizSketch();
    return true;
  });
  var quizReady = roleReady.then(function () {
    if (isTrainer) loadTrainerSession();
    return loadQuizQuestions();
  }).then(function () {
    if (document.body.classList.contains('quiz-live')) renderQuiz();
    return restoreQuizMirrorState();
  }).then(function () { return true; });
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
        if (!studentView && (quizQA === 'reteach' || quizQA === 'recheck')) {
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

  consumePlannerQuestion();

  if (sessionId && (isTrainer || studentView)) {
    sendPresence(false);
    presenceInterval = window.setInterval(function () { sendPresence(false); }, 20000);
    /* A whiteboard → camera hand-off is still the same meeting. Skip the
       leaving beacon on that navigation so the server keeps the clock and
       recording alive until End session is clicked. A bfcache restore clears
       the flag, so any later real exit still finalizes presence. */
    window.addEventListener('pagehide', function () {
      if (window.MATHIFY_STAY_PRESENT === true) return;
      sendPresence(true);
    });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) window.MATHIFY_STAY_PRESENT = false;
    });
    /* Media control, connection and reward events must reach a participant
       even when no quiz is running. Open the safe event channel on load. */
    initRealtime();
  }

  /* Expose quiz controls for QA and future real-time wiring. */
  api.openQuiz = launchQuiz;
  api.isTrainer = function () { return isTrainer; };
  api.sendPresence = sendPresence;
  api.backToCamera = backToCamera;
  api.cameraUrl = cameraUrl;
  api.setFrontBoardShareState = setFrontBoardShareState;
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
  api.pushQuizQuestion = pushQuizQuestionToBoard;
  api.selectQuizOption = selectQuizOption;
  api.submitQuizAnswer = submitQuizAnswer;
  /* Kept as a compatibility alias for QA tooling; the visible controls are
     Retest (replace) and New check, and neither freezes the quiz. */
  api.reteachQuiz = addRecheckQuestion;
  api.addRecheckQuestion = addRecheckQuestion;
  api.retestQuiz = function () { return addRecheckQuestion({ replace: true }); };
  api.refreshGuide = refreshGuide;
  api.guideState = guideState;
  api.completeQuiz = completeQuiz;
  api.quizState = quizState;
})();
