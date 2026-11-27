/* LMS auto-selected weekly planner.
 *
 * Reads the role-filtered curriculum catalogue, then asks the signed-in Mathify
 * API for the planner that matches the subject, board and grade. All generated
 * strings are inserted with textContent; no AI text becomes HTML. A trainer is
 * pinned to the one subject returned for their account; founder and the planner
 * agent may switch freely. A founder-authored planner is immutable to the agent,
 * which files an alternate idea instead. Relationship managers never reach this
 * code path.
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

  function isAgent() {
    var gate = access();
    return Boolean(gate && gate.role && gate.role() === 'planner_agent');
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

  function notifyIdeas() {
    var event;
    try { event = new CustomEvent('mathify:planneridea', { bubbles: true }); }
    catch (error) {
      event = document.createEvent('Event');
      event.initEvent('mathify:planneridea', true, true);
    }
    document.dispatchEvent(event);
  }

  function selectionPayload(page) {
    var selection = (page && page.selection) || state.selection || {};
    var cache = (page && page.cache) || {};
    var curriculum = curriculumSelect();
    var grade = gradeSelect();
    return {
      subject: selection.subject || cache.subject || currentSubject(),
      curriculum: selection.curriculumSlug || cache.curriculumSlug || (curriculum && curriculum.value) || '',
      grade: selection.gradeSlug || cache.gradeSlug || (grade && grade.value) || '',
      topic: selection.topic || cache.topic || ''
    };
  }

  /* The local designer stays the source of the draft: it must pass its own
     schema/privacy validation first. Only student-facing copy is attached to
     the server-validated weekly planner; trainer notes are never submitted. */
  function validatedAlternate(page) {
    var designer = window.mathifyPlanner;
    if (!designer || typeof designer.validate !== 'function' ||
        typeof designer.buildPayload !== 'function' || !page || !page.planner) {
      throw new Error('The planner designer is unavailable right now.');
    }
    var errors = designer.validate();
    if (errors.length) throw new Error('Validate the designer first: ' + errors[0]);
    var payload = designer.buildPayload();
    var student = typeof designer.buildStudentPayload === 'function'
      ? designer.buildStudentPayload() : null;
    var proposed = JSON.parse(JSON.stringify(page.planner));
    proposed.meta = Object.assign({}, proposed.meta, {
      topic: String(payload.topic_id || (proposed.meta && proposed.meta.topic) || 'Planner topic').slice(0, 120)
    });
    proposed.designDraft = {
      topicId: payload.topic_id,
      chapter: payload.curriculum_map.chapter,
      learningObjectives: payload.curriculum_map.learning_objectives,
      studentQuizPrompt: student ? student.quizPrompt : '',
      studentBlocks: student ? student.blocks : []
    };
    return proposed;
  }

  function runAgentMutation(page, kind, button) {
    var client = api();
    if (!client) return;
    var payload = selectionPayload(page);
    var call;
    if (kind === 'regenerate') {
      call = client.plannerAgentRegenerate(payload);
    } else {
      var proposed;
      try { proposed = validatedAlternate(page); }
      catch (error) { status(error.message, 'warn'); return; }
      call = client.plannerAgentEdit(Object.assign({}, payload, { planner: proposed }));
    }
    button.disabled = true;
    status(kind === 'regenerate' ? 'Regenerating planner…' : 'Applying your planner edit…');
    return call.then(function (result) {
      state.page = result;
      setSelection(result.selection || {});
      renderPlanner(result);
      status(kind === 'regenerate' ? 'Planner regenerated for this selection.' : 'Planner edit saved.', 'ok');
    }).catch(function (error) {
      if (error && error.code === 'FOUNDER_PLANNER_IMMUTABLE') {
        status('Founder-created planners are immutable. File an alternate idea for founder review instead.', 'warn');
      } else {
        status((error && error.message) || 'Planner change is unavailable right now.', 'warn');
      }
    }).then(function () { button.disabled = false; });
  }

  function agentToolsNode(page) {
    var wrap = element('section', 'wp-agent-tools');
    var cache = (page && page.cache) || {};
    var locked = cache.createdByRole === 'founder';

    if (locked) {
      var banner = element('div', 'wp-lock-banner');
      banner.setAttribute('role', 'alert');
      banner.appendChild(element('strong', '', 'Founder-created planner — read only for this desk.'));
      banner.appendChild(element('p', '',
        'Direct edit and regenerate are disabled. File an alternate idea below; only the founder can review or apply it.'));
      wrap.appendChild(banner);
    } else {
      wrap.appendChild(element('p', 'wp-own-banner',
        'This planner is agent-authored. Direct edit and regenerate are available while it stays editable.'));
    }

    var actions = element('div', 'wp-agent-actions');
    var edit = element('button', 'btn btn-ghost btn-sm', 'Edit planner');
    edit.type = 'button';
    edit.disabled = locked;
    edit.title = locked ? 'Founder-created planners are immutable for the planner agent.' : '';
    edit.addEventListener('click', function () { runAgentMutation(page, 'edit', edit); });

    var regenerate = element('button', 'btn btn-ghost btn-sm', 'Regenerate');
    regenerate.type = 'button';
    regenerate.disabled = locked;
    regenerate.title = locked ? 'Founder-created planners are immutable for the planner agent.' : '';
    regenerate.addEventListener('click', function () { runAgentMutation(page, 'regenerate', regenerate); });

    actions.appendChild(edit);
    actions.appendChild(regenerate);
    wrap.appendChild(actions);

    var form = element('form', 'wp-alternate-form');
    var label = element('label', 'wp-alternate-label', 'File alternate idea for founder review');
    var note = element('textarea', 'wp-alternate-note');
    note.rows = 2;
    note.maxLength = 600;
    note.placeholder = 'What should the founder consider instead?';
    label.appendChild(note);
    form.appendChild(label);
    var send = element('button', 'btn btn-coral btn-sm', 'Send idea for founder review');
    send.type = 'submit';
    form.appendChild(send);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = String(note.value || '').trim();
      if (!text) { status('Add a short note so the founder knows what to review.', 'warn'); return; }
      var proposed;
      try { proposed = validatedAlternate(page); }
      catch (error) { status(error.message, 'warn'); return; }
      var client = api();
      if (!client || !client.plannerSuggest) {
        status('Alternate ideas are unavailable right now.', 'warn');
        return;
      }
      send.disabled = true;
      status('Filing alternate idea…');
      client.plannerSuggest(Object.assign(selectionPayload(page), {
        planner: proposed,
        note: text
      })).then(function (result) {
        note.value = '';
        var idea = (result && result.suggestion) || {};
        status('Alternate idea filed for founder review · ' + (idea.status || 'pending') + '.', 'ok');
        notifyIdeas();
      }).catch(function (error) {
        status((error && error.message) || 'Alternate idea could not be filed.', 'warn');
      }).then(function () { send.disabled = false; });
    });
    wrap.appendChild(form);
    return wrap;
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
    if (isAgent()) shell.appendChild(agentToolsNode(page));
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
      return loadPlanner(false);
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
    subject: currentSubject,
    label: function () { return subjectLabel(currentSubject()); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
