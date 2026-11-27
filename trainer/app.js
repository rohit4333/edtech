/* ==========================================================================
   MATHIFY — trainer console
   Vanilla JS. No build step, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function TZ() { return window.MATHIFY_TZ || 'Asia/Kolkata'; }
  var activeSessionId = window.MATHIFY_SESSION_ID || null;
  var ACTIVE_LINK_MINUTES = 50;
  var activeLinkMinutes = ACTIVE_LINK_MINUTES;
  var dashboardSnapshot = null;
  var activeSessionStartedAt = null;
  var rolledSessionIds = {};
  var rolloverTimer = null;
  var sessionEventCursor = 0;
  var sessionEventTimer = null;
  var sessionEventPollingId = null;
  var sessionEventCursorReady = false;
  var warningEl = $('#sessionWarning');
  var warningTextEl = $('#sessionWarningText');
  var warningCountEl = $('#sessionWarningCount');
  var warningAnchorAt = null;
  var warningRemainingSeconds = null;
  var warningAnnounced = false;
  var warningStateShown = false;
  var payGateDeck = $('#payGateDeck');
  var payGateBars = {
    child: payGateDeck && $('[data-meter="child"] i', payGateDeck),
    trainer: payGateDeck && $('[data-meter="trainer"] i', payGateDeck)
  };

  function parts(value) {
    if (!value) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    var fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ(),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    var map = {};
    fmt.formatToParts(d).forEach(function (part) { map[part.type] = part.value; });
    if (!map.hour || !map.minute) return null;
    return { hour: Number(map.hour) % 24, minute: Number(map.minute) };
  }

  function fmtTime(value) {
    var p = parts(value);
    if (!p) return '—';
    return ((p.hour % 12) || 12) + ':' + (p.minute < 10 ? '0' : '') + p.minute + ' ' + (p.hour >= 12 ? 'PM' : 'AM');
  }

  function fmtClock(value) {
    var p = parts(value);
    if (!p) return '—';
    return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
  }

  /* Reverse countdown for the five-minute end warning. */
  function clock(seconds) {
    var value = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(value / 60);
    var s = value % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function plural(value, word) {
    return value + ' ' + word + (value === 1 ? '' : 's');
  }

  function setText(selector, value) {
    var el = typeof selector === 'string' ? $(selector) : selector;
    if (el && value !== undefined && value !== null) el.textContent = String(value);
  }

  /* ------------------------------------------------------------------ toast */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 3200);
  }

  /* ------------------------------------------------------------ batch menu */
  var batchBtn = $('#batchBtn');
  var batchMenu = $('#batchMenu');
  var batchLabel = $('#batchLabel');

  function closeMenu() {
    if (!batchMenu || !batchBtn) return;
    batchMenu.hidden = true;
    batchBtn.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    if (!batchMenu || !batchBtn) return;
    batchMenu.hidden = false;
    batchBtn.setAttribute('aria-expanded', 'true');
    var selected = $('button[aria-selected="true"]', batchMenu);
    if (selected) selected.focus();
  }

  if (batchBtn && batchMenu) {
    batchBtn.addEventListener('click', function () {
      if (batchMenu.hidden) openMenu(); else closeMenu();
    });

    $$('button', batchMenu).forEach(function (option) {
      option.addEventListener('click', function () {
        $$('button', batchMenu).forEach(function (b) {
          b.setAttribute('aria-selected', b === option ? 'true' : 'false');
        });
        var value = option.getAttribute('data-value') || option.textContent.trim();
        if (batchLabel) batchLabel.textContent = value;
        $$('[data-batch-label]').forEach(function (el) { el.textContent = value; });
        var swatch = batchBtn.querySelector('.swatch');
        if (swatch) swatch.textContent = value.charAt(0);
        closeMenu();
        batchBtn.focus();
        toast('Attendance register now showing ' + value + '.');
      });
    });

    document.addEventListener('click', function (event) {
      if (batchMenu.hidden) return;
      if (!batchMenu.contains(event.target) && !batchBtn.contains(event.target)) closeMenu();
    });

    batchMenu.addEventListener('keydown', function (event) {
      var options = $$('button', batchMenu);
      var index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var step = event.key === 'ArrowDown' ? 1 : -1;
        options[(index + step + options.length) % options.length].focus();
      }
      if (event.key === 'Home') {
        event.preventDefault();
        options[0].focus();
      }
      if (event.key === 'End') {
        event.preventDefault();
        options[options.length - 1].focus();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !batchMenu.hidden) {
        closeMenu();
        batchBtn.focus();
      }
    });
  }

  /* --------------------------------------------------------- countdown chip */
  var countdown = $('#countdown');
  var apiRendered = false;
  if (countdown) {
    var seconds = 42 * 60;
    setInterval(function () {
      if (apiRendered || seconds <= 0) return;
      seconds -= 1;
      var m = Math.floor(seconds / 60);
      var s = seconds % 60;
      countdown.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  /* ------------------------------------------------------------- attendance */
  var STATUS = {
    '': { next: 'p', value: 'present', label: 'Not marked' },
    p: { next: 'a', value: 'present', label: 'Present' },
    a: { next: 'l', value: 'absent', label: 'Absent' },
    l: { next: 'p', value: 'late', label: 'Late' }
  };

  var saveNote = $('#saveNote');
  var saveText = $('#saveText');
  var saveBtn = $('#saveRegister');
  var noteTimer;
  var registerData = null;
  var dirtyRecords = {};

  function codeFor(value) {
    if (value === 'present') return 'p';
    if (value === 'absent') return 'a';
    if (value === 'late') return 'l';
    return '';
  }

  function labelFor(value) {
    return STATUS[codeFor(value)].label;
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0);
    }).join('').toUpperCase();
  }

  function dayLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ() }).format(d);
  }

  function dateLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ() }).format(d);
  }

  function rateFor(cells, columns) {
    var total = 0;
    var present = 0;
    columns.forEach(function (column) {
      var value = cells[column.id];
      if (!value) return;
      total += 1;
      if (value === 'present') present += 1;
    });
    return total ? Math.round((present / total) * 100) + '%' : '—';
  }

  function tallyToday() {
    var count = { p: 0, a: 0, l: 0 };
    $$('.cell.editable').forEach(function (cell) {
      var key = cell.getAttribute('data-status') || '';
      if (key) count[key] += 1;
    });
    return count;
  }

  function paintTally() {
    var regCount = $('#regCount') || $('.reg-count');
    if (!regCount) return;
    var t = tallyToday();
    regCount.textContent = t.p + ' present · ' + t.l + ' late · ' + t.a + ' absent';
  }

  function paintCell(cell, code) {
    cell.classList.remove('p', 'a', 'l');
    if (code) cell.classList.add(code);
    cell.setAttribute('data-status', code);
    var name = cell.getAttribute('data-name') || 'Student';
    var scope = cell.getAttribute('data-scope') || 'today';
    var label = code ? STATUS[code].label : 'not marked';
    var action = code ? 'Activate to change status.' : 'Activate to mark present.';
    cell.setAttribute('aria-label', name + ', ' + scope + ': ' + label + '. ' + action);
    cell.setAttribute('title', scope.charAt(0).toUpperCase() + scope.slice(1) + ': ' + label);
  }

  function setDirty() {
    var count = 0;
    Object.keys(dirtyRecords).forEach(function (sessionId) {
      count += Object.keys(dirtyRecords[sessionId]).length;
    });
    setText(saveBtn, count ? 'Save changes' : 'Save register');
  }

  var registerBody = $('#registerBody');
  if (registerBody) {
    registerBody.addEventListener('click', function (event) {
      var cell = event.target && event.target.closest ? event.target.closest('.cell.editable') : null;
      if (!cell || !registerBody.contains(cell)) return;
      var current = cell.getAttribute('data-status') || '';
      var next = STATUS[current].next;
      paintCell(cell, next);
      var sessionId = cell.getAttribute('data-session-id');
      var studentId = cell.getAttribute('data-student-id');
      if (sessionId && studentId) {
        dirtyRecords[sessionId] = dirtyRecords[sessionId] || {};
        dirtyRecords[sessionId][studentId] = STATUS[next].value;
      }
      paintTally();
      setDirty();
    });
  }

  $$('.cell:not(.editable)').forEach(function (cell) {
    var title = cell.getAttribute('title');
    if (!title) return;
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', title.split(' · ')[0]);
  });

  function renderRegister(register) {
    if (!register) return;
    registerData = register;
    dirtyRecords = {};

    var head = $('#registerHead');
    var body = $('#registerBody');
    if (!head || !body) return;

    var columns = register.columns || [];
    var rows = register.rows || [];
    head.innerHTML = '';
    body.innerHTML = '';

    var studentHead = document.createElement('th');
    studentHead.className = 'student-col';
    studentHead.setAttribute('scope', 'col');
    studentHead.textContent = 'Student';
    head.appendChild(studentHead);

    columns.forEach(function (column) {
      var th = document.createElement('th');
      th.className = 'date-col' + (column.editable ? ' today-col' : '');
      th.setAttribute('scope', 'col');
      var label = document.createElement('span');
      label.textContent = column.editable ? 'Today' : dayLabel(column.startsAt);
      var date = document.createElement('span');
      date.className = 'd';
      date.textContent = dateLabel(column.startsAt);
      th.appendChild(label);
      th.appendChild(date);
      head.appendChild(th);
    });

    var rateHead = document.createElement('th');
    rateHead.className = 'rate-col';
    rateHead.setAttribute('scope', 'col');
    rateHead.textContent = '30 days';
    head.appendChild(rateHead);

    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var studentCell = document.createElement('th');
      studentCell.className = 'student-col';
      studentCell.setAttribute('scope', 'row');

      var stu = document.createElement('span');
      stu.className = 'stu';
      var avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initials(row.student && row.student.name);
      var name = document.createElement('b');
      name.textContent = (row.student && row.student.name) || 'Student';
      stu.appendChild(avatar);
      stu.appendChild(name);
      studentCell.appendChild(stu);
      tr.appendChild(studentCell);

      columns.forEach(function (column) {
        var value = row.cells ? row.cells[column.id] : null;
        var code = codeFor(value);
        var td = document.createElement('td');
        if (column.editable) td.className = 'today-col';

        if (column.editable) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'cell editable';
          button.setAttribute('data-session-id', column.id);
          button.setAttribute('data-student-id', row.student ? row.student.id : '');
          button.setAttribute('data-name', row.student ? row.student.name : 'Student');
          button.setAttribute('data-scope', dateLabel(column.startsAt));
          paintCell(button, code);
          td.appendChild(button);
        } else {
          var mark = document.createElement('span');
          mark.className = 'cell' + (code ? ' ' + code : '');
          var scope = dateLabel(column.startsAt);
          mark.setAttribute('title', labelFor(value) + ' · ' + scope);
          mark.setAttribute('role', 'img');
          mark.setAttribute('aria-label', labelFor(value));
          td.appendChild(mark);
        }
        tr.appendChild(td);
      });

      var rateCell = document.createElement('td');
      rateCell.className = 'rate num';
      rateCell.textContent = rateFor(row.cells || {}, columns);
      tr.appendChild(rateCell);
      body.appendChild(tr);
    });

    var firstStudent = rows[0] && rows[0].student ? rows[0].student.name : null;
    setText('#registerMeta', firstStudent ? '1:1 · ' + firstStudent : '1:1 · student');
    setText('#registerRange', 'Last ' + plural(columns.length, 'session'));
    var caption = $('#registerCaption');
    if (caption && firstStudent) {
      caption.textContent = '1:1 attendance for ' + firstStudent + ' over the last ' + columns.length +
        ' session' + (columns.length === 1 ? '' : 's') + '. Today’s column is editable.';
    }
    setText(saveBtn, 'Save register');
    paintTally();
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var sessions = Object.keys(dirtyRecords);
      if (!sessions.length) {
        toast('No attendance changes to save.');
        return;
      }
      var api = window.mathifyTrainerApi;
      if (!api || !api.saveAttendance) {
        toast('Attendance API is unavailable.');
        return;
      }

      saveBtn.disabled = true;
      setText(saveBtn, 'Saving…');
      Promise.all(sessions.map(function (sessionId) {
        var records = Object.keys(dirtyRecords[sessionId]).map(function (studentId) {
          return { studentId: studentId, status: dirtyRecords[sessionId][studentId] };
        });
        return api.saveAttendance(sessionId, records);
      })).then(function (results) {
        var last = results[results.length - 1];
        if (last && last.register) renderRegister(last.register);
        dirtyRecords = {};
        setText(saveBtn, 'Save register');
        if (saveText) saveText.textContent = 'Saved ' + fmtTime(new Date());
        if (saveNote) {
          saveNote.hidden = false;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(function () { saveNote.hidden = true; }, 5000);
        }
        toast('Attendance saved.');
      }).catch(function (error) {
        setText(saveBtn, 'Save changes');
        toast('Could not save attendance.');
        if (window.console && console.warn) console.warn('Attendance save failed.', error);
      }).then(function () {
        saveBtn.disabled = false;
      });
    });
  }

  /* ------------------------------------------------------ nav + tab states */
  function setActive(group, current) {
    $$(group).forEach(function (el) {
      var on = el === current;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  function viewForLink(link) {
    var href = link && link.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return null;
    var target = document.getElementById(href.slice(1));
    if (!target) return null;
    return target.closest ? target.closest('[data-view]') : null;
  }

  function activateView(link, scroll) {
    if (!link) return;
    setActive('.nav a[data-nav]', link);
    var view = viewForLink(link);
    var name = view ? view.getAttribute('data-view') : 'today';
    $$('[data-view]').forEach(function (node) {
      node.classList.toggle('is-active', node.getAttribute('data-view') === name);
    });
    if (scroll) {
      var target = view || document.getElementById('main');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  $$('.nav a[data-nav]').forEach(function (link) {
    link.addEventListener('click', function () { activateView(link, false); });
  });

  window.addEventListener('hashchange', function () {
    var link = $$('.nav a[data-nav]').find(function (item) {
      return item.getAttribute('href') === window.location.hash;
    });
    activateView(link || $$('.nav a[data-nav]')[0], false);
  });
  activateView($$('.nav a[data-nav]').find(function (item) {
    return item.getAttribute('href') === window.location.hash;
  }) || $$('.nav a[data-nav]')[0], false);

  $$('.tabs button[data-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      setActive('.tabs button[data-tab]', button);
      var target = document.getElementById(button.dataset.tabTarget);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ------------------------------------------------------- placeholder links */
  $$('a[href="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      if (!link.hasAttribute('data-toast') && !link.hasAttribute('data-ask')) {
        toast('This control is not available in the live 1-on-1 console.');
      }
    });
  });

  /* --------------------------------------------------------------- utilities */
  function flash(el, message) {
    if (message) toast(message);
    if (!el) return;
    el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }],
      { duration: 220, easing: 'ease-out' }
    );
  }

  function openConnectPage(button, message) {
    var id = activeSessionId || window.MATHIFY_SESSION_ID || 'ses_math_001';
    if (button) flash(button, message);
    /* Start class opens the readiness gate first. Camera, microphone and
       connection are checked there; Join starts the class clock and moves to
       the camera page, which then opens the whiteboard. */
    window.location.href = '../classroom/preflight.html?sessionId=' +
      encodeURIComponent(id) + '&role=trainer';
  }

  $('#startClass') && $('#startClass').addEventListener('click', function (event) {
    openConnectPage(event.currentTarget, 'Opening the 1-on-1 classroom…');
  });

  $$('[data-toast]').forEach(function (el) {
    el.addEventListener('click', function () {
      toast(el.getAttribute('data-toast'));
    });
  });

  /* ------------------------------------------- copilot / trainer desk */
  var fab = $('#aiFab');
  var panel = $('#aiPanel');
  var closeBtn = $('#aiClose');
  var form = $('#aiForm');
  var input = $('#aiInput');
  var body = $('#aiBody');
  var aiTitle = $('#aiTitle');
  var aiStatus = $('#aiStatus');
  var modeButtons = $$('[data-chat-mode]');
  var aiMode = 'copilot';

  function openPanel(skipFocus) {
    if (!panel || !fab) return;
    closeMenu();
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    if (!skipFocus) {
      setTimeout(function () { if (input && !panel.hidden) input.focus(); }, 20);
    }
  }

  /* Suggested prompts are pasted into the composer. The trainer, not the
     chip, decides when the question is actually sent. */
  function pasteSuggestion(text) {
    if (!input) return;
    openPanel(true);
    input.value = String(text || '').trim();
    input.focus();
    if (typeof input.setSelectionRange === 'function') {
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (error) { /* unsupported input */ }
    }
  }

  function closePanel() {
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  }

  if (fab && panel) {
    fab.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    closeBtn && closeBtn.addEventListener('click', function () {
      closePanel();
      fab.focus();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) {
        closePanel();
        fab.focus();
      }
    });
  }

  function bubble(text, me) {
    var p = document.createElement('p');
    p.className = 'msg ' + (me ? 'me' : 'bot');
    p.textContent = text;
    if (body) {
      body.appendChild(p);
      body.scrollTop = body.scrollHeight;
    }
  }

  var COPILOT_OPEN = '<p class="msg bot">Your 4:30 is planned. Want a reteach note for Ishaan, or a parent update after the session?</p>' +
    '<div class="ai-chips"><button type="button">Differentiate today&rsquo;s set</button>' +
    '<button type="button">Draft a parent note</button>' +
    '<button type="button">Summarise last session</button></div>';
  var SUPPORT_OPEN = '<p class="msg bot">Mathify Trainer Desk here. Ask me about payout, leave or attendance policy.</p>' +
    '<div class="ai-chips"><button type="button">What is the session payout?</button>' +
    '<button type="button">48-hour cancellation rule</button>' +
    '<button type="button">How do leaves work?</button>' +
    '<button type="button">Attendance bonus rules</button></div>';

  function setChatMode(mode, force) {
    if (!mode || (mode === aiMode && !force)) return;
    aiMode = mode === 'support' ? 'support' : 'copilot';
    var support = aiMode === 'support';
    if (aiTitle) aiTitle.textContent = support ? 'Mathify Trainer Desk' : 'Mathify copilot';
    if (aiStatus) aiStatus.textContent = support ? 'Payout · leave · attendance' : 'Plans · grading · parent notes';
    if (input) input.placeholder = support ? 'Ask about payout, leave or attendance…' : 'Ask about a plan, student or score…';
    if (fab) fab.setAttribute('aria-label', support ? 'Open Mathify Trainer Desk' : 'Open Mathify copilot');
    modeButtons.forEach(function (button) {
      var active = button.getAttribute('data-chat-mode') === aiMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (body) {
      body.innerHTML = support ? SUPPORT_OPEN : COPILOT_OPEN;
      body.scrollTop = 0;
    }
    if (support) loadSupportRecords(true);
  }

  modeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setChatMode(button.getAttribute('data-chat-mode'));
      if (input) input.focus();
    });
  });

  /* Both assistants are real Cloudflare calls. No keyword branches and no
     seeded student names are sent by the client — the server supplies only
     the policy facts or academic context the prompt is allowed to use. */
  function ask(text) {
    var api = window.mathifyTrainerApi;
    if (aiMode === 'support') {
      if (!api || typeof api.askSupport !== 'function') {
        return Promise.resolve({
          reply: 'The Trainer Desk is unavailable right now. Please retry in a moment.',
          source: 'offline'
        });
      }
      return api.askSupport(text);
    }
    if (!api || typeof api.askCopilot !== 'function') {
      return Promise.resolve({
        reply: 'The copilot service is unavailable right now. Please retry in a moment.',
        source: 'offline'
      });
    }
    return api.askCopilot(text, window.MATHIFY_SESSION_ID || null);
  }

  /* The worker only knows general policy. This desk augments the displayed
     answer with the signed-in trainer's own records, fetched through the same
     authenticated client. Student names, contact details and other people's
     records are never read into the answer. */
  var supportRecords = null;
  var supportRecordsAt = 0;
  var supportRecordsPromise = null;

  function loadSupportRecords(force) {
    if (supportRecordsPromise) return supportRecordsPromise;
    if (supportRecords && !force && Date.now() - supportRecordsAt < 60000) {
      return Promise.resolve(supportRecords);
    }
    var api = window.mathifyTrainerApi;
    if (!api || typeof api.request !== 'function') {
      supportRecords = { available: false };
      return Promise.resolve(supportRecords);
    }

    function soft(job) {
      return Promise.resolve().then(job).catch(function () { return null; });
    }

    supportRecordsPromise = Promise.all([
      soft(function () {
        return typeof api.getPayout === 'function'
          ? api.getPayout()
          : api.request('/trainer/payouts').then(function (data) { return data && data.payout; });
      }),
      soft(function () {
        return typeof api.getDashboard === 'function'
          ? api.getDashboard()
          : api.request('/trainer/dashboard').then(function (data) { return data && data.dashboard; });
      }),
      soft(function () {
        return typeof api.getAttendance === 'function'
          ? api.getAttendance()
          : api.request('/trainer/attendance').then(function (data) { return data && data.register; });
      }),
      soft(function () {
        return api.request('/leaves').then(function (data) { return data && data.leave ? data.leave : data; });
      })
    ]).then(function (results) {
      supportRecords = {
        payout: results[0] || null,
        dashboard: results[1] || null,
        attendance: results[2] || null,
        leave: results[3] || null,
        available: Boolean(results[0] || results[1] || results[2] || results[3])
      };
      return supportRecords;
    }).then(function (records) {
      supportRecordsAt = Date.now();
      supportRecordsPromise = null;
      return records;
    });
    return supportRecordsPromise;
  }

  function finiteNumber(value) {
    /* Number(null) is 0, which would turn an unavailable metric into a real
       looking zero. Only present, numeric values may become figures. */
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function periodLabel(period) {
    var value = String(period || '');
    var match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return value || 'this period';
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /* Register totals only — no student names or identifying cells. */
  function registerMarks(register) {
    var counts = { present: 0, late: 0, absent: 0 };
    var rows = register && Array.isArray(register.rows) ? register.rows : [];
    rows.forEach(function (row) {
      var cells = row && row.cells ? row.cells : {};
      Object.keys(cells).forEach(function (key) {
        var status = cells[key];
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      });
    });
    return counts.present + counts.late + counts.absent
      ? counts
      : null;
  }

  function supportRecordLines(records) {
    if (!records || !records.available) {
      return ['Your records could not be loaded right now. Please retry; no figures have been guessed.'];
    }

    var lines = [];
    var payout = records.payout;
    var rate = payout && finiteNumber(payout.ratePerSession);
    if (rate !== null && rate > 0) {
      lines.push('Your current recorded rate is ' + inr(rate) + ' per completed 1-on-1 session.');
    }
    var amount = payout && payout.amount && finiteNumber(payout.amount.value);
    if (amount !== null) {
      lines.push('Your recorded payout for ' + periodLabel(payout.period) + ' is ' + inr(amount) + '.');
    }
    var breakdown = payout && payout.amount && payout.amount.breakdown;
    var gratitude = breakdown && finiteNumber(breakdown.founderGratitude);
    if (gratitude !== null && gratitude > 0) {
      lines.push('Your protected founder credit for ' + periodLabel(payout.period) + ' is ' + inr(gratitude) + '.');
    }

    var balance = records.leave && records.leave.balance;
    var remaining = balance && finiteNumber(balance.remaining);
    var total = balance && finiteNumber(balance.total);
    if (remaining !== null) {
      lines.push('Your remaining leave is ' + remaining + (total !== null ? ' of ' + total : '') +
        ' session' + (remaining === 1 ? '' : 's') + ' this month.');
    }

    var attendance = records.dashboard && records.dashboard.metrics && records.dashboard.metrics.attendance;
    var attendanceValue = attendance && finiteNumber(attendance.value);
    var attendanceAvailable = false;
    if (attendanceValue !== null) {
      lines.push('Your recorded attendance is ' + attendanceValue + '%.');
      attendanceAvailable = true;
    } else {
      var marks = registerMarks(records.attendance);
      if (marks) {
        lines.push('Your attendance register records ' + marks.present + ' present, ' +
          marks.late + ' late and ' + marks.absent + ' absent marks in the visible window.');
        attendanceAvailable = true;
      }
    }

    var missing = [];
    if (!payout) missing.push('pay');
    if (!balance) missing.push('leave');
    if (!attendanceAvailable) missing.push('attendance');
    if (missing.length) {
      lines.push('Your ' + missing.join(', ') + ' record' + (missing.length === 1 ? '' : 's') +
        ' could not be loaded right now; no figures have been guessed.');
    }
    if (!lines.length) {
      lines.push('Your records could not be loaded right now. Please retry; no figures have been guessed.');
    }
    return lines;
  }

  function augmentSupportReply(policyReply, records) {
    var policy = (policyReply && String(policyReply).trim()) || 'No policy reply was returned. Please retry.';
    return 'From your records\n' + supportRecordLines(records).join('\n') +
      '\n\nGeneral Mathify policy\n' + policy;
  }

  function send(text) {
    var value = (text || '').trim();
    if (!value) return;
    var modeAtSend = aiMode;
    bubble(value, true);
    if (input) input.value = '';

    var pending = document.createElement('p');
    pending.className = 'msg bot' + (modeAtSend === 'support' ? ' desk-answer' : '');
    pending.textContent = 'Thinking…';
    if (body) {
      body.appendChild(pending);
      body.scrollTop = body.scrollHeight;
    }

    ask(value).then(function (data) {
      var reply = (data && data.reply) || 'No reply was returned. Please retry.';
      if (data && data.source && data.source !== 'ai') pending.dataset.source = data.source;
      if (modeAtSend !== 'support') {
        pending.textContent = reply;
        if (body) body.scrollTop = body.scrollHeight;
        return null;
      }
      return loadSupportRecords().then(function (records) {
        pending.textContent = augmentSupportReply(reply, records);
        if (body) body.scrollTop = body.scrollHeight;
      });
    }).catch(function () {
      pending.textContent = modeAtSend === 'support'
        ? 'The Trainer Desk could not be reached. Please retry in a moment.'
        : 'The copilot could not be reached. Please retry in a moment.';
      pending.dataset.source = 'offline';
    });
  }

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      send(input ? input.value : '');
    });
  }

  if (panel) {
    panel.addEventListener('click', function (event) {
      var chip = event.target.closest ? event.target.closest('.ai-chips button') : null;
      if (chip && panel.contains(chip)) pasteSuggestion(chip.textContent);
    });
  }

  $$('[data-ask]').forEach(function (el) {
    el.addEventListener('click', function () {
      setChatMode('copilot');
      pasteSuggestion(el.getAttribute('data-ask'));
    });
  });

  /* -------------------------------------------------------------- search */
  var overlay = $('#searchOverlay');
  var mobileSearch = $('#mobileSearch');
  var searchOpen = $('#searchOpen');
  var searchClose = $('#searchClose');
  var searchMobile = $('#searchMobile');
  var searchTrigger = null;

  function openSearch(trigger) {
    if (!overlay) return;
    closeMenu();
    closePanel();
    searchTrigger = trigger || document.activeElement;
    overlay.hidden = false;
    if (searchMobile) searchMobile.focus();
  }

  function closeSearch() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (searchTrigger && typeof searchTrigger.focus === 'function') searchTrigger.focus();
  }

  if (overlay) {
    searchOpen && searchOpen.addEventListener('click', function () {
      openSearch(searchOpen);
    });
    mobileSearch && mobileSearch.addEventListener('click', function () {
      openSearch(mobileSearch);
    });
    searchClose && searchClose.addEventListener('click', closeSearch);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeSearch();
    });

    overlay.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var focusables = $$('button, input', overlay).filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
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

    function runSearch(query) {
      var term = String(query || '').trim().toLowerCase();
      if (!term) return;
      var matches = 0;
      $$('#registerBody tr, #timeline li, #attentionQueue .queue-row').forEach(function (row) {
        var found = row.textContent.toLowerCase().indexOf(term) !== -1;
        row.hidden = Boolean(term) && !found;
        if (found) matches += 1;
      });
      closeSearch();
      toast(matches ? matches + ' matching student/session row(s) for “' + query + '”.' :
        'No student or session matches “' + query + '”.');
    }

    $$('.search-tags button').forEach(function (tag) {
      tag.addEventListener('click', function () {
        var query = tag.textContent.trim();
        if (searchMobile) searchMobile.value = query;
        runSearch(query);
      });
    });

    searchMobile && searchMobile.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      runSearch(searchMobile.value);
    });
  }

  /* ------------------------------------------------------------ shortcuts */
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === 'Escape' && overlay && !overlay.hidden) closeSearch();
  });

  /* -------------------------------------------------------- API-backed data */
  function renderPlan(session) {
    var wrap = $('#planChips');
    if (!wrap || !session) return;
    wrap.innerHTML = '';
    (session.planner || []).slice(0, 4).forEach(function (item) {
      var chip = document.createElement('span');
      chip.textContent = item.label;
      wrap.appendChild(chip);
    });
    var open = (session.planner || []).filter(function (item) { return !item.done; }).length;
    var ready = document.createElement('span');
    ready.className = 'plan-ready';
    ready.textContent = open ? plural(open, 'step') + ' open' : 'Plan ready';
    wrap.appendChild(ready);
  }

  function renderTimeline(sessions) {
    var list = $('#timeline');
    if (!list) return;
    list.innerHTML = '';

    (sessions || []).forEach(function (session) {
      var state = session.status === 'ended'
        ? { cls: 'done', state: 's-done', label: 'Done' }
        : session.status === 'live'
          ? { cls: 'is-next', state: 's-next', label: 'Next' }
          : { cls: 'later', state: 's-later', label: 'Later' };

      var li = document.createElement('li');
      li.className = 'slot ' + state.cls;

      var time = document.createElement('span');
      time.className = 'slot-time num';
      time.textContent = fmtClock(session.startsAt || session.startedAt);

      var body = document.createElement('span');
      body.className = 'slot-body';
      var title = document.createElement('b');
      title.textContent = session.title || session.code || 'Session';
      var meta = document.createElement('span');
      meta.textContent = session.student
        ? '1:1 · ' + session.student.name
        : session.code || '';
      body.appendChild(title);
      body.appendChild(meta);

      var stateEl = document.createElement('span');
      stateEl.className = 'slot-state ' + state.state;
      stateEl.textContent = state.label;

      li.appendChild(time);
      li.appendChild(body);
      li.appendChild(stateEl);
      list.appendChild(li);
    });
  }

  var ATTENTION_TAG = {
    planning: 'Planning',
    attendance: 'Attendance',
    quiz: 'Quiz',
    recording: 'Recording'
  };

  var ATTENTION_ACTION = {
    open_planner: 'Open',
    open_register: 'Open',
    launch_quiz: 'Launch',
    reveal_answers: 'Reveal',
    review_drafts: 'Review',
    open_recap: 'Recap'
  };

  function renderAttention(items) {
    var queue = $('#attentionQueue');
    if (!queue) return;
    queue.innerHTML = '';

    if (!items || !items.length) {
      var empty = document.createElement('article');
      empty.className = 'queue-row';
      var ok = document.createElement('span');
      ok.className = 'body';
      var okTitle = document.createElement('span');
      okTitle.className = 'title';
      okTitle.textContent = 'Nothing needs attention right now.';
      ok.appendChild(okTitle);
      empty.appendChild(ok);
      queue.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement('article');
      row.className = 'queue-row';

      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = ATTENTION_TAG[item.kind] || 'Update';

      var body = document.createElement('span');
      body.className = 'body';
      var title = document.createElement('span');
      title.className = 'title';
      title.textContent = item.title;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = item.meta || '';
      body.appendChild(title);
      body.appendChild(meta);

      var status = document.createElement('span');
      status.className = 'status ' + (item.status === 'later' ? 's-later' : item.status === 'info' ? 's-next' : 's-today');
      status.textContent = item.status === 'later' ? 'Later' : item.status === 'info' ? 'Info' : 'Today';

      var button = document.createElement('button');
      button.className = 'btn btn-ghost btn-sm';
      button.type = 'button';
      button.textContent = ATTENTION_ACTION[item.action] || 'Open';
      button.addEventListener('click', function () {
        toast(item.title);
      });

      row.appendChild(tag);
      row.appendChild(body);
      row.appendChild(status);
      row.appendChild(button);
      queue.appendChild(row);
    });
  }

  /* ------------------------------------------------------- payout trend */
  function inr(value) {
    return '₹' + Number(value || 0).toLocaleString('en-IN');
  }

  function compactInr(value) {
    var amount = Number(value || 0);
    if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (amount >= 1000) return '₹' + Math.round(amount / 1000) + 'k';
    return '₹' + Math.round(amount);
  }

  function escapeXml(value) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, function (character) { return map[character]; });
  }

  function renderPayoutTrend(payout) {
    var mount = $('#payoutChart');
    if (!mount) return;

    var knownRules = payout && payout.knownRules;
    var detail = knownRules && knownRules.mutualLeave && knownRules.fine
      ? knownRules.mutualLeave + ' ' + knownRules.fine
      : 'A 48-hour notice is required from either side; later trainer cancellation costs one session pay.';
    setText('#payoutPolicyNote', detail +
      ' Pay is ₹300–₹400 per completed 1-on-1 session; your exact rate is the one in your contract or offer letter, or the rate stated during onboarding. Perfect attendance and clean conduct earn bonuses; severe complaints go to founder@mathify.app.' +
      ' Founder’s Gratitude Gift: ₹2,000 is credited to every trainer’s balance sheet on the first day of each month as a standing, non-revocable acknowledgement of faithful service, steady reliability, and the hard work they bring to every child’s learning. This credit is protected from deductions, cancellations and reversals, and may be adjusted only by the founder.');

    var series = payout && payout.dailySeries;
    var points = series && Array.isArray(series.points) ? series.points : [];
    var foot = $('.trend-foot');
    var badge = $('#payoutTrendBadge');
    var note = $('#payoutTrendNote');

    if (payout && payout.period) {
      var year = Number(String(payout.period).slice(0, 4));
      var month = Number(String(payout.period).slice(5, 7));
      if (year && month) {
        setText('#payoutTrendPeriod', new Date(Date.UTC(year, month - 1, 1))
          .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
      }
    }

    if (!points.length) {
      mount.textContent = 'No payout history yet.';
      setText('#payoutTrendTotal', '—');
      setText(badge, 'Unconfigured');
      setText(note, 'The daily trend appears once payout rules are confirmed.');
      return;
    }

    var width = 760;
    var height = 230;
    var left = 46;
    var right = 748;
    var top = 14;
    var baseline = 182;
    var plotWidth = right - left;
    var plotHeight = baseline - top;
    var maxValue = 1;

    points.forEach(function (point) {
      maxValue = Math.max(maxValue, Number(point.daily) || 0, Number(point.cumulative) || 0);
    });
    maxValue = maxValue * 1.12;

    function y(value) {
      return baseline - (Number(value) || 0) / maxValue * plotHeight;
    }

    var count = points.length;
    var group = plotWidth / count;
    var barWidth = Math.min(13, Math.max(3, group * 0.3));
    var chunks = [];

    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var gridY = baseline - fraction * plotHeight;
      chunks.push('<line class="tc-grid" x1="' + left + '" y1="' + gridY.toFixed(1) +
        '" x2="' + right + '" y2="' + gridY.toFixed(1) + '"/>');
      chunks.push('<text class="tc-axis" x="' + (left - 8) + '" y="' + (gridY + 3).toFixed(1) +
        '" text-anchor="end">' + compactInr(maxValue * fraction) + '</text>');
    });
    chunks.push('<line class="tc-base" x1="' + left + '" y1="' + baseline +
      '" x2="' + right + '" y2="' + baseline + '"/>');

    var linePoints = [];
    var labelEvery = Math.max(1, Math.ceil(count / 8));

    points.forEach(function (point, index) {
      var center = left + group * (index + 0.5);
      var daily = Number(point.daily) || 0;
      var cumulative = Number(point.cumulative) || 0;
      var dailyHeight = daily > 0 ? Math.max(2, baseline - y(daily)) : 0;
      var cumulativeHeight = cumulative > 0 ? Math.max(2, baseline - y(cumulative)) : 0;
      var title = escapeXml((point.label || '') + ' · daily ' + inr(daily) +
        ' · accumulated ' + inr(cumulative));

      chunks.push('<g><title>' + title + '</title>');
      chunks.push('<rect class="tc-bar-cumulative" x="' + (center + 1).toFixed(1) +
        '" y="' + (baseline - cumulativeHeight).toFixed(1) + '" width="' + barWidth.toFixed(1) +
        '" height="' + cumulativeHeight.toFixed(1) + '" rx="2"/>');
      chunks.push('<rect class="tc-bar-daily" x="' + (center - barWidth - 1).toFixed(1) +
        '" y="' + (baseline - dailyHeight).toFixed(1) + '" width="' + barWidth.toFixed(1) +
        '" height="' + dailyHeight.toFixed(1) + '" rx="2"/>');
      chunks.push('</g>');

      linePoints.push(center.toFixed(1) + ',' + y(cumulative).toFixed(1));

      if (index % labelEvery === 0 || index === count - 1) {
        chunks.push('<text class="tc-axis" x="' + center.toFixed(1) + '" y="' + (baseline + 16) +
          '" text-anchor="middle">' + escapeXml(point.label || '') + '</text>');
      }
    });

    chunks.push('<polyline class="tc-line" points="' + linePoints.join(' ') + '"/>');

    var dotEvery = Math.max(1, Math.ceil(count / 6));
    points.forEach(function (point, index) {
      if (index !== 0 && index !== count - 1 && index % dotEvery !== 0) return;
      chunks.push('<circle class="tc-dot" cx="' + (left + group * (index + 0.5)).toFixed(1) +
        '" cy="' + y(point.cumulative).toFixed(1) + '" r="2.6"/>');
    });

    var latest = points[count - 1];
    var lastX = left + group * (count - 0.5);
    var lastY = y(latest.cumulative);
    chunks.push('<circle class="tc-dot-latest" cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="4"/>');
    chunks.push('<text class="tc-latest-label" x="' + (lastX - 8).toFixed(1) + '" y="' + (lastY - 10).toFixed(1) +
      '" text-anchor="end">' + inr(latest.cumulative) + '</text>');

    mount.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + chunks.join('') + '</svg>';
    mount.setAttribute('aria-label', 'Daily and accumulated payout for ' + (payout.period || 'this period') +
      '. Latest accumulated ' + inr(latest.cumulative) + (series.isIllustrative ? ', illustrative preview' : '') + '.');

    setText('#payoutTrendTotal', (series.isIllustrative ? '≈ ' : '') + inr(latest.cumulative));
    if (foot) foot.classList.toggle('is-live', !series.isIllustrative);
    setText(badge, series.isIllustrative ? 'Preview' : 'Recorded');
    setText(note, series.note || '');
  }

  function renderMetrics(dashboard, score, payout) {
    var attendance = dashboard.metrics && dashboard.metrics.attendance;
    if (attendance && attendance.value !== null) {
      setText('#metricAttendance', attendance.value);
      setText('#capAttendance', 'Recorded sessions · mock data');
      var bar = $('#attendanceBar');
      if (bar) bar.style.width = attendance.value + '%';
    } else {
      setText('#capAttendance', 'Not configured');
    }

    var scoreValue = score && score.score && score.score.value;
    if (scoreValue === null || scoreValue === undefined) {
      setText('#metricScore', '—');
      setText('#capScore', 'Scoring not configured');
    } else {
      setText('#metricScore', scoreValue);
      setText('#capScore', 'Teaching score · configured');
    }

    var review = dashboard.metrics && dashboard.metrics.toReview;
    if (review && review.value !== null) {
      setText('#metricReview', review.value);
      setText('#capReview', 'Quiz attempts · mock data');
    }

    if (!payout || !payout.amount || payout.amount.value === null) {
      setText('#metricPayout', '—');
      setText('#capPayout', (payout ? plural(payout.sessionCount, 'session') + ' · ' : '') + 'rules not configured');
    } else {
      setText('#metricPayout', '₹' + Number(payout.amount.value).toLocaleString('en-IN'));
      setText('#capPayout', payout.period + ' · statement ' + payout.statementDate);
    }
  }

  function renderBatches(batches) {
    var list = $('#allotedBatchList');
    if (!list) return;
    list.textContent = '';
    var rows = Array.isArray(batches) ? batches : [];
    setText('#batchCount', rows.length + (rows.length === 1 ? ' batch' : ' batches'));
    if (!rows.length) {
      var empty = document.createElement('li');
      empty.className = 'batch-empty';
      empty.textContent = 'No batches allotted yet.';
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (batch) {
      var item = document.createElement('li');
      item.title = '1:1 · ' + batch.studentName + ' · Batch ' + batch.code;
      var name = document.createElement('span');
      name.className = 'batch-student';
      name.textContent = batch.studentName || 'Student';
      var code = document.createElement('span');
      code.className = 'batch-code';
      code.textContent = batch.code || '—';
      item.appendChild(name);
      item.appendChild(code);
      if (batch.demoId) {
        var demo = document.createElement('a');
        demo.className = 'batch-demo';
        demo.href = batch.demoLink || ('/trainer/students?demoId=' + encodeURIComponent(batch.demoId));
        demo.textContent = 'Demo ' + batch.demoId;
        item.appendChild(demo);
      }
      list.appendChild(item);
    });
  }

  /* ------------------------------------------------- live session cues */
  /* This deck is desk-only: no child-facing console ever renders it. */
  function isTrainerDesk() {
    var role = window.MATHIFY_USER && window.MATHIFY_USER.role;
    var params = new URLSearchParams(window.location.search);
    return role !== 'student' && params.get('role') !== 'student' &&
      params.get('view') !== 'student';
  }

  function showPayGateDeck() {
    if (payGateDeck && isTrainerDesk()) payGateDeck.hidden = false;
  }

  function hidePayGateDeck() {
    if (!payGateDeck) return;
    payGateDeck.hidden = true;
    payGateDeck.classList.remove('is-met');
  }

  function countedMinutes(value) {
    return Math.floor(Math.max(0, Math.floor(Number(value) || 0)) / 60);
  }

  function requiredMinutes(gate, key, fallback) {
    var seconds = Number(gate[key + 'RequiredSeconds']);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds / 60);
    return fallback;
  }

  function meterValue(counted, required) {
    return String(countedMinutes(counted)).padStart(2, '0') + '/' + required + ' min';
  }

  function setPayMeter(which, label, value, counted, requiredSeconds) {
    var prefix = '#payGate' + which;
    setText(prefix + 'Label', label);
    setText(prefix + 'Value', value);
    var bar = payGateBars && payGateBars[which.toLowerCase()];
    if (!bar) return;
    var ratio = requiredSeconds > 0
      ? Math.max(0, Math.min(1, (Number(counted) || 0) / requiredSeconds)) : 0;
    bar.style.width = (ratio * 100).toFixed(1) + '%';
  }

  function applyPayGate(gate) {
    if (!payGateDeck) return;
    if (!isTrainerDesk()) {
      hidePayGateDeck();
      return;
    }
    showPayGateDeck();
    if (!gate) {
      payGateDeck.classList.remove('is-met');
      setText('#payGateState', 'Pay gate unavailable');
      setPayMeter('Child', 'Child', '—', 0, 0);
      setPayMeter('Trainer', 'Trainer', '—', 0, 0);
      setText('#payGateNote', 'Live pay and fine rules are unavailable right now.');
      return;
    }

    var childJoined = gate.childJoined === true;
    var childPresent = gate.childStillPresent === true;
    var childRequired = requiredMinutes(gate, 'child', 35);
    var childRequiredSeconds = Number(gate.childRequiredSeconds) || childRequired * 60;
    var trainerRequired = childJoined
      ? requiredMinutes(gate, 'trainer', 50)
      : (Number(gate.trainerOnlyMinutes) > 0
        ? Math.round(Number(gate.trainerOnlyMinutes)) : 15);
    var trainerRequiredSeconds = Number(gate.trainerRequiredSeconds) || trainerRequired * 60;
    var childCounted = Number(gate.childCountedSeconds) || 0;
    var trainerCounted = Number(gate.trainerCountedSeconds) || 0;
    var childMet = gate.childGateMet === true;
    var trainerMet = gate.trainerGateMet === true;
    var stateText;
    var childValue;
    var trainerValue;
    var note;

    if (!childJoined) {
      stateText = 'Child not joined';
      childValue = 'Not in session';
      trainerValue = countedMinutes(trainerCounted) + '/' + trainerRequired + ' min counted';
      note = trainerRequired + ' trainer minutes keeps full pay and avoids a fine.';
    } else {
      childValue = meterValue(childCounted, childRequired);
      trainerValue = meterValue(trainerCounted, trainerRequired);
      if (childMet && trainerMet) {
        stateText = 'Minimum met' + (childPresent ? '' : ' · Child left');
        note = 'Pay unlocked · 50–55 min pays only while the child stays.';
      } else {
        stateText = childPresent
          ? 'Child joined · minimum pending' : 'Child left · minimum pending';
        note = 'Pay needs child ' + childRequired + ' min + trainer ' + trainerRequired + ' min.';
      }
    }

    setText('#payGateState', stateText);
    setText('#payGateNote', note);
    setPayMeter('Child', 'Child', childValue, childJoined ? childCounted : 0,
      childJoined ? childRequiredSeconds : 0);
    setPayMeter('Trainer', 'Trainer', trainerValue, trainerCounted, trainerRequiredSeconds);
    payGateDeck.classList.toggle('is-met', childJoined && childMet && trainerMet);
  }

  function deskWarningCopy(details, seconds) {
    var info = details || {};
    var minutes = Math.ceil(Math.max(0, seconds) / 60) || 5;
    var label = info.minimumQuotaReached === true
      ? 'Minimum time complete · ' + minutes + ' min left'
      : 'Class ends in ' + minutes + ' minutes';
    if (info.childPresent === true || info.childJoined === true) {
      label += ' · class ends in 5 minutes';
    }
    return label;
  }

  function showDeskWarning(payload, withSound) {
    if (!warningEl) return;
    warningStateShown = true;
    var details = payload || {};
    var seconds = Number(details.countdownSeconds);
    if (!Number.isFinite(seconds)) seconds = 5 * 60;
    warningRemainingSeconds = Math.max(0, Math.floor(seconds));
    warningAnchorAt = Date.now();
    if (warningTextEl) {
      warningTextEl.textContent = deskWarningCopy(details, warningRemainingSeconds);
    }
    if (warningCountEl) warningCountEl.textContent = clock(warningRemainingSeconds);
    warningEl.hidden = false;
    if (withSound && !warningAnnounced && window.MathifySessionAlerts) {
      window.MathifySessionAlerts.ping('warning');
      warningAnnounced = true;
    }
  }

  function clearDeskWarning() {
    warningAnchorAt = null;
    warningRemainingSeconds = null;
    if (warningEl) warningEl.hidden = true;
  }

  function paintDeskWarning() {
    if (!warningEl || warningEl.hidden || warningAnchorAt === null) return;
    var remaining = Math.max(0,
      (warningRemainingSeconds || 0) - Math.floor((Date.now() - warningAnchorAt) / 1000));
    if (warningCountEl) warningCountEl.textContent = clock(remaining);
    if (remaining === 0) clearDeskWarning();
  }

  function handleDeskEvent(event) {
    if (!event || !event.event) return;
    if (event.event === 'session.warning') {
      showDeskWarning(event.payload || {}, true);
      toast('Five minutes left. Wrap up the class now.');
    } else if (event.event === 'participant.joined' || event.event === 'participant.left') {
      if (window.MathifySessionAlerts) {
        window.MathifySessionAlerts.ping(
          event.event === 'participant.joined' ? 'join' : 'leave');
      }
    } else if (event.event === 'session.ended' || event.event === 'session.auto_closed') {
      clearDeskWarning();
      if (event.event === 'session.auto_closed') toast('Session closed at the scheduled end time.');
    }
  }

  /* The state poll drives the live pay tracker and the quiet fallback cue.
     It shares the event tick so a selected session refreshes both together. */
  function applySessionState(state) {
    var payload = state || {};
    applyPayGate(payload.payGate);
    var timing = payload.sessionTiming;
    if (!timing) return;
    if (timing.closeReached === true) {
      clearDeskWarning();
      return;
    }
    if (timing.minimumQuotaReached !== true || warningStateShown) return;
    var cueSeconds = timing.minimumQuota && Number(timing.minimumQuota.cueSeconds);
    if (!Number.isFinite(cueSeconds)) cueSeconds = 5 * 60;
    showDeskWarning({
      minimumQuotaReached: true,
      childPresent: timing.childPresent === true,
      childJoined: timing.childPresent === true,
      classType: timing.classType,
      countdownSeconds: cueSeconds,
      minimumQuota: timing.minimumQuota
    }, false);
  }

  function pollSessionEvents() {
    var sessionId = activeSessionId;
    if (!sessionId) return;
    if (api && api.getSessionEvents) {
      api.getSessionEvents(sessionId, sessionEventCursor).then(function (events) {
        if (sessionId !== activeSessionId) return;
        var maxSeq = sessionEventCursor;
        events.forEach(function (event) {
          var seq = Number(event.seq) || 0;
          if (seq > maxSeq) maxSeq = seq;
          if (sessionEventCursorReady) handleDeskEvent(event);
        });
        sessionEventCursor = maxSeq;
        sessionEventCursorReady = true;
      }).catch(function () { /* transient polling failure; next tick retries */ });
    }
    if (api && api.getSessionState) {
      api.getSessionState(sessionId).then(function (state) {
        if (sessionId !== activeSessionId) return;
        applySessionState(state || {});
      }).catch(function () { /* dashboard remains usable without session state */ });
    }
  }

  function startSessionEventPolling(sessionId) {
    if (!sessionId) return;
    if (sessionEventPollingId === sessionId && sessionEventTimer) return;
    activeSessionId = sessionId;
    window.MATHIFY_SESSION_ID = sessionId;
    try { window.localStorage.setItem('mathify.trainer.sessionId', sessionId); } catch (error) { /* private mode */ }
    sessionEventPollingId = sessionId;
    sessionEventCursor = 0;
    sessionEventCursorReady = false;
    warningAnnounced = false;
    warningStateShown = false;
    clearDeskWarning();
    showPayGateDeck();
    if (sessionEventTimer) window.clearInterval(sessionEventTimer);
    pollSessionEvents();
    sessionEventTimer = window.setInterval(pollSessionEvents, 1500);
  }

  function applyActiveSession(session) {
    if (!session) return;
    activeSessionId = session.id;
    window.MATHIFY_SESSION_ID = session.id;
    activeSessionStartedAt = session.startsAt || session.scheduledAt || null;
    activeLinkMinutes = Number(session.durationMinutes) > 0
      ? Number(session.durationMinutes) : 50;
    startSessionEventPolling(session.id);
    setText('#nextTime', fmtTime(session.startsAt) + ' · live 1:1');
    setText('#nextTopic', session.title);
    if (window.MathifySubjects && typeof window.MathifySubjects.setNextMeta === 'function') {
      window.MathifySubjects.setNextMeta(session, dashboardSnapshot && dashboardSnapshot.trainer);
    } else {
      var minutes = Number(session.durationMinutes) > 0
        ? Number(session.durationMinutes) : 50;
      setText('#nextMeta', '1:1 · ' + (session.student ? session.student.name : 'Student') +
        ' · ' + (session.code || 'Session') + ' · link active for ' + minutes + ' min');
    }
    renderPlan(session);
    setText('#countdownLabel', session.status === 'live' ? 'session' : 'starts in');
    setText('#countdown', session.status === 'live' ? 'LIVE NOW' : 'SOON');
  }

  function nextScheduledSession(excludeId) {
    if (!dashboardSnapshot || !Array.isArray(dashboardSnapshot.today)) return null;
    var cutoff = Date.now() - ACTIVE_LINK_MINUTES * 60000;
    return dashboardSnapshot.today.filter(function (session) {
      return session.id !== excludeId &&
        !rolledSessionIds[session.id] &&
        (session.status === 'scheduled' || session.status === 'live') &&
        new Date(session.startsAt || session.scheduledAt || 0).getTime() >= cutoff;
    }).sort(function (left, right) {
      return new Date(left.startsAt || 0) - new Date(right.startsAt || 0);
    })[0] || null;
  }

  /* Dashboard link promotion follows the booked class length. Demos and
     regular classes are both 50 minutes; pay still uses the server's audit
     window. */
  function checkActiveLinkRollover() {
    paintDeskWarning();
    if (!activeSessionStartedAt) return;
    var started = new Date(activeSessionStartedAt).getTime();
    if (isNaN(started) || Date.now() - started < activeLinkMinutes * 60000) return;
    var nextSession = nextScheduledSession(activeSessionId);
    if (!nextSession) return;
    rolledSessionIds[activeSessionId] = true;
    applyActiveSession(nextSession);
    if (window.toast) window.toast('Next session link is now active: ' + nextSession.title + '.');
  }

  function renderDashboard(dashboard, score, payout, attention, register) {
    document.body.setAttribute('data-api', 'live');
    apiRendered = true;
    dashboardSnapshot = dashboard;

    var total = dashboard.summary.sessionsToday || 0;
    var taken = dashboard.summary.sessionsTaken || 0;
    var remaining = dashboard.summary.sessionsRemaining || 0;
    setText('#greetingName', (dashboard.trainer && dashboard.trainer.name || 'Ananya').split(' ')[0]);
    setText('#profileName', (dashboard.trainer && dashboard.trainer.name) || 'Trainer');
    setText('#subSessions', plural(total, 'session') + ' today · ' + taken + ' taken · ' + remaining + ' left');
    setText('#subStudents', plural(dashboard.summary.studentsNext, 'student') + ' next');
    var attentionWord = dashboard.summary.needsAttention === 1 ? 'item needs' : 'items need';
    setText('#subAttention', dashboard.summary.needsAttention + ' ' + attentionWord + ' attention');
    setText('#attentionCount', String(dashboard.summary.needsAttention).padStart(2, '0'));
    setText('#dayCount', plural(total, 'session') + ' · ' + taken + ' taken · ' + remaining + ' left');

    var next = dashboard.nextSession;
    if (next && !rolledSessionIds[next.id]) applyActiveSession(next);
    checkActiveLinkRollover();
    if (!rolloverTimer) rolloverTimer = window.setInterval(checkActiveLinkRollover, 1000);

    renderTimeline(dashboard.today);
    if (window.MathifySubjects && typeof window.MathifySubjects.decorateTrainer === 'function') {
      window.MathifySubjects.decorateTrainer(dashboard);
    }
    renderMetrics(dashboard, score, payout);
    renderPayoutTrend(payout);
    renderAttention((attention && attention.items) || dashboard.attention);
    if (register) renderRegister(register);
  }

  var api = window.mathifyTrainerApi;

  if (activeSessionId) showPayGateDeck();

  (function bindProfile() {
    var profileBtn = $('#profileBtn');
    var profilePanel = $('#profilePanel');
    if (!profileBtn || !profilePanel) return;
    profileBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = profilePanel.hidden;
      profilePanel.hidden = !open;
      profileBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if (!profilePanel.hidden && !profilePanel.contains(event.target) && event.target !== profileBtn) {
        profilePanel.hidden = true;
        profileBtn.setAttribute('aria-expanded', 'false');
      }
    });
    var logoutBtn = $('#logoutBtn');
    if (logoutBtn && api && typeof api.logout === 'function') {
      logoutBtn.addEventListener('click', api.logout);
    }
  }());

  if (api) {
    if (window.mathifyLeaveCalendar) {
      window.mathifyLeaveCalendar.mount({
        mount: '#leaveCalendar',
        role: 'trainer',
        request: api.request
      });
    }
    if (window.mathifyTrainerSchedule) {
      window.mathifyTrainerSchedule.mount({ mount: '#trainerSchedule', api: api });
    }

    Promise.all([
      api.getDashboard(),
      api.getScore().catch(function () { return null; }),
      api.getPayout().catch(function () { return null; }),
      api.getAttention().catch(function () { return null; }),
      api.getAttendance().catch(function () { return null; }),
      api.getBatches().catch(function () { return []; })
    ]).then(function (results) {
      renderDashboard(results[0], results[1], results[2], results[3], results[4]);
      renderBatches(results[5]);
    }).catch(function (error) {
      document.body.setAttribute('data-api', 'fallback');
      var banner = document.createElement('div');
      banner.className = 'api-banner';
      banner.setAttribute('role', 'status');
      banner.textContent = 'Offline preview · live trainer data is unavailable. Retry when the API is reachable.';
      document.body.appendChild(banner);
      if (window.console && console.warn) console.warn('Mathify API unavailable; trainer console is showing sample data.', error);
    });
  }

})();
