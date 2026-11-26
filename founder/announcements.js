/* Founder announcement composer.
 *
 * The server owns audience enforcement and the DLP gate. This client only
 * collects a title, message and one of four audiences: trainers, students,
 * both, or a single named trainer/student. Blocked content returns a neutral
 * reason and is never echoed back to any recipient.
 */

(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.classroom.token.founder';
  var LOGIN_PAGE = 'login.html?role=founder';

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
  }

  function signIn() {
    var next = window.location.pathname + window.location.search;
    var target = LOGIN_PAGE + '&next=' + encodeURIComponent(next);
    if (window.location.replace) window.location.replace(target);
    else window.location.href = target;
  }

  function request(path, options) {
    var settings = options || {};
    var headers = { Accept: 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: settings.method || 'GET',
      headers: headers,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var problem = new Error((data && data.message) || 'Request failed.');
          problem.status = response.status;
          problem.code = data && data.error;
          throw problem;
        }
        return data;
      });
    });
  }

  function status(message, kind) {
    var node = $('announcementStatus');
    if (!node) return;
    node.textContent = message || '';
    node.className = 'announcement-status' + (kind ? ' is-' + kind : '');
  }

  function audienceLabel(audience, recipientName) {
    if (audience === 'individual') return 'Individual · ' + (recipientName || 'Former account');
    if (audience === 'both') return 'Trainers + students';
    if (audience === 'trainers') return 'Trainers only';
    return 'Students only';
  }

  function renderList(rows) {
    var host = $('announcementHistory');
    if (!host) return;
    host.textContent = '';
    if (!rows.length) {
      host.appendChild(el('p', 'announcement-empty', 'No announcements sent yet.'));
      return;
    }
    rows.forEach(function (row) {
      var item = el('article', 'announcement-row');
      item.appendChild(el('span', 'announcement-audience', audienceLabel(row.audience, row.recipientName)));
      var body = el('div', 'announcement-copy');
      body.appendChild(el('b', null, row.title));
      body.appendChild(el('p', null, row.message));
      item.appendChild(body);
      item.appendChild(el('time', null, String(row.createdAt || '').slice(0, 16).replace('T', ' ')));
      host.appendChild(item);
    });
  }

  function load() {
    if (!token()) { signIn(); return Promise.reject(new Error('SIGN_IN_REQUIRED')); }
    return Promise.all([
      request('/admin/announcements/recipients'),
      request('/admin/announcements')
    ]).then(function (results) {
      var select = $('announcementRecipient');
      var recipients = (results[0] && results[0].recipients) || [];
      if (select) {
        select.textContent = '';
        recipients.forEach(function (person) {
          var option = el('option', null, person.name + ' · ' + person.role);
          option.value = person.id;
          select.appendChild(option);
        });
        if (!recipients.length) {
          var empty = el('option', null, 'No eligible accounts');
          empty.value = '';
          select.appendChild(empty);
        }
      }
      renderList((results[1] && results[1].announcements) || []);
      status('Announcements loaded from the server.', 'saved');
    }).catch(function (error) {
      if (error && (error.status === 401 || error.status === 403)) { signIn(); return; }
      status('Announcements could not be loaded. Nothing was changed.', 'error');
    });
  }

  function syncAudience() {
    var audience = $('announcementAudience');
    var wrap = $('announcementRecipientWrap');
    if (!audience || !wrap) return;
    wrap.hidden = audience.value !== 'individual';
  }

  function submit(event) {
    event.preventDefault();
    if (!token()) { signIn(); return; }
    var button = $('announcementSend');
    if (button) button.disabled = true;
    var audience = $('announcementAudience');
    var payload = {
      audience: audience ? audience.value : '',
      title: $('announcementTitleInput') ? $('announcementTitleInput').value : '',
      message: $('announcementMessage') ? $('announcementMessage').value : '',
      recipientId: audience && audience.value === 'individual' && $('announcementRecipient')
        ? $('announcementRecipient').value : undefined
    };
    status('Validating announcement…');
    request('/admin/announcements', { method: 'POST', body: payload }).then(function (data) {
      var form = $('announcementForm');
      if (form) form.reset();
      syncAudience();
      status('Sent · ' + audienceLabel(data.announcement.audience, data.announcement.recipientName), 'saved');
      return load();
    }).catch(function (error) {
      if (error && (error.status === 401 || error.status === 403)) { signIn(); return; }
      /* Only the server's neutral message is displayed. */
      status(error && error.message ? error.message : 'Announcement could not be sent.', 'error');
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function init() {
    var form = $('announcementForm');
    var audience = $('announcementAudience');
    if (!form || !audience) return;
    audience.addEventListener('change', syncAudience);
    form.addEventListener('submit', submit);
    syncAudience();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
