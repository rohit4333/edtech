/* Desk notification mailbox.
 *
 * Trainer mode reads notices addressed to the signed-in trainer and that
 * trainer's own parent threads. Parent mode reads child-scoped notices from
 * /api/demo/notifications with the parent token. Both keep a real unread count
 * from the server and open each item inside the same panel with Back. No
 * password, payment credential, provider data or foreign child is displayed.
 */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var config = window.MATHIFY_NOTIFICATION_INBOX || {};
  var mode = config.mode === 'parent' ? 'parent' : 'trainer';
  var TOKEN_KEY =
    config.tokenKey || (mode === 'parent' ? 'mathify.parent.token' : 'mathify.trainer.token');
  var SOURCE = config.source || '/demo/notifications';

  function dom(value) {
    if (!value) return null;
    if (typeof value === 'string') return document.querySelector(value);
    return value;
  }

  var button = dom(config.button || '#notificationBtn');
  var panel = dom(config.panel || '#notificationPanel');
  var badge = dom(config.badge || '#notificationBadge');
  var title = dom(config.title || '#inboxTitle');
  var body = dom(config.body || '#notificationBody');
  var closeBtn = dom(config.close || '#notificationClose');

  var state = {
    view: 'list',
    loaded: false,
    announcements: [],
    threads: [],
    notices: [],
    announcementUnread: null,
    parentUnread: null,
    noticeUnread: null,
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function unreadNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function token() {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  /* Prefer the desk client so token refresh and role gating stay shared. */
  function request(path, options) {
    var api =
      mode === 'parent'
        ? (config.api && window[config.api]) || window.mathifyParentApi
        : window.mathifyTrainerApi;
    if (api && typeof api.request === 'function') return api.request(path, options);

    var opts = options || {};
    var headers = { Accept: 'application/json' };
    var value = token();
    if (value) headers.Authorization = 'Bearer ' + value;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (typeof fetch !== 'function') return Promise.reject(new Error('Fetch unavailable'));

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = null;
        }
        if (!response.ok) throw new Error((data && data.message) || 'Request failed.');
        return data || {};
      });
    });
  }

  function soft(path) {
    return request(path).catch(function () {
      return null;
    });
  }

  function safeAnnouncement(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id || null,
      title: row.title || 'Notice',
      message: row.message || '',
      createdAt: row.createdAt || null,
      readAt: row.readAt || null,
    };
  }

  /* Only the fields parentChat itself returns as safe message data. */
  function safeMessages(data) {
    var rows = data && Array.isArray(data.messages) ? data.messages : [];
    return rows
      .filter(function (row) {
        return row && typeof row === 'object';
      })
      .map(function (row) {
        return {
          id: row.id || null,
          senderRole: row.senderRole || 'unknown',
          body: row.body === undefined || row.body === null ? '' : String(row.body),
          createdAt: row.createdAt || null,
        };
      })
      .filter(function (row) {
        return row.body.trim() !== '';
      });
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: window.MATHIFY_TZ || undefined,
      }).format(date);
    } catch (error) {
      return '—';
    }
  }

  function roleLabel(role) {
    if (role === 'parent') return 'Parent';
    if (role === 'trainer') return 'You · trainer';
    return 'Message';
  }

  function preview(text) {
    var value = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    return value || 'Open to read this message.';
  }

  /* The server has already scoped parent notices to the signed-in child. Only
     these display fields are copied; credentials and provider data are not. */
  function safeNotice(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id || null,
      kind: row.kind || 'update',
      title: row.title || 'Child update',
      message: row.message === undefined || row.message === null ? '' : String(row.message),
      createdAt: row.createdAt || null,
      readAt: row.readAt || null,
      link: safeNoticeLink(row.link),
    };
  }

  function safeNoticeLink(value) {
    if (!value) return null;
    try {
      var parsed = new URL(String(value), window.location.href);
      if (parsed.origin !== window.location.origin) return null;
      if (parsed.pathname !== '/parent/balance' && parsed.pathname !== '/app/parent/balance') {
        return null;
      }
      return parsed.pathname;
    } catch (error) {
      return null;
    }
  }

  function totalUnread() {
    if (mode === 'parent') return state.noticeUnread || 0;
    var known = state.announcementUnread !== null || state.parentUnread !== null;
    if (!known) return 0;
    return (state.announcementUnread || 0) + (state.parentUnread || 0);
  }

  function updateBadge() {
    var count = totalUnread();
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
    if (button) {
      button.setAttribute(
        'aria-label',
        count ? 'Notifications, ' + count + ' unread' : 'Notifications'
      );
    }
    if (title && state.view === 'list') {
      title.textContent = count ? 'Notifications · ' + count + ' unread' : 'Notifications';
    }
  }

  function loadParent() {
    /* The badge stays accurate even while the popover is closed. */
    if (!body || !button) return Promise.resolve();
    if (!token()) {
      state.loaded = false;
      state.noticeUnread = 0;
      renderUnavailable();
      return Promise.resolve();
    }
    return request(SOURCE)
      .then(function (data) {
        state.notices = asArray(data && data.notifications)
          .map(safeNotice)
          .filter(function (row) {
            return row && row.id;
          });
        var reported = data && data.unreadCount;
        state.noticeUnread =
          reported === undefined
            ? state.notices.filter(function (row) {
                return !row.readAt;
              }).length
            : unreadNumber(reported);
        state.loaded = true;
        updateBadge();
        if (state.view === 'list') renderList();
      })
      .catch(function () {
        state.loaded = false;
        state.noticeUnread = 0;
        updateBadge();
        if (state.view === 'list') renderUnavailable();
      });
  }

  function load() {
    if (mode === 'parent') return loadParent();
    if (!body || panel.hidden) return Promise.resolve();
    if (!button || !token()) {
      state.loaded = false;
      renderUnavailable();
      return Promise.resolve();
    }

    return Promise.all([
      soft('/announcements'),
      soft('/announcements/unread'),
      soft('/parent-chat/unread-summary'),
    ])
      .then(function (results) {
        var announcementData = results[0] || {};
        var announcementSummary = results[1];
        var parentSummary = results[2] || {};

        state.announcements = asArray(announcementData.announcements)
          .map(safeAnnouncement)
          .filter(function (row) {
            return row && row.id;
          });
        state.announcementUnread =
          announcementSummary && announcementSummary.unread !== undefined
            ? unreadNumber(announcementSummary.unread)
            : state.announcements.filter(function (row) {
                return !row.readAt;
              }).length;

        var parentRaw =
          parentSummary.unreadCount !== undefined
            ? parentSummary.unreadCount
            : parentSummary.total !== undefined
              ? parentSummary.total
              : null;
        state.parentUnread = parentRaw === null ? null : unreadNumber(parentRaw);

        var summaries = asArray(parentSummary.threads)
          .filter(function (row) {
            return row && (row.studentId || row.threadId || row.id);
          })
          .sort(function (left, right) {
            return unreadNumber(right.unreadCount) - unreadNumber(left.unreadCount);
          })
          .slice(0, 20);

        return Promise.all(
          summaries.map(function (row) {
            var id = String(row.studentId || row.threadId || row.id);
            return soft('/parent-chat/thread/' + encodeURIComponent(id)).then(function (data) {
              return {
                id: id,
                messages: safeMessages(data),
                unreadCount:
                  data && data.unreadCount !== undefined
                    ? unreadNumber(data.unreadCount)
                    : unreadNumber(row.unreadCount),
              };
            });
          })
        );
      })
      .then(function (threads) {
        state.threads = threads.filter(function (thread) {
          return thread.unreadCount > 0 || thread.messages.length > 0;
        });
        if (state.parentUnread === null) {
          state.parentUnread = state.threads.reduce(function (sum, thread) {
            return sum + thread.unreadCount;
          }, 0);
        }
        state.loaded = true;
        updateBadge();
        if (state.view === 'list') renderList();
      })
      .catch(function () {
        state.loaded = false;
        updateBadge();
        if (state.view === 'list') renderUnavailable();
      });
  }

  function appendGroup(parent, key, heading, rows, buildRow) {
    var group = el('section', 'inbox-group');
    group.setAttribute('data-notification-group', key);
    group.appendChild(el('h3', 'inbox-group-title', heading));
    var list = el('ul', 'inbox-items');
    if (!rows.length) {
      var empty = el('li', 'inbox-empty', 'Nothing new here.');
      list.appendChild(empty);
    } else {
      rows.forEach(function (row) {
        list.appendChild(buildRow(row));
      });
    }
    group.appendChild(list);
    parent.appendChild(group);
  }

  function announcementRow(row) {
    var item = el('li');
    var open = el('button', 'inbox-item' + (row.readAt ? '' : ' is-unread'));
    open.type = 'button';
    open.setAttribute('data-notification-kind', 'announcement');
    open.setAttribute('data-notification-id', String(row.id));

    var top = el('span', 'inbox-item-top');
    top.appendChild(el('b', null, 'RM / founder notice'));
    top.appendChild(el('time', null, formatDate(row.createdAt)));
    open.appendChild(top);
    open.appendChild(el('span', 'inbox-item-title', row.title));
    open.appendChild(el('span', 'inbox-item-preview', preview(row.message)));
    open.addEventListener('click', function () {
      openDetail('announcement', String(row.id));
    });

    item.appendChild(open);
    return item;
  }

  function parentRow(thread) {
    var item = el('li');
    var latest = thread.messages[thread.messages.length - 1] || null;
    var open = el('button', 'inbox-item' + (thread.unreadCount > 0 ? ' is-unread' : ''));
    open.type = 'button';
    open.setAttribute('data-notification-kind', 'parent');
    open.setAttribute('data-notification-id', thread.id);

    var top = el('span', 'inbox-item-top');
    top.appendChild(
      el(
        'b',
        null,
        thread.unreadCount > 0 ? 'Parent · ' + thread.unreadCount + ' unread' : 'Parent message'
      )
    );
    top.appendChild(el('time', null, formatDate(latest && latest.createdAt)));
    open.appendChild(top);
    open.appendChild(
      el('span', 'inbox-item-title', latest ? roleLabel(latest.senderRole) : 'Private thread')
    );
    open.appendChild(
      el('span', 'inbox-item-preview', latest ? preview(latest.body) : 'Open to read this thread.')
    );
    open.addEventListener('click', function () {
      openDetail('parent', thread.id);
    });

    item.appendChild(open);
    return item;
  }

  function noticeRow(row) {
    var item = el('li');
    var open = el('button', 'inbox-item' + (row.readAt ? '' : ' is-unread'));
    open.type = 'button';
    open.setAttribute('data-notification-kind', 'notice');
    open.setAttribute('data-notification-id', String(row.id));

    var top = el('span', 'inbox-item-top');
    top.appendChild(el('b', null, row.kind === 'renewal_request' ? 'Renewal' : 'Child notice'));
    top.appendChild(el('time', null, formatDate(row.createdAt)));
    open.appendChild(top);
    open.appendChild(el('span', 'inbox-item-title', row.title));
    open.appendChild(el('span', 'inbox-item-preview', preview(row.message)));
    open.addEventListener('click', function () {
      openDetail('notice', String(row.id));
    });

    item.appendChild(open);
    return item;
  }

  function renderUnavailable() {
    state.view = 'list';
    if (!body) return;
    if (title) title.textContent = 'Notifications';
    clear(body);
    body.appendChild(
      el(
        'p',
        'inbox-empty',
        'Notifications could not be loaded right now. Please retry in a moment.'
      )
    );
    body.scrollTop = 0;
  }

  function renderList() {
    if (!body) return;
    state.view = 'list';
    updateBadge();
    clear(body);
    var wrap = el('div', 'inbox-list-wrap');
    if (mode === 'parent') {
      appendGroup(wrap, 'child-notices', 'Your child', state.notices, noticeRow);
    } else {
      appendGroup(wrap, 'notices', 'RM & founder notices', state.announcements, announcementRow);
      appendGroup(wrap, 'parent', 'Parent messages', state.threads, parentRow);
    }
    body.appendChild(wrap);
    body.scrollTop = 0;
  }

  function addBack() {
    var back = el('button', 'inbox-back', '← Back to notifications');
    back.type = 'button';
    back.addEventListener('click', function () {
      load();
      renderList();
    });
    body.appendChild(back);
  }

  function markAnnouncementRead(row) {
    if (row.readAt) return;
    row.readAt = new Date().toISOString();
    if (state.announcementUnread !== null && state.announcementUnread > 0) {
      state.announcementUnread -= 1;
    }
    updateBadge();
    request('/announcements/' + encodeURIComponent(row.id) + '/read', { method: 'POST' }).catch(
      function () {
        row.readAt = null;
        if (state.announcementUnread !== null) state.announcementUnread += 1;
        updateBadge();
      }
    );
  }

  function markThreadRead(thread) {
    var before = thread.unreadCount;
    if (!before) return;
    thread.unreadCount = 0;
    if (state.parentUnread !== null) {
      state.parentUnread = Math.max(0, state.parentUnread - before);
    }
    updateBadge();
    request('/parent-chat/thread/' + encodeURIComponent(thread.id) + '/read', {
      method: 'POST',
      body: {},
    }).catch(function () {
      thread.unreadCount = before;
      if (state.parentUnread !== null) state.parentUnread += before;
      updateBadge();
    });
  }

  function markNoticeRead(row) {
    if (row.readAt) return;
    row.readAt = new Date().toISOString();
    if (state.noticeUnread > 0) state.noticeUnread -= 1;
    updateBadge();
    request(SOURCE + '/' + encodeURIComponent(row.id) + '/read', { method: 'POST' }).catch(
      function () {
        row.readAt = null;
        state.noticeUnread += 1;
        updateBadge();
      }
    );
  }

  function detailShell(kicker, heading, when, unread) {
    var article = el('article', 'inbox-detail' + (unread ? ' is-unread' : ''));
    article.appendChild(el('span', 'inbox-kicker', kicker));
    article.appendChild(el('h3', 'inbox-detail-title', heading));
    article.appendChild(el('time', null, formatDate(when)));
    return article;
  }

  function openAnnouncement(id) {
    var row = state.announcements.filter(function (item) {
      return String(item.id) === String(id);
    })[0];
    if (!row) return;
    var unread = !row.readAt;
    state.view = 'detail';
    if (title) title.textContent = 'Notice';
    clear(body);
    addBack();
    var article = detailShell('RM / founder notice', row.title, row.createdAt, unread);
    article.appendChild(
      el('p', 'inbox-detail-copy', row.message || 'No message text was supplied.')
    );
    body.appendChild(article);
    body.scrollTop = 0;
    markAnnouncementRead(row);
  }

  function openThread(id) {
    var thread = state.threads.filter(function (item) {
      return String(item.id) === String(id);
    })[0];
    if (!thread) return;
    var unread = thread.unreadCount > 0;
    state.view = 'detail';
    if (title) title.textContent = 'Parent thread';
    clear(body);
    addBack();
    var latest = thread.messages[thread.messages.length - 1] || null;
    var article = detailShell(
      'Parent message',
      'Private thread',
      latest ? latest.createdAt : null,
      unread
    );
    var list = el('ol', 'inbox-msg-list');
    if (!thread.messages.length) {
      list.appendChild(el('li', 'inbox-empty', 'This thread has no messages yet.'));
    } else {
      thread.messages.forEach(function (message) {
        var row = el('li', 'inbox-msg' + (message.senderRole === 'trainer' ? ' is-mine' : ''));
        row.appendChild(el('span', 'inbox-kicker', roleLabel(message.senderRole)));
        row.appendChild(el('p', 'inbox-msg-copy', message.body));
        row.appendChild(el('time', null, formatDate(message.createdAt)));
        list.appendChild(row);
      });
    }
    article.appendChild(list);
    body.appendChild(article);
    body.scrollTop = 0;
    markThreadRead(thread);
  }

  function openNotice(id) {
    var row = state.notices.filter(function (item) {
      return String(item.id) === String(id);
    })[0];
    if (!row) return;
    var unread = !row.readAt;
    state.view = 'detail';
    if (title) title.textContent = 'Child notice';
    clear(body);
    addBack();
    var article = detailShell('Your child · Mathify', row.title, row.createdAt, unread);
    article.appendChild(
      el('p', 'inbox-detail-copy', row.message || 'Open your child’s desk for details.')
    );
    if (row.link) {
      var link = el('a', 'inbox-link', 'Open Balance & pack');
      link.href = row.link;
      article.appendChild(link);
    }
    body.appendChild(article);
    body.scrollTop = 0;
    markNoticeRead(row);
  }

  function openDetail(kind, id) {
    if (kind === 'notice') openNotice(id);
    else if (kind === 'announcement') openAnnouncement(id);
    else if (kind === 'parent') openThread(id);
  }

  function open() {
    if (!panel || !button) return;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (closeBtn) closeBtn.focus();
    load();
  }

  function close() {
    if (!panel || !button) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    state.view = 'list';
  }

  function bind() {
    if (!button || !panel) return;
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (panel.hidden) open();
      else close();
    });
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        close();
        button.focus();
      });
    }
    /* Capture keeps the mailbox from stacking with the profile popover. */
    document.addEventListener(
      'click',
      function (event) {
        if (panel.hidden) return;
        if (panel.contains(event.target) || button.contains(event.target)) return;
        close();
      },
      true
    );
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || panel.hidden) return;
      close();
      button.focus();
    });
  }

  function init() {
    if (!button || !panel || !body) return;
    bind();
    updateBadge();
    if (mode === 'parent') {
      /* The bell is accurate on page load, not only after it is clicked. */
      load();
      window.setInterval(load, 60000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.mathifyNotificationInbox = { open: open, close: close, refresh: load };
})();
