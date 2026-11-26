/* Founder settings draft UI.
 *
 * The server owns validation and the money allowlist. If the API is offline,
 * the same fields are rendered from a small fallback so the surface remains
 * reviewable; writes then stay in this browser only and are labelled honestly. */

(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.classroom.token.founder';
  var LOCAL_KEY = 'mathify.founder.settings.v1';
  var DEMO_EMAIL = 'founder@mathify.app';
  var DEMO_PASSWORD = 'mathify-demo';

  var FALLBACK_POLICY = {
    quiz: { unlockThreshold: 80, scoringBands: { easy: { min: 0, max: 40 }, medium: { min: 41, max: 79 }, hard: { min: 80, max: 100 } } },
    masteryGating: { unlockThreshold: 80, keepSameTopicBelowThreshold: true, reteachBeforeNewCheck: true },
    teachingScore: { scaleMax: null, target: null },
    presence: {
      heartbeatSeconds: 20, idleSeconds: 45, learningEventWindowSeconds: 60,
      graceMinutes: 10, trainerMinPresentMinutes: 15, studentMinPresentMinutes: 15,
      learningEventsForPresent: 3
    },
    trainerSlots: { maxHoursPerSlot: 12, committedClassPayPercent: 100, unutilisedPayPercent: 30 },
    payout: {
      rateRange: [300, 400],
      bonusRules: { perfectAttendanceBonus: 2000, incrementPerConsecutiveMonth: 500 },
      fineRules: { penalty: 'session_pay' },
      noShow: { payout: 0 },
      mvtAwards: [3000, 2000, 1000]
    },
    leaveBalances: { trainer: { perMonth: 8 }, student: { packPenalty: false } },
    packs: { expiryDays: 38, refundable: false }
  };

  var SECTION_FIELDS = {
    policy: [
      { key: 'quiz.unlockThreshold', label: 'Quiz unlock threshold', type: 'number', min: 50, max: 100, step: 1 },
      { key: 'quiz.scoringBands.easy.max', label: 'Easy band upper bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.medium.min', label: 'Medium band lower bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.medium.max', label: 'Medium band upper bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.hard.min', label: 'Hard band lower bound', type: 'number', min: 0, max: 100, step: 1 }
    ],
    mastery: [
      { key: 'masteryGating.unlockThreshold', label: 'Mastery unlock threshold', type: 'number', min: 50, max: 100, step: 1 },
      { key: 'masteryGating.keepSameTopicBelowThreshold', label: 'Keep topic below threshold', type: 'boolean' },
      { key: 'masteryGating.reteachBeforeNewCheck', label: 'Reteach before a new check', type: 'boolean' },
      { key: 'teachingScore.scaleMax', label: 'Teaching score scale max', type: 'nullableNumber', min: 1, max: 1000, step: 1 },
      { key: 'teachingScore.target', label: 'Teaching score target', type: 'nullableNumber', min: 1, max: 1000, step: 1 }
    ],
    trainerPolicy: [
      { key: 'presence.heartbeatSeconds', label: 'Presence heartbeat (seconds)', type: 'number', min: 5, max: 120, step: 1 },
      { key: 'presence.idleSeconds', label: 'Idle window (seconds)', type: 'number', min: 15, max: 600, step: 1 },
      { key: 'presence.learningEventWindowSeconds', label: 'Learning event window (seconds)', type: 'number', min: 30, max: 600, step: 1 },
      { key: 'presence.graceMinutes', label: 'Join grace (minutes)', type: 'number', min: 0, max: 30, step: 1 },
      { key: 'presence.trainerMinPresentMinutes', label: 'Trainer minimum presence (minutes)', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'presence.studentMinPresentMinutes', label: 'Student minimum presence (minutes)', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'presence.learningEventsForPresent', label: 'Learning events for present', type: 'number', min: 1, max: 20, step: 1 },
      { key: 'trainerSlots.maxHoursPerSlot', label: 'Maximum hours per declared slot', type: 'number', min: 1, max: 24, step: 1 }
    ]
  };

  var MONEY_FIELDS = [
    { key: 'payout.rateRange', label: 'Trainer session rate range', format: 'currencyRange' },
    { key: 'payout.bonusRules.perfectAttendanceBonus', label: 'Perfect attendance bonus', format: 'currency' },
    { key: 'payout.bonusRules.incrementPerConsecutiveMonth', label: 'Monthly increment', format: 'currency' },
    { key: 'payout.fineRules.penalty', label: 'Late cancellation penalty', format: 'text' },
    { key: 'payout.noShow.payout', label: 'No-show payout', format: 'currency' },
    { key: 'payout.mvtAwards', label: 'MVT awards', format: 'currencyList' },
    { key: 'trainerSlots.committedClassPayPercent', label: 'Committed class pay', format: 'percent' },
    { key: 'trainerSlots.unutilisedPayPercent', label: 'Unutilised slot pay', format: 'percent' },
    { key: 'leaveBalances.trainer.perMonth', label: 'Trainer leave balance', format: 'number' },
    { key: 'leaveBalances.student.packPenalty', label: 'Student pack penalty', format: 'boolean' },
    { key: 'packs.expiryDays', label: 'Pack expiry (days)', format: 'number' },
    { key: 'packs.refundable', label: 'Pack refundable', format: 'boolean' }
  ];

  var SECTION_NOTES = {
    policy: 'Lesson pacing and scoring bands. Network floors and payouts are locked.',
    mastery: 'Progression stays on one topic until the learner clears the gate.',
    trainerPolicy: 'Presence and planning windows. Pay percentages, rates and fines are locked.'
  };

  var SECTION_TARGETS = {
    policy: 'policyFields',
    mastery: 'masteryFields',
    trainerPolicy: 'trainerPolicyFields'
  };

  var view = null;
  var online = false;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function getPath(object, key) {
    return String(key).split('.').reduce(function (value, part) {
      if (value === null || value === undefined) return undefined;
      return value[part];
    }, object);
  }

  function fallbackView() {
    var saved = null;
    try {
      var raw = window.localStorage.getItem(LOCAL_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (error) { saved = null; }

    var policy = saved && saved.policy ? saved.policy : FALLBACK_POLICY;
    return {
      storage: 'browser',
      persistence: 'local',
      note: 'Server is unavailable. This draft is saved in this browser only; deployment policy remains file-backed.',
      updatedAt: saved ? saved.updatedAt : null,
      policy: policy,
      sections: Object.keys(SECTION_FIELDS).map(function (id) {
        return {
          id: id,
          label: id === 'policy' ? 'Class policy' : id === 'mastery' ? 'Mastery' : 'Trainer policy',
          note: SECTION_NOTES[id],
          fields: SECTION_FIELDS[id].map(function (field) {
            var copy = JSON.parse(JSON.stringify(field));
            copy.value = getPath(policy, field.key);
            return copy;
          })
        };
      }),
      readOnlyMoney: MONEY_FIELDS.map(function (field) {
        var copy = JSON.parse(JSON.stringify(field));
        copy.value = getPath(policy, field.key);
        copy.readOnly = true;
        return copy;
      })
    };
  }

  function status(message, kind) {
    var node = $('settingsStatus');
    if (!node) return;
    node.textContent = message;
    node.className = 'status' + (kind ? ' ' + kind : '');
  }

  function readToken() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
  }

  function writeToken(value) {
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (error) { /* private mode */ }
  }

  function request(path, options) {
    var settings = options || {};
    var headers = { Accept: 'application/json' };
    if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: settings.method || 'GET',
      headers: headers,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var problem = new Error((data && data.message) || 'Request failed.');
          problem.status = response.status;
          throw problem;
        }
        return data;
      });
    });
  }

  function login() {
    return request('/auth/login', {
      method: 'POST',
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD }
    }).then(function (data) {
      writeToken(data.token);
      return data.token;
    });
  }

  function load() {
    var token = readToken();
    var attempt = token
      ? request('/admin/settings', { token: token }).catch(function (error) {
        if (error.status !== 401) throw error;
        return login().then(function (value) {
          return request('/admin/settings', { token: value });
        });
      })
      : login().then(function (value) { return request('/admin/settings', { token: value }); });

    return attempt.then(function (data) {
      view = data;
      online = true;
      render();
      status('Server draft loaded · ' + (data.updatedAt ? 'edited ' + data.updatedAt : 'defaults active'), 'saved');
    }).catch(function () {
      view = fallbackView();
      online = false;
      render();
      status('API unavailable · showing browser-only draft', 'error');
    });
  }

  function formatMoney(item) {
    var value = item.value;
    if (item.format === 'currency') return '₹' + Number(value || 0).toLocaleString('en-IN');
    if (item.format === 'currencyRange') {
      return Array.isArray(value) ? '₹' + value[0] + ' – ₹' + value[1] : '—';
    }
    if (item.format === 'currencyList') {
      return Array.isArray(value) ? value.map(function (number) { return '₹' + number; }).join(' · ') : '—';
    }
    if (item.format === 'percent') return value + '%';
    if (item.format === 'boolean') return value ? 'Yes' : 'No';
    return value === null || value === undefined ? 'Unset' : String(value);
  }

  function renderField(field, sectionId) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', field.label));

    var input;
    if (field.type === 'boolean') {
      input = el('select');
      [['true', 'Enabled'], ['false', 'Disabled']].forEach(function (pair) {
        var option = el('option', null, pair[1]);
        option.value = pair[0];
        input.appendChild(option);
      });
      input.value = field.value ? 'true' : 'false';
    } else {
      input = el('input');
      input.type = 'number';
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.value = field.value === null || field.value === undefined ? '' : String(field.value);
      if (field.type === 'nullableNumber') input.placeholder = 'Unset';
    }

    input.setAttribute('data-section', sectionId);
    input.setAttribute('data-key', field.key);
    input.setAttribute('data-type', field.type);
    input.setAttribute('aria-label', field.label);
    wrap.appendChild(input);
    return wrap;
  }

  function render() {
    (view.sections || []).forEach(function (section) {
      var target = $(SECTION_TARGETS[section.id]);
      if (target) {
        target.innerHTML = '';
        section.fields.forEach(function (field) { target.appendChild(renderField(field, section.id)); });
      }
      var note = $(section.id + 'Note');
      if (note && section.note) note.textContent = section.note;
    });

    var money = $('moneyFields');
    if (money) {
      money.innerHTML = '';
      (view.readOnlyMoney || []).forEach(function (item) {
        var row = el('div', 'readonly-field');
        row.setAttribute('aria-label', item.label + ' (read-only)');
        row.appendChild(el('b', null, item.label));
        row.appendChild(el('span', null, formatMoney(item)));
        row.appendChild(el('i', null, '🔒'));
        money.appendChild(row);
      });
    }
  }

  function collect(sectionId) {
    var values = {};
    var inputs = document.querySelectorAll('[data-section="' + sectionId + '"][data-key]');
    Array.prototype.forEach.call(inputs, function (input) {
      var type = input.getAttribute('data-type');
      if (type === 'boolean') values[input.getAttribute('data-key')] = input.value === 'true';
      else if (type === 'nullableNumber') {
        values[input.getAttribute('data-key')] = input.value === '' ? null : Number(input.value);
      } else values[input.getAttribute('data-key')] = Number(input.value);
    });
    return values;
  }

  function localSave() {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify({
        policy: view.policy,
        updatedAt: new Date().toISOString()
      }));
      return true;
    } catch (error) { return false; }
  }

  function save() {
    var saveButton = $('saveSettingsBtn');
    if (saveButton) saveButton.disabled = true;
    status('Validating draft…');

    var pending = (view.sections || []).map(function (section) {
      return { section: section.id, values: collect(section.id) };
    });

    var writeLocal = function () {
      var saved = localSave();
      status(saved
        ? 'Draft saved in this browser only. Server policy remains file-backed.'
        : 'Browser storage is unavailable; draft is valid for this page view only.', saved ? 'error' : 'error');
    };

    if (!online) {
      writeLocal();
      if (saveButton) saveButton.disabled = false;
      return;
    }

    var token = readToken();
    Promise.all(pending.map(function (patch) {
      return request('/admin/settings', { method: 'PATCH', token: token, body: patch });
    })).then(function (results) {
      view = results[results.length - 1];
      localSave();
      render();
      status('Server draft saved · ' + view.updatedAt, 'saved');
    }).catch(function (error) {
      writeLocal();
    }).then(function () {
      if (saveButton) saveButton.disabled = false;
    });
  }

  function reset() {
    if (!online) {
      try { window.localStorage.removeItem(LOCAL_KEY); } catch (error) { /* private mode */ }
      view = fallbackView();
      render();
      status('Browser draft reset to defaults.', 'saved');
      return;
    }
    request('/admin/settings', { method: 'DELETE', token: readToken() }).then(function (data) {
      view = data;
      try { window.localStorage.removeItem(LOCAL_KEY); } catch (error) { /* private mode */ }
      render();
      status('Server draft reset to file-backed defaults.', 'saved');
    }).catch(function () {
      status('Reset failed. No values were changed.', 'error');
    });
  }

  document.querySelectorAll('[data-nav]').forEach(function (link) {
    link.addEventListener('click', function () {
      document.querySelectorAll('[data-nav]').forEach(function (item) {
        var active = item === link;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
    });
  });

  var saveButton = $('saveSettingsBtn');
  if (saveButton) saveButton.addEventListener('click', save);
  var resetButton = $('resetSettingsBtn');
  if (resetButton) resetButton.addEventListener('click', reset);

  load();
}());
