/* Subject framing for the LMS planner preview.
 *
 * Academic content only. Coding stays unplugged (the live IDE lives in the
 * classroom); English Communication is reading, writing, public speaking,
 * listening and vocabulary — never a literature or grammar track. Every string
 * is rendered with textContent, including anything supplied by the catalogue.
 */
(function () {
  'use strict';

  var FALLBACK = {
    math: {
      subject: 'math', label: 'Mathematics', shortLabel: 'Math', workspace: 'board',
      description: 'Numbers, patterns, shapes and measurement through play and talk.',
      strands: ['Number', 'Patterns', 'Shape and space', 'Measurement', 'Data', 'Reasoning'],
      activities: ['Number talk', 'Pattern hunt', 'Draw the shape', 'Measure and compare']
    },
    coding: {
      subject: 'coding', label: 'Coding', shortLabel: 'Coding', workspace: 'ide',
      description: 'Screen-free logic and step work. The live IDE stays in the classroom workspace.',
      strands: ['Sequencing', 'Variables', 'Conditions', 'Loops', 'Functions', 'Debugging'],
      activities: ['Step cards', 'Choice cards', 'Bug hunt', 'Loop the routine']
    },
    english: {
      subject: 'english', label: 'English Communication', shortLabel: 'English', workspace: 'literacy',
      description: 'Reading, writing, public speaking, listening and vocabulary for everyday school tasks.',
      strands: ['Reading', 'Writing', 'Public speaking', 'Listening', 'Vocabulary', 'Expression'],
      activities: ['Read aloud', 'Write one line', 'Pair share', 'Listening walk', 'Word bank']
    }
  };
  var DEFAULT_TOPIC = {
    math: 'General Mathematics', coding: 'General Coding', english: 'General Communication'
  };

  function normalize(value) {
    var access = window.MathifyLmsAccess;
    if (access && access.normalize) {
      return access.normalize(value) || 'math';
    }
    var key = String(value === null || value === undefined ? '' : value)
      .trim().toLowerCase();
    if (key === 'coding' || key === 'code' || key === 'programming') return 'coding';
    if (key === 'english' || key === 'communication') return 'english';
    return 'math';
  }

  function descriptor(value, list) {
    var slug = normalize(value);
    var base = FALLBACK[slug] || FALLBACK.math;
    var supplied = null;
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (item && normalize(item.subject || item.slug) === slug) supplied = item;
    });
    return {
      subject: base.subject,
      label: supplied && typeof supplied.label === 'string' && supplied.label.trim()
        ? supplied.label : base.label,
      shortLabel: supplied && typeof supplied.shortLabel === 'string' && supplied.shortLabel.trim()
        ? supplied.shortLabel : base.shortLabel,
      workspace: supplied && typeof supplied.workspace === 'string'
        ? supplied.workspace : base.workspace,
      description: base.description,
      strands: supplied && Array.isArray(supplied.strands) && supplied.strands.length
        ? supplied.strands.filter(function (strand) { return typeof strand === 'string'; }).slice(0, 6)
        : base.strands.slice()
    };
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function node(value, list) {
    var item = descriptor(value, list);
    var section = element('section', 'wp-subject-focus');
    section.appendChild(element('span', 'wp-subject-kicker', 'Academic focus'));
    section.appendChild(element('h3', '', item.label));
    section.appendChild(element('p', '', item.description));

    var strands = element('div', 'wp-subject-strands');
    item.strands.forEach(function (strand) {
      strands.appendChild(element('span', 'wp-subject-strand', strand));
    });
    section.appendChild(strands);

    var cards = element('div', 'wp-subject-cards');
    (FALLBACK[item.subject] || FALLBACK.math).activities.forEach(function (activity) {
      cards.appendChild(element('span', 'wp-subject-card', activity));
    });
    section.appendChild(cards);
    return section;
  }

  window.mathifySubjectPlanner = {
    FALLBACK: FALLBACK,
    normalize: normalize,
    descriptor: descriptor,
    node: node,
    label: function (value, list) { return descriptor(value, list).label; },
    defaultTopic: function (value) { return DEFAULT_TOPIC[normalize(value)] || DEFAULT_TOPIC.math; }
  };
}());
