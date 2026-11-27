/* LMS auto-selected weekly planner.
 *
 * Reads the public curriculum catalogue, then asks the signed-in Mathify API
 * for the planner that matches the child's registered board and grade. All
 * generated strings are inserted with textContent; no AI text becomes HTML.
 */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEYS = [
    'mathify.student.token', 'mathify.classroom.token.student',
    'mathify.parent.token', 'mathify.trainer.token',
    'mathify.classroom.token.trainer', 'mathify.classroom.token.founder',
    'mathify.rm.token', 'mathify.classroom.token.relationship_manager'
  ];
  var PALETTE = {
    sunflower: ['#FFF3C4', '#FFD166', '#6B4A00'],
    seafoam: ['#DCF7EE', '#9AE6C9', '#14563F'],
    sky: ['#E4F2FF', '#A9D6FF', '#174A70'],
    lilac: ['#F1E9FF', '#D5BCFF', '#4C2E78'],
    coral: ['#FFE7DF', '#FFB69E', '#7A3320']
  };
  var state = {
    catalog: [],
    selection: null,
    page: null,
    loading: false
  };

  function $(id) { return document.getElementById(id); }

  function token() {
    for (var index = 0; index < TOKEN_KEYS.length; index += 1) {
      try {
        var value = window.localStorage.getItem(TOKEN_KEYS[index]);
        if (value) return value;
      } catch (error) { /* private mode */ }
    }
    return null;
  }

  async function getJSON(path, authenticated) {
    var headers = { accept: 'application/json' };
    var authToken = token();
    if (authenticated && authToken) headers.authorization = 'Bearer ' + authToken;
    var response = await fetch(BASE + path, { headers: headers, credentials: 'same-origin' });
    var text = await response.text();
    var body;
    try { body = JSON.parse(text); } catch (error) { body = null; }
    return { ok: response.ok, status: response.status, body: body };
  }

  function element(tag, className, textValue) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
    return node;
  }

  function status(message, tone) {
    var node = $('autoPlannerStatus');
    if (!node) return;
    node.textContent = message;
    node.className = 'wp-status' + (tone ? ' wp-status-' + tone : '');
  }

  function curriculumSelect() { return $('autoCurriculum'); }
  function gradeSelect() { return $('autoGrade'); }

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

  function setSelection(selection) {
    state.selection = selection;
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    if (curriculum && selection.curriculumSlug) curriculum.value = selection.curriculumSlug;
    if (window.MathifyCurriculums) {
      window.MathifyCurriculums.fillGrades(grade, state.catalog, selection.curriculumSlug, selection.gradeSlug);
    }
    if (grade && selection.gradeSlug) grade.value = selection.gradeSlug;
    if (state.page) renderPlanner(state.page);
  }

  async function loadPlanner(useQuery) {
    if (state.loading) return;
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    if (useQuery && (!curriculum || !curriculum.value || !grade || !grade.value)) {
      status('Choose a curriculum, then choose its grade.', 'warn');
      return;
    }
    if (!token()) {
      status('Sign in to Mathify to auto-select the child’s planner.', 'warn');
      return;
    }
    state.loading = true;
    status('Loading planner…');
    try {
      var query = useQuery
        ? '?curriculum=' + encodeURIComponent(curriculum.value) + '&grade=' + encodeURIComponent(grade.value)
        : '';
      var result = await getJSON('/lms/planner' + query, true);
      if (!result.ok || !result.body || !result.body.planner) {
        var message = result.body && result.body.message
          ? result.body.message
          : 'Sign in to Mathify to auto-select the child’s planner.';
        status(message, 'warn');
        state.loading = false;
        return;
      }
      state.page = result.body;
      var selection = result.body.selection;
      setSelection(selection);
      renderPlanner(result.body);
      status(selection.source === 'profile'
        ? 'Auto-selected from the child’s registered ' + selection.curriculumLabel + ' · ' + selection.gradeLabel + '.'
        : 'Planner set to ' + selection.curriculumLabel + ' · ' + selection.gradeLabel + '.', 'ok');
    } catch (error) {
      status('Planner is unavailable right now.', 'warn');
    } finally {
      state.loading = false;
    }
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

    var shell = element('div', 'wp-shell');
    shell.appendChild(heroNode(page));

    var header = element('div', 'wp-header');
    var heading = element('div', '');
    heading.appendChild(element('h3', '', page.planner.meta.title));
    heading.appendChild(element('p', '',
      page.selection.curriculumLabel + ' · ' + page.selection.gradeLabel +
      ' · ' + (page.cache.topic || page.planner.meta.topic || 'General Mathematics') +
      ' · ' + page.planner.meta.ageBand));
    header.appendChild(heading);
    var badges = element('div', 'wp-badges');
    [page.planner.meta.promptVersion, page.cache.cacheKey, page.cache.provider].forEach(function (value) {
      badges.appendChild(element('span', 'wp-badge', value));
    });
    header.appendChild(badges);
    shell.appendChild(header);

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

  function boot() {
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    var load = $('autoPlannerLoad');
    if (!curriculum || !grade || !load) return;

    load.addEventListener('click', function () {
      loadPlanner(Boolean(curriculum.value && grade.value));
    });

    populateDropdowns().then(function (list) {
      state.catalog = list || [];
      return loadPlanner(false);
    }).catch(function () {
      status('Curriculum catalogue is unavailable.', 'warn');
    });
  }

  window.mathifyAutoPlanner = {
    boot: boot,
    render: function () {
      if (state.page) renderPlanner(state.page);
    },
    load: loadPlanner
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
