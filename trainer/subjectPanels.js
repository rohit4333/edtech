/* Mathify — subject-aware trainer desk decoration.
   Subject is server-owned. Missing subjects fall back to mathematics so the
   existing maths console is unchanged. No attendance, planner, payout, KYC,
   parent-chat, scheduling or onboarding state is read or written here. */
(function () {
  'use strict';

  var NS = window.MathifySubjects = window.MathifySubjects || {};

  function activeMinutes(session) {
    if (session && Number(session.durationMinutes) > 0) return Number(session.durationMinutes);
    return session && session.classType === 'demo' ? 45 : 50;
  }

  var ALIASES = {
    math: 'math', maths: 'math', mathematics: 'math',
    coding: 'coding', code: 'coding', programming: 'coding', computer: 'coding',
    english: 'english', communication: 'english',
    'english communication': 'english',
    english_communication: 'english',
    'english-communication': 'english'
  };

  var DEFAULTS = {
    math: { key: 'math', label: 'Mathematics', shortLabel: 'Maths', workspace: 'Math workspace' },
    coding: { key: 'coding', label: 'Coding', shortLabel: 'Code', workspace: 'Coding workspace' },
    english: { key: 'english', label: 'English Communication', shortLabel: 'English', workspace: 'English workspace' }
  };

  function copy(base) {
    return { key: base.key, label: base.label, shortLabel: base.shortLabel, workspace: base.workspace };
  }

  function canonical(value) {
    var key = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    return ALIASES[key] || ALIASES[key.replace(/\s+/g, ' ')] || null;
  }

  function normalize(input) {
    var fallback = copy(DEFAULTS.math);
    if (!input) return fallback;
    var raw = input;
    if (typeof input === 'object') raw = input.subject || input.name || input.key || '';
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
    }
    return result;
  }

  function setText(el, value) {
    if (el && value !== undefined && value !== null) el.textContent = String(value);
  }

  function classFor(key) {
    return 'subject-' + (key === 'math' || key === 'coding' || key === 'english' ? key : 'math');
  }

  /* Called by applyActiveSession instead of overwriting #nextMeta wholesale,
     so the subject tag survives session-link rollover. */
  function setNextMeta(session, trainer) {
    var meta = document.getElementById('nextMeta');
    if (!meta) return;
    var subject = normalize(session && session.subject || (trainer && trainer.subject) || 'math');
    meta.textContent = '';
    meta.appendChild(document.createTextNode('1:1 · ' + ((session && session.student && session.student.name) || 'Student')));

    var sep = document.createElement('span');
    sep.className = 'dot-sep';
    sep.setAttribute('aria-hidden', 'true');
    meta.appendChild(sep);

    var tag = document.createElement('span');
    tag.className = 'subject-tag';
    tag.id = 'nextSubjectTag';
    tag.setAttribute('data-subject', subject.key);
    tag.textContent = subject.label;
    meta.appendChild(tag);

    var course = document.createElement('span');
    course.className = 'next-course-note';
    course.textContent = ' · ' + ((session && session.code) || subject.workspace) +
      ' · link active for ' + activeMinutes(session) + ' min';
    meta.appendChild(course);

    var indicators = document.getElementById('englishIndicators');
    if (indicators) indicators.hidden = subject.key !== 'english';
  }

  function decorateNext(dashboard) {
    var next = dashboard && dashboard.nextSession;
    var subject = normalize(next && next.subject || (dashboard && dashboard.trainer && dashboard.trainer.subject) || 'math');
    var tag = document.getElementById('nextSubjectTag');
    if (tag) {
      setText(tag, subject.label);
      tag.setAttribute('data-subject', subject.key);
      tag.className = 'subject-tag ' + classFor(subject.key);
    }
    var article = document.querySelector('.hero .next');
    if (article) article.setAttribute('data-subject', subject.key);

    var course = document.querySelector('.next-course-note');
    if (course) {
      course.textContent = ' · ' + ((next && next.code) || subject.workspace) +
        ' · link active for ' + activeMinutes(next) + ' min';
    }

    var link = document.getElementById('codingWorkspaceLink');
    var id = next && (next.id || next.sessionId) || window.MATHIFY_SESSION_ID || null;
    if (link) {
      link.hidden = subject.key !== 'coding';
      if (id) link.setAttribute('href', '../classroom/index.html?sessionId=' + encodeURIComponent(id));
      else link.setAttribute('href', '../classroom/index.html');
    }
    var indicators = document.getElementById('englishIndicators');
    if (indicators) indicators.hidden = subject.key !== 'english';
    return subject;
  }

  function decorateTimeline(sessions) {
    var list = document.getElementById('timeline');
    if (!list) return;
    var items = list.querySelectorAll('.slot');
    (sessions || []).slice(0, items.length).forEach(function (session, index) {
      var li = items[index];
      var subject = normalize(session && session.subject || 'math');
      li.setAttribute('data-subject', subject.key);
      var body = li.querySelector('.slot-body');
      if (!body) return;
      var old = body.querySelector('.slot-subject');
      if (old) old.remove();
      var tag = document.createElement('span');
      tag.className = 'slot-subject ' + classFor(subject.key);
      tag.setAttribute('data-subject', subject.key);
      tag.textContent = subject.shortLabel;
      body.appendChild(tag);
    });
  }

  function countSummary(dashboard) {
    var subjectSummary = dashboard && dashboard.subjectSummary;
    if (subjectSummary && typeof subjectSummary === 'object') {
      if (Array.isArray(subjectSummary)) {
        return subjectSummary.map(function (entry) {
          return { subject: normalize(entry.subject || entry), count: Number(entry.count || entry.sessions || 0) };
        });
      }
      return Object.keys(subjectSummary).map(function (key) {
        var value = subjectSummary[key];
        return {
          subject: normalize(key),
          count: typeof value === 'number' ? value : Number(value && (value.count || value.sessions) || 0)
        };
      });
    }
    var counts = {};
    (dashboard && Array.isArray(dashboard.today) ? dashboard.today : []).forEach(function (session) {
      var key = normalize(session && session.subject || 'math').key;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(function (key) {
      return { subject: normalize(key), count: counts[key] };
    });
  }

  function decorateSummary(dashboard) {
    var host = document.getElementById('subjectSummary');
    if (!host) return;
    var rows = countSummary(dashboard).filter(function (row) { return row.count > 0; });
    host.textContent = '';
    host.hidden = !rows.length;
    rows.slice(0, 6).forEach(function (row) {
      var chip = document.createElement('span');
      chip.className = 'subject-summary-chip ' + classFor(row.subject.key);
      chip.setAttribute('data-subject', row.subject.key);
      chip.appendChild(document.createTextNode(row.subject.label + ' · '));
      var count = document.createElement('b');
      count.className = 'num';
      count.textContent = String(row.count);
      chip.appendChild(count);
      host.appendChild(chip);
    });
  }

  function decorateTrainer(dashboard) {
    decorateNext(dashboard);
    decorateTimeline(dashboard && dashboard.today);
    decorateSummary(dashboard);
  }

  NS.DEFAULTS = DEFAULTS;
  NS.normalize = normalize;
  NS.setNextMeta = setNextMeta;
  NS.decorateNext = decorateNext;
  NS.decorateTimeline = decorateTimeline;
  NS.decorateSummary = decorateSummary;
  NS.decorateTrainer = decorateTrainer;
})();
