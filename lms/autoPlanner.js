/* LMS planner viewer and founder authoring surface.
 *
 * Reads the role-filtered curriculum catalogue and renders stored planner JSON
 * with textContent only. Trainers never load this path: their assigned planner
 * comes from the batch-scoped read-only surface. Planner agents can view an
 * active planner but have no edit, regenerate or idea-filing controls. Only the
 * founder sees authoring actions, and the server repeats every role gate.
 */
(function () {
  'use strict';

  var PALETTE = {
    sunflower: ['#FFF3C4', '#FFD166', '#6B4A00'],
    seafoam: ['#DCF7EE', '#9AE6C9', '#14563F'],
    sky: ['#E4F2FF', '#A9D6FF', '#174A70'],
    lilac: ['#F1E9FF', '#D5BCFF', '#4C2E78'],
    coral: ['#FFE7DF', '#FFB69E', '#7A3320']
  };
  var state = {
    catalog: [],
    subjects: [],
    selection: null,
    page: null,
    loading: false
  };

  function $(id) { return document.getElementById(id); }
  function access() { return window.MathifyLmsAccess || null; }
  function api() { return window.mathifyLmsApi || null; }

  function denied() {
    var gate = access();
    return Boolean(gate && gate.isDenied && gate.isDenied());
  }

  function isTrainer() {
    var gate = access();
    return Boolean(gate && gate.isTrainer && gate.isTrainer());
  }

  function isAgent() {
    var gate = access();
    return Boolean(gate && gate.isAgent && gate.isAgent());
  }

  function element(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
    return node;
  }

  function notifySubject() {
    var event;
    try { event = new CustomEvent('mathify:subjectchange', { bubbles: true }); }
    catch (error) {
      event = document.createEvent('Event');
      event.initEvent('mathify:subjectchange', true, true);
    }
    document.dispatchEvent(event);
  }

  function status(message, tone) {
    var node = $('autoPlannerStatus');
    if (!node) return;
    node.textContent = message;
    node.className = 'wp-status' + (tone ? ' wp-status-' + tone : '');
  }

  function curriculumSelect() { return $('autoCurriculum'); }
  function gradeSelect() { return $('autoGrade'); }
  function subjectSelect() { return $('autoSubject'); }

  function currentSubject() {
    var select = subjectSelect();
    var value = select && select.value ? select.value : (access() && access().subject()) || 'math';
    var client = api();
    return client && client.safeSubject ? client.safeSubject(value) : value;
  }

  function subjectLabel(subject) {
    var planner = window.mathifySubjectPlanner;
    return planner && planner.label ? planner.label(subject, state.subjects) : subject;
  }

  function populateDropdowns(preferred) {
    if (!window.MathifyCurriculums) return Promise.resolve([]);
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    return window.MathifyCurriculums.populate(curriculum, grade, {
      curriculum: preferred && preferred.curriculumSlug,
      grade: preferred && preferred.gradeSlug,
      onChange: function () {
        status('Curriculum chosen. Select its grade from the list.', 'ok');
      },
      onGradeChange: function () {
        if (grade && grade.value) loadPlanner(true);
      }
    });
  }

  function populateSubjects() {
    if (!window.MathifyCurriculums || !window.MathifyCurriculums.populateSubjects) {
      return Promise.resolve([]);
    }
    var select = subjectSelect();
    var gate = access();
    return window.MathifyCurriculums.populateSubjects(select, {
      subject: gate && gate.subject ? gate.subject() : 'math',
      onChange: function (slug) {
        state.subject = currentSubject();
        status('Subject set to ' + subjectLabel(state.subject) + '.', 'ok');
        var curriculum = curriculumSelect();
        var grade = gradeSelect();
        if (curriculum && curriculum.value && grade && grade.value) loadPlanner(true);
      }
    }).then(function (list) {
      /* A trainer has exactly one field; the selector is shown but locked so
         the label is visible without offering a forbidden switch. Founder and
         the planner agent keep every field selectable. */
      if (select && gate && gate.role && gate.role() === 'trainer') select.disabled = true;
      else if (select && list.length) select.disabled = false;
      return list;
    });
  }

  function setSelection(selection) {
    state.selection = selection;
    var chosen = selection.subject || (state.page && state.page.cache && state.page.cache.subject)
      || currentSubject();
    state.subject = api() && api().safeSubject ? api().safeSubject(chosen) : chosen;
    var subject = subjectSelect();
    if (subject && (!access() || access().canUse(state.subject))) {
      subject.value = state.subject;
      notifySubject();
    }
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    if (curriculum && selection.curriculumSlug) curriculum.value = selection.curriculumSlug;
    if (window.MathifyCurriculums) {
      window.MathifyCurriculums.fillGrades(grade, state.catalog, selection.curriculumSlug, selection.gradeSlug);
    }
    if (grade && selection.gradeSlug) grade.value = selection.gradeSlug;
    if (state.page) renderPlanner(state.page);
  }

  function loadPlanner(useQuery) {
    if (denied() || state.loading) return Promise.resolve(null);
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    if (useQuery && (!curriculum || !curriculum.value || !grade || !grade.value)) {
      status('Choose a curriculum, then choose its grade.', 'warn');
      return Promise.resolve(null);
    }
    var client = api();
    if (!client || !client.plannerGet) {
      status('Planner is unavailable right now.', 'warn');
      return Promise.resolve(null);
    }
    if (!client.token()) {
      status('Sign in to Mathify to auto-select the child’s planner.', 'warn');
      return Promise.resolve(null);
    }
    /* A founder/agent planner key needs a real board and grade. Calling with
       only a subject cannot resolve a selection and produces a server 400;
       ask for the academic inputs instead of guessing a curriculum. */
    var access = window.MathifyLmsAccess;
    var authorRole = access && access.role ? access.role() : null;
    if (!useQuery && (authorRole === 'founder' || authorRole === 'planner_agent') &&
        (!curriculum || !curriculum.value || !grade || !grade.value)) {
      status('Choose a curriculum, then choose its grade to load a planner.', 'warn');
      return Promise.resolve(null);
    }
    state.loading = true;
    status('Loading planner…');
    var params = { subject: currentSubject() };
    if (useQuery) {
      params.curriculum = curriculum.value;
      params.grade = grade.value;
    }
    return client.plannerGet(params).then(function (result) {
      if (!result || !result.planner) {
        status('Sign in to Mathify to auto-select the child’s planner.', 'warn');
        return null;
      }
      state.page = result;
      var selection = result.selection || {};
      setSelection(selection);
      renderPlanner(result);
      var label = selection.subjectLabel || subjectLabel(currentSubject());
      status(selection.source === 'profile'
        ? 'Auto-selected from the child’s registered ' + label + ' · ' +
          selection.curriculumLabel + ' · ' + selection.gradeLabel + '.'
        : 'Planner set to ' + label + ' · ' + selection.curriculumLabel + ' · ' +
          selection.gradeLabel + '.', 'ok');
      return result;
    }).catch(function (error) {
      if (error && error.status === 403) {
        var gate = access();
        if (gate && gate.role && gate.role() === 'trainer' && subjectSelect()) {
          subjectSelect().value = gate.subject() || 'math';
          state.subject = gate.subject() || 'math';
          notifySubject();
        }
        status(error.message || (gate && gate.message ? gate.message() : 'LMS access is restricted.'), 'warn');
        return null;
      }
      status('Planner is unavailable right now.', 'warn');
      return null;
    }).then(function (result) {
      state.loading = false;
      return result;
    });
  }

  function listNode(items, className) {
    var list = element('ul', className);
    (items || []).forEach(function (item) {
      var value = typeof item === 'string' ? item : (item && (item.label || item.name || item.detail) || '');
      list.appendChild(element('li', '', value));
    });
    return list;
  }

  function heroNode(page) {
    var planner = page.planner;
    var theme = planner.hero.colorTheme || {};
    var hero = element('header', 'wp-hero');
    var from = /^#[0-9a-f]{6}$/i.test(String(theme.from || '')) ? theme.from : '#FFF3C4';
    var to = /^#[0-9a-f]{6}$/i.test(String(theme.to || '')) ? theme.to : '#FFD166';
    var angle = Number.isFinite(Number(theme.angle)) ? Number(theme.angle) : 135;
    hero.style.background = 'linear-gradient(' + angle + 'deg, ' + from + ', ' + to + ')';
    hero.style.color = /^#[0-9a-f]{6}$/i.test(String(theme.text || '')) ? theme.text : '#4A3310';
    hero.appendChild(element('span', 'wp-hero-emoji', planner.hero.emoji));
    var copy = element('div', 'wp-hero-copy');
    copy.appendChild(element('h3', '', planner.hero.title));
    copy.appendChild(element('p', '', planner.hero.subtitle));
    hero.appendChild(copy);
    return hero;
  }

  function differentiationNode(activity, index) {
    var wrap = element('div', 'wp-diff');
    var tabs = element('div', 'wp-diff-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Differentiation for ' + activity.title);
    var panels = element('div', 'wp-diff-panels');
    var keys = [
      ['support', 'Support'], ['core', 'Core'], ['stretch', 'Stretch']
    ];
    keys.forEach(function (pair, pairIndex) {
      var button = element('button', 'wp-diff-tab' + (pairIndex === 1 ? ' active' : ''), pair[1]);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(pairIndex === 1));
      button.dataset.diff = pair[0];
      button.dataset.activity = String(index);
      tabs.appendChild(button);
      var panel = element('p', 'wp-diff-panel' + (pairIndex === 1 ? '' : ' hidden'), activity.differentiation[pair[0]]);
      panel.dataset.panel = pair[0] + '-' + index;
      panels.appendChild(panel);
    });
    wrap.appendChild(tabs);
    wrap.appendChild(panels);
    return wrap;
  }

  function activityNode(activity, index) {
    var card = element('article', 'wp-activity');
    var paletteKey = /^[a-z-]+$/.test(String(activity.color || '')) ? activity.color : 'sunflower';
    var palette = PALETTE[paletteKey] || PALETTE.sunflower;
    card.style.setProperty('--wp-accent', palette[0]);
    card.style.setProperty('--wp-accent-deep', palette[2]);

    var top = element('div', 'wp-activity-top');
    top.appendChild(element('span', 'wp-emoji', activity.emoji));
    var heading = element('div', 'wp-activity-heading');
    heading.appendChild(element('h5', '', activity.title));
    heading.appendChild(element('span', 'wp-icon', activity.icon + ' · ' + activity.type + ' · ' + activity.durationMinutes + ' min'));
    top.appendChild(heading);
    card.appendChild(top);
    card.appendChild(element('span', 'wp-ican', activity.iCan));
    card.appendChild(listNode(activity.instructions, 'wp-list'));
    card.appendChild(differentiationNode(activity, index));
    card.appendChild(element('p', 'wp-observe', 'Watch for: ' + activity.observation));
    return card;
  }

  function dayNode(day, index) {
    var section = element('section', 'wp-day');
    var strip = element('div', 'wp-story-strip');
    strip.appendChild(element('span', 'wp-day-emoji', day.emoji));
    var copy = element('div', 'wp-story-copy');
    copy.appendChild(element('h4', '', day.day));
    copy.appendChild(element('p', '', day.narrative));
    strip.appendChild(copy);
    section.appendChild(strip);
    var grid = element('div', 'wp-activity-grid');
    (day.activities || []).forEach(function (activity, activityIndex) {
      grid.appendChild(activityNode(activity, index + '-' + activityIndex));
    });
    section.appendChild(grid);
    return section;
  }

  function standardsNode(page) {
    var aside = element('aside', 'wp-standards');
    aside.appendChild(element('h3', '', 'Standards'));
    aside.appendChild(element('p', 'wp-standards-framework', page.planner.meta.standardsFramework));
    var list = element('ul', 'wp-standard-list');
    (page.planner.standards || []).forEach(function (standard) {
      var item = element('li', '');
      item.appendChild(element('code', '', standard.code));
      item.appendChild(element('span', '', standard.label + ' · ' + standard.strand));
      list.appendChild(item);
    });
    aside.appendChild(list);
    return aside;
  }

  function observationsNode(page) {
    var section = element('section', 'wp-block');
    section.appendChild(element('h3', '', 'Observation checklist'));
    var key = 'mathify.lms.weeklyPlanner.observations.' + page.cache.cacheKey;
    var saved = {};
    try { saved = JSON.parse(window.localStorage.getItem(key) || '{}') || {}; } catch (error) { saved = {}; }
    var list = element('div', 'wp-checks');
    (page.planner.observationTracker || []).forEach(function (item, index) {
      var label = element('label', 'wp-check');
      var box = element('input');
      box.type = 'checkbox';
      box.checked = saved[item.id + '-' + index] === true;
      box.addEventListener('change', function () {
        saved[item.id + '-' + index] = box.checked;
        try { window.localStorage.setItem(key, JSON.stringify(saved)); } catch (error) { /* private mode */ }
      });
      label.appendChild(box);
      label.appendChild(element('span', '', item.label + ' — ' + item.criteria));
      list.appendChild(label);
    });
    section.appendChild(list);
    return section;
  }

  function familyNode(page) {
    var home = page.planner.homeConnection || {};
    var section = element('section', 'wp-block wp-family-print');
    section.appendChild(element('h3', '', home.title || 'Family note'));
    section.appendChild(element('p', '', home.familyNote));
    section.appendChild(listNode(home.conversationStarters, 'wp-list'));
    (page.planner.safetyNotes || []).forEach(function (note) {
      var line = element('p', 'wp-safety', note.title + ': ' + note.detail);
      section.appendChild(line);
    });
    var print = element('button', 'btn btn-ghost btn-sm wp-print', home.printLabel || 'Print family note');
    print.type = 'button';
    print.addEventListener('click', function () { window.print(); });
    section.appendChild(print);
    return section;
  }

  function renderPlanner(page) {
    var target = $('autoPlannerView');
    if (!target || !page || !page.planner) return;
    target.textContent = '';

    var selection = page.selection || {};
    var cache = page.cache || {};
    var subject = api() && api().safeSubject
      ? api().safeSubject(selection.subject || cache.subject || currentSubject())
      : 'math';
    var label = selection.subjectLabel || cache.subjectLabel || subjectLabel(subject);

    var shell = element('div', 'wp-shell');
    shell.appendChild(heroNode(page));

    var header = element('div', 'wp-header');
    var heading = element('div', '');
    heading.appendChild(element('h3', '', page.planner.meta.title));
    heading.appendChild(element('p', '',
      label + ' · ' + selection.curriculumLabel +
      ' · ' + (cache.topic || page.planner.meta.topic ||
        (window.mathifySubjectPlanner ? window.mathifySubjectPlanner.defaultTopic(subject) : 'General Mathematics')) +
      ' · ' + page.planner.meta.ageBand));
    header.appendChild(heading);
    var badges = element('div', 'wp-badges');
    /* The cache key string itself is untouched — math stays planner:v1:... */
    [label, page.planner.meta.promptVersion, cache.cacheKey, cache.provider, cache.createdByRole].forEach(function (value) {
      if (value !== undefined && value !== null) badges.appendChild(element('span', 'wp-badge', value));
    });
    header.appendChild(badges);
    shell.appendChild(header);

    if (window.mathifySubjectPlanner && window.mathifySubjectPlanner.node) {
      shell.appendChild(window.mathifySubjectPlanner.node(subject, state.subjects));
    }

    var layout = element('div', 'wp-layout');
    var main = element('div', 'wp-main');
    (page.planner.week.days || []).forEach(function (day, index) { main.appendChild(dayNode(day, index)); });

    var materials = element('section', 'wp-block');
    materials.appendChild(element('h3', '', 'Materials'));
    var materialList = element('div', 'wp-materials');
    (page.planner.materialsMasterList || []).forEach(function (item) {
      var row = element('p', '', item.name + ' · ' + item.quantity);
      row.appendChild(element('small', '', item.preparation));
      materialList.appendChild(row);
    });
    materials.appendChild(materialList);
    main.appendChild(materials);
    main.appendChild(observationsNode(page));
    main.appendChild(familyNode(page));

    layout.appendChild(main);
    layout.appendChild(standardsNode(page));
    shell.appendChild(layout);
    if (isAgent()) {
      var notice = element('p', 'wp-readonly-note',
        'Planner-agent authoring is disabled until the founder explicitly re-enables it. This view is read-only.');
      notice.setAttribute('role', 'status');
      shell.appendChild(notice);
    }
    target.appendChild(shell);

    target.querySelectorAll('.wp-diff-tab').forEach(function (button) {
      button.addEventListener('click', function () {
        var current = button.dataset.activity;
        var tabList = button.parentNode;
        tabList.querySelectorAll('.wp-diff-tab').forEach(function (tab) {
          var active = tab === button;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-selected', String(active));
        });
        var panels = button.closest('.wp-diff').querySelectorAll('.wp-diff-panel');
        panels.forEach(function (panel) {
          panel.classList.toggle('hidden', panel.dataset.panel !== button.dataset.diff + '-' + current);
        });
      });
    });
  }

  function showAssignedPage(page) {
    if (!page || !page.planner || denied()) return;
    state.page = page;
    var selection = page.selection || {};
    state.subject = api() && api().safeSubject
      ? api().safeSubject(selection.subject || (page.cache && page.cache.subject) || currentSubject())
      : currentSubject();
    var grade = gradeSelect();
    if (window.MathifyCurriculums && grade) {
      window.MathifyCurriculums.fillGrades(grade, state.catalog, selection.curriculumSlug, selection.gradeSlug);
    }
    renderPlanner(page);
  }

  function boot() {
    if (access() && access().detect) access().detect();
    var deniedPanel = $('lmsDenied');
    if (denied()) {
      var gate = access();
      document.body.classList.add('lms-denied');
      if (deniedPanel) deniedPanel.hidden = false;
      status(gate.message(), 'warn');
      return;
    }

    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    var subject = subjectSelect();
    var load = $('autoPlannerLoad');
    if (!curriculum || !grade || !load) return;

    if (isTrainer()) {
      /* A trainer never selects a board, grade or generation action. The only
         planner is the one already stored for an assigned batch. */
      if (window.mathifyAssignedPlanner && window.mathifyAssignedPlanner.load) {
        window.mathifyAssignedPlanner.load();
      } else {
        status('Assigned planner is unavailable right now.', 'warn');
      }
      return;
    }

    load.addEventListener('click', function () {
      loadPlanner(Boolean(curriculum.value && grade.value));
    });
    if (subject) {
      subject.addEventListener('change', function () {
        state.subject = currentSubject();
        status('Subject set to ' + subjectLabel(state.subject) + '.', 'ok');
        if (curriculum.value && grade.value) loadPlanner(true);
      });
    }

    Promise.all([populateDropdowns(), populateSubjects()]).then(function (results) {
      state.catalog = results[0] || [];
      state.subjects = results[1] || [];
      state.subject = currentSubject();
      /* After the catalogue is populated the academic selects carry a real
         board and grade. Send them so a founder load resolves an actual
         selection instead of producing an UNKNOWN_CURRICULUM 400. */
      return loadPlanner(Boolean(curriculum.value && grade.value));
    }).catch(function () {
      status('Curriculum catalogue is unavailable.', 'warn');
    });
  }

  window.mathifyAutoPlanner = {
    boot: boot,
    render: function () {
      if (state.page && !denied()) renderPlanner(state.page);
    },
    load: loadPlanner,
    showPage: showAssignedPage,
    subject: currentSubject,
    label: function () { return subjectLabel(currentSubject()); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
