/* ==========================================================================
   MATHIFY — coding live workspace (subject = coding only)

   Feature-scoped module. It never owns RTC, LiveKit, the network check,
   engagement, full board, quiz controller, planner, recordings, recap or the
   end-class flow. Subject is read from server state via classroomSession;
   this file cannot switch a session into coding by itself.

   Student-facing surfaces never receive hidden tests. IDE events carry only
   version, opaque ownerId, lock, timestamp and (optionally) code.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var noop = function () {};

  var NOT_LINKED = 'Not linked yet';
  var state = {
    subject: 'math',
    sessionId: null,
    client: null,
    toast: noop,
    isTrainer: false,
    viewerId: null,
    booted: false,
    loadAttempted: false,
    challenge: null,
    activeTab: 'main.js',
    dirty: false,
    quizMode: false,
    runBusy: false,
    syncing: false,
    errorNotified: Object.create(null),
    saveTimer: null,
    ideRefetchQueued: false,
    preserveOnRefetch: false,
    loadGeneration: 0,
    ide: {
      code: '',
      language: 'javascript',
      ownerId: null,
      locked: false,
      version: 0,
      updatedAt: null
    }
  };

  function host() { return window.classroomSession || {}; }

  /* IDE ownership is an opaque id, never contact data. */
  function safeOwner(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    var text = String(value);
    if (text.indexOf('@') >= 0 || /^\+?[\d\s()-]{7,}$/.test(text)) return null;
    return text;
  }

  function readContext() {
    var h = host();
    var params = new URLSearchParams(window.location.search);
    state.sessionId = h.sessionId || window.MATHIFY_SESSION_ID ||
      params.get('session') || params.get('sessionId') || null;
    state.client = h.api || window.mathifyClassroomApi || null;
    state.toast = typeof h.toast === 'function' ? h.toast : noop;
    state.isTrainer = typeof h.isTrainer === 'function' ? h.isTrainer() : state.isTrainer;
    if (state.client && typeof state.client.viewerId === 'function') {
      state.viewerId = state.client.viewerId();
    }
    state.viewerId = safeOwner(state.viewerId) ||
      safeOwner(window.MATHIFY_USER && (window.MATHIFY_USER.id || window.MATHIFY_USER.userId));
  }

  function can(method) {
    return Boolean(state.client && typeof state.client[method] === 'function');
  }

  function setStatus(text, kind) {
    var el = $('#ideSyncStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'subject-sync' + (kind ? ' is-' + kind : '');
  }

  function setControlStatus(text) {
    var el = $('#ideControlStatus');
    if (el) el.textContent = text;
  }

  function notifyOnce(key, text) {
    if (state.errorNotified[key]) return;
    state.errorNotified[key] = true;
    setStatus(text, 'error');
  }

  /* --------------------------------------------------------------- console */
  function consoleLine(text, className) {
    var log = $('#ideConsoleLog');
    if (!log) return;
    var empty = $('.ide-console-empty', log);
    if (empty) empty.remove();
    var line = document.createElement('p');
    line.className = 'ide-console-line' + (className ? ' ' + className : '');
    line.textContent = String(text);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function clearConsole() {
    var log = $('#ideConsoleLog');
    if (!log) return;
    log.textContent = '';
    var empty = document.createElement('p');
    empty.className = 'ide-console-empty';
    empty.textContent = 'No check output yet.';
    log.appendChild(empty);
  }

  /* ----------------------------------------------------------------- editor */
  function editor() { return $('#ideCode'); }

  function renderLines() {
    var field = editor();
    var gutter = $('#ideLines');
    if (!field || !gutter) return;
    var count = Math.max(1, field.value.split('\n').length);
    var labels = [];
    for (var i = 1; i <= count; i += 1) labels.push(String(i));
    gutter.textContent = labels.join('\n');
    gutter.scrollTop = field.scrollTop;
  }

  function setTab(name) {
    state.activeTab = name === 'notes.txt' ? 'notes.txt' : 'main.js';
    $$tab();
  }

  function $$tab() {
    $$ideTabs().forEach(function (tab) {
      var selected = tab.getAttribute('data-ide-tab') === state.activeTab;
      tab.classList.toggle('is-on', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    var main = $('#ideMainPanel');
    var notes = $('#ideNotesPanel');
    if (main) main.hidden = state.activeTab !== 'main.js';
    if (notes) notes.hidden = state.activeTab !== 'notes.txt';
    if (state.activeTab === 'main.js') renderLines();
  }

  function $$ideTabs() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-ide-tab]'));
  }

  function canEdit() {
    if (!state.ide.locked) return true;
    if (!state.ide.ownerId || !state.viewerId) return false;
    return String(state.ide.ownerId) === String(state.viewerId);
  }

  function paintLock() {
    var editable = canEdit();
    var field = editor();
    var notes = $('#ideNotes');
    var note = $('#ideLockNote');
    if (field) field.disabled = !editable;
    if (notes) notes.disabled = !editable;
    if (note) {
      note.hidden = editable;
      note.textContent = state.isTrainer
        ? 'Another participant is editing'
        : 'Trainer is editing';
    }
    var lockBtn = $('#ideLockBtn');
    if (lockBtn) {
      lockBtn.textContent = state.ide.locked ? 'Unlock editor' : 'Lock editor';
      lockBtn.setAttribute('aria-pressed', String(Boolean(state.ide.locked)));
    }
  }

  function paintIde() {
    var field = editor();
    if (field && field.value !== state.ide.code) field.value = state.ide.code;
    var lang = $('#codingLanguageChip');
    if (lang) lang.textContent = state.ide.language || 'javascript';
    renderLines();
    paintLock();
  }

  /* --------------------------------------------------------------- challenge */
  function paintChallenge() {
    var ch = state.challenge;
    var title = $('#codingChallengeTitle');
    var text = $('#codingChallengeText');
    var starter = $('#codingStarter');
    if (title) title.textContent = ch ? ch.title : 'No challenge loaded';
    if (text) {
      text.textContent = ch && ch.prompt
        ? ch.prompt
        : 'Challenge not linked yet · run checks any time, or ask your trainer to set one.';
    }
    if (starter) {
      starter.hidden = !ch || !ch.starterCode;
      starter.textContent = ch ? ch.starterCode : '';
    }
  }

  /* Keep only the browser-safe challenge fields. `tests` is never copied. */
  function applyChallenge(challenge) {
    if (!challenge || typeof challenge !== 'object') return false;
    state.challenge = {
      id: challenge.id || null,
      title: typeof challenge.title === 'string' && challenge.title.trim()
        ? challenge.title.trim() : 'Practice challenge',
      prompt: typeof challenge.prompt === 'string' ? challenge.prompt : '',
      language: typeof challenge.language === 'string' && challenge.language.trim()
        ? challenge.language.trim() : 'javascript',
      starterCode: typeof challenge.starterCode === 'string' ? challenge.starterCode : '',
      testsHidden: true,
      sessionId: challenge.sessionId || state.sessionId
    };
    if (state.challenge.language !== 'javascript') state.ide.language = state.challenge.language;
    paintChallenge();
    var field = editor();
    if (field && !field.value.trim() && state.challenge.starterCode) {
      state.ide.code = state.challenge.starterCode;
      field.value = state.ide.code;
      renderLines();
    }
    return true;
  }

  function challengeUnlinked() {
    notifyOnce('challenge', 'Challenge not linked yet · practice stays local.');
    paintChallenge();
  }

  /* -------------------------------------------------------------- IDE state */
  function applyIdeState(next, options) {
    if (!next || typeof next !== 'object') return false;
    var settings = options || {};
    var incomingVersion = Number(next.version);
    var currentVersion = Number(state.ide.version) || 0;
    if (Number.isFinite(incomingVersion) && incomingVersion < currentVersion) return false;

    /* An empty initial server draft, or an untouched version-0 draft, must
       not wipe a starter challenge already painted into the editor. A pending
       local edit is never dropped by a refetch either. */
    var localDraft = String(state.ide.code || '').trim().length > 0;
    var preserveInitial = settings.initial === true && localDraft && (
      (typeof next.code === 'string' && !next.code.trim()) ||
      (incomingVersion === 0 && Boolean(state.challenge && state.challenge.starterCode))
    );
    var preserveCode = settings.preserveCode === true && state.dirty;
    var takeCode = typeof next.code === 'string' && !preserveInitial && !preserveCode &&
      (settings.initial === true || !state.dirty || incomingVersion > currentVersion);
    state.ide = {
      code: takeCode ? next.code : state.ide.code,
      language: typeof next.language === 'string' && next.language
        ? next.language : state.ide.language,
      ownerId: next.ownerId === null || typeof next.ownerId === 'undefined'
        ? null : next.ownerId,
      locked: next.locked === true,
      version: Number.isFinite(incomingVersion) ? incomingVersion : currentVersion,
      updatedAt: next.updatedAt || null
    };
    paintIde();
    if (!settings.silent) {
      setStatus('IDE synced' + (state.ide.version ? ' · v' + state.ide.version : ''), 'ok');
    }
    return true;
  }

  function fetchIdeState(options) {
    var settings = options || {};
    if (!can('getIdeState') || !state.sessionId) {
      notifyOnce('ide', 'IDE not linked yet · changes stay in this browser.');
      return Promise.resolve(false);
    }
    if (state.syncing) {
      /* A GET is already in flight. Queue one follow-up instead of reporting
         a false "not linked" error for a realtime signal. */
      state.ideRefetchQueued = true;
      if (settings.preserveCode === true || state.dirty) state.preserveOnRefetch = true;
      return Promise.resolve(false);
    }
    state.syncing = true;
    function finish(result) {
      state.syncing = false;
      if (!state.ideRefetchQueued) return result;
      state.ideRefetchQueued = false;
      var preserve = settings.preserveCode === true || state.preserveOnRefetch === true;
      state.preserveOnRefetch = false;
      return fetchIdeState({ silent: true, preserveCode: preserve });
    }
    return state.client.getIdeState(state.sessionId).then(function (ide) {
      return applyIdeState(ide, settings);
    }).catch(function () {
      notifyOnce('ide', 'IDE not linked yet · changes stay in this browser.');
      return false;
    }).then(finish, function (error) {
      state.syncing = false;
      throw error;
    });
  }

  function loadWorkspace(force) {
    if (!force && state.loadAttempted) return;
    state.loadAttempted = true;
    readContext();
    var field = editor();
    if (field && !field.value) {
      field.value = state.ide.code;
      renderLines();
    }
    if (!state.sessionId || !state.client) {
      setStatus('IDE not linked yet · local editor only', 'error');
      consoleLine(NOT_LINKED + ' · code has not been run.');
      return;
    }
    var generation = ++state.loadGeneration;
    var challengeReady = Promise.resolve();
    if (can('getCodeChallenge')) {
      challengeReady = state.client.getCodeChallenge(state.sessionId).then(function (challenge) {
        if (generation !== state.loadGeneration || state.subject !== 'coding') return false;
        return applyChallenge(challenge);
      }).catch(challengeUnlinked);
    } else {
      challengeUnlinked();
    }
    /* Resolve the challenge first, then fetch the IDE draft. A racing IDE
       response must not overwrite a starter draft before it is painted. */
    challengeReady.then(function () {
      if (generation !== state.loadGeneration || state.subject !== 'coding') return false;
      if (can('getIdeState')) {
        return fetchIdeState({ initial: true, preserveCode: state.dirty });
      }
      notifyOnce('ide', 'IDE not linked yet · changes stay in this browser.');
      return false;
    }).catch(noop);
  }

  /* ------------------------------------------------------------------- save */
  function clearPendingSave() {
    if (state.saveTimer !== null) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
  }

  function saveIde(patch, options) {
    var settings = options || {};
    if (!can('saveIdeState') || !state.sessionId) {
      setStatus('Save not linked yet · changes stay in this browser.', 'error');
      if (settings.control) setControlStatus('Save not linked yet · editor state unchanged.');
      return Promise.resolve(false);
    }
    var body = Object.assign({}, patch || {});
    if (settings.control) {
      /* Lock and hand-over are the only requests allowed to carry control
         fields. A pending keystroke autosave is cancelled, not sent as code. */
      clearPendingSave();
      delete body.code;
      delete body.expectedVersion;
      if (body.ownerId !== undefined && body.ownerId !== null) {
        body.ownerId = safeOwner(body.ownerId);
      }
    } else {
      /* An autosave is exactly {code, expectedVersion}: no lock field and no
         owner id, so a student request cannot be rejected as trainer-only. */
      delete body.locked;
      delete body.ownerId;
      if (typeof body.code !== 'string') body.code = state.ide.code;
      body.expectedVersion = Number(state.ide.version) || 0;
    }

    return state.client.saveIdeState(state.sessionId, body).then(function (ide) {
      if (!ide || typeof ide !== 'object') {
        setStatus('Save not linked yet · changes stay in this browser.', 'error');
        if (settings.control) setControlStatus('Editor control not linked yet · state unchanged.');
        return false;
      }
      applyIdeState(ide, { silent: settings.control !== true });
      state.dirty = false;
      if (settings.control) {
        setControlStatus(settings.success || 'Editor state updated.');
      } else {
        setStatus('IDE synced' + (state.ide.version ? ' · v' + state.ide.version : ''), 'ok');
      }
      return true;
    }).catch(function (error) {
      var conflict = Boolean(error && (error.status === 409 || error.code === 'IDE_VERSION_CONFLICT'));
      if (conflict) {
        /* Keep the draft, advance the base version with a refetch, and never
           claim that the save succeeded. */
        setStatus('IDE changed elsewhere · your edits are still pending.', 'error');
        if (settings.control) setControlStatus('IDE changed elsewhere · try again.');
        fetchIdeState({ silent: true, preserveCode: true });
        return false;
      }
      setStatus('Save not linked yet · changes stay in this browser.', 'error');
      if (settings.control) setControlStatus('Editor control not linked yet · state unchanged.');
      return false;
    });
  }

  function queueSave() {
    if (!canEdit()) return;
    state.dirty = true;
    clearPendingSave();
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      var field = editor();
      if (field) state.ide.code = field.value;
      saveIde({ code: state.ide.code, expectedVersion: Number(state.ide.version) || 0 });
    }, 900);
  }

  /* -------------------------------------------------------------- run checks */
  function runChecks() {
    if (state.runBusy) return;
    var field = editor();
    var code = field ? field.value : '';
    if (!code.trim()) {
      consoleLine('Nothing to run yet · add some code first.');
      return;
    }
    state.ide.code = code;
    if (!can('checkCode')) {
      consoleLine('Checks not linked yet · code was not run.');
      setStatus('Checks not linked yet · code was not run.', 'error');
      return;
    }
    state.runBusy = true;
    var button = $('#ideRunBtn');
    if (button) button.disabled = true;
    consoleLine('Running checks…');
    var body = { code: code };
    if (state.challenge && state.challenge.id) body.challengeId = state.challenge.id;
    if (state.sessionId) body.sessionId = state.sessionId;

    state.client.checkCode(body).then(function (data) {
      var results = data && Array.isArray(data.results) ? data.results : [];
      if (!data || typeof data.passed !== 'boolean') {
        consoleLine('Checks not linked yet · code was not run.');
        setStatus('Checks not linked yet · code was not run.', 'error');
        return;
      }
      consoleLine(data.passed ? 'Checks complete · all passed.' : 'Checks complete · try again.');
      results.forEach(function (result) {
        if (!result || typeof result !== 'object') return;
        var line = document.createElement('p');
        line.className = 'ide-result ' + (result.passed ? 'is-pass' : 'is-fail');
        var mark = document.createElement('b');
        mark.textContent = result.passed ? 'PASS' : 'CHECK';
        var detail = document.createElement('span');
        detail.textContent = (result.name || 'check') +
          (result.message ? ' — ' + result.message : '');
        line.appendChild(mark);
        line.appendChild(detail);
        var log = $('#ideConsoleLog');
        if (log) {
          var empty = $('.ide-console-empty', log);
          if (empty) empty.remove();
          log.appendChild(line);
          log.scrollTop = log.scrollHeight;
        }
      });
      setStatus('Checks complete', 'ok');
    }).catch(function () {
      consoleLine('Checks not linked yet · code was not run.');
      setStatus('Checks not linked yet · code was not run.', 'error');
    }).then(function () {
      state.runBusy = false;
      if (button) button.disabled = false;
    });
  }

  /* -------------------------------------------------------- trainer controls */
  function createChallenge(event) {
    event.preventDefault();
    var title = $('#codingChallengeTitleInput');
    var prompt = $('#codingChallengePromptInput');
    var starter = $('#codingStarterInput');
    var tests = $('#codingTestsInput');
    var titleValue = title ? title.value.trim() : '';
    var promptValue = prompt ? prompt.value.trim() : '';
    if (!titleValue || !promptValue) {
      setControlStatus('Add a title and a prompt first.');
      return;
    }
    var testList = [];
    var raw = tests ? tests.value.trim() : '';
    if (raw) {
      try {
        testList = JSON.parse(raw);
        if (!Array.isArray(testList)) throw new Error('not a list');
      } catch (error) {
        setControlStatus('Tests must be a JSON array of {name, code} objects.');
        return;
      }
    }
    if (!testList.length) {
      setControlStatus('Add at least one hidden check before creating a challenge.');
      return;
    }
    if (!can('createCodeChallenge') || !state.sessionId) {
      setControlStatus('Challenge creation not linked yet · no challenge was created.');
      return;
    }
    var button = $('#codingCreateChallenge');
    if (button) button.disabled = true;
    state.client.createCodeChallenge({
      sessionId: state.sessionId,
      title: titleValue,
      prompt: promptValue,
      language: 'javascript',
      starterCode: starter ? starter.value : '',
      tests: testList
    }).then(function (challenge) {
      /* The response is scrubbed by the server. Never render submitted tests. */
      applyChallenge(challenge);
      if (tests) tests.value = '';
      setControlStatus('Challenge ready. Hidden tests stayed on the server.');
      state.toast('Challenge created · hidden tests were not shared.');
    }).catch(function (error) {
      if (error && (error.code === 'TEST_REQUIRED' || error.code === 'INVALID_TEST')) {
        setControlStatus('Add at least one hidden check before creating a challenge.');
      } else {
        setControlStatus('Challenge creation not linked yet · no challenge was created.');
      }
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function toggleLock() {
    var next = !state.ide.locked;
    saveIde({
      locked: next,
      ownerId: state.viewerId || state.ide.ownerId || null
    }, {
      control: true,
      success: next ? 'Editor locked for the student.' : 'Editor unlocked.'
    });
  }

  function handOver() {
    /* `ownerId: null` asks the server to assign the verified session student. */
    saveIde({ locked: false, ownerId: null }, {
      control: true,
      success: 'Control handed over to the student.'
    });
  }

  /* -------------------------------------------------------------- quiz mode */
  function setQuizMode(active) {
    state.quizMode = Boolean(active);
    var exit = $('#codingPracticeExit');
    var label = $('#codingModeLabel');
    if (exit) exit.hidden = !state.quizMode;
    if (label) label.textContent = state.quizMode
      ? 'Practice check · coding' : 'Live IDE · coding';
  }

  function launchQuizChallenge() {
    var info = host().subject && typeof host().subject === 'function'
      ? host().subject() : null;
    if (!info || info.subject !== 'coding') return false;
    readContext();
    var stage = $('#codingStage');
    var board = $('.board');
    if (board) board.hidden = true;
    if (stage) stage.hidden = false;
    document.body.classList.remove('subject-board-open');
    setQuizMode(true);
    state.loadAttempted = false;
    var fresh = editor();
    if (fresh) {
      fresh.value = '';
      state.ide.code = '';
      state.dirty = false;
      renderLines();
    }
    loadWorkspace(true);
    state.toast('Practice check · run your code to see results.');
    var field = editor();
    if (field) setTimeout(function () { field.focus(); }, 40);
    return true;
  }

  function exitQuizChallenge() {
    if (state.subject !== 'coding') return false;
    setQuizMode(false);
    var stage = $('#codingStage');
    var board = $('.board');
    if (stage) stage.hidden = false;
    if (board) board.hidden = true;
    var h = host();
    if (h.fitCanvas) setTimeout(h.fitCanvas, 40);
    return true;
  }

  /* ------------------------------------------------------------------ init */
  function insertAtCursor(text) {
    var field = editor();
    if (!field || field.disabled) return;
    var start = field.selectionStart;
    var end = field.selectionEnd;
    field.value = field.value.slice(0, start) + text + field.value.slice(end);
    field.selectionStart = field.selectionEnd = start + text.length;
    renderLines();
    queueSave();
  }

  function attach() {
    var field = editor();
    if (field) {
      field.addEventListener('input', function () {
        state.ide.code = field.value;
        renderLines();
        queueSave();
      });
      field.addEventListener('scroll', function () {
        var gutter = $('#ideLines');
        if (gutter) gutter.scrollTop = field.scrollTop;
      });
      field.addEventListener('keydown', function (event) {
        if (event.key === 'Tab') {
          event.preventDefault();
          insertAtCursor('  ');
        } else if (event.key === 'Enter') {
          event.preventDefault();
          var before = field.value.slice(0, field.selectionStart);
          var line = before.split('\n').pop();
          var indent = (line.match(/^\s*/) || [''])[0];
          if (/[{([]\s*$/.test(line)) indent += '  ';
          insertAtCursor('\n' + indent);
        }
      });
    }
    $$ideTabs().forEach(function (tab) {
      tab.addEventListener('click', function () { setTab(tab.getAttribute('data-ide-tab')); });
    });
    var notes = $('#ideNotes');
    if (notes) {
      notes.addEventListener('input', function () {
        try {
          if (state.sessionId) {
            window.localStorage.setItem('mathify.coding.notes.' + state.sessionId, notes.value);
          }
        } catch (error) { /* private mode: notes stay in memory */ }
      });
    }
    var run = $('#ideRunBtn');
    if (run) run.addEventListener('click', runChecks);
    var clear = $('#ideConsoleClear');
    if (clear) clear.addEventListener('click', clearConsole);
    var form = $('#codingChallengeForm');
    if (form) form.addEventListener('submit', createChallenge);
    var lock = $('#ideLockBtn');
    if (lock) lock.addEventListener('click', toggleLock);
    var hand = $('#ideHandoverBtn');
    if (hand) hand.addEventListener('click', handOver);
    var exit = $('#codingPracticeExit');
    if (exit) exit.addEventListener('click', exitQuizChallenge);

    var realtime = window.classroomRealtime;
    if (realtime && typeof realtime.onIdeState === 'function') {
      realtime.onIdeState(function (payload) {
        if (state.subject !== 'coding') return;
        if (!payload || typeof payload !== 'object') return;
        if (state.syncing) {
          /* A GET is in flight: queue one refetch rather than painting a stale
             signal or claiming the IDE is not linked. */
          state.ideRefetchQueued = true;
          if (state.dirty) state.preserveOnRefetch = true;
          return;
        }
        if (typeof payload.code === 'string') {
          applyIdeState(payload, { fromEvent: true, preserveCode: state.dirty });
        } else {
          /* The event is a signal only; full code comes from the scoped GET. */
          fetchIdeState({ silent: true, preserveCode: state.dirty });
        }
      });
    }
    window.addEventListener('mathify:subjectchange', function (event) {
      if (event && event.detail) setSubject(event.detail);
    });
  }

  function setSubject(value) {
    var raw = value && typeof value === 'object' ? value.subject : value;
    var key = String(raw || 'math').trim().toLowerCase();
    var next = key === 'coding' ? 'coding' : (key === 'english' ? 'english' : 'math');
    if (next !== state.subject) {
      clearPendingSave();
      state.loadGeneration += 1;
    }
    state.subject = next;
    if (state.subject !== 'coding') {
      setQuizMode(false);
      return state.subject;
    }
    if (!state.booted) {
      state.booted = true;
      readContext();
      attach();
      paintIde();
      paintChallenge();
      var notes = $('#ideNotes');
      if (notes && state.sessionId) {
        try {
          notes.value = window.localStorage.getItem('mathify.coding.notes.' + state.sessionId) || '';
        } catch (error) { /* private mode */ }
      }
    }
    loadWorkspace(false);
    return state.subject;
  }

  /* Subject is never set by a public caller: it only comes from the server
     state delivered through the subjectchange listener. */
  window.classroomCoding = {
    launchQuizChallenge: launchQuizChallenge,
    exitQuizChallenge: exitQuizChallenge,
    applyIdeState: applyIdeState,
    runChecks: runChecks
  };
  setSubject(host().subject && typeof host().subject === 'function' ? host().subject() : null);
})();
