/* Mathify — subject-aware student panels.
   The subject always comes from the server payload. This file never offers a
   subject picker: an absent/unknown subject falls back to mathematics so the
   existing maths desk stays exactly as it is. */
(function () {
  'use strict';

  var NS = window.MathifySubjects = window.MathifySubjects || {};

  var ALIASES = {
    math: 'math', maths: 'math', mathematics: 'math',
    coding: 'coding', code: 'coding', programming: 'coding', computer: 'coding',
    english: 'english', communication: 'english',
    'english communication': 'english',
    english_communication: 'english',
    'english-communication': 'english'
  };

  var DEFAULTS = {
    math: { key: 'math', label: 'Mathematics', shortLabel: 'Maths', workspace: 'Math workspace', strands: [] },
    coding: { key: 'coding', label: 'Coding', shortLabel: 'Code', workspace: 'Coding workspace', strands: [] },
    english: { key: 'english', label: 'English Communication', shortLabel: 'English', workspace: 'English workspace', strands: [] }
  };

  function copy(base) {
    return {
      key: base.key,
      label: base.label,
      shortLabel: base.shortLabel,
      workspace: base.workspace,
      strands: (base.strands || []).slice()
    };
  }

  function canonical(value) {
    var key = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    return ALIASES[key] || ALIASES[key.replace(/\s+/g, ' ')] || null;
  }

  /* Accepts either a subject string or a server subject object. */
  function normalize(input) {
    var fallback = copy(DEFAULTS.math);
    if (!input) return fallback;

    var raw = input;
    if (typeof input === 'object') {
      raw = input.subject || input.name || input.key || '';
    }
    var key = canonical(typeof raw === 'string' ? raw : '') || 'math';
    var result = copy(DEFAULTS[key] || DEFAULTS.math);

    if (typeof input === 'object') {
      if (typeof input.label === 'string' && input.label.trim()) result.label = input.label.trim();
      if (typeof input.shortLabel === 'string' && input.shortLabel.trim()) result.shortLabel = input.shortLabel.trim();
      if (typeof input.workspace === 'string' && input.workspace.trim()) result.workspace = input.workspace.trim();
      if (input.workspace && typeof input.workspace === 'object') {
        var ws = input.workspace.label || input.workspace.name;
        if (typeof ws === 'string' && ws.trim()) result.workspace = ws.trim();
      }
      if (Array.isArray(input.strands)) {
        result.strands = input.strands.map(function (strand) {
          if (typeof strand === 'string') return strand.trim();
          if (strand && typeof strand === 'object') {
            return String(strand.label || strand.name || strand.title || '').trim();
          }
          return '';
        }).filter(Boolean).slice(0, 8);
      }
    }
    return result;
  }

  function subjectFromDashboard(dashboard) {
    var student = dashboard && dashboard.student;
    var next = dashboard && dashboard.nextSession;
    return normalize((student && student.subject) || (next && next.subject) || 'math');
  }

  function subjectFromSessionState(state) {
    if (!state || !state.subject) return null;
    return normalize(state.subject);
  }

  function setText(el, value) {
    if (el && value !== undefined && value !== null) el.textContent = String(value);
  }

  function sessionIdFor(dashboard) {
    var next = dashboard && dashboard.nextSession;
    return (next && (next.id || next.sessionId)) ||
      (dashboard && dashboard.student && dashboard.student.nextSessionId) ||
      window.MATHIFY_SESSION_ID || null;
  }

  /* ---------- subject identity on the desk ---------- */
  function mountIdentity(dashboard, sessionState) {
    var strip = document.getElementById('subjectStrip');
    if (!strip) return;
    var subject = subjectFromDashboard(dashboard);
    if (sessionState && sessionState.subject && !(dashboard && dashboard.student && dashboard.student.subject)) {
      subject = subjectFromSessionState(sessionState) || subject;
    }
    strip.setAttribute('data-subject', subject.key);
    setText(document.getElementById('subjectBadge'), subject.label);
    setText(document.getElementById('subjectWorkspace'), subject.workspace);

    var strands = document.getElementById('subjectStrands');
    if (strands) {
      strands.textContent = '';
      subject.strands.forEach(function (strand) {
        var chip = document.createElement('span');
        chip.className = 'subject-strand';
        chip.textContent = strand;
        strands.appendChild(chip);
      });
      strands.hidden = !subject.strands.length;
    }
  }

  /* ---------- safe renderers: only allow coach-visible fields ---------- */
  function safeText(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : (fallback || '');
  }

  function codeFeedback(payload) {
    if (!payload || typeof payload !== 'object') return 'No feedback was returned yet.';
    var parts = [];
    ['output', 'stdout', 'stderr', 'summary', 'message'].forEach(function (key) {
      var value = payload[key];
      if (typeof value === 'string' && value.trim()) parts.push(value.trim());
    });
    /* Counts only. Labels, hidden tests and answer keys are never rendered. */
    var checks = Array.isArray(payload.checks) ? payload.checks : null;
    if (checks) {
      var passed = checks.filter(function (check) {
        return check && (check.passed === true || check.ok === true || check.status === 'passed');
      }).length;
      parts.push(passed + ' of ' + checks.length + ' visible checks reported');
    }
    return parts.length ? parts.join('\n') : 'No feedback was returned yet.';
  }

  function vocabularyFrom(work) {
    var list = work && (work.vocabulary || work.vocab);
    if (!Array.isArray(list)) return [];
    return list.map(function (entry) {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        return safeText(entry.word || entry.term || entry.label || entry.text, '');
      }
      return '';
    }).filter(Boolean).slice(0, 12);
  }

  function applyEnglishWork(payload, refs) {
    var work = payload && typeof payload === 'object' ? (payload.work || payload) : {};
    var reading = work.reading || {};
    setText(refs.passageTitle, safeText(reading.title || work.title, 'Reading passage'));
    setText(refs.passageText, safeText(
      reading.text || reading.passage || work.passage || work.text,
      'Your trainer will share the passage in class.'
    ));
    setText(refs.speaking, safeText(
      (work.speaking && work.speaking.prompt) || work.speakingPrompt || work.prompt,
      'Speak for one minute about what you read.'
    ));
    if (typeof work.draft === 'string' && refs.editor) {
      refs.editor.value = work.draft;
      englishDraft = work.draft;
    }

    if (refs.vocab) {
      refs.vocab.textContent = '';
      vocabularyFrom(work).forEach(function (word) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'vocab-chip';
        chip.textContent = word;
        chip.addEventListener('click', function () {
          if (!refs.editor) return;
          var separator = refs.editor.value && !/\s$/.test(refs.editor.value) ? ' ' : '';
          refs.editor.value += separator + word;
          refs.editor.focus();
        });
        refs.vocab.appendChild(chip);
      });
      refs.vocab.hidden = !refs.vocab.children.length;
    }
  }

  /* ---------- coding panel ---------- */
  function renderCodingPanel(host, sessionId, sessionState, dashboard) {
    var next = dashboard && dashboard.nextSession;
    var challengeId = (sessionState && (sessionState.challengeId || sessionState.challenge && sessionState.challenge.id)) ||
      (next && (next.challengeId || next.challenge && next.challenge.id)) || null;
    var challengeTitle = (sessionState && (sessionState.challengeTitle || sessionState.challenge && sessionState.challenge.title)) ||
      (next && next.title) || '';

    host.innerHTML =
      '<div class="subject-panel coding-panel" data-subject="coding">' +
        '<div class="subject-panel-head">' +
          '<div class="subject-panel-titles">' +
            '<span class="mono">Practice</span>' +
            '<h3>Coding practice</h3>' +
            '<p class="subject-panel-note" id="codingChallengeNote"></p>' +
          '</div>' +
          '<a class="btn btn-light btn-sm subject-room-link" id="codingRoomLink" href="../classroom/index.html">' +
            'Live coding room <span class="ide-indicator" aria-hidden="true">&lt;/&gt;</span>' +
          '</a>' +
        '</div>' +
        '<div class="code-workspace">' +
          '<div class="code-toolbar"><span class="mono">editor</span><span class="mono" id="codeStatus">No checks run yet</span></div>' +
          '<textarea class="code-editor" id="codeEditor" spellcheck="false" autocomplete="off" aria-label="Code editor" ' +
            'placeholder="// Write your solution here"></textarea>' +
          '<div class="code-actions">' +
            '<button type="button" class="btn btn-coral btn-sm" id="codeRun">Run checks</button>' +
            '<span class="code-hint" id="codeHint"></span>' +
          '</div>' +
          '<pre class="code-output" id="codeOutput" role="status" aria-live="polite">Checks have not run yet.</pre>' +
        '</div>' +
      '</div>';

    var link = document.getElementById('codingRoomLink');
    var hint = document.getElementById('codeHint');
    var status = document.getElementById('codeStatus');
    var output = document.getElementById('codeOutput');
    var button = document.getElementById('codeRun');
    var editor = document.getElementById('codeEditor');

    setText(document.getElementById('codingChallengeNote'), challengeTitle
      ? 'Challenge: ' + challengeTitle
      : 'Your trainer will share the challenge in class.');

    if (editor) {
      editor.value = codeDraft;
      editor.addEventListener('input', function () { codeDraft = editor.value; });
    }

    if (sessionId) {
      if (link) {
        link.setAttribute('href', '../classroom/index.html?sessionId=' + encodeURIComponent(sessionId) + '&state=live');
        link.hidden = false;
      }
      setText(hint, 'Checks run against the challenge for this class.');
    } else {
      if (link) link.hidden = true;
      setText(hint, 'Live room and checks are not linked yet — join a class first.');
    }

    if (button) {
      button.addEventListener('click', function () {
        var api = window.mathifyStudentApi;
        if (!sessionId || !api || typeof api.checkCode !== 'function') {
          setText(status, 'Not linked yet');
          setText(output, 'Checks are not linked yet for this class.');
          return;
        }
        button.disabled = true;
        setText(status, 'Running checks…');
        setText(output, 'Checking…');
        api.checkCode({
          code: editor ? editor.value : '',
          challengeId: challengeId,
          sessionId: sessionId
        }).then(function (data) {
          setText(output, codeFeedback(data));
          setText(status, 'Checks returned');
        }).catch(function () {
          setText(output, 'Checks are not available yet. Please retry after class.');
          setText(status, 'Not linked yet');
        }).then(function () {
          button.disabled = false;
        });
      });
    }
  }

  /* ---------- english panel ---------- */
  function renderEnglishPanel(host, sessionId) {
    host.innerHTML =
      '<div class="subject-panel english-panel" data-subject="english">' +
        '<div class="subject-panel-head">' +
          '<div class="subject-panel-titles">' +
            '<span class="mono">Practice</span>' +
            '<h3>Communication practice</h3>' +
            '<p class="subject-panel-note" id="englishNote"></p>' +
          '</div>' +
        '</div>' +
        '<div class="english-grid">' +
          '<section class="english-reading" aria-labelledby="englishPassageTitle">' +
            '<span class="mono">Reading</span>' +
            '<h4 id="englishPassageTitle">Reading passage</h4>' +
            '<p class="english-passage" id="englishPassage">Your trainer will share the passage in class.</p>' +
          '</section>' +
          '<section class="english-writing" aria-labelledby="englishWritingTitle">' +
            '<span class="mono">Writing</span>' +
            '<h4 id="englishWritingTitle">Your response</h4>' +
            '<textarea class="english-editor" id="englishWriting" rows="7" aria-label="Writing draft" ' +
              'placeholder="Write your response here…"></textarea>' +
            '<div class="english-actions">' +
              '<button type="button" class="btn btn-coral btn-sm" id="englishSave">Save draft</button>' +
              '<span class="english-status" id="englishStatus" role="status" aria-live="polite"></span>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="english-vocab-wrap">' +
          '<span class="mono">Vocabulary</span>' +
          '<div class="vocab-chips" id="englishVocab" hidden></div>' +
        '</div>' +
        '<div class="english-speaking">' +
          '<span class="mono">Speaking prompt</span>' +
          '<p id="englishSpeaking">Speak for one minute about what you read.</p>' +
        '</div>' +
      '</div>';

    var refs = {
      passageTitle: document.getElementById('englishPassageTitle'),
      passageText: document.getElementById('englishPassage'),
      speaking: document.getElementById('englishSpeaking'),
      editor: document.getElementById('englishWriting'),
      vocab: document.getElementById('englishVocab'),
      note: document.getElementById('englishNote'),
      status: document.getElementById('englishStatus'),
      save: document.getElementById('englishSave')
    };
    if (refs.editor) {
      refs.editor.value = englishDraft;
      refs.editor.addEventListener('input', function () { englishDraft = refs.editor.value; });
    }

    var api = window.mathifyStudentApi;
    var linked = Boolean(sessionId && api && typeof api.getEnglishWork === 'function');

    if (!linked) {
      setText(refs.note, 'Draft only — not sent until a class is linked.');
      setText(refs.status, 'This draft stays on this page until a class is linked.');
      return;
    }

    setText(refs.note, 'Linked to your class.');
    setText(refs.status, 'Loading class work…');
    api.getEnglishWork(sessionId).then(function (data) {
      applyEnglishWork(data, refs);
      setText(refs.status, 'Class work loaded.');
    }).catch(function () {
      setText(refs.note, 'Class work is not linked yet — you can draft here meanwhile.');
      setText(refs.status, 'Nothing was sent.');
    });

    if (refs.save) {
      refs.save.addEventListener('click', function () {
        if (!api || typeof api.saveEnglishWork !== 'function') {
          setText(refs.status, 'Drafts stay on this page until a class is linked.');
          return;
        }
        setText(refs.status, 'Saving draft…');
        api.saveEnglishWork(sessionId, refs.editor ? refs.editor.value : '').then(function () {
          setText(refs.status, 'Your draft was accepted.');
        }).catch(function () {
          setText(refs.status, 'Draft could not be sent yet — it is still on this page.');
        });
      });
    }
  }

  var codeDraft = '';
  var englishDraft = '';
  var renderedToken = null;

  function mountPanels(dashboard, sessionState) {
    var host = document.getElementById('subjectPanels');
    if (!host) return;

    var subject = subjectFromDashboard(dashboard);
    if (sessionState && sessionState.subject && !(dashboard && dashboard.student && dashboard.student.subject)) {
      subject = subjectFromSessionState(sessionState) || subject;
    }
    if (subject.key === 'math') {
      host.hidden = true;
      host.textContent = '';
      host.removeAttribute('data-subject');
      renderedToken = null;
      return;
    }

    var sessionId = sessionIdFor(dashboard);
    var token = subject.key + '|' + (sessionId || 'none') + '|' + (sessionState ? 'state' : 'dash');
    if (host.dataset.subject === subject.key && renderedToken === token && host.firstChild) return;

    host.hidden = false;
    host.setAttribute('data-subject', subject.key);
    host.setAttribute('data-session-id', sessionId || '');
    renderedToken = token;
    if (subject.key === 'coding') renderCodingPanel(host, sessionId, sessionState, dashboard);
    else renderEnglishPanel(host, sessionId);
  }

  function mountStudent(dashboard, sessionState) {
    mountIdentity(dashboard, sessionState);
    mountPanels(dashboard, sessionState);
  }

  NS.DEFAULTS = DEFAULTS;
  NS.normalize = normalize;
  NS.subjectFromDashboard = subjectFromDashboard;
  NS.subjectFromSessionState = subjectFromSessionState;
  NS.codeFeedback = codeFeedback;
  NS.vocabularyFrom = vocabularyFrom;
  NS.mountIdentity = mountIdentity;
  NS.mountPanels = mountPanels;
  NS.mountStudent = mountStudent;
})();
