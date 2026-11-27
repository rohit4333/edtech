/* Subject-specific copy for the shared session shell.
 *
 * The stage itself is already different per subject (whiteboard / IDE / literacy
 * workspace). The overlay sheets, end-of-class recap and local recheck scaffold
 * must speak the learner's language too, so a coding or English child never
 * sees a ratio worksheet. Math copy below is the original wording, unchanged.
 * Every value is written with textContent or created elements — no HTML string
 * from a server or a URL is ever injected.
 */
(function () {
  'use strict';

  var COPY = {
    math: {
      lesson: 'Ratios · Lesson 15',
      board: 'Lesson 15',
      quizPlaceholder: 'Which ratio is equivalent to 3 : 5?',
      recap: {
        chips: ['Bar models', 'Equivalent ratios', 'Unit labels'],
        log: [
          ['4:30', 'Session opened', 'Ishaan joined · 1:1 room'],
          ['4:38', 'Bar model marked complete', 'Split the ribbon into 8 parts'],
          ['4:46', 'Quiz ready', 'Level 2 · one question'],
          ['4:52', 'Ishaan raised a hand', 'Resolved on the board, page 2'],
          ['5:04', 'Board page 3 opened', 'Independent practice · 12 min']
        ],
        followup: 'Ishaan missed 1 of the last 6 sessions. Assign a short practice set after this one.',
        summary: 'Ratios · Lesson 15',
        highlights: ['Bar models', 'Equivalent ratios'],
        homework: 'Practice sheet 3'
      },
      planner: {
        eyebrow: 'Lesson 15 · Shared plan',
        objective: 'Use bar models to solve ratio problems when one part is known.',
        note: 'Pace is 4 minutes behind plan. The extra bar-model example is worth it — trim the quiz to one question.',
        steps: [
          ['Warm-up · one ratio, two lengths', 6, 'with trainer', 'done'],
          ['Build · scale both sides', 10, 'board + sketch', 'done'],
          ['Guided practice · bar models', 12, '1:1 questions', 'current'],
          ['Independent · bead mix', 10, 'page 3', 'next'],
          ['Quiz · checks', 4, 'threshold configurable', 'next']
        ]
      },
      health: {
        bars: [['Equivalent ratios', 82], ['Bar models', 74], ['Unit rates', 58]],
        focus: 'Unit rates',
        focusNote: 'Slowest bar · assign 6 questions before the next session'
      },
      recheck: [
        { q: 'Which ratio is equivalent to 4 : 7?', options: ['8 : 14', '7 : 4', '12 : 14', '4 : 10'] },
        { q: 'A 3 : 4 mix uses 9 red beads. How many blue beads are needed?', options: ['4', '12', '16', '21'] }
      ]
    },
    coding: {
      lesson: 'Coding · Live editor',
      board: 'Coding board',
      quizPlaceholder: 'Your trainer will start a practice check in the editor.',
      recap: {
        chips: ['Functions', 'Hidden checks', 'Hand-over'],
        log: [
          ['4:30', 'Session opened', 'Learner joined · 1:1 room'],
          ['4:38', 'Starter code shared', 'Prompt opened in the live IDE'],
          ['4:46', 'Practice check run', 'Hidden checks passed'],
          ['4:52', 'Trainer took the editor', 'One fix demonstrated, then handed back'],
          ['5:04', 'Independent fix', 'Learner wrote the final function']
        ],
        followup: 'Keep one short function drill ready before the next session.',
        summary: 'Coding · Live editor',
        highlights: ['Functions', 'Hidden checks'],
        homework: 'Two function drills'
      },
      planner: {
        eyebrow: 'Coding · Shared plan',
        objective: 'Write a JavaScript function that passes the trainer’s hidden checks.',
        note: 'Keep the editor with the learner. Use lock only while demonstrating a fix, then hand it back.',
        steps: [
          ['Warm-up · read the prompt', 6, 'with trainer', 'done'],
          ['Build · write the function', 10, 'live IDE', 'done'],
          ['Guided practice · run checks', 12, 'trainer + learner', 'current'],
          ['Independent · fix a failing case', 10, 'editor hand-over', 'next'],
          ['Practice check · in IDE', 4, 'hidden tests on server', 'next']
        ]
      },
      health: {
        bars: [['Functions', 82], ['Conditions', 70], ['Loops', 58]],
        focus: 'Loops',
        focusNote: 'Lowest strand · assign one loop drill before the next session'
      },
      recheck: [
        { q: 'Which line calls a function named add?', options: ['add(2, 3)', 'function add', 'let add', 'add = 2'] },
        { q: 'What does a hidden check verify?', options: ['Code colour', 'The result of your function', 'File name', 'Typing speed'] }
      ]
    },
    english: {
      lesson: 'English · Communication',
      board: 'English board',
      quizPlaceholder: 'Your trainer will start a reading and speaking check.',
      recap: {
        chips: ['Reading', 'Writing', 'Speaking'],
        log: [
          ['4:30', 'Session opened', 'Learner joined · 1:1 room'],
          ['4:38', 'Passage annotated', 'New words marked together'],
          ['4:46', 'Draft revised', 'One describing word added'],
          ['4:52', 'Speaking prompt answered', 'Thirty seconds, one new word'],
          ['5:04', 'Vocabulary review', 'Five words saved to the word bank']
        ],
        followup: 'Read one short passage aloud before the next session.',
        summary: 'English · Communication',
        highlights: ['Reading', 'Writing'],
        homework: 'One short paragraph'
      },
      planner: {
        eyebrow: 'English · Shared plan',
        objective: 'Read a short passage, revise a paragraph and speak for thirty seconds.',
        note: 'Keep feedback on one describing word at a time so the revision stays focused.',
        steps: [
          ['Warm-up · vocabulary', 6, 'with trainer', 'done'],
          ['Build · read and annotate', 10, 'passage + notes', 'done'],
          ['Guided practice · draft', 12, 'writing with trainer', 'current'],
          ['Independent · revise paragraph', 10, 'writing + feedback', 'next'],
          ['Speaking check', 4, 'thirty-second prompt', 'next']
        ]
      },
      health: {
        bars: [['Reading', 80], ['Writing', 72], ['Speaking', 60]],
        focus: 'Speaking',
        focusNote: 'Lowest strand · one thirty-second answer before the next session'
      },
      recheck: [
        { q: 'Which word best completes: “The dog came back ___.”?', options: ['gentle', 'gently', 'gentler', 'gentleness'] },
        { q: 'What makes a strong speaking answer?', options: ['One clear idea', 'A long silence', 'Reading the prompt twice', 'A big word used wrongly'] }
      ]
    }
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    var node = $(selector);
    if (node && typeof value === 'string') node.textContent = value;
  }

  function checkIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-check');
    svg.appendChild(use);
    return svg;
  }

  function paintChips(list) {
    var host = $('#recapChips');
    if (!host || !Array.isArray(list)) return;
    host.textContent = '';
    list.forEach(function (label) {
      var chip = document.createElement('span');
      chip.textContent = label;
      host.appendChild(chip);
    });
  }

  function paintLog(entries) {
    var host = $('#recapLog');
    if (!host || !Array.isArray(entries)) return;
    host.textContent = '';
    entries.forEach(function (entry) {
      var li = document.createElement('li');
      var time = document.createElement('time');
      time.textContent = entry[0];
      var body = document.createElement('div');
      var title = document.createElement('b');
      title.textContent = entry[1];
      var detail = document.createElement('span');
      detail.textContent = entry[2];
      body.appendChild(title);
      body.appendChild(detail);
      li.appendChild(time);
      li.appendChild(body);
      host.appendChild(li);
    });
  }

  function paintSteps(steps) {
    var host = $('#planSteps');
    if (!host || !Array.isArray(steps)) return;
    host.textContent = '';
    steps.forEach(function (item, index) {
      var li = document.createElement('li');
      var state = item[3];
      if (state === 'done' || state === 'current') li.className = state;
      li.setAttribute('data-step', item[0].split(' · ')[0]);
      li.setAttribute('data-min', String(item[1]));

      var mark = document.createElement('span');
      mark.className = 'step-mark';
      if (state === 'done') mark.appendChild(checkIcon());
      else mark.textContent = String(index + 1);

      var main = document.createElement('div');
      main.className = 'step-main';
      var title = document.createElement('b');
      title.textContent = item[0];
      var sub = document.createElement('span');
      sub.textContent = item[1] + ' min · ' + item[2];
      main.appendChild(title);
      main.appendChild(sub);
      li.appendChild(mark);
      li.appendChild(main);

      if (state === 'current') {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'mini-btn';
        button.setAttribute('data-done-step', '');
        button.textContent = 'Mark done';
        li.appendChild(button);
      } else {
        var label = document.createElement('span');
        label.className = 'step-state';
        label.textContent = state === 'done' ? 'Done' : 'Next';
        li.appendChild(label);
      }
      host.appendChild(li);
    });
  }

  function paintBars(bars) {
    var host = $('#healthBars');
    if (!host || !Array.isArray(bars)) return;
    host.textContent = '';
    bars.forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'bar-row' + (index === bars.length - 1 ? ' is-low' : '');
      var name = document.createElement('span');
      name.textContent = item[0];
      var track = document.createElement('div');
      track.className = 'bar-track';
      var fill = document.createElement('i');
      fill.style.width = Math.max(0, Math.min(100, Number(item[1]) || 0)) + '%';
      track.appendChild(fill);
      var score = document.createElement('b');
      score.className = 'num';
      score.textContent = String(item[1]);
      row.appendChild(name);
      row.appendChild(track);
      row.appendChild(score);
      host.appendChild(row);
    });
  }

  var lastApplied = null;

  function apply(info) {
    var key = info && info.subject;
    if (key !== 'coding' && key !== 'english') key = 'math';
    var copy = COPY[key];
    /* applySubject runs on init and again when session state arrives. Painting
       twice would reset a trainer's step progress, so keep it idempotent. */
    if (lastApplied === key) return copy;
    lastApplied = key;

    setText('#lessonSubject', copy.lesson);
    setText('#boardSub', copy.board);
    setText('#quizQuestion', copy.quizPlaceholder);

    paintChips(copy.recap.chips);
    paintLog(copy.recap.log);
    setText('#recapFollowup', copy.recap.followup);

    setText('#plannerEyebrow', copy.planner.eyebrow);
    setText('#plannerObjective', copy.planner.objective);
    setText('#planNoteText', copy.planner.note);
    paintSteps(copy.planner.steps);

    paintBars(copy.health.bars);
    setText('#healthFocus', copy.health.focus);
    setText('#healthFocusNote', copy.health.focusNote);

    return copy;
  }

  /* The end-of-class payload must describe the subject the child actually had. */
  function recapFor(info, studentName) {
    var key = info && info.subject;
    if (key !== 'coding' && key !== 'english') key = 'math';
    var recap = COPY[key].recap;
    return {
      summary: recap.summary + ' with ' + (studentName || 'your learner'),
      highlights: recap.highlights.slice(),
      homework: recap.homework
    };
  }

  function recheckFor(info) {
    var key = info && info.subject;
    if (key !== 'coding' && key !== 'english') key = 'math';
    return COPY[key].recheck.map(function (item) {
      return { q: item.q, options: item.options.slice() };
    });
  }

  window.mathifySubjectCopy = {
    apply: apply,
    recapFor: recapFor,
    recheckFor: recheckFor,
    copy: COPY
  };
})();
