/* Wires the visible pointer relay to the classroom ink surfaces.
   Loaded by classroom/index.html after api.js and fullBoard.js. */
(function () {
  'use strict';

  var relay = window.MathifyCursor;
  if (!relay) return;

  var paper = document.getElementById('paper');
  var fullBoard = document.getElementById('fullBoard');
  var boardCanvas = document.getElementById('fullBoardCanvas');
  var boardWrap = document.querySelector('.full-board-canvas-wrap');
  var scratchCanvas = document.getElementById('scratchCanvas');
  var scratchOverlay = document.getElementById('scratchOverlay');
  var studentInk = document.getElementById('studentInk');
  var studentInkCanvas = document.getElementById('studentInkCanvas');

  function quizLive() {
    return document.body.classList.contains('quiz-live');
  }

  var sources = [];
  if (paper) {
    sources.push(relay.attachSource({
      element: paper,
      surface: 'board',
      hidden: function () { return quizLive(); }
    }));
  }
  if (boardCanvas) {
    sources.push(relay.attachSource({
      element: boardCanvas,
      surface: 'board',
      hidden: function () { return !fullBoard || fullBoard.hidden; }
    }));
  }
  if (scratchCanvas) {
    sources.push(relay.attachSource({
      element: scratchCanvas,
      surface: 'sketch',
      hidden: function () { return !scratchOverlay || scratchOverlay.hidden; }
    }));
  }

  relay.watchRemote({
    targets: {
      board: [
        {
          container: paper,
          element: paper,
          visible: function () { return !quizLive() && Boolean(paper); }
        },
        {
          container: boardWrap,
          element: boardCanvas,
          visible: function () { return Boolean(fullBoard && boardWrap && !fullBoard.hidden); }
        }
      ],
      sketch: [{
        container: studentInk,
        element: studentInkCanvas,
        visible: function () {
          return Boolean(studentInk && studentInkCanvas && quizLive() && !studentInk.hidden);
        }
      }]
    }
  });

  function teardown() {
    sources.forEach(function (source) {
      if (source && typeof source.detach === 'function') source.detach();
      if (source && typeof source.hide === 'function') source.hide();
    });
    relay.hideAll();
  }

  window.addEventListener('pagehide', teardown);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) relay.hideAll();
  });
})();
