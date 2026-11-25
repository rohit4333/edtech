/* ==========================================================================
   MATHIFY — student desk
   No dependencies. State via ?state=soon|live|empty|loading
   ========================================================================== */
(function () {
  'use strict';

  var STATES = ['soon', 'live', 'ended', 'empty', 'loading'];
  var params = new URLSearchParams(window.location.search);
  var requested = params.get('state');
  var state = STATES.indexOf(requested) !== -1 ? requested : 'soon';

  var countdownEl = document.getElementById('countdown');
  var pendingCount = document.querySelector('.block-head .count');
  var timer = null;

  /* ---------- state ---------- */
  function applyState(next) {
    state = next;
    document.body.dataset.state = state;

    document.querySelectorAll('.only-soon').forEach(function (el) {
      el.hidden = state !== 'soon';
    });
    document.querySelectorAll('.only-live').forEach(function (el) {
      el.hidden = state !== 'live';
    });
    document.querySelectorAll('.only-ended').forEach(function (el) {
      el.hidden = state !== 'ended';
    });
    document.querySelectorAll('.only-empty').forEach(function (el) {
      el.hidden = state !== 'empty';
    });

    if (pendingCount) pendingCount.textContent = state === 'empty' ? '00' : '03';
  }

  function startCountdown() {
    if (timer) window.clearInterval(timer);
    if (state !== 'soon') return;

    var end = Date.now() + 42 * 60 * 1000;

    function tick() {
      var ms = Math.max(0, end - Date.now());
      var mins = Math.floor(ms / 60000);
      var secs = Math.floor((ms % 60000) / 1000);

      if (countdownEl) {
        countdownEl.textContent =
          String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }

      if (ms === 0) {
        window.clearInterval(timer);
        applyState('live');
      }
    }

    tick();
    timer = window.setInterval(tick, 1000);
  }

  /* ---------- batch switcher ---------- */
  var batchBtn = document.getElementById('batchBtn');
  var batchMenu = document.getElementById('batchMenu');
  var batchLabel = document.getElementById('batchLabel');

  function closeBatch() {
    if (!batchMenu || !batchBtn) return;
    batchMenu.hidden = true;
    batchBtn.setAttribute('aria-expanded', 'false');
  }

  if (batchBtn && batchMenu) {
    batchBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = batchMenu.hidden;
      batchMenu.hidden = !open;
      batchBtn.setAttribute('aria-expanded', String(open));
    });

    batchMenu.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (!option) return;

      batchMenu.querySelectorAll('[role="option"]').forEach(function (el) {
        el.setAttribute('aria-selected', String(el === option));
      });
      batchLabel.textContent = option.dataset.value;
      closeBatch();
      batchBtn.focus();
    });

    document.addEventListener('click', function (event) {
      if (!batchMenu.hidden && !event.target.closest('.batch-wrap')) closeBatch();
    });
  }

  /* ---------- rail nav + mobile tabs ---------- */
  function activate(group, target) {
    group.forEach(function (el) {
      el.classList.toggle('active', el === target);
      if (el === target) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  navLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      activate(navLinks, link);
    });
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activate(tabs, tab);
    });
  });

  /* placeholder links should never jump the page */
  document.querySelectorAll('a[href="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
    });
  });

  /* show the right shortcut hint per platform */
  var kbd = document.querySelector('.search kbd');
  if (kbd) {
    var isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    kbd.textContent = isMac ? '⌘K' : 'Ctrl K';
  }

  /* ---------- tutor panel ---------- */
  var fab = document.getElementById('aiFab');
  var panel = document.getElementById('aiPanel');
  var closeBtn = document.getElementById('aiClose');
  var input = document.getElementById('aiInput');
  var form = document.getElementById('aiForm');
  var body = document.getElementById('aiBody');

  function openPanel() {
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Close tutor');
    window.setTimeout(function () {
      if (input) input.focus();
    }, 30);
  }

  function closePanel() {
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open tutor');
  }

  function togglePanel() {
    if (!panel) return;
    if (panel.hidden) openPanel();
    else closePanel();
  }

  if (fab) fab.addEventListener('click', togglePanel);
  if (closeBtn) closeBtn.addEventListener('click', function () {
    closePanel();
    fab.focus();
  });

  document.querySelectorAll('[data-open-ai]').forEach(function (btn) {
    btn.addEventListener('click', openPanel);
  });

  /* ---------- tutor conversation (Cloudflare-backed) ---------- */
  function addMessage(text, who) {
    if (!body) return null;
    var p = document.createElement('p');
    p.className = 'msg ' + who;
    p.textContent = text;
    body.appendChild(p);
    body.scrollTop = body.scrollHeight;
    return p;
  }

  function askTutor(text) {
    var api = window.mathifyStudentApi;
    if (!api || typeof api.askTutor !== 'function') {
      return Promise.resolve({
        reply: 'The tutor service is unavailable right now. Please retry in a moment.',
        source: 'offline'
      });
    }
    return api.askTutor(text, window.MATHIFY_SESSION_ID || null);
  }

  if (form && input) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;

      addMessage(text, 'me');
      input.value = '';
      var pending = addMessage('Thinking…', 'bot');

      askTutor(text).then(function (data) {
        if (!pending) return;
        pending.textContent = (data && data.reply) || 'No reply was returned. Please retry.';
        if (data && data.source && data.source !== 'ai') pending.dataset.source = data.source;
      }).catch(function () {
        if (pending) {
          pending.textContent = 'The tutor could not be reached. Please retry in a moment.';
          pending.dataset.source = 'offline';
        }
      });
    });
  }

  document.querySelectorAll('.ai-chips button').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (!input || !form) return;
      input.value = chip.textContent.trim();
      form.requestSubmit();
    });
  });

  /* ---------- app strip ---------- */
  var strip = document.getElementById('appStrip');
  var stripClose = document.getElementById('stripClose');
  var STRIP_KEY = 'mathify.appStrip';

  try {
    if (strip && window.localStorage.getItem(STRIP_KEY) === 'hidden') strip.remove();
  } catch (error) {
    /* storage blocked — keep the strip */
  }

  if (strip && stripClose) {
    stripClose.addEventListener('click', function () {
      try {
        window.localStorage.setItem(STRIP_KEY, 'hidden');
      } catch (error) {
        /* ignore */
      }
      strip.style.transition = 'opacity .18s ease';
      strip.style.opacity = '0';
      window.setTimeout(function () {
        strip.remove();
      }, 180);
    });
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (event) {
    var search = document.getElementById('searchInput');

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (search) search.focus();
      return;
    }

    if (event.key === 'Escape') {
      closeBatch();
      if (panel && !panel.hidden) {
        closePanel();
        if (fab) fab.focus();
      }
      if (search && document.activeElement === search) search.blur();
    }
  });

  /* ---------- leave calendar ---------- */
  var api = window.mathifyStudentApi;
  if (api && window.mathifyLeaveCalendar) {
    window.mathifyLeaveCalendar.mount({
      mount: '#leaveCalendar',
      role: 'student',
      request: api.request
    });
  }

  /* ---------- boot ---------- */
  applyState(state);
  startCountdown();
})();
