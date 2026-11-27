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

  function load() {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    pending = fetch(endpoint(), {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('Catalogue request failed.');
      return response.json();
    }).then(function (body) {
      cached = Array.isArray(body && body.curricula) && body.curricula.length
        ? body.curricula
        : FALLBACK;
      pending = null;
      return cached;
    }).catch(function () {
      cached = FALLBACK;
      pending = null;
      return cached;
    });
    return pending;
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

  window.MathifyCurriculums = {
    load: load,
    populate: populate,
    fillGrades: fillGrades,
    bySlug: bySlug,
    FALLBACK: FALLBACK
  };
}());
