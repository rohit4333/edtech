/* ==========================================================================
   MATHIFY — trainer commitment calendar.
   Seven-day timetable: dates on the x-axis, UTC hour marks on the y-axis.
   ========================================================================== */
(function () {
  'use strict';

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(value) { return String(value).padStart(2, '0'); }

  function parseDay(value) {
    var input = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(NaN);
    var date = new Date(input + 'T00:00:00.000Z');
    return isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? new Date(NaN) : date;
  }

  function ymd(date) { return date.toISOString().slice(0, 10); }

  function today() { return ymd(new Date()); }

  function mondayOf(value) {
    var date = parseDay(value);
    if (isNaN(date.getTime())) date = new Date(today() + 'T00:00:00.000Z');
    var weekday = (date.getUTCDay() + 6) % 7;
    return ymd(new Date(date.getTime() - weekday * 86400000));
  }

  function shiftDays(value, amount) {
    var date = parseDay(value);
    return ymd(new Date(date.getTime() + amount * 86400000));
  }

  function weekLabel(start) {
    var first = parseDay(start);
    var last = new Date(first.getTime() + 6 * 86400000);
    var format = { day: '2-digit', month: 'short', timeZone: 'UTC' };
    return first.toLocaleDateString('en-GB', format) + ' – ' +
      last.toLocaleDateString('en-GB', format) + ' ' + last.getUTCFullYear();
  }

  function dayLabel(value) {
    var date = parseDay(value);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC'
    }).toUpperCase();
  }

  function viewerZone() {
    return window.MATHIFY_TZ || 'Asia/Kolkata';
  }

  function localTime(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: viewerZone(), hour: '2-digit', minute: '2-digit', hour12: true
      }).format(date) + ' (' + viewerZone() + ')';
    } catch (error) { return ''; }
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

    var state = {
      weekStart: mondayOf(today()),
      view: null,
      slots: [],
      error: '',
      success: '',
      loading: true
    };

    function renderHead(parent) {
      var head = el('div', 'sc-head');
      var copy = el('div');
      copy.appendChild(el('span', 'mono', 'COMMITTED SCHEDULE'));
      copy.appendChild(el('h3', null, 'Your 7-day class calendar'));
      copy.appendChild(el('p', null,
        'Dates run left to right, UTC hours run top to bottom. Classes inside a declared slot are paid at ' +
        '100%; unutilised slot hours are paid at ' +
        ((state.view && state.view.rules && state.view.rules.unutilisedPayPercent) || 30) + '%.'));
      head.appendChild(copy);
      parent.appendChild(head);
    }

    function navButton(label, ariaLabel, handler, className) {
      var button = el('button', className || null, label);
      button.type = 'button';
      button.setAttribute('aria-label', ariaLabel);
      button.addEventListener('click', handler);
      return button;
    }

    function renderNav(parent) {
      var nav = el('div', 'sc-nav');
      nav.appendChild(el('span', 'sc-week-label', weekLabel(state.weekStart)));
      var buttons = el('div', 'sc-nav-buttons');
      buttons.appendChild(navButton('‹ Prev', 'Previous 7 days', function () {
        state.weekStart = shiftDays(state.weekStart, -7);
        load();
      }));
      buttons.appendChild(navButton('Today', 'Jump to the current week and today column', function () {
        state.weekStart = mondayOf(today());
        load();
      }, 'is-today-button'));
      buttons.appendChild(navButton('Next ›', 'Next 7 days', function () {
        state.weekStart = shiftDays(state.weekStart, 7);
        load();
      }));
      nav.appendChild(buttons);
      parent.appendChild(nav);
    }

    function renderGrid(parent) {
      var days = (state.view && state.view.days) || [];
      var grid = el('div', 'sc-timetable');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Seven-day timetable with dates across the top and UTC times down the side');
      grid.style.setProperty('--sc-columns', String(days.length || 7));

      grid.appendChild(el('div', 'sc-corner', 'UTC'));
      days.forEach(function (day) {
        var header = el('div', 'sc-date-head' + (day.isToday ? ' is-today' : '') +
          (day.isPast ? ' is-past' : ''), dayLabel(day.date));
        header.setAttribute('data-date', day.date);
        grid.appendChild(header);
      });

      var currentHour = new Date().getUTCHours();
      for (var hour = 0; hour < 24; hour += 1) {
        grid.appendChild(el('div', 'sc-time', pad(hour) + ':00'));
        days.forEach(function (day) {
          var cell = el('div', 'sc-cell');
          if (day.isToday) cell.classList.add('is-today-column');
          if (day.isToday && hour === currentHour) cell.classList.add('is-now');
          if (day.isPast) cell.classList.add('is-past');

          (day.slots || []).forEach(function (slot) {
            if (Number(slot.startMinuteUtc) < (hour + 1) * 60 && Number(slot.endMinuteUtc) > hour * 60) {
              cell.classList.add('is-slot');
              cell.title = slot.label + ' · ' + slot.start + '–' + slot.end + ' UTC';
            }
          });

          (day.classes || []).forEach(function (item) {
            if (Number(String(item.time || '').slice(0, 2)) !== hour) return;
            var block = el('div', 'sc-class' + (item.status === 'live' ? ' is-live' : ''));
            block.appendChild(el('b', null, localTime(item.startsAt) || item.time));
            block.appendChild(el('span', null, item.title || '1-on-1 session'));
            block.title = (item.startsAt || day.date) + ' · ' +
              (item.durationMinutes || 50) + ' min · ' + item.status +
              (item.batchCode ? ' · Batch ' + item.batchCode : '');
            cell.appendChild(block);
          });

          grid.appendChild(cell);
        });
      }

      parent.appendChild(grid);
      if (!days.length) parent.appendChild(el('p', 'sc-empty', state.loading ? 'Loading timetable…' : 'Schedule unavailable.'));
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
        row.appendChild(el('span', null,
          (slot.date || DAY_NAMES[slot.dayOfWeek] || 'One-off') + ' · ' +
          pad(Math.floor(slot.startMinuteUtc / 60)) + ':' + pad(slot.startMinuteUtc % 60) + '–' +
          pad(Math.floor(slot.endMinuteUtc / 60)) + ':' + pad(slot.endMinuteUtc % 60) + ' UTC · ' +
          (slot.label || 'Committed slot')));
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
      var dayLabelEl = el('label', null, 'Day');
      var day = el('select');
      DAY_NAMES.forEach(function (name, index) {
        var option = el('option', null, name);
        option.value = String(index);
        day.appendChild(option);
      });
      day.value = '1';
      dayLabelEl.appendChild(day);
      form.appendChild(dayLabelEl);

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
        api.getWeekSchedule(state.weekStart),
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
