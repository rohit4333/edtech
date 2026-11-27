/* ==========================================================================
   MATHIFY — parent space · private 1-on-1 inbox
   Vanilla JS. No build step. Messages are plain text, rendered as text only.

   API (BASE = window.MATHIFY_API_BASE || '/api', Bearer parent token):
     GET  /parent-chat/thread                 -> thread + messages + unread
     POST /parent-chat/thread/:studentId/messages  { body: string }
     POST /parent-chat/thread/:studentId/read      {}
   ========================================================================== */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.parent.token';
  var ROLE = 'parent';
  var LOGIN_PAGE = '/login.html?role=' + ROLE;
  var LIMIT = 2000;
  var POLL_MS = 30000;
  var UNAVAILABLE = 'Messages are unavailable right now';
  var BLOCKED = 'That message could not be sent. Please keep chat on Mathify and leave out phone numbers, social handles, links and personal contact details.';

  var IDS = [
    'trainerHeading', 'threadSub', 'childName', 'peerName', 'peerMeta', 'topThread',
    'profileBtn', 'profilePanel', 'profileName', 'logoutBtn',
    'unreadBadge', 'threadStatus', 'messageList', 'emptyState', 'composer',
    'composerInput', 'charCount', 'sendBtn', 'noticeRow', 'notice', 'retryBtn', 'demoLogin',
    'classReminder', 'classReminderTag', 'classReminderText', 'classReminderLink'
  ];
  var el = {};
  var memoryToken = null;
  var state = {
    thread: null,
    messages: [],
    loading: false,
    sending: false,
    unavailable: false
  };

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    IDS.forEach(function (id) { el[id] = $(id); });
  }

  /* ------------------------------------------------------------- api client */
  function rawRequest(path, options, token) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('Fetch unavailable'));
    var opts = options || {};
    var headers = { 'Accept': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) {}
        if (!response.ok) {
          var error = new Error((data && (data.message || data.error)) || 'API request failed.');
          error.status = response.status;
          error.code = (data && (data.error || data.code)) || null;
          error.payload = data;
          throw error;
        }
        return data || {};
      });
    });
  }

  function readToken() {
    if (memoryToken) return memoryToken;
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function writeToken(value) {
    memoryToken = value;
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
  }

  function clearTokens() {
    memoryToken = null;
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
  }

  function logout() {
    clearTokens();
    window.location.replace(LOGIN_PAGE);
  }

  function login(email, password) {
    return rawRequest('/auth/login', {
      method: 'POST',
      body: { email: email, password: password }
    }, null).then(function (data) {
      if (!data || !data.token) throw new Error('Demo sign-in unavailable.');
      writeToken(data.token);
      return data.token;
    });
  }

  /* The private inbox needs a verified parent token. No silent demo login. */
  function requireLogin() {
    clearTokens();
    var next = window.location.pathname + window.location.search;
    var target = LOGIN_PAGE + '&next=' + encodeURIComponent(next);
    if (window.location.replace) window.location.replace(target);
    else window.location.href = target;
    return new Error('SIGN_IN_REQUIRED');
  }

  function ensureAuth() {
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    return Promise.reject(requireLogin());
  }

  function api(path, options) {
    return ensureAuth().then(function (token) {
      return rawRequest(path, options, token).catch(function (error) {
        if (error.status === 401 || error.status === 403) return Promise.reject(requireLogin());
        throw error;
      });
    });
  }

  function isBlocked(error) {
    if (!error) return false;
    var payload = error.payload || {};
    var code = error.code || payload.error || payload.code;
    return code === 'CONTENT_BLOCKED' || (error.status === 422 && typeof code === 'string' && /block/i.test(code));
  }

  function noThread() {
    var error = new Error('No private thread yet.');
    error.noThread = true;
    return error;
  }

  /* -------------------------------------------------------------- normalize */
  function asArray(value) { return Array.isArray(value) ? value : []; }

  function normalizeThread(data) {
    var source = data || {};
    var candidate = source.thread || null;
    if (!candidate && Array.isArray(source.threads) && source.threads.length) {
      candidate = source.threads.slice().sort(function (a, b) {
        return (Number(b.unreadCount) || 0) - (Number(a.unreadCount) || 0);
      })[0];
    }
    if (!candidate && (source.threadId || source.studentId)) candidate = source;
    if (!candidate || typeof candidate !== 'object') return null;

    var student = candidate.student || {};
    var trainer = candidate.trainer || {};
    var parent = candidate.parent || {};
    var id = candidate.threadId || candidate.studentId || candidate.id || candidate.thread_id || null;
    if (!id) return null;
    var unread = candidate.unreadCount;
    if (unread === undefined) unread = source.unreadCount;
    var studentName = candidate.studentName || student.name || 'Ishaan Verma';

    return {
      id: String(id),
      studentName: studentName,
      trainerName: candidate.trainerName || trainer.name || 'Ananya Rao',
      parentName: candidate.parentName || parent.name || ('Parent of ' + String(studentName).split(' ')[0]),
      unreadCount: Number(unread) || 0
    };
  }

  function normalizeRole(value) {
    if (!value) return 'unknown';
    if (typeof value === 'object') value = value.role || value.type || value.name || '';
    var role = String(value).toLowerCase();
    if (role.indexOf('parent') !== -1 || role.indexOf('guardian') !== -1) return 'parent';
    if (role.indexOf('trainer') !== -1 || role.indexOf('tutor') !== -1) return 'trainer';
    return 'unknown';
  }

  function normalizeMessages(data) {
    var source = data || {};
    var list = asArray(source.messages || (source.data && source.data.messages));
    if (!list.length && Array.isArray(source)) list = source;

    return list.filter(function (item) { return item && typeof item === 'object'; }).map(function (item) {
      var body = item.body;
      if (body === undefined || body === null) body = item.text;
      if (body === undefined || body === null) body = item.content;
      if (body === undefined || body === null) body = item.message;
      var role = normalizeRole(item.senderRole || item.role || item.sender || item.from || item.author);
      var explicitMine = (typeof item.isMine === 'boolean') ? item.isMine
        : (typeof item.mine === 'boolean') ? item.mine : null;
      return {
        id: item.id || item.messageId || item.message_id || null,
        role: role,
        mine: explicitMine === null ? role === 'parent' : explicitMine,
        label: item.senderLabel || item.senderName || item.label || item.name || null,
        body: body === undefined || body === null ? '' : String(body),
        createdAt: item.createdAt || item.created_at || item.timestamp || item.time || item.at || null
      };
    }).filter(function (item) { return item.body.trim() !== ''; });
  }

  function formatTime(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: window.MATHIFY_TZ || undefined
      }).format(date);
    } catch (e) { return '—'; }
  }

  function threadId() {
    return state.thread && state.thread.id ? state.thread.id : null;
  }

  function sameMessages(next, current) {
    if (next.length !== current.length) return false;
    var a = next[next.length - 1];
    var b = current[current.length - 1];
    return Boolean(a && b && a.id === b.id && a.body === b.body);
  }

  /* --------------------------------------------------------------- painting */
  function setNotice(message, kind, retry) {
    if (!el.notice || !el.noticeRow) return;
    el.notice.textContent = message;
    el.notice.className = 'inline-notice' + (kind === 'warn' ? ' warn' : '');
    el.noticeRow.hidden = false;
    if (el.retryBtn) el.retryBtn.hidden = retry !== true;
  }

  function hideNotice() {
    if (el.noticeRow) el.noticeRow.hidden = true;
    if (el.notice) { el.notice.textContent = ''; el.notice.className = 'inline-notice'; }
    if (el.retryBtn) el.retryBtn.hidden = true;
  }

  function setStatus(text) {
    if (el.threadStatus) el.threadStatus.textContent = text;
  }

  function updateCount() {
    if (el.charCount && el.composerInput) {
      el.charCount.textContent = el.composerInput.value.length + ' / ' + LIMIT;
    }
  }

  function setComposerDisabled(disabled) {
    if (el.composerInput) el.composerInput.disabled = disabled;
    if (el.sendBtn) el.sendBtn.disabled = disabled || state.sending;
  }

  function renderHeader() {
    var thread = state.thread;
    if (!thread) return;
    if (el.trainerHeading) el.trainerHeading.textContent = thread.trainerName;
    if (el.peerName) el.peerName.textContent = thread.trainerName;
    if (el.peerMeta) el.peerMeta.textContent = thread.studentName + ' · 1-on-1 trainer';
    if (el.childName) el.childName.textContent = thread.studentName;
    if (el.topThread) el.topThread.textContent = thread.studentName + ' \u2194 ' + thread.trainerName;
    if (el.profileName) el.profileName.textContent = thread.parentName || 'Parent';
    if (el.threadSub) el.threadSub.textContent = thread.studentName + ' \u00b7 ' + thread.trainerName + ' \u00b7 1-on-1 maths';
  }

  function renderBadge() {
    if (!el.unreadBadge) return;
    var count = state.thread ? Math.max(0, Number(state.thread.unreadCount) || 0) : 0;
    el.unreadBadge.textContent = count + ' unread';
    el.unreadBadge.hidden = count === 0;
  }

  function clearList() {
    if (!el.messageList) return;
    while (el.messageList.firstChild) el.messageList.removeChild(el.messageList.firstChild);
  }

  function appendUnavailable() {
    if (!el.messageList) return;
    var item = document.createElement('li');
    item.className = 'msg-unavailable';
    item.textContent = UNAVAILABLE;
    el.messageList.appendChild(item);
  }

  function appendMessage(message) {
    if (!el.messageList) return;
    var item = document.createElement('li');
    item.className = 'msg ' + (message.mine ? 'mine' : 'theirs');

    var meta = document.createElement('span');
    meta.className = 'msg-meta';

    var label = document.createElement('span');
    label.className = 'msg-label';
    label.textContent = message.label || (message.mine ? 'You · parent' : (state.thread ? state.thread.trainerName : 'Trainer'));

    var time = document.createElement('time');
    time.className = 'msg-time';
    time.textContent = formatTime(message.createdAt);
    if (message.createdAt && !isNaN(new Date(message.createdAt).getTime())) {
      time.setAttribute('datetime', String(message.createdAt));
    }

    meta.appendChild(label);
    meta.appendChild(time);

    var text = document.createElement('p');
    text.className = 'msg-text';
    text.textContent = message.body;

    item.appendChild(meta);
    item.appendChild(text);
    el.messageList.appendChild(item);
  }

  function render() {
    clearList();
    if (el.emptyState) el.emptyState.hidden = true;

    if (state.unavailable) {
      appendUnavailable();
      setComposerDisabled(true);
      return;
    }

    setComposerDisabled(false);
    if (!state.messages.length) {
      if (el.emptyState) el.emptyState.hidden = false;
      return;
    }
    state.messages.forEach(appendMessage);
    if (el.messageList) el.messageList.scrollTop = el.messageList.scrollHeight;
  }

  function renderUnavailable() {
    state.unavailable = true;
    state.messages = [];
    setNotice(UNAVAILABLE, 'warn', true);
    setStatus('Unavailable');
    render();
  }

  function applyThread(data) {
    var thread = normalizeThread(data);
    if (!thread) throw noThread();
    state.thread = thread;
    state.messages = normalizeMessages(data);
    state.unavailable = false;
    hideNotice();
    setStatus('Private · 1-on-1');
    renderHeader();
    renderBadge();
    render();
    markRead();
  }

  /* ------------------------------------------------------------ operations */
  function markRead() {
    var id = threadId();
    if (!id || state.unavailable) return;
    api('/parent-chat/thread/' + encodeURIComponent(id) + '/read', { method: 'POST', body: {} })
      .then(function (data) {
        if (!state.thread) return;
        var remaining = data && data.unreadCount;
        state.thread.unreadCount = remaining === undefined ? 0 : Number(remaining) || 0;
        renderBadge();
      })
      .catch(function () { /* mark-read is best effort */ });
  }

  function load() {
    if (state.loading || !el.messageList) return Promise.resolve();
    state.loading = true;
    setStatus('Loading…');

    return api('/parent-chat/thread')
      .then(applyThread)
      .catch(function (error) {
        if ((error && error.noThread) || (error && error.code === 'STUDENT_REQUIRED')) {
          state.unavailable = false;
          state.thread = null;
          state.messages = [];
          hideNotice();
          setStatus('No thread yet');
          renderBadge();
          render();
          return;
        }
        renderUnavailable();
      })
      .then(function () { state.loading = false; });
  }

  function send(event) {
    event.preventDefault();
    if (state.sending || state.unavailable || !el.composerInput) return;
    var text = (el.composerInput.value || '').trim();
    if (!text) return;

    var id = threadId();
    if (!id) {
      setNotice(UNAVAILABLE, 'warn', true);
      return;
    }

    state.sending = true;
    el.sendBtn.disabled = true;

    api('/parent-chat/thread/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: { body: text } })
      .then(function (data) {
        el.composerInput.value = '';
        updateCount();
        hideNotice();
        var created = data && data.message;
        if (created && typeof created === 'object') {
          state.messages.push(normalizeMessages([created])[0]);
          state.messages = state.messages.filter(function (item) { return item && item.body.trim() !== ''; });
          render();
        } else {
          return load();
        }
      })
      .catch(function (error) {
        /* The rejected text is never echoed back into the DOM. */
        el.composerInput.value = '';
        updateCount();
        if (isBlocked(error)) setNotice(BLOCKED, 'warn', false);
        else setNotice(UNAVAILABLE, 'warn', true);
      })
      .then(function () {
        state.sending = false;
        if (el.sendBtn) el.sendBtn.disabled = state.unavailable;
        if (el.composerInput && !state.unavailable) el.composerInput.focus();
      });
  }

  function poll() {
    if (document.visibilityState !== 'visible' || state.loading || state.sending || state.unavailable) return;
    var id = threadId();
    if (!id) return;
    api('/parent-chat/thread/' + encodeURIComponent(id))
      .then(function (data) {
        var incoming = normalizeMessages(data);
        var thread = normalizeThread(data);
        if (thread) state.thread.unreadCount = thread.unreadCount;
        if (!sameMessages(incoming, state.messages)) {
          state.messages = incoming;
          render();
        } else {
          renderBadge();
        }
        if (state.thread && state.thread.unreadCount > 0) markRead();
      })
      .catch(function () { /* background refresh is best effort */ });
  }

  function demoLogin() {
    window.location.assign(LOGIN_PAGE + '&next=' +
      encodeURIComponent(window.location.pathname + window.location.search));
  }

  function bindProfile() {
    if (!el.profileBtn || !el.profilePanel) return;
    el.profileBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = el.profilePanel.hidden;
      el.profilePanel.hidden = !open;
      el.profileBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if (!el.profilePanel.hidden && !el.profilePanel.contains(event.target) && event.target !== el.profileBtn) {
        el.profilePanel.hidden = true;
        el.profileBtn.setAttribute('aria-expanded', 'false');
      }
    });
    if (el.logoutBtn) el.logoutBtn.addEventListener('click', logout);
  }

  function bind() {
    if (el.composer) el.composer.addEventListener('submit', send);
    if (el.retryBtn) el.retryBtn.addEventListener('click', function () { hideNotice(); load(); });
    if (el.demoLogin) el.demoLogin.addEventListener('click', demoLogin);
    bindProfile();
    if (el.composerInput) {
      el.composerInput.addEventListener('input', updateCount);
      el.composerInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        if (el.composer && el.composer.requestSubmit) el.composer.requestSubmit();
        else if (el.composer) el.composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }
    if (typeof window.setInterval === 'function') window.setInterval(poll, POLL_MS);
  }

  /* -------------------------------------------------- in-app class reminders */
  var REMINDER_POLL_MS = 60000;

  function safeJoinUrl(value) {
    if (!value) return null;
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.origin !== window.location.origin ||
          parsed.pathname.indexOf('/classroom/') !== 0) return null;
      return parsed.href;
    } catch (error) { return null; }
  }

  function renderReminders(data) {
    if (!el.classReminder) return;
    var list = data && Array.isArray(data.reminders) ? data.reminders : [];
    var next = list.find(function (item) { return item && item.joinUrl && safeJoinUrl(item.joinUrl); });
    if (!next) {
      el.classReminder.hidden = true;
      if (el.classReminderLink) el.classReminderLink.removeAttribute('href');
      return;
    }
    if (el.classReminderTag) {
      el.classReminderTag.textContent = next.phase === 'starting'
        ? 'Class starting now'
        : next.phase === 'open' ? 'Classroom is open' : 'Class starting soon';
    }
    if (el.classReminderText) {
      el.classReminderText.textContent = next.message +
        (next.localStart ? ' Starts: ' + next.localStart + '.' : '');
    }
    if (el.classReminderLink) {
      el.classReminderLink.href = safeJoinUrl(next.joinUrl);
      el.classReminderLink.hidden = false;
    }
    el.classReminder.hidden = false;
  }

  function loadReminders() {
    var token = readToken();
    if (!token || !el.classReminder) return Promise.resolve(null);
    return rawRequest('/parent/reminders', { method: 'GET' }, token)
      .then(renderReminders)
      .catch(function () { el.classReminder.hidden = true; });
  }

  function init() {
    cacheDom();
    if (!el.messageList) return;
    updateCount();
    renderBadge();
    bind();
    load();
    loadReminders();
    window.setInterval(loadReminders, REMINDER_POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadReminders();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
