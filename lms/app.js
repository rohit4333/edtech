/* ==========================================================================
   MATHIFY — curriculum LMS library interactions.
   Local/offline prototype: all state lives in memory plus the courses the
   author creates, which are kept in localStorage. No answer keys or student
   data are ever rendered here.
   ========================================================================== */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STORAGE_KEY = 'mathify.lms.courses.v1';

  var ASSET_TYPES = [
    { type: 'note', icon: 'i-note', label: 'Board notes' },
    { type: 'worksheet', icon: 'i-worksheet', label: 'Worksheet' },
    { type: 'flash', icon: 'i-flash', label: 'Flashcards' },
    { type: 'quiz', icon: 'i-quiz', label: 'Quiz' },
    { type: 'recording', icon: 'i-recording', label: 'Recording' }
  ];
  var MODULE_TITLES = [
    'Reading the question', 'Core method', 'Worked examples', 'Guided practice',
    'Word problems', 'Common mistakes', 'Mastery check', 'Reteach loop',
    'Exam style set'
  ];

  function seedCourse(id, code, title, blurb, status, level, modules, assets, progress, edited) {
    return {
      id: id, code: code, title: title, blurb: blurb, status: status, level: level,
      modules: modules, assets: assets, progress: progress, edited: edited, custom: false
    };
  }

  var SEED = [
    seedCourse('ratios', 'MTH-601', 'Ratios & Proportion',
      'From sharing to proportional reasoning, with a mastery gate before algebra.',
      'progress', 'Class 6–7', 9, 52, 64, '25 Nov 2026'),
    seedCourse('fractions', 'MTH-602', 'Fractions Without Fear',
      'Number lines, equivalence and operations built one representation at a time.',
      'progress', 'Class 5–6', 8, 46, 48, '24 Nov 2026'),
    seedCourse('algebra', 'MTH-603', 'Algebra Foundations',
      'Variables, patterns and simple equations tied to the school curriculum.',
      'progress', 'Class 7–8', 8, 40, 31, '22 Nov 2026'),
    seedCourse('geometry', 'MTH-604', 'Geometry Essentials',
      'Angles, triangles and area worked live on the whiteboard.',
      'review', 'Class 7–8', 7, 34, 82, '20 Nov 2026'),
    seedCourse('mastery', 'MTH-605', 'Mastery Remediation',
      'Short reteach loops for learners who need one more pass at a topic.',
      'published', 'Class 6–8', 6, 30, 100, '18 Nov 2026'),
    seedCourse('word-problems', 'MTH-606', 'Word Problem Lab',
      'Turning language into equations, then checking whether the answer makes sense.',
      'draft', 'Class 6–7', 6, 36, 12, '17 Nov 2026')
  ];

  var STATUS_LABEL = {
    progress: 'In progress', review: 'In review', published: 'Published', draft: 'Draft'
  };
  var STATUS_CLASS = {
    progress: 's-progress', review: 's-review', published: 's-published', draft: 's-draft'
  };

  var courses = SEED.slice();
  var state = {
    filter: 'all',
    query: '',
    density: 'grid',
    selectedId: 'ratios',
    assetFilter: 'all',
    openModules: {},
    sheetCourseId: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function icon(id, className) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    if (className) svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function pad(number) { return String(number).padStart(2, '0'); }

  function loadCustom() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach(function (course) {
          if (course && course.id && course.title) {
            course.custom = true;
            courses.push(course);
          }
        });
      }
    } catch (error) {
      /* Private browsing or corrupt storage: the seed library still works. */
    }
  }

  function persistCustom() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses.filter(function (course) {
        return course.custom;
      })));
    } catch (error) {
      toast('Course created for this session only.');
    }
  }

  function findCourse(id) {
    return courses.find(function (course) { return course.id === id; }) || null;
  }

  function matches(course) {
    if (state.filter !== 'all' && course.status !== state.filter) return false;
    var query = state.query.trim().toLowerCase();
    if (!query) return true;
    return (course.title + ' ' + course.blurb + ' ' + course.level + ' ' + course.code)
      .toLowerCase().indexOf(query) !== -1;
  }

  function visibleCourses() {
    return courses.filter(matches);
  }

  function toast(message) {
    var node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { node.classList.remove('show'); }, 2600);
  }

  function updateCounts() {
    ['all', 'progress', 'review', 'published', 'draft'].forEach(function (key) {
      var button = document.querySelector('[data-filter="' + key + '"]');
      if (!button) return;
      var count = key === 'all'
        ? courses.length
        : courses.filter(function (course) { return course.status === key; }).length;
      var badge = button.querySelector('span');
      if (badge) badge.textContent = pad(count);
    });
    var total = $('courseCount');
    if (total) total.textContent = pad(visibleCourses().length);
  }

  function buildCard(course) {
    var card = el('button', 'course-card' + (course.id === state.selectedId ? ' active' : ''));
    card.type = 'button';
    card.setAttribute('aria-pressed', String(course.id === state.selectedId));

    var top = el('div', 'cc-top');
    top.appendChild(el('span', 'cc-code mono', course.code));
    var status = el('span', 'cc-status ' + STATUS_CLASS[course.status], STATUS_LABEL[course.status]);
    top.appendChild(status);
    card.appendChild(top);

    card.appendChild(el('h3', 'cc-title', course.title));
    card.appendChild(el('p', 'cc-blurb', course.blurb));

    var meta = el('div', 'cc-meta');
    meta.appendChild(el('span', null, course.level));
    meta.appendChild(el('i'));
    meta.appendChild(el('span', null, pad(course.modules) + ' modules'));
    meta.appendChild(el('i'));
    meta.appendChild(el('span', null, course.assets + ' assets'));
    card.appendChild(meta);

    var progress = el('div', 'cc-progress');
    var bar = el('span', 'cc-bar');
    var fill = el('i');
    fill.style.width = course.progress + '%';
    bar.appendChild(fill);
    progress.appendChild(bar);
    progress.appendChild(el('span', 'cc-pct', course.progress + '%'));
    card.appendChild(progress);

    var foot = el('div', 'cc-foot');
    var assets = el('span', 'cc-assets');
    assets.appendChild(icon('i-asset'));
    assets.appendChild(el('span', null, 'typed assets'));
    foot.appendChild(assets);
    foot.appendChild(el('span', 'cc-edited', course.edited));
    card.appendChild(foot);

    card.addEventListener('click', function () { selectCourse(course.id); });
    return card;
  }

  function renderCourses() {
    var grid = $('courseGrid');
    var empty = $('emptyState');
    if (!grid || !empty) return;

    var list = visibleCourses();
    grid.innerHTML = '';
    grid.classList.toggle('list', state.density === 'list');
    list.forEach(function (course) { grid.appendChild(buildCard(course)); });
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;
    updateCounts();
  }

  function moduleData(course, index) {
    var count = 3 + ((index + course.modules) % 3);
    var assets = [];
    for (var i = 0; i < count; i += 1) {
      var kind = ASSET_TYPES[(index + i) % ASSET_TYPES.length];
      assets.push({
        label: kind.label + ' · ' + MODULE_TITLES[(index + i) % MODULE_TITLES.length],
        type: kind.type,
        icon: kind.icon,
        state: (index + i) % 5 === 0 ? 'review' : 'ready'
      });
    }
    return {
      title: MODULE_TITLES[index % MODULE_TITLES.length] + (index >= 9 ? ' ' + (index + 1) : ''),
      status: index === 1 ? 'In review' : (index < course.progress / 14 ? 'Ready' : 'Draft'),
      assets: assets
    };
  }

  function buildDetail(course, inSheet) {
    var inner = el('div', 'detail-inner');

    var head = el('div', 'detail-head');
    head.appendChild(el('span', 'mono', inSheet ? 'Course outline' : 'Selected course'));
    var actions = el('div', 'detail-actions');
    var copy = el('button', 'mini-icon' + (inSheet ? '' : ' is-on'));
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy course outline');
    copy.title = 'Copy course outline';
    copy.appendChild(icon('i-copy'));
    copy.addEventListener('click', function () {
      toast('Outline copy is part of the full product.');
    });
    actions.appendChild(copy);
    head.appendChild(actions);
    inner.appendChild(head);

    var titleRow = el('div', 'detail-title-row');
    titleRow.appendChild(el('span', 'detail-mark', course.code.split('-').pop().slice(0, 2)));
    var titleCopy = el('div');
    titleCopy.appendChild(el('h2', null, course.title));
    titleCopy.appendChild(el('p', null, course.level + ' · ' + pad(course.modules) + ' modules'));
    titleRow.appendChild(titleCopy);
    inner.appendChild(titleRow);

    var status = el('span', 'cc-status detail-status ' + STATUS_CLASS[course.status],
      STATUS_LABEL[course.status]);
    inner.appendChild(status);
    inner.appendChild(el('p', 'detail-blurb', course.blurb));

    var progress = el('div', 'detail-progress');
    var bar = el('span', 'cc-bar');
    var fill = el('i');
    fill.style.width = course.progress + '%';
    bar.appendChild(fill);
    progress.appendChild(bar);
    progress.appendChild(el('span', 'cc-pct', course.progress + '% publish-ready'));
    inner.appendChild(progress);

    var filters = el('div', 'asset-filters');
    filters.id = inSheet ? 'sheetAssetFilters' : 'assetFilters';
    ['all', 'note', 'worksheet', 'flash', 'quiz', 'recording'].forEach(function (key) {
      var button = el('button', key === state.assetFilter ? 'active' : '');
      button.type = 'button';
      button.setAttribute('data-asset', key);
      if (key !== 'all') button.appendChild(icon('i-' + key));
      button.appendChild(el('span', null, key === 'all' ? 'All assets' : key));
      button.addEventListener('click', function () {
        state.assetFilter = key;
        var target = inSheet ? $('sheetDetailContent') : $('detailContent');
        if (target) { target.innerHTML = ''; target.appendChild(buildDetail(course, inSheet)); }
      });
      filters.appendChild(button);
    });
    inner.appendChild(filters);

    var blockHead = el('div', 'detail-block-head');
    blockHead.appendChild(el('span', 'mono', 'Modules'));
    blockHead.appendChild(el('span', 'count', pad(course.modules)));
    var add = el('button', 'add-module');
    add.type = 'button';
    add.appendChild(icon('i-plus'));
    add.appendChild(el('span', null, 'Add module'));
    add.addEventListener('click', function () { toast('Module authoring is part of the full product.'); });
    blockHead.appendChild(add);
    inner.appendChild(blockHead);

    var list = el('div', 'module-list');
    for (var index = 0; index < Math.min(course.modules, 9); index += 1) {
      list.appendChild(buildModule(course, index, moduleData(course, index), inSheet));
    }
    if (course.modules > 9) {
      var more = el('div', 'asset-none', '+ ' + (course.modules - 9) + ' more modules in this course');
      list.appendChild(more);
    }
    inner.appendChild(list);

    var foot = el('div', 'detail-foot');
    foot.appendChild(el('span', null, 'Updated ' + course.edited));
    var open = el('button', 'link', inSheet ? 'Open in panel' : 'Open full outline');
    open.type = 'button';
    open.addEventListener('click', function () {
      if (inSheet) { closeSheet(); selectCourse(course.id); }
      else openCourseSheet(course);
    });
    foot.appendChild(open);
    inner.appendChild(foot);
    return inner;
  }

  function buildModule(course, index, data, inSheet) {
    var key = (inSheet ? 'sheet:' : 'panel:') + course.id + ':' + index;
    var module = el('div', 'module' + (state.openModules[key] ? ' open' : ''));

    var head = el('button', 'module-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(Boolean(state.openModules[key])));
    head.appendChild(el('span', 'module-num', pad(index + 1)));
    var main = el('span', 'module-main');
    main.appendChild(el('b', null, data.title));
    main.appendChild(el('span', null, pad(data.assets.length) + ' typed assets'));
    head.appendChild(main);
    var badge = el('span', 'module-status s-' + (data.status === 'Ready' ? 'published'
      : data.status === 'In review' ? 'review' : 'draft'), data.status);
    head.appendChild(badge);
    head.appendChild(icon('i-chev-down', 'module-chev'));
    head.addEventListener('click', function () {
      state.openModules[key] = !state.openModules[key];
      var target = inSheet ? $('sheetDetailContent') : $('detailContent');
      if (target) { target.innerHTML = ''; target.appendChild(buildDetail(course, inSheet)); }
    });
    module.appendChild(head);

    var assets = el('div', 'asset-list');
    var shown = data.assets.filter(function (asset) {
      return state.assetFilter === 'all' || asset.type === state.assetFilter;
    });
    if (!shown.length) {
      assets.appendChild(el('div', 'asset-none', 'No assets of that type in this module.'));
    }
    shown.forEach(function (asset) {
      var row = el('div', 'asset-row');
      var iconBox = el('span', 'asset-icon');
      iconBox.appendChild(icon(asset.icon));
      row.appendChild(iconBox);
      var text = el('span', 'asset-txt');
      text.appendChild(el('b', null, asset.label));
      text.appendChild(el('span', null, asset.type.toUpperCase()));
      row.appendChild(text);
      row.appendChild(el('i', 'asset-dot ' + asset.state));
      var more = el('button', 'asset-btn');
      more.type = 'button';
      more.setAttribute('aria-label', 'Asset options');
      more.appendChild(icon('i-more'));
      more.addEventListener('click', function () { toast('Asset actions are part of the full product.'); });
      row.appendChild(more);
      assets.appendChild(row);
    });
    module.appendChild(assets);
    return module;
  }

  function renderDetail() {
    var target = $('detailContent');
    if (!target) return;
    target.innerHTML = '';
    var course = findCourse(state.selectedId) || courses[0];
    if (course) target.appendChild(buildDetail(course, false));
    var label = $('contextLabel');
    if (label && course) label.textContent = course.title;
  }

  function selectCourse(id) {
    state.selectedId = id;
    state.openModules = {};
    renderCourses();
    renderDetail();
  }

  function openSheet(name, course) {
    var layer = $('sheetLayer');
    if (!layer) return;
    layer.hidden = false;
    document.body.classList.add('sheet-open');
    ['course', 'new'].forEach(function (key) {
      var node = $('sheet-' + key);
      if (node) node.hidden = key !== name;
    });
    if (name === 'course' && course) {
      var target = $('sheetDetailContent');
      if (target) {
        target.innerHTML = '';
        target.appendChild(buildDetail(course, true));
      }
      state.sheetCourseId = course.id;
    }
    var focusable = layer.querySelector('[data-close-sheet], input, button');
    if (focusable) focusable.focus();
  }

  function openCourseSheet(course) { openSheet('course', course); }

  function closeSheet() {
    var layer = $('sheetLayer');
    if (!layer) return;
    layer.hidden = true;
    document.body.classList.remove('sheet-open');
    state.sheetCourseId = null;
  }

  function openSearch() {
    var overlay = $('searchOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('search-open');
    var input = $('searchInput');
    if (input) { input.value = state.query; input.focus(); input.select(); }
    renderSearch();
  }

  function closeSearch() {
    var overlay = $('searchOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('search-open');
  }

  function renderSearch() {
    var target = $('searchResults');
    if (!target) return;
    target.innerHTML = '';
    var query = ($('searchInput') || {}).value || '';
    var needle = query.trim().toLowerCase();
    var rows = courses.filter(function (course) {
      return !needle || (course.title + ' ' + course.blurb + ' ' + course.code)
        .toLowerCase().indexOf(needle) !== -1;
    }).slice(0, 8);

    if (!rows.length) {
      target.appendChild(el('div', 'search-empty', 'No matches. Try “ratio”, “flashcards” or “algebra”.'));
      return;
    }
    rows.forEach(function (course) {
      var row = el('button', 'search-row');
      row.type = 'button';
      var mark = el('span', 'sr-mark');
      mark.appendChild(icon('i-course'));
      row.appendChild(mark);
      var text = el('span', 'sr-txt');
      text.appendChild(el('b', null, course.title));
      text.appendChild(el('span', null, course.code + ' · ' + STATUS_LABEL[course.status]));
      row.appendChild(text);
      row.appendChild(icon('i-arrow', 'sr-go'));
      row.addEventListener('click', function () {
        closeSearch();
        selectCourse(course.id);
        var detail = $('detailTitle');
        if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      target.appendChild(row);
    });
  }

  function createCourse(event) {
    event.preventDefault();
    var name = ($('newName') || {}).value || '';
    var level = ($('newLevel') || {}).value || 'Class 6';
    var topic = ($('newTopic') || {}).value || 'Mathematics';
    var title = name.trim();
    if (!title) return;

    var number = courses.length + 1;
    var course = {
      id: 'custom-' + Date.now(),
      code: 'MTH-' + (600 + number),
      title: title,
      blurb: 'A new ' + topic.toLowerCase() + ' course for ' + level + '. Add your first typed asset to begin.',
      status: 'draft',
      level: level,
      modules: 1,
      assets: 0,
      progress: 0,
      edited: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      custom: true
    };
    courses.unshift(course);
    persistCustom();
    var form = $('newCourseForm');
    if (form) form.reset();
    closeSheet();
    state.filter = 'all';
    state.query = '';
    var search = $('librarySearch');
    if (search) search.value = '';
    document.querySelectorAll('[data-filter]').forEach(function (button) {
      var active = button.getAttribute('data-filter') === 'all';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    selectCourse(course.id);
    toast('Course created with one empty module.');
  }

  function bind() {
    document.querySelectorAll('[data-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.filter = button.getAttribute('data-filter');
        document.querySelectorAll('[data-filter]').forEach(function (item) {
          var active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
        });
        renderCourses();
      });
    });

    var librarySearch = $('librarySearch');
    if (librarySearch) {
      librarySearch.addEventListener('input', function () {
        state.query = librarySearch.value;
        renderCourses();
      });
    }

    document.querySelectorAll('[data-density]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.density = button.getAttribute('data-density');
        document.querySelectorAll('[data-density]').forEach(function (item) {
          var active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        renderCourses();
      });
    });

    var clear = $('clearFilters');
    if (clear) {
      clear.addEventListener('click', function () {
        state.filter = 'all';
        state.query = '';
        if (librarySearch) librarySearch.value = '';
        document.querySelectorAll('[data-filter]').forEach(function (button) {
          var active = button.getAttribute('data-filter') === 'all';
          button.classList.toggle('active', active);
          button.setAttribute('aria-selected', String(active));
        });
        renderCourses();
      });
    }

    var newCourse = $('newCourseBtn');
    if (newCourse) newCourse.addEventListener('click', function () { openSheet('new'); });
    var form = $('newCourseForm');
    if (form) form.addEventListener('submit', createCourse);

    document.querySelectorAll('[data-close-sheet]').forEach(function (button) {
      button.addEventListener('click', closeSheet);
    });

    var context = $('courseContext');
    if (context) context.addEventListener('click', function () {
      var course = findCourse(state.selectedId);
      if (course) openCourseSheet(course);
    });

    var searchOpen = $('searchOpen');
    if (searchOpen) searchOpen.addEventListener('click', openSearch);
    var mobileSearch = $('mobileSearch');
    if (mobileSearch) mobileSearch.addEventListener('click', openSearch);
    var searchClose = $('searchClose');
    if (searchClose) searchClose.addEventListener('click', closeSearch);
    var searchInput = $('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderSearch);

    var overlay = $('searchOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) closeSearch();
      });
    }

    document.querySelectorAll('[data-quick]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (searchInput) { searchInput.value = button.getAttribute('data-quick'); renderSearch(); }
      });
    });

    document.querySelectorAll('[data-toast]').forEach(function (button) {
      button.addEventListener('click', function () { toast(button.getAttribute('data-toast')); });
    });

    document.querySelectorAll('[data-nav]').forEach(function (link) {
      link.addEventListener('click', function () {
        document.querySelectorAll('[data-nav]').forEach(function (item) {
          item.classList.toggle('active', item === link);
          if (item === link) item.setAttribute('aria-current', 'page');
          else item.removeAttribute('aria-current');
        });
      });
    });

    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('[data-tab]').forEach(function (item) {
          item.classList.toggle('active', item === tab);
          if (item === tab) item.setAttribute('aria-current', 'page');
          else item.removeAttribute('aria-current');
        });
      });
    });

    document.addEventListener('keydown', function (event) {
      var key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (key !== 'escape') return;
      if (!$('searchOverlay') || !$('searchOverlay').hidden) closeSearch();
      else if (!$('sheetLayer') || !$('sheetLayer').hidden) closeSheet();
    });
  }

  loadCustom();
  bind();
  renderCourses();
  renderDetail();
}());
