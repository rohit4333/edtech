/* Shared announcement inbox for trainer and student dashboards.
 * Reads only notices addressed to the signed-in role or account. A notice is
 * marked read only when the recipient opens it; founder targeting metadata is
 * never sent to these surfaces.
 */

(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var config = window.MATHIFY_ANNOUNCEMENTS || {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function token() {
    try { return window.localStorage.getItem(config.tokenKey); } catch (error) { return null; }
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
        if (!response.ok) throw new Error((data && data.message) || 'Request failed.');
        return data;
      });
    });
  }

  function label(row) {
    if (row.audience === 'trainers') return 'Trainers';
    if (row.audience === 'students') return 'Students';
    if (row.audience === 'individual') return 'For you';
    return 'Trainers + students';
  }

  function render(rows) {
    var host = typeof config.mount === 'string'
      ? document.querySelector(config.mount) : config.mount;
    if (!host) return;
    host.textContent = '';
    var badge = document.querySelector(config.badge || '[data-announcement-badge]');
    var unread = rows.filter(function (row) { return !row.readAt; }).length;
    if (badge) {
      badge.textContent = unread ? String(unread) : '';
      badge.hidden = !unread;
    }
    if (!rows.length) {
      host.appendChild(el('p', 'announce-empty', 'No announcements yet.'));
      return;
    }
    rows.forEach(function (row) {
      var item = el('article', 'announce-item' + (row.readAt ? '' : ' is-unread'));
      item.appendChild(el('span', 'announce-audience', label(row)));
      var copy = el('div', 'announce-copy');
      copy.appendChild(el('b', null, row.title));
      copy.appendChild(el('p', null, row.message));
      item.appendChild(copy);
      if (!row.readAt) {
        var mark = el('button', 'announce-mark', 'Mark read');
        mark.type = 'button';
        mark.addEventListener('click', function () {
          request('/announcements/' + encodeURIComponent(row.id) + '/read', { method: 'POST' })
            .then(load).catch(function () { /* leave the notice unread on failure */ });
        });
        item.appendChild(mark);
      }
      host.appendChild(item);
    });
  }

  function load() {
    if (!token()) return Promise.resolve(render([]));
    return request('/announcements').then(function (data) {
      render((data && data.announcements) || []);
    }).catch(function () { render([]); });
  }

  function init() {
    if (!config.mount) return;
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.mathifyAnnouncements = { refresh: load };
})();
