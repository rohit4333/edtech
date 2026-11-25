/* ==========================================================================
   MATHIFY — shared leave-request calendar.
   Mount with { mount, role, request }. The host supplies the authenticated
   request function; this component never handles tokens or secrets.
   ========================================================================== */
(function () {
  'use strict';

  var WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  function pad(value) { return String(value).padStart(2, '0'); }

  function currentMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  function shiftMonth(month, delta) {
    var parts = month.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1)).toISOString().slice(0, 7);
  }

  function monthDays(month) {
    var parts = month.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  }

  function leadingBlanks(month) {
    var parts = month.split('-').map(Number);
    return (new Date(Date.UTC(parts[0], parts[1] - 1, 1)).getUTCDay() + 6) % 7;
  }

  function monthLabel(month) {
    var parts = month.split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, 1))
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function mount(options) {
    var config = options || {};
    var host = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
    if (!host || typeof config.request !== 'function') return null;

    var role = config.role || 'student';
    var state = {
      view: null,
      month: currentMonth(),
      selectedDate: null,
      selectedSessionId: null,
      error: '',
      success: '',
      loading: true
    };

    function sessionsFor(date) {
      var sessions = (state.view && state.view.sessions) || [];
      return sessions.filter(function (session) { return session.date === date; });
    }

    function eligibleSessions() {
      return ((state.view && state.view.sessions) || []).filter(function (session) { return session.eligible; });
    }

    function earliestEligible() {
      var list = eligibleSessions();
      return list.length ? list[0].date : null;
    }

    function noticeText() {
      var rules = state.view && state.view.rules;
      var days = rules && rules.noticeDays ? Number(rules.noticeDays) : 2;
      return 'Apply at least ' + days + ' days before a session.';
    }

    function renderBalance(parent) {
      var balance = state.view && state.view.balance;
      var box = el('div', 'lc-balance');

      if (role === 'trainer' && balance) {
        box.appendChild(el('span', 'mono', 'Leave balance'));
        box.appendChild(el('b', 'lc-balance-num', balance.remaining + '/' + balance.total));
        box.appendChild(el('span', 'lc-balance-detail',
          balance.used + ' used · ' + balance.period + ' · session leaves'));
      } else {
        box.appendChild(el('span', 'mono', 'Mutual leave'));
        box.appendChild(el('b', 'lc-balance-num', '2d'));
        box.appendChild(el('span', 'lc-balance-detail', 'No pack deduction'));
      }
      parent.appendChild(box);
    }

    function renderHead(parent) {
      var head = el('div', 'lc-head');
      var copy = el('div');
      copy.appendChild(el('span', 'mono', 'LEAVE REQUEST'));
      copy.appendChild(el('h3', null, 'Plan time away'));
      copy.appendChild(el('p', null,
        noticeText() + ' Both sides get the same leave; nobody is marked absent or charged.'));
      head.appendChild(copy);
      renderBalance(head);
      parent.appendChild(head);
    }

    function renderNav(parent) {
      var nav = el('div', 'lc-nav');
      nav.appendChild(el('span', 'lc-month', monthLabel(state.month)));

      var buttons = el('div', 'lc-nav-buttons');
      var prev = el('button', null, '‹');
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Previous month');
      prev.disabled = state.month <= currentMonth();
      prev.addEventListener('click', function () {
        state.month = shiftMonth(state.month, -1);
        render();
      });

      var next = el('button', null, '›');
      next.type = 'button';
      next.setAttribute('aria-label', 'Next month');
      next.addEventListener('click', function () {
        state.month = shiftMonth(state.month, 1);
        render();
      });

      buttons.appendChild(prev);
      buttons.appendChild(next);
      nav.appendChild(buttons);
      parent.appendChild(nav);
    }

    function renderGrid(parent) {
      var grid = el('div', 'lc-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Choose a leave date');

      WEEKDAYS.forEach(function (day) { grid.appendChild(el('span', 'lc-week', day)); });
      for (var blank = 0; blank < leadingBlanks(state.month); blank += 1) {
        grid.appendChild(el('span', 'lc-day is-muted', ''));
      }

      var parts = state.month.split('-').map(Number);
      var today = new Date().toISOString().slice(0, 10);
      var total = monthDays(state.month);

      for (var day = 1; day <= total; day += 1) {
        var date = parts[0] + '-' + pad(parts[1]) + '-' + pad(day);
        var daySessions = sessionsFor(date);
        var hasLeave = daySessions.some(function (session) { return session.hasLeave; });
        var hasEligible = daySessions.some(function (session) { return session.eligible; });
        var classes = ['lc-day'];
        if (date < today) classes.push('is-muted');
        if (hasLeave) classes.push('is-leave');
        else if (hasEligible) classes.push('is-eligible');
        if (date === state.selectedDate) classes.push('is-selected');

        var button = el('button', classes.join(' '), day);
        button.type = 'button';
        button.setAttribute('aria-label', date + (hasLeave ? ' · leave applied' : hasEligible ? ' · session available' : ''));
        button.disabled = !hasEligible && !hasLeave;
        if (button.disabled) button.classList.add('is-muted');
        button.addEventListener('click', function () {
          state.selectedDate = date;
          var first = daySessions.find(function (session) { return session.eligible; });
          state.selectedSessionId = first ? first.id : null;
          state.error = '';
          state.success = '';
          render();
        });
        grid.appendChild(button);
      }

      parent.appendChild(grid);
    }

    function renderAction(parent) {
      var box = el('div', 'lc-action');
      var chosen = sessionsFor(state.selectedDate);

      if (!chosen.length) {
        box.appendChild(el('p', 'lc-empty', state.loading
          ? 'Loading sessions…'
          : 'No sessions in this month can be changed with 2 days notice.'));
      } else {
        var list = el('ul', 'lc-session-list');
        chosen.forEach(function (session) {
          var item = el('li');
          var button = el('button', 'lc-session');
          button.type = 'button';
          button.setAttribute('aria-pressed', String(session.id === state.selectedSessionId));
          button.disabled = !session.eligible;
          button.appendChild(el('span', 'lc-session-time', (session.time || '--:--') + ' UTC'));
          var copy = el('span', 'lc-session-copy');
          copy.appendChild(el('b', null, session.title || '1-on-1 maths session'));
          copy.appendChild(el('small', null, session.hasLeave
            ? 'Leave applied'
            : session.studentName + ' · ' + session.trainerName));
          button.appendChild(copy);
          button.addEventListener('click', function () {
            state.selectedSessionId = session.id;
            state.error = '';
            render();
          });
          item.appendChild(button);
          list.appendChild(item);
        });
        box.appendChild(list);

        var balance = state.view && state.view.balance;
        var exhausted = role === 'trainer' && balance && balance.remaining < 1;
        var apply = el('button', 'lc-apply', exhausted ? 'No leave credits left' : 'Apply for leave');
        apply.type = 'button';
        apply.disabled = !state.selectedSessionId || exhausted;
        apply.addEventListener('click', submitLeave);
        box.appendChild(apply);
      }

      box.appendChild(el('p', 'lc-note',
        role === 'trainer' ? 'Each approved trainer leave uses one of 8 monthly credits.'
          : 'Student leave is mutual and does not reduce pack sessions.'));

      if (state.error) box.appendChild(el('p', 'lc-error', state.error));
      if (state.success) box.appendChild(el('p', 'lc-note', state.success));
      parent.appendChild(box);
    }

    function renderRecent(parent) {
      var list = el('ul', 'lc-recent');
      var requests = ((state.view && state.view.requests) || []).slice(-4).reverse();
      if (!requests.length) return;
      requests.forEach(function (request) {
        var row = el('li');
        row.appendChild(el('span', null, request.date + ' · ' + (request.status || 'approved')));
        row.appendChild(el('b', null, (request.requestedByRole || role) === 'trainer' ? 'Trainer leave' : 'Student leave'));
        list.appendChild(row);
      });
      parent.appendChild(list);
    }

    function render() {
      host.textContent = '';
      host.classList.add('leave-calendar');
      renderHead(host);
      renderNav(host);
      renderGrid(host);
      renderAction(host);
      renderRecent(host);
    }

    function submitLeave() {
      if (!state.selectedSessionId) return;
      state.error = '';
      state.success = '';
      render();

      config.request('/leaves', {
        method: 'POST',
        body: { sessionId: state.selectedSessionId, reason: 'Planned mutual leave' }
      }).then(function (data) {
        state.success = 'Leave approved. The session is marked as mutual leave for both of you.';
        return load();
      }).catch(function (error) {
        state.error = error.message || 'Leave could not be applied.';
        render();
      });
    }

    function load() {
      state.loading = true;
      render();
      return config.request('/leaves').then(function (data) {
        state.view = (data && data.leave) || data || {};
        state.loading = false;
        if (!state.selectedDate) state.selectedDate = earliestEligible();
        if (!state.selectedSessionId) {
          var first = sessionsFor(state.selectedDate).find(function (session) { return session.eligible; });
          state.selectedSessionId = first ? first.id : null;
        }
        render();
        return state.view;
      }).catch(function (error) {
        state.loading = false;
        state.error = error.message || 'Leave calendar unavailable.';
        render();
        return null;
      });
    }

    load();
    return { refresh: load };
  }

  window.mathifyLeaveCalendar = { mount: mount };
})();
