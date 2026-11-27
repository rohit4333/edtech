/* ==========================================================================
   MATHIFY — English communication live workspace (subject = english only)

   Reading, writing, public speaking, listening and vocabulary. No literature
   or grammar framing. Work is scoped to the session child; no contact, KYC,
   bank or private document data is read or sent. The server-selected subject
   is the only way this panel becomes visible.

   Workspace fields follow the nested /api/english/work contract:
   { reading:{title,text}, annotations, vocabulary:[], speaking:{prompt,
   responses:[]}, writing:{draft,revisions:[]}, feedback }.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var noop = function () {};

  var DEFAULT_VOCAB = ['rainwater', 'supply', 'record', 'evidence', 'audience', 'concise'];

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
      reading: { title: '', text: '' },
      annotations: '',
      vocabulary: DEFAULT_VOCAB.slice(),
      speaking: { prompt: '', responses: [] },
      writing: { draft: '', revisions: [] },
      feedback: '',
      updatedAt: null,
      updatedByRole: null
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

  function currentRole() {
    if (state.role) return String(state.role).toLowerCase();
    return state.isTrainer ? 'trainer' : null;
  }

  function isTrainerRole(role) {
    return role === 'trainer' || role === 'founder';
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

  function asString(value) {
    return typeof value === 'string' ? value : '';
  }

  function stringList(value, limit) {
    var max = limit || 8000;
    var out = [];
    if (!Array.isArray(value)) return out;
    value.forEach(function (item) {
      var text = typeof item === 'string' ? item :
        (item && typeof item.text === 'string' ? item.text : '');
      if (text.trim()) out.push(text.slice(0, max));
    });
    return out;
  }

  function unique(values) {
    return values.filter(function (item, index) { return values.indexOf(item) === index; });
  }

  function normalizeWork(work) {
    var src = work && typeof work === 'object' ? work : {};
    var reading = src.reading && typeof src.reading === 'object' ? src.reading : {};
    var speaking = src.speaking && typeof src.speaking === 'object' ? src.speaking : {};
    var writing = src.writing && typeof src.writing === 'object' ? src.writing : {};
    return {
      reading: {
        title: asString(reading.title),
        text: asString(reading.text)
      },
      annotations: asString(src.annotations),
      vocabulary: stringList(src.vocabulary, 120),
      speaking: {
        prompt: asString(speaking.prompt),
        responses: stringList(speaking.responses)
      },
      writing: {
        draft: asString(writing.draft),
        revisions: stringList(writing.revisions)
      },
      feedback: asString(src.feedback),
      updatedAt: src.updatedAt || null,
      updatedByRole: src.updatedByRole || null
    };
  }

  function applyWork(work) {
    if (!work || typeof work !== 'object') return false;
    state.work = normalizeWork(work);
    state.responses = state.work.speaking.responses.slice();
    state.revisions = state.work.writing.revisions.slice();
    state.customVocab = state.work.vocabulary.filter(function (word) {
      return DEFAULT_VOCAB.indexOf(word) < 0;
    });
    paintFields();
    return true;
  }

  function setValue(selector, value) {
    var el = $(selector);
    if (el && document.activeElement !== el && el.value !== value) el.value = value;
  }

  function paintFields() {
    var title = $('#englishPassageTitle');
    var passage = $('#englishPassageText');
    var view = $('#englishFeedbackView');
    if (title) title.textContent = state.work.reading.title;
    if (passage) passage.textContent = state.work.reading.text;
    setValue('#englishPassageNotes', state.work.annotations);
    setValue('#englishWriting', state.work.writing.draft);
    setValue('#englishSpeakingPrompt', state.work.speaking.prompt);
    setValue('#englishFeedback', state.work.feedback);
    if (view) view.textContent = state.work.feedback || 'No trainer feedback yet.';
    paintResponses();
    paintRevisions();
    paintVocab();
  }

  function paintRole() {
    var chip = $('#englishRoleChip');
    if (!chip) return;
    var role = String(state.role || '').toLowerCase();
    if (role === 'parent') chip.textContent = 'Parent · read only';
    else if (isTrainerRole(role) || state.isTrainer) chip.textContent = 'Trainer';
    else chip.textContent = 'Student';
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
      var envelope = data && typeof data === 'object' ? data : {};
      var work = envelope.work && typeof envelope.work === 'object' ? envelope.work : null;
      if (work) applyWork(work);
      if (envelope.role) state.role = String(envelope.role).toLowerCase();
      paintRole();
      setStatus('Work loaded', 'ok');
    }).catch(function () {
      notifyOnce('work', 'Work not linked yet · local draft only.');
      paintFields();
    });
  }

  /* Only fields the current role may write are sent: students own annotations,
     writing.draft/revisions and speaking.responses; trainers and founders own
     reading, vocabulary, speaking.prompt and feedback. */
  function collectWork() {
    var role = currentRole();
    var notes = $('#englishPassageNotes');
    var writing = $('#englishWriting');
    var prompt = $('#englishSpeakingPrompt');
    var feedback = $('#englishFeedback');
    if (!isTrainerRole(role)) {
      return {
        annotations: notes ? notes.value : state.work.annotations,
        writing: {
          draft: writing ? writing.value : state.work.writing.draft,
          revisions: state.revisions.slice()
        },
        speaking: {
          responses: state.responses.slice()
        }
      };
    }
    return {
      reading: {
        title: state.work.reading.title,
        text: state.work.reading.text
      },
      vocabulary: state.work.vocabulary.slice(),
      speaking: {
        prompt: prompt ? prompt.value : state.work.speaking.prompt
      },
      feedback: feedback ? feedback.value : state.work.feedback
    };
  }

  function saveWork() {
    if (currentRole() === 'parent') {
      setStatus('Read-only for your role.', 'error');
      return Promise.resolve(false);
    }
    var work = collectWork();
    if (!can('saveEnglishWork') || !state.sessionId) {
      setStatus('Save not linked yet · work stays in this browser.', 'error');
      return Promise.resolve(false);
    }
    return state.client.saveEnglishWork(state.sessionId, work).then(function (saved) {
      var envelope = saved && typeof saved === 'object' ? saved : null;
      var persisted = envelope && envelope.work && typeof envelope.work === 'object'
        ? envelope.work : null;
      if (!persisted) {
        setStatus('Save not acknowledged · work stays in this browser.', 'error');
        return false;
      }
      state.dirty = false;
      if (envelope.role) state.role = String(envelope.role).toLowerCase();
      applyWork(persisted);
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
      text.textContent = String(revision || '').slice(0, 90) || '(empty draft)';
      var restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'mini';
      restore.textContent = 'Restore';
      restore.addEventListener('click', function () {
        var writing = $('#englishWriting');
        if (writing) writing.value = revision || '';
        queueSave();
      });
      li.appendChild(stamp);
      li.appendChild(text);
      li.appendChild(restore);
      list.appendChild(li);
    });
  }

  function addRevision() {
    var writing = $('#englishWriting');
    var text = writing ? writing.value : state.work.writing.draft;
    state.revisions.push(text);
    if (state.revisions.length > 20) state.revisions.shift();
    state.work.writing.revisions = state.revisions.slice();
    writeLocal('revisions', state.revisions);
    paintRevisions();
    queueSave();
    state.toast('Revision queued for save.');
  }

  /* --------------------------------------------------------------- vocab */
  function paintVocab() {
    var hostEl = $('#englishVocabChips');
    if (!hostEl) return;
    hostEl.textContent = '';
    state.work.vocabulary.forEach(function (word) {
      var chip = document.createElement('span');
      chip.className = 'english-chip' + (DEFAULT_VOCAB.indexOf(word) < 0 ? ' is-custom' : '');
      chip.textContent = word;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + word);
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        state.work.vocabulary = state.work.vocabulary.filter(function (item) {
          return item !== word;
        });
        state.customVocab = state.work.vocabulary.filter(function (item) {
          return DEFAULT_VOCAB.indexOf(item) < 0;
        });
        writeLocal('vocab', state.customVocab);
        paintVocab();
        queueSave();
      });
      chip.appendChild(remove);
      hostEl.appendChild(chip);
    });
  }

  function addVocab() {
    var input = $('#englishVocabInput');
    var word = input ? input.value.trim().replace(/[<>\n]/g, '') : '';
    if (!word) return;
    word = word.slice(0, 32);
    if (state.work.vocabulary.indexOf(word) >= 0) return;
    state.work.vocabulary.push(word);
    state.customVocab = state.work.vocabulary.filter(function (item) {
      return DEFAULT_VOCAB.indexOf(item) < 0;
    });
    writeLocal('vocab', state.customVocab);
    if (input) input.value = '';
    paintVocab();
    queueSave();
    state.toast(isTrainerRole(currentRole())
      ? 'Word added · save status shows the link.'
      : 'Word added here · the word bank is trainer-managed.');
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
      who.textContent = 'Note';
      var text = document.createElement('span');
      text.textContent = String(response || '').slice(0, 100);
      li.appendChild(who);
      li.appendChild(text);
      list.appendChild(li);
    });
  }

  function addResponse() {
    var field = $('#englishResponse');
    var text = field ? field.value.trim() : '';
    if (!text) return;
    state.responses.push(text);
    if (state.responses.length > 20) state.responses.shift();
    state.work.speaking.responses = state.responses.slice();
    if (field) field.value = '';
    paintResponses();
    queueSave();
  }

  function saveFeedback() {
    if (!isTrainerRole(currentRole())) {
      state.toast('Only trainers can save feedback.');
      return;
    }
    var field = $('#englishFeedback');
    var text = field ? field.value.trim() : '';
    if (!text) return;
    state.work.feedback = text;
    paintFields();
    queueSave();
    state.toast('Feedback queued for save.');
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

  /* ------------------------------------------------------------------- init */
  function attach() {
    [
      { selector: '#englishPassageNotes', field: 'annotations' },
      { selector: '#englishWriting', field: 'draft' },
      { selector: '#englishSpeakingPrompt', field: 'prompt' },
      { selector: '#englishFeedback', field: 'feedback' }
    ].forEach(function (entry) {
      var field = $(entry.selector);
      if (!field) return;
      field.addEventListener('input', function () {
        if (entry.field === 'annotations') state.work.annotations = field.value;
        else if (entry.field === 'draft') state.work.writing.draft = field.value;
        else if (entry.field === 'prompt') state.work.speaking.prompt = field.value;
        else state.work.feedback = field.value;
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

  /* Internal only: the subject controller drives this through the
     mathify:subjectchange event, so no subject setter is exported. */
  function setSubject(value) {
    var raw = value && typeof value === 'object' ? value.subject : value;
    var key = String(raw || 'math').trim().toLowerCase();
    state.subject = key === 'english' ? 'english' : (key === 'coding' ? 'coding' : 'math');
    if (state.subject !== 'english') return state.subject;
    if (!state.booted) {
      state.booted = true;
      readContext();
      state.revisions = stringList(readLocal('revisions'));
      state.customVocab = stringList(readLocal('vocab'), 32);
      state.work.writing.revisions = state.revisions.slice();
      state.work.speaking.responses = state.responses.slice();
      state.work.vocabulary = unique(DEFAULT_VOCAB.concat(state.customVocab));
      var promptField = $('#englishSpeakingPrompt');
      if (promptField) state.work.speaking.prompt = promptField.value;
      attach();
      paintFields();
      paintTimer();
      paintRole();
    }
    var info = value && typeof value === 'object' ? value : host().subject();
    paintStrands(info && info.strands);
    loadWorkspace(false);
    return state.subject;
  }

  window.classroomEnglish = {
    saveWork: saveWork
  };
  setSubject(host().subject && typeof host().subject === 'function' ? host().subject() : null);
})();
