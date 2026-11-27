/* ==========================================================================
   MATHIFY — English communication live workspace (subject = english only)

   Reading, writing, public speaking, listening and vocabulary. No literature
   or grammar framing. Work is scoped to the session child; no contact, KYC,
   bank or private document data is read or sent. The server-selected subject
   is the only way this panel becomes visible.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var noop = function () {};

  var DEFAULT_VOCAB = ['rainwater', 'supply', 'record', 'evidence', 'audience', 'concise'];
  var QUIZ_BANK = [
    {
      id: 'eng_read_1',
      q: 'What is the main idea of the garden passage?',
      options: [
        'A plan to collect and track rainwater for plants',
        'A list of garden tools',
        'A rule about school terms',
        'A story about one rainy Friday'
      ]
    },
    {
      id: 'eng_listen_1',
      q: 'A speaker says both tanks hold 90 litres. What should the group record next?',
      options: [
        'The litres used each week',
        'The colour of the tanks',
        'The name of the principal',
        'The price of the roof'
      ]
    },
    {
      id: 'eng_vocab_1',
      q: 'Which word describes a short explanation that stays on the main point?',
      options: ['Concise', 'Silent', 'Random', 'Lengthy']
    }
  ];

  var state = {
    subject: 'math',
    sessionId: null,
    client: null,
    toast: noop,
    isTrainer: false,
    booted: false,
    loadAttempted: false,
    role: null,
    work: {
      passageNotes: '',
      writing: '',
      speakingPrompt: '',
      responses: []
    },
    responses: [],
    revisions: [],
    customVocab: [],
    timerSeconds: 60,
    timerId: null,
    saveTimer: null,
    dirty: false,
    errorNotified: Object.create(null)
  };

  function host() { return window.classroomSession || {}; }

  function readContext() {
    var h = host();
    var params = new URLSearchParams(window.location.search);
    state.sessionId = h.sessionId || window.MATHIFY_SESSION_ID ||
      params.get('session') || params.get('sessionId') || null;
    state.client = h.api || window.mathifyClassroomApi || null;
    state.toast = typeof h.toast === 'function' ? h.toast : noop;
    state.isTrainer = typeof h.isTrainer === 'function' ? h.isTrainer() : state.isTrainer;
  }

  function can(method) {
    return Boolean(state.client && typeof state.client[method] === 'function');
  }

  function setStatus(text, kind) {
    var el = $('#englishSaveStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'subject-sync' + (kind ? ' is-' + kind : '');
  }

  function notifyOnce(key, text) {
    if (state.errorNotified[key]) return;
    state.errorNotified[key] = true;
    setStatus(text, 'error');
  }

  function storageKey(suffix) {
    return state.sessionId
      ? 'mathify.english.' + suffix + '.' + state.sessionId
      : 'mathify.english.' + suffix;
  }

  function readLocal(suffix) {
    try { return JSON.parse(window.localStorage.getItem(storageKey(suffix)) || '[]'); }
    catch (error) { return []; }
  }

  function writeLocal(suffix, value) {
    try { window.localStorage.setItem(storageKey(suffix), JSON.stringify(value)); }
    catch (error) { /* private mode: keep in memory */ }
  }

  function normalizeResponses(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === 'object') {
      return Object.keys(value).map(function (key) {
        var item = value[key];
        return {
          name: key,
          text: typeof item === 'string' ? item :
            (item && (item.text || item.body || item.feedback) ?
              String(item.text || item.body || item.feedback) : '')
        };
      });
    }
    return [];
  }

  function applyWork(work) {
    if (!work || typeof work !== 'object') return false;
    state.work.passageNotes = typeof work.passageNotes === 'string' ? work.passageNotes : '';
    state.work.writing = typeof work.writing === 'string' ? work.writing : '';
    if (typeof work.speakingPrompt === 'string' && work.speakingPrompt.trim()) {
      state.work.speakingPrompt = work.speakingPrompt;
    }
    state.responses = normalizeResponses(work.responses);
    state.work.responses = state.responses.slice();
    paintFields();
    return true;
  }

  function paintFields() {
    var notes = $('#englishPassageNotes');
    var writing = $('#englishWriting');
    var prompt = $('#englishSpeakingPrompt');
    if (notes && notes.value !== state.work.passageNotes) notes.value = state.work.passageNotes;
    if (writing && writing.value !== state.work.writing) writing.value = state.work.writing;
    if (prompt && prompt.value !== state.work.speakingPrompt) prompt.value = state.work.speakingPrompt;
    paintResponses();
    paintRevisions();
    paintVocab();
  }

  function paintRole() {
    var chip = $('#englishRoleChip');
    if (!chip) return;
    var role = String(state.role || '').toLowerCase();
    chip.textContent = role === 'trainer' || role === 'founder' || state.isTrainer
      ? 'Trainer' : 'Student';
  }

  function paintStrands(strands) {
    var el = $('#englishStrands');
    if (!el) return;
    var list = Array.isArray(strands) ? strands : [];
    el.textContent = list.length
      ? list.slice(0, 4).join(' · ')
      : 'Reading · Writing · Speaking · Vocabulary';
  }

  function loadWorkspace(force) {
    if (!force && state.loadAttempted) return;
    state.loadAttempted = true;
    readContext();
    if (!state.sessionId || !state.client || !can('getEnglishWork')) {
      notifyOnce('work', 'Work not linked yet · local draft only.');
      paintFields();
      return;
    }
    state.client.getEnglishWork(state.sessionId).then(function (data) {
      if (data && data.work) applyWork(data.work);
      state.role = data && data.role ? data.role : null;
      paintRole();
      setStatus('Work loaded', 'ok');
    }).catch(function () {
      notifyOnce('work', 'Work not linked yet · local draft only.');
      paintFields();
    });
  }

  function collectWork() {
    var notes = $('#englishPassageNotes');
    var writing = $('#englishWriting');
    var prompt = $('#englishSpeakingPrompt');
    return {
      passageNotes: notes ? notes.value : state.work.passageNotes,
      writing: writing ? writing.value : state.work.writing,
      speakingPrompt: prompt ? prompt.value : state.work.speakingPrompt,
      responses: state.responses.slice()
    };
  }

  function saveWork() {
    var work = collectWork();
    state.work.passageNotes = work.passageNotes;
    state.work.writing = work.writing;
    state.work.speakingPrompt = work.speakingPrompt;
    if (!can('saveEnglishWork') || !state.sessionId) {
      setStatus('Save not linked yet · work stays in this browser.', 'error');
      return Promise.resolve(false);
    }
    return state.client.saveEnglishWork(state.sessionId, work).then(function (saved) {
      state.dirty = false;
      if (saved && typeof saved === 'object') {
        state.role = saved.role || state.role;
        applyWork(saved);
      }
      paintRole();
      setStatus('Work saved', 'ok');
      return true;
    }).catch(function () {
      setStatus('Save not linked yet · work stays in this browser.', 'error');
      return false;
    });
  }

  function queueSave() {
    state.dirty = true;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveWork, 1000);
  }

  /* -------------------------------------------------------------- revisions */
  function paintRevisions() {
    var list = $('#englishRevisionList');
    if (!list) return;
    list.textContent = '';
    if (!state.revisions.length) {
      var empty = document.createElement('li');
      empty.className = 'english-empty';
      empty.textContent = 'No revisions saved yet.';
      list.appendChild(empty);
      return;
    }
    state.revisions.slice(-8).reverse().forEach(function (revision, index) {
      var li = document.createElement('li');
      var stamp = document.createElement('b');
      stamp.textContent = 'R' + Math.max(1, state.revisions.length - index);
      var text = document.createElement('span');
      text.textContent = String(revision.text || '').slice(0, 90) || '(empty draft)';
      var time = document.createElement('b');
      time.textContent = revision.time || '';
      var restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'mini';
      restore.textContent = 'Restore';
      restore.addEventListener('click', function () {
        var writing = $('#englishWriting');
        if (writing) writing.value = revision.text || '';
        queueSave();
      });
      li.appendChild(stamp);
      li.appendChild(text);
      li.appendChild(time);
      li.appendChild(restore);
      list.appendChild(li);
    });
  }

  function addRevision() {
    var writing = $('#englishWriting');
    var text = writing ? writing.value : state.work.writing;
    var now = new Date();
    state.revisions.push({
      text: text,
      at: now.toISOString(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (state.revisions.length > 30) state.revisions.shift();
    writeLocal('revisions', state.revisions);
    paintRevisions();
    state.toast('Revision saved in this browser.');
  }

  /* --------------------------------------------------------------- vocab */
  function paintVocab() {
    var hostEl = $('#englishVocabChips');
    if (!hostEl) return;
    hostEl.textContent = '';
    DEFAULT_VOCAB.concat(state.customVocab).forEach(function (word) {
      var chip = document.createElement('span');
      chip.className = 'english-chip' + (state.customVocab.indexOf(word) >= 0 ? ' is-custom' : '');
      chip.textContent = word;
      if (state.customVocab.indexOf(word) >= 0) {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + word);
        remove.textContent = '×';
        remove.addEventListener('click', function () {
          state.customVocab = state.customVocab.filter(function (item) { return item !== word; });
          writeLocal('vocab', state.customVocab);
          paintVocab();
        });
        chip.appendChild(remove);
      }
      hostEl.appendChild(chip);
    });
  }

  function addVocab() {
    var input = $('#englishVocabInput');
    var word = input ? input.value.trim().replace(/[<>\n]/g, '') : '';
    if (!word) return;
    if (DEFAULT_VOCAB.indexOf(word) >= 0 || state.customVocab.indexOf(word) >= 0) return;
    state.customVocab.push(word.slice(0, 32));
    writeLocal('vocab', state.customVocab);
    if (input) input.value = '';
    paintVocab();
  }

  /* -------------------------------------------------------------- responses */
  function paintResponses() {
    var list = $('#englishResponseList');
    if (!list) return;
    list.textContent = '';
    if (!state.responses.length) {
      var empty = document.createElement('li');
      empty.className = 'english-empty';
      empty.textContent = 'No responses noted yet.';
      list.appendChild(empty);
      return;
    }
    state.responses.slice(-8).reverse().forEach(function (response) {
      var li = document.createElement('li');
      var who = document.createElement('b');
      who.textContent = String(response.name || 'Note').slice(0, 18);
      var text = document.createElement('span');
      text.textContent = String(response.text || '').slice(0, 100);
      li.appendChild(who);
      li.appendChild(text);
      list.appendChild(li);
    });
  }

  function addResponse() {
    var field = $('#englishResponse');
    var text = field ? field.value.trim() : '';
    if (!text) return;
    state.responses.push({
      name: state.isTrainer ? 'Trainer' : 'Student',
      text: text,
      at: new Date().toISOString()
    });
    state.work.responses = state.responses.slice();
    if (field) field.value = '';
    paintResponses();
    queueSave();
  }

  function saveFeedback() {
    var field = $('#englishFeedback');
    var text = field ? field.value.trim() : '';
    if (!text) return;
    state.responses = state.responses.filter(function (item) {
      return String(item && item.name) !== 'Trainer feedback';
    });
    state.responses.push({
      name: 'Trainer feedback',
      text: text,
      at: new Date().toISOString()
    });
    state.work.responses = state.responses.slice();
    queueSave();
    state.toast('Feedback added locally · save status shows the link.');
  }

  /* ------------------------------------------------------------------ timer */
  function paintTimer() {
    var el = $('#englishTimer');
    if (!el) return;
    var m = Math.floor(Math.max(0, state.timerSeconds) / 60);
    var s = Math.max(0, state.timerSeconds) % 60;
    el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    el.classList.toggle('is-running', Boolean(state.timerId));
  }

  function stopTimer(done) {
    clearInterval(state.timerId);
    state.timerId = null;
    paintTimer();
    var toggle = $('#englishTimerToggle');
    if (toggle) toggle.textContent = done ? 'Start again' : 'Start timer';
  }

  function toggleTimer() {
    if (state.timerId) {
      stopTimer(false);
      return;
    }
    if (state.timerSeconds <= 0) state.timerSeconds = 60;
    var toggle = $('#englishTimerToggle');
    if (toggle) toggle.textContent = 'Pause timer';
    state.timerId = setInterval(function () {
      state.timerSeconds -= 1;
      if (state.timerSeconds <= 0) {
        state.timerSeconds = 0;
        stopTimer(true);
        state.toast('Time is up · note one thing to improve.');
        return;
      }
      paintTimer();
    }, 1000);
    paintTimer();
  }

  function resetTimer() {
    stopTimer(false);
    state.timerSeconds = 60;
    paintTimer();
  }

  /* -------------------------------------------------------------- quiz bank */
  function prepareQuizBank() {
    readContext();
    return QUIZ_BANK.map(function (question) {
      return {
        id: question.id,
        q: question.q,
        options: question.options.slice()
      };
    });
  }

  /* ------------------------------------------------------------------- init */
  function attach() {
    ['#englishPassageNotes', '#englishWriting', '#englishSpeakingPrompt'].forEach(function (sel) {
      var field = $(sel);
      if (!field) return;
      field.addEventListener('input', function () {
        state.work.passageNotes = $('#englishPassageNotes')
          ? $('#englishPassageNotes').value : state.work.passageNotes;
        state.work.writing = $('#englishWriting')
          ? $('#englishWriting').value : state.work.writing;
        state.work.speakingPrompt = $('#englishSpeakingPrompt')
          ? $('#englishSpeakingPrompt').value : state.work.speakingPrompt;
        queueSave();
      });
    });
    var revisionBtn = $('#englishRevisionAdd');
    if (revisionBtn) revisionBtn.addEventListener('click', addRevision);
    var vocabAdd = $('#englishVocabAdd');
    if (vocabAdd) vocabAdd.addEventListener('click', addVocab);
    var vocabInput = $('#englishVocabInput');
    if (vocabInput) {
      vocabInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); addVocab(); }
      });
    }
    var responseAdd = $('#englishResponseAdd');
    if (responseAdd) responseAdd.addEventListener('click', addResponse);
    var feedbackSave = $('#englishFeedbackSave');
    if (feedbackSave) feedbackSave.addEventListener('click', saveFeedback);
    var timerToggle = $('#englishTimerToggle');
    if (timerToggle) timerToggle.addEventListener('click', toggleTimer);
    var timerReset = $('#englishTimerReset');
    if (timerReset) timerReset.addEventListener('click', resetTimer);
    window.addEventListener('mathify:subjectchange', function (event) {
      if (event && event.detail) setSubject(event.detail);
    });
  }

  function setSubject(value) {
    var raw = value && typeof value === 'object' ? value.subject : value;
    var key = String(raw || 'math').trim().toLowerCase();
    state.subject = key === 'english' ? 'english' : (key === 'coding' ? 'coding' : 'math');
    if (state.subject !== 'english') return state.subject;
    if (!state.booted) {
      state.booted = true;
      readContext();
      state.revisions = readLocal('revisions');
      state.customVocab = readLocal('vocab');
      var promptField = $('#englishSpeakingPrompt');
      if (promptField) state.work.speakingPrompt = promptField.value;
      attach();
      paintTimer();
      paintRole();
    }
    var info = value && typeof value === 'object' ? value : host().subject();
    paintStrands(info && info.strands);
    loadWorkspace(false);
    return state.subject;
  }

  window.classroomEnglish = {
    setSubject: setSubject,
    prepareQuizBank: prepareQuizBank,
    saveWork: saveWork
  };
  setSubject(host().subject && typeof host().subject === 'function' ? host().subject() : null);
})();
