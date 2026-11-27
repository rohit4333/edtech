/* Shared curriculum + grade picker used by the demo form, registration and LMS.
 *
 * It follows the timezone picker pattern: one server-owned catalogue, grouped
 * <optgroup> dropdowns, and a grade list that is rebuilt whenever the selected
 * board changes. A small embedded set keeps the form usable if the catalogue
 * endpoint is temporarily unreachable; the server remains the source of truth
 * for validation.
 */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var cached = null;
  var pending = null;
  var subjectsCached = null;

  /* Subject is an academic-content choice only: the same board, grade, roles,
     policies and payments apply to all three. These labels are display-only
     fallbacks; the catalogue endpoint remains the source of truth. */
  var SUBJECT_FALLBACK = [
    {
      subject: 'math', label: 'Mathematics', shortLabel: 'Math', workspace: 'board',
      strands: ['Number', 'Patterns', 'Shape and space', 'Measurement', 'Data', 'Reasoning']
    },
    {
      subject: 'coding', label: 'Coding', shortLabel: 'Coding', workspace: 'ide',
      strands: ['Sequencing', 'Variables', 'Conditions', 'Loops', 'Functions', 'Debugging']
    },
    {
      subject: 'english', label: 'English Communication', shortLabel: 'English', workspace: 'literacy',
      strands: ['Reading', 'Writing', 'Public speaking', 'Listening', 'Vocabulary', 'Expression']
    }
  ];
  var SUBJECT_ALIASES = {
    maths: 'math', mathematics: 'math', numeracy: 'math',
    code: 'coding', programming: 'coding', javascript: 'coding',
    communication: 'english', 'public speaking': 'english', reading: 'english', writing: 'english'
  };

  function grades(prefix, count, band) {
    var list = [];
    for (var index = 1; index <= count; index += 1) {
      list.push({
        slug: prefix + '-' + index,
        label: prefix === 'class' ? 'Class ' + index : 'Grade ' + index,
        group: 'School',
        band: band(index)
      });
    }
    return list;
  }

  function band(index) {
    if (index <= 2) return '6–8 years';
    if (index <= 5) return '8–11 years';
    if (index <= 8) return '11–14 years';
    return '14–17 years';
  }

  var FALLBACK = [
    { slug: 'cbse', label: 'CBSE — India', country: 'India', grades: grades('class', 12, band) },
    { slug: 'icse', label: 'ICSE / ISC — India', country: 'India', grades: grades('class', 12, band) },
    { slug: 'igcse', label: 'IGCSE / Cambridge (International)', country: 'International', grades: grades('grade', 12, band) },
    { slug: 'ib', label: 'IB — International Baccalaureate', country: 'International', grades: grades('grade', 12, band) },
    { slug: 'common-core', label: 'Common Core — United States', country: 'United States', grades: grades('grade', 12, band) },
    { slug: 'uk-national', label: 'National Curriculum — England & UK', country: 'United Kingdom', grades: grades('grade', 12, band) },
    { slug: 'uae-ministry', label: 'UAE Ministry of Education', country: 'United Arab Emirates', grades: grades('grade', 12, band) },
    { slug: 'dubai-private', label: 'Dubai private schools (KHDA)', country: 'United Arab Emirates', grades: grades('grade', 12, band) },
    { slug: 'saudi-national', label: 'Saudi National Curriculum', country: 'Saudi Arabia', grades: grades('grade', 12, band) },
    { slug: 'singapore-moe', label: 'Singapore MOE', country: 'Singapore', grades: grades('grade', 12, band) },
    { slug: 'japan-mext', label: 'Japan MEXT', country: 'Japan', grades: grades('grade', 12, band) },
    { slug: 'china-national', label: 'China National Curriculum', country: 'China', grades: grades('grade', 12, band) },
    { slug: 'other-local', label: 'Other / local curriculum', country: 'International', grades: grades('grade', 12, band) }
  ];

  function endpoint() {
    return String(BASE).replace(/\/$/, '') + '/lms/curriculum-catalog';
  }

  function access() { return window.MathifyLmsAccess || null; }

  function normalizeSubject(value) {
    var key = String(value === null || value === undefined ? '' : value)
      .trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return SUBJECT_ALIASES[key] ||
      (key === 'math' || key === 'coding' || key === 'english' ? key : null);
  }

  function cleanSubjects(list) {
    var source = Array.isArray(list) ? list : [];
    var safe = [];
    source.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var slug = normalizeSubject(item.subject || item.slug);
      if (!slug || safe.some(function (entry) { return entry.subject === slug; })) return;
      safe.push({
        subject: slug,
        label: typeof item.label === 'string' && item.label.trim() ? item.label : slug,
        shortLabel: typeof item.shortLabel === 'string' && item.shortLabel.trim() ? item.shortLabel : slug,
        workspace: typeof item.workspace === 'string' ? item.workspace : '',
        strands: Array.isArray(item.strands)
          ? item.strands.filter(function (strand) { return typeof strand === 'string'; }).slice(0, 8)
          : []
      });
    });
    return safe;
  }

  function fallbackSubjects() {
    return SUBJECT_FALLBACK.map(function (item) {
      return {
        subject: item.subject, label: item.label, shortLabel: item.shortLabel,
        workspace: item.workspace, strands: item.strands.slice()
      };
    });
  }

  function visibleSubjects(list) {
    var gate = access();
    if (gate && gate.isDenied && gate.isDenied()) return [];
    var source = cleanSubjects(list);
    if (!source.length) source = fallbackSubjects();
    if (gate && gate.applyCatalog) gate.applyCatalog(source);
    if (gate && gate.allowedSubjects) source = gate.allowedSubjects(source);
    if (!source.length && gate && gate.role && gate.role() === 'trainer') return [];
    return source.length ? source : fallbackSubjects();
  }

  function load() {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    var headers = { accept: 'application/json' };
    var gate = access();
    var authToken = gate && gate.token ? gate.token() : null;
    if (authToken) headers.authorization = 'Bearer ' + authToken;
    pending = fetch(endpoint(), {
      headers: headers,
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('Catalogue request failed.');
      return response.json();
    }).then(function (body) {
      cached = Array.isArray(body && body.curricula) && body.curricula.length
        ? body.curricula
        : FALLBACK;
      subjectsCached = visibleSubjects(body && body.subjects);
      pending = null;
      return cached;
    }).catch(function () {
      cached = FALLBACK;
      subjectsCached = visibleSubjects(null);
      pending = null;
      return cached;
    });
    return pending;
  }

  function loadSubjects() {
    return load().then(function () {
      return subjectsCached || visibleSubjects(null);
    });
  }

  function option(label, value) {
    var node = document.createElement('option');
    node.value = value || '';
    node.textContent = label;
    return node;
  }

  function placeholder(select, label) {
    select.textContent = '';
    select.appendChild(option(label, ''));
  }

  function group(select, label) {
    var found = null;
    Array.prototype.forEach.call(select.querySelectorAll('optgroup'), function (node) {
      if (node.label === label) found = node;
    });
    if (!found) {
      found = document.createElement('optgroup');
      found.label = label;
      select.appendChild(found);
    }
    return found;
  }

  function bySlug(list, slug) {
    var found = null;
    (list || []).forEach(function (item) {
      if (item.slug === slug) found = item;
    });
    return found;
  }

  function gradeLabel(grade) {
    return grade.label + (grade.band ? ' · ' + grade.band : '');
  }

  /* Rebuild the grade dropdown from the selected curriculum, exactly like the
     timezone picker rebuilds its region groups. */
  function fillGrades(gradeSelect, curriculumList, curriculumSlug, preferred) {
    if (!gradeSelect) return null;
    var item = bySlug(curriculumList, curriculumSlug);
    var grades = item && Array.isArray(item.grades) ? item.grades : [];
    placeholder(gradeSelect, grades.length ? 'Select a grade' : 'Choose a curriculum first');
    grades.forEach(function (grade) {
      group(gradeSelect, grade.group || 'School').appendChild(
        option(gradeLabel(grade), grade.slug));
    });
    if (preferred && grades.some(function (grade) { return grade.slug === preferred; })) {
      gradeSelect.value = preferred;
    }
    return item;
  }

  /* Public entry point. `options` may carry curriculum, grade and onChange. */
  function populate(curriculumSelect, gradeSelect, options) {
    if (!curriculumSelect) return Promise.resolve([]);
    var settings = options || {};
    return load().then(function (list) {
      placeholder(curriculumSelect, 'Select a curriculum');
      list.forEach(function (item) {
        group(curriculumSelect, item.country || 'Other').appendChild(
          option(item.label, item.slug));
      });

      function choose(preferredGrade) {
        var item = fillGrades(gradeSelect, list, curriculumSelect.value, preferredGrade);
        if (typeof settings.onChange === 'function') {
          settings.onChange(item, curriculumSelect.value, gradeSelect && gradeSelect.value);
        }
      }

      curriculumSelect.addEventListener('change', function () { choose(''); });
      if (settings.curriculum && bySlug(list, settings.curriculum)) {
        curriculumSelect.value = settings.curriculum;
      }
      if (gradeSelect) gradeSelect.addEventListener('change', function () {
        if (typeof settings.onGradeChange === 'function') {
          settings.onGradeChange(gradeSelect.value);
        }
      });
      choose(settings.grade);
      return list;
    });
  }

  function bySubject(list, slug) {
    var wanted = normalizeSubject(slug);
    var found = null;
    (list || []).forEach(function (item) {
      if (item.subject === wanted) found = item;
    });
    return found;
  }

  /* Subject picker: labels come from the role-filtered catalogue, with the
     hardcoded list only as a graceful fallback. Trainers never receive a
     second option here; founder keeps all three. */
  function populateSubjects(subjectSelect, options) {
    if (!subjectSelect) return Promise.resolve([]);
    var settings = options || {};
    return loadSubjects().then(function (list) {
      subjectSelect.textContent = '';
      if (!list.length) {
        subjectSelect.appendChild(option('Subject unavailable', ''));
        subjectSelect.disabled = true;
        return list;
      }
      list.forEach(function (item) {
        subjectSelect.appendChild(option(item.label || item.shortLabel, item.subject));
      });
      var preferred = normalizeSubject(settings.subject);
      subjectSelect.value = preferred && bySubject(list, preferred)
        ? preferred
        : list[0].subject;
      var event;
      try { event = new CustomEvent('mathify:subjectchange', { detail: { subject: subjectSelect.value } }); }
      catch (error) {
        event = document.createEvent('Event');
        event.initEvent('mathify:subjectchange', true, true);
        event.detail = { subject: subjectSelect.value };
      }
      subjectSelect.dispatchEvent(event);
      if (typeof settings.onChange === 'function') {
        subjectSelect.addEventListener('change', function () {
          settings.onChange(subjectSelect.value, bySubject(list, subjectSelect.value));
        });
      }
      return list;
    });
  }

  window.MathifyCurriculums = {
    load: load,
    loadSubjects: loadSubjects,
    populate: populate,
    populateSubjects: populateSubjects,
    fillGrades: fillGrades,
    bySlug: bySlug,
    bySubject: bySubject,
    normalizeSubject: normalizeSubject,
    FALLBACK: FALLBACK,
    SUBJECT_FALLBACK: SUBJECT_FALLBACK
  };
}());
