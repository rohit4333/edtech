/* Trainer's assigned planner surface.
 *
 * Read-only by construction: it only calls the batch-scoped GET endpoint and
 * renders the stored planner it returns. No board, grade, hint, suggested edit
 * or batch mapping is inferred in the browser. When a founder has not generated
 * a planner, this surface shows the server's honest empty state.
 */
(function () {
  'use strict';

  var state = { items: [], loaded: false, loading: false };

  function $(id) { return document.getElementById(id); }
  function mount() { return $('assignedPlannerMount'); }
  function gate() { return window.MathifyLmsAccess || null; }
  function api() { return window.mathifyLmsApi || null; }

  function node(tag, className, textValue) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (textValue !== undefined && textValue !== null) item.textContent = String(textValue);
    return item;
  }

  function status(message, tone) {
    var line = $('assignedPlannerStatus');
    if (!line) return;
    line.textContent = message || '';
    line.className = 'assigned-status' + (tone ? ' assigned-status-' + tone : '');
  }

  function guidanceLine(label, items) {
    var row = node('div', 'assigned-guidance-row');
    row.appendChild(node('strong', '', label));
    if (!items || !items.length) {
      row.appendChild(node('span', '', 'None provided'));
      return row;
    }
    var list = node('ul');
    items.forEach(function (item) {
      var text = typeof item === 'string' ? item : (item && item.text) || '';
      if (!text) return;
      var entry = node('li', '', text);
      if (item && item.questionId) {
        entry.appendChild(node('small', '', ' · ' + item.questionId));
      }
      list.appendChild(entry);
    });
    row.appendChild(list);
    return row;
  }

  function card(item) {
    var shell = node('article', 'assigned-card');
    var head = node('div', 'assigned-card-head');
    head.appendChild(node('span', 'mono', (item.batch && item.batch.code) || 'Assigned batch'));
    head.appendChild(node('span', 'assigned-version', 'v' + ((item.cache && item.cache.version) || 1)));
    shell.appendChild(head);

    var selection = item.selection || {};
    shell.appendChild(node('h3', '',
      selection.curriculumLabel || (item.planner && item.planner.meta && item.planner.meta.title) || 'Assigned planner'));
    shell.appendChild(node('p', '', [
      selection.subjectLabel,
      selection.gradeLabel,
      item.cache && item.cache.topic
    ].filter(Boolean).join(' · ')));

    var guidance = item.guidance || {};
    var notes = node('div', 'assigned-guidance');
    notes.appendChild(guidanceLine('Suggested edits', guidance.suggestedEdits));
    notes.appendChild(guidanceLine('Hint additions', guidance.hintAdditions));
    if (!guidance.hasGuidance) {
      notes.appendChild(node('p', 'assigned-empty', guidance.message ||
        'No planner-provided suggested edits or hint additions are available yet.'));
    }
    shell.appendChild(notes);

    var view = node('button', 'btn btn-ghost btn-sm', 'View assigned planner');
    view.type = 'button';
    view.addEventListener('click', function () {
      if (window.mathifyAutoPlanner && window.mathifyAutoPlanner.showPage) {
        window.mathifyAutoPlanner.showPage(item);
        var target = $('autoPlannerView');
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
    shell.appendChild(view);
    return shell;
  }

  function render() {
    var target = mount();
    if (!target) return;
    target.textContent = '';
    if (!state.loaded) {
      target.appendChild(node('p', 'assigned-empty', 'Loading assigned planners…'));
      return;
    }
    if (!state.items.length) {
      var empty = node('div', 'assigned-empty');
      empty.setAttribute('role', 'status');
      empty.appendChild(node('strong', '', 'No assigned planner yet.'));
      empty.appendChild(node('p', '', 'Planners appear here only after the founder generates one for an assigned batch.'));
      target.appendChild(empty);
      return;
    }
    state.items.forEach(function (item) { target.appendChild(card(item)); });
  }

  function load(force) {
    var access = gate();
    var client = api();
    if (access && access.isDenied && access.isDenied()) {
      status('LMS access is restricted.', 'warn');
      return Promise.resolve(null);
    }
    if (!client || !client.assignedPlanners) {
      status('Assigned planner is unavailable right now.', 'warn');
      return Promise.resolve(null);
    }
    if (state.loading && !force) return Promise.resolve(null);
    if (state.loaded && !force) { render(); return Promise.resolve(state.items); }

    state.loading = true;
    status('Loading assigned planners…');
    return client.assignedPlanners().then(function (result) {
      state.items = (result && result.assignedPlanners) || [];
      state.loaded = true;
      status((result && result.message) || '', state.items.length ? 'ok' : 'warn');
      render();
      return state.items;
    }).catch(function (error) {
      state.loaded = true;
      state.items = [];
      status((error && error.message) || 'Assigned planners could not be loaded.', 'warn');
      render();
      return null;
    }).then(function (value) {
      state.loading = false;
      return value;
    });
  }

  window.mathifyAssignedPlanner = {
    load: load,
    render: render,
    items: function () { return state.items.slice(); }
  };
}());
