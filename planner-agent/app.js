/* Planner agent desk.
 *
 * Academic-only companion to the LMS planner designer. It uses the same
 * role-filtered catalogue, planner reads and validated local draft as the LMS;
 * the only extra calls are the agent's own alternate-idea queue. No family,
 * money, staff or delivery surface is loaded or linked from this desk. */
(function () {
  'use strict';

  var TOKEN_KEYS = ['mathify.planner.token', 'mathify.classroom.token.planner_agent'];
  var LOGIN_PAGE = '../login.html?role=planner_agent';

  function byId(id) { return document.getElementById(id); }

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }

  function token() {
    for (var index = 0; index < TOKEN_KEYS.length; index += 1) {
      try {
        var value = window.localStorage.getItem(TOKEN_KEYS[index]);
        if (value) return value;
      } catch (error) { /* private mode */ }
    }
    return null;
  }

  function logout() {
    TOKEN_KEYS.forEach(function (key) {
      try { window.localStorage.removeItem(key); } catch (error) { /* private mode */ }
    });
    window.location.replace('../login.html');
  }

  function requireLogin() {
    window.location.replace(LOGIN_PAGE);
  }

  function say(id, message, tone) {
    var target = byId(id);
    if (!target) return;
    target.textContent = message || '';
    if (tone) target.setAttribute('data-tone', tone);
    else target.removeAttribute('data-tone');
  }

  function stamp(value) {
    if (!value) return '—';
    var date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function bindChrome() {
    var skip = document.querySelector('[data-skip="main"]');
    if (skip) {
      skip.addEventListener('click', function () {
        var main = byId('main');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus();
          if (main.scrollIntoView) main.scrollIntoView({ block: 'start' });
        }
      });
    }
    var button = byId('profileBtn');
    var panel = byId('profilePanel');
    if (button && panel) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function (event) {
        if (!panel.hidden && !panel.contains(event.target) && event.target !== button) {
          panel.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });
    }
    var exit = byId('logoutBtn');
    if (exit) exit.addEventListener('click', logout);

    Array.prototype.forEach.call(document.querySelectorAll('.nav button[data-nav]'), function (link) {
      link.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.nav button[data-nav]'), function (item) {
          var active = item === link;
          item.classList.toggle('active', active);
          if (active) item.setAttribute('aria-current', 'page');
          else item.removeAttribute('aria-current');
        });
        var target = byId(link.getAttribute('data-target'));
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function ideaRow(idea) {
    var item = idea || {};
    var row = node('article', 'idea-row');
    var top = node('div', 'idea-top');
    top.appendChild(node('h3', '', item.topic || item.plannerTitle || 'Untitled idea'));
    var status = ['pending', 'accepted', 'rejected'].indexOf(item.status) !== -1 ? item.status : 'pending';
    top.appendChild(node('span', 'chip ' + status, status));
    row.appendChild(top);
    row.appendChild(node('p', '', item.note || 'No review note was supplied.'));
    row.appendChild(node('p', '',
      'Target: version ' + (item.targetVersion || '—') + ' · ' +
      (item.targetAuthoredByRole || 'unknown') + ' authorship'));
    row.appendChild(node('div', 'meta',
      (item.subjectLabel || item.subject || 'subject') + ' · ' +
      (item.curriculumSlug || 'board') + ' · ' + (item.gradeSlug || 'grade') +
      ' · filed ' + stamp(item.createdAt) +
      (item.decidedAt ? ' · decided ' + stamp(item.decidedAt) : '')));
    return row;
  }

  function refreshIdeas() {
    var client = window.mathifyLmsApi;
    if (!client || !client.plannerSuggestions) {
      say('ideaStatus', 'The idea queue is unavailable right now.', 'warn');
      return Promise.resolve(null);
    }
    say('ideaStatus', 'Loading your ideas…');
    return client.plannerSuggestions({ all: true }).then(function (result) {
      var source = (result && result.suggestions) || [];
      var own = source.filter(function (item) {
        return item && item.authorRole === 'planner_agent';
      });
      var queue = byId('ideaQueue');
      if (queue) {
        queue.textContent = '';
        if (!own.length) queue.appendChild(node('p', 'idea-empty', 'No alternate ideas filed yet.'));
        else own.forEach(function (idea) { queue.appendChild(ideaRow(idea)); });
      }
      say('ideaStatus', own.length + ' alternate idea' + (own.length === 1 ? '' : 's') + ' on file.', 'ok');
      return own;
    }).catch(function (error) {
      say('ideaStatus', (error && error.message) || 'Idea queue is unavailable right now.', 'warn');
      return null;
    });
  }

  function boot() {
    bindChrome();
    var refresh = byId('ideaRefresh');
    if (refresh) refresh.addEventListener('click', refreshIdeas);
    document.addEventListener('mathify:planneridea', refreshIdeas);

    var gate = window.MathifyLmsAccess;
    if (!gate) {
      say('agentStatus', 'The planner desk is unavailable right now.', 'warn');
      return;
    }
    var identity = gate.detect ? gate.detect() : gate.current();
    if (!token() || identity.denied || identity.role !== 'planner_agent') {
      say('agentStatus', 'Open this desk with the planner agent credential.', 'warn');
      requireLogin();
      return;
    }
    var subject = gate.subject && gate.subject();
    say('agentStatus', 'Signed in as the planner agent. All three subjects are available' +
      (subject ? ' (starting with ' + subject + ')' : '') + '.', 'ok');
    refreshIdeas();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
