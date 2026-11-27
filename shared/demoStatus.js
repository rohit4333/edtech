/* Demo desk card for the child, parent and assigned trainer.
 *
 * All data comes from role-scoped server endpoints. The browser never supplies
 * a child id, and the trainer card only contains the family-facing allowlist. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var path = window.location.pathname || '';
  var role = path.indexOf('/parent') === 0 ? 'parent'
    : path.indexOf('/trainer') === 0 ? 'trainer' : 'student';

  function byId(id) { return document.getElementById(id); }
  function text(node, value) { if (node) node.textContent = value === null || value === undefined ? '—' : String(value); }
  function show(node, visible) { if (node) node.hidden = !visible; }

  function token() {
    var keys = window.MathifySession && window.MathifySession.accessKeys[role];
    if (!keys) return null;
    for (var index = 0; index < keys.length; index += 1) {
      try {
        var value = window.localStorage.getItem(keys[index]);
        if (value) return value;
      } catch (error) { /* private mode */ }
    }
    return null;
  }

  function get(url) {
    var value = token();
    if (!value) return Promise.resolve(null);
    return fetch(BASE + url, {
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + value }
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json();
    }).catch(function () { return null; });
  }

  function list(node, values) {
    if (!node) return;
    node.textContent = '';
    (values || []).forEach(function (value) {
      var item = document.createElement('span');
      item.className = 'demo-chip';
      item.textContent = value;
      node.appendChild(item);
    });
  }

  function renderFamily(data) {
    var card = byId('demoCard');
    if (!card) return;
    var demo = data && data.demo;
    show(card, Boolean(demo));
    if (!demo) return;
    text(byId('demoIdValue'), demo.demoId);
    text(byId('demoBatchValue'), demo.batchCode || 'Pending batch');
    text(byId('demoState'), demo.trainerAssigned ? 'Trainer assigned' : 'Trainer pending');
    text(byId('demoTrainerValue'), demo.trainerName || 'Pending assignment');
    text(byId('demoAccessValue'), demo.attendedAt
      ? 'Demo attended · payments and policies only until a pack is chosen'
      : 'Demo login active · classes open after assignment');
    text(byId('demoHint'), 'Check your email for more details. Demo ID ' + demo.demoId +
      ' and your shared login are there.');
    var trainer = data.trainer;
    var panel = byId('demoTrainerPanel');
    show(panel, Boolean(trainer));
    if (!trainer) return;
    text(byId('demoTrainerName'), trainer.name);
    text(byId('demoTrainerExperience'), trainer.yearsExperience === null
      ? 'Experience shared on request' : trainer.yearsExperience + ' years of experience');
    list(byId('demoTrainerDegrees'), trainer.degrees);
    list(byId('demoTrainerAchievements'), trainer.achievements);
    var photo = byId('demoTrainerPhoto');
    if (photo) {
      show(photo, Boolean(trainer.hasProfilePicture));
      if (trainer.hasProfilePicture) photo.src = BASE + '/demo/photo';
    }
  }

  function renderNotices(data) {
    var box = byId('demoNotices');
    if (!box) return;
    var rows = (data && data.notifications) || [];
    show(box, rows.length > 0);
    box.textContent = '';
    rows.slice(0, 6).forEach(function (row) {
      var item = document.createElement('div');
      item.className = 'demo-notice';
      var title = document.createElement('b');
      title.textContent = row.title || 'Mathify update';
      var message = document.createElement('span');
      message.textContent = row.message || '';
      item.appendChild(title);
      item.appendChild(message);
      box.appendChild(item);
    });
  }

  function renderTrainer(demoId) {
    if (!demoId || role !== 'trainer') return;
    get('/demo/trainer/' + encodeURIComponent(demoId)).then(function (data) {
      var demo = data && data.demo;
      var card = byId('trainerDemoCard');
      show(card, Boolean(demo));
      if (!demo) return;
      text(byId('trainerDemoId'), demo.demoId);
      text(byId('trainerDemoChild'), demo.childName);
      text(byId('trainerDemoBatch'), demo.batchCode);
      text(byId('trainerDemoContext'), demo.curriculum + ' · ' + demo.grade);
    });
  }

  function init() {
    if (role === 'trainer') {
      var params = new URLSearchParams(window.location.search);
      renderTrainer(params.get('demoId'));
      return;
    }
    get('/demo/status').then(renderFamily);
    if (role === 'parent') get('/demo/notifications').then(renderNotices);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
