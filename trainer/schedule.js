/* ==========================================================================
   MATHIFY — trainer commitment calendar.
   Shows classes with timings, committed slots, and unutilised-hour pay.
   ========================================================================== */
(function () {
  'use strict';

  var WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(value) { return String(value).padStart(2, '0'); }

  function currentMonth() { return new Date().toISOString().slice(0, 7); }

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

  function money(value, currency) {
    return (currency || 'INR') + ' ' + Number(value || 0).toLocaleString('en-IN');
  }

  function mount(options) {
    var config = options || {};
    var host = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
    var api = config.api;
    if (!host || !api) return null;

    var state = { month: currentMonth(), view: null, slots: [], error: '', success: '', loading: true };

    function daysByDate() {
      var map = {};
      ((state.view && state.view.days) || []).forEach(function (day) { map[day.date] = day; });
      return map;
    }

    function renderHead(parent) {
      var head = el('div', 'sc-head');
      var copy = el('div');
      copy.appendChild(el('span', 'mono', 'COMMITTED SCHEDULE'));
      copy.appendChild(el('h3', null, 'Your classes & slots'));
      copy.appendChild(el('p', null,
        'Classes inside a declared slot are paid at 100%. Unutilised slot hours are paid at ' +
        ((state.view && state.view.rules && state.view.rules.unutilisedPayPercent) || 30) +
        '% of your session rate. All times shown in UTC.'));
      head.appendChild(copy);
      parent.appendChild(head);
    }

    function renderNav(parent) {
      var nav = el('div', 'sc-nav');
      nav.appendChild(el('span', 'sc-month', monthLabel(state.month)));
      var buttons = el('div', 'sc-nav-buttons');

      var prev = el('button', null, '‹');
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Previous month');
      prev.disabled = state.month <= currentMonth().slice(0, 7);
      prev.addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });

      var next = el('button', null, '›');
      next.type = 'button';
      next.setAttribute('aria-label', 'Next month');
      next.addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });

      buttons.appendChild(prev);
      buttons.appendChild(next);
      nav.appendChild(buttons);
      parent.appendChild(nav);
    }

    function renderGrid(parent) {
      var grid = el('div', 'sc-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Scheduled classes by date');
      WEEKDAYS.forEach(function (day) { grid.appendChild(el('span', 'sc-week', day)); });

      for (var blank = 0; blank < leadingBlanks(state.month); blank += 1) {
        grid.appendChild(el('span', 'sc-day is-muted', ''));
      }

      var parts = state.month.split('-').map(Number);
      var byDate = daysByDate();
      var today = new Date().toISOString().slice(0, 10);

      for (var day = 1; day <= monthDays(state.month); day += 1) {
        var date = parts[0] + '-' + pad(parts[1]) + '-' + pad(day);
        var record = byDate[date] || { classes: [], slots: [] };
        var classesForDay = record.classes || [];

        var dayEl = el('div', 'sc-day');
        if (date < today) dayEl.classList.add('is-muted');
        if (record.slots && record.slots.length) dayEl.classList.add('is-slot');
        if (date === today) dayEl.classList.add('is-today');

        dayEl.appendChild(el('span', 'sc-day-num', day));
        classesForDay.forEach(function (item) {
          var line = el('span', 'sc-class');
          line.appendChild(el('b', null, item.time || '--:--'));
          line.appendChild(document.createTextNode(item.title || '1-on-1 session'));
          line.title = (item.startsAt || date) + ' · ' + (item.durationMinutes || 60) + ' min · ' + item.status;
          dayEl.appendChild(line);
        });
        if (record.slots && record.slots.length) {
          var slot = record.slots[0];
          dayEl.appendChild(el('span', 'sc-slotline', slot.start + '–' + slot.end + ' UTC'));
        }

        grid.appendChild(dayEl);
      }

      parent.appendChild(grid);
    }

    function renderTotals(parent) {
      var totals = (state.view && state.view.totals) || {};
      var currency = state.view && state.view.currency;
      var box = el('div', 'sc-totals');

      var committed = el('div', 'sc-total');
      committed.appendChild(el('span', null, 'Committed · 100%'));
      committed.appendChild(el('b', null, money(totals.committedPay, currency)));
      committed.appendChild(el('small', null, Number(totals.committedHours || 0).toFixed(2) + ' h of classes'));
      box.appendChild(committed);

      var idle = el('div', 'sc-total is-idle');
      idle.appendChild(el('span', null, 'Unutilised · 30%'));
      idle.appendChild(el('b', null, money(totals.unutilisedPay, currency)));
      idle.appendChild(el('small', null, Number(totals.unutilisedHours || 0).toFixed(2) + ' h of open slot'));
      box.appendChild(idle);

      parent.appendChild(box);
      parent.appendChild(el('p', 'sc-note',
        state.view && state.view.note ? state.view.note : 'Loading slot summary…'));
    }

    function renderSlots(parent) {
      var detail = el('div', 'sc-detail');
      detail.appendChild(el('h4', null, 'Declared slots'));

      var list = el('ul', 'sc-slotlist');
      if (!state.slots.length) list.appendChild(el('li', null, 'No slots declared yet.'));
      state.slots.forEach(function (slot) {
        var row = el('li');
        var text = el('span', null,
          (slot.date || DAY_NAMES[slot.dayOfWeek] || 'One-off') + ' · ' +
          pad(Math.floor(slot.startMinuteUtc / 60)) + ':' + pad(slot.startMinuteUtc % 60) + '–' +
          pad(Math.floor(slot.endMinuteUtc / 60)) + ':' + pad(slot.endMinuteUtc % 60) + ' UTC · ' +
          (slot.label || 'Committed slot'));
        row.appendChild(text);
        row.appendChild(el('b', null, ((slot.endMinuteUtc - slot.startMinuteUtc) / 60) + ' h'));
        var remove = el('button', null, '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove slot');
        remove.addEventListener('click', function () {
          api.deleteSlot(slot.id).then(load).catch(function (error) {
            state.error = error.message || 'Slot could not be removed.';
            render();
          });
        });
        row.appendChild(remove);
        list.appendChild(row);
      });
      detail.appendChild(list);

      var form = el('form', 'sc-form');
      var dayLabel = el('label', null, 'Day');
      var day = el('select');
      DAY_NAMES.forEach(function (name, index) {
        var option = el('option', null, name);
        option.value = String(index);
        day.appendChild(option);
      });
      day.value = '1';
      dayLabel.appendChild(day);
      form.appendChild(dayLabel);

      var startLabel = el('label', null, 'Start UTC');
      var start = el('input');
      start.type = 'time';
      start.value = '12:00';
      startLabel.appendChild(start);
      form.appendChild(startLabel);

      var endLabel = el('label', null, 'End UTC');
      var end = el('input');
      end.type = 'time';
      end.value = '16:00';
      endLabel.appendChild(end);
      form.appendChild(endLabel);

      var labelLabel = el('label', null, 'Label');
      var label = el('input');
      label.type = 'text';
      label.value = 'Committed slot';
      labelLabel.appendChild(label);
      form.appendChild(labelLabel);

      var submit = el('button', null, 'Add slot');
      submit.type = 'submit';
      form.appendChild(submit);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        state.error = '';
        var toMinutes = function (value) {
          var parts = String(value || '').split(':').map(Number);
          return parts[0] * 60 + parts[1];
        };
        api.addSlot({
          dayOfWeek: Number(day.value),
          startMinuteUtc: toMinutes(start.value),
          endMinuteUtc: toMinutes(end.value),
          label: label.value
        }).then(function () {
          state.success = 'Slot committed. Classes in it are fully paid; open hours earn 30%.';
          return load();
        }).catch(function (error) {
          state.error = error.message || 'Slot could not be saved.';
          render();
        });
      });
      detail.appendChild(form);

      if (state.error) detail.appendChild(el('p', 'sc-error', state.error));
      if (state.success) detail.appendChild(el('p', 'sc-note', state.success));
      parent.appendChild(detail);
    }

    function render() {
      host.textContent = '';
      host.classList.add('schedule-calendar');
      renderHead(host);
      renderNav(host);
      renderGrid(host);
      renderTotals(host);
      renderSlots(host);
    }

    function load() {
      state.loading = true;
      state.error = '';
      return Promise.all([
        api.getSchedule(state.month),
        api.getSlots()
      ]).then(function (results) {
        state.view = results[0] || {};
        state.slots = (results[1] && results[1].slots) || [];
        state.loading = false;
        render();
        return state.view;
      }).catch(function (error) {
        state.loading = false;
        state.error = error.message || 'Schedule unavailable.';
        state.view = { days: [], totals: {} };
        render();
        return null;
      });
    }

    load();
    return { refresh: load };
  }

  window.mathifyTrainerSchedule = { mount: mount };
})();
