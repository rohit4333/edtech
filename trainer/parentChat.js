/* ==========================================================================
   MATHIFY — trainer console · parent messages (private 1-on-1)
   Vanilla JS, namespaced. Uses the existing trainer token when available.

   API (BASE = window.MATHIFY_API_BASE || '/api', Bearer trainer token):
     GET  /parent-chat/unread                  -> roster thread summary
     GET  /parent-chat/thread/:studentId       -> thread + messages + unread
     POST /parent-chat/thread/:studentId/messages  { body: string }
     POST /parent-chat/thread/:studentId/read      {}
   ========================================================================== */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.trainer.token';
  var LOGIN_PAGE = 'login.html?role=trainer';
  var POLL_MS = 30000;
  var UNAVAILABLE = 'Messages are unavailable right now';
  var BLOCKED = 'That message could not be sent. Please keep chat on Mathify and leave out phone numbers, social handles, links and personal contact details.';

  var IDS = [
    'pcUnreadBadge', 'pcStudentName', 'pcMeta', 'pcStatus', 'pcMessageList',
    'pcEmpty', 'pcComposer', 'pcInput', 'pcSend', 'pcNoticeRow', 'pcNotice', 'pcRetry'
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

  function requireLogin() {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
    memoryToken = null;
    var next = window.location.pathname + window.location.search;
    var target = LOGIN_PAGE + '&next=' + encodeURIComponent(next);
    if (window.location.replace) window.location.replace(target);
    else window.location.href = target;
    return new Error('SIGN_IN_REQUIRED');
  }

  /* Prefer the console's own auth client. Its fallback is credential sign-in,
     never a local demo login. */
  function ensureAuth() {
    if (window.mathifyTrainerApi && typeof window.mathifyTrainerApi.ensureAuth === 'function') {
      return Promise.resolve(window.mathifyTrainerApi.ensureAuth());
    }
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    return Promise.reject(requireLogin());
  }

  function api(path, options) {
    return ensureAuth().then(function (token) { return rawRequest(path, options, token); });
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

  function normalizeThread(data, fallbackId) {
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
    var id = candidate.threadId || candidate.studentId || candidate.id || candidate.thread_id || fallbackId || null;
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
        mine: explicitMine === null ? role === 'trainer' : explicitMine,
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
    if (!el.pcNotice || !el.pcNoticeRow) return;
    el.pcNotice.textContent = message;
    el.pcNotice.className = 'pc-notice' + (kind === 'warn' ? ' warn' : '');
    el.pcNoticeRow.hidden = false;
    if (el.pcRetry) el.pcRetry.hidden = retry !== true;
  }

  function hideNotice() {
    if (el.pcNoticeRow) el.pcNoticeRow.hidden = true;
    if (el.pcNotice) { el.pcNotice.textContent = ''; el.pcNotice.className = 'pc-notice'; }
    if (el.pcRetry) el.pcRetry.hidden = true;
  }

  function setStatus(text) {
    if (el.pcStatus) el.pcStatus.textContent = text;
  }

  function setComposerDisabled(disabled) {
    if (el.pcInput) el.pcInput.disabled = disabled;
    if (el.pcSend) el.pcSend.disabled = disabled || state.sending;
  }

  function renderHeader() {
    var thread = state.thread;
    if (!thread) return;
    if (el.pcStudentName) el.pcStudentName.textContent = thread.studentName;
    if (el.pcMeta) el.pcMeta.textContent = 'Private thread with ' + thread.parentName + ' · 1-on-1';
  }

  function renderBadge() {
    if (!el.pcUnreadBadge) return;
    var count = state.thread ? Math.max(0, Number(state.thread.unreadCount) || 0) : 0;
    el.pcUnreadBadge.textContent = String(count);
    el.pcUnreadBadge.setAttribute('aria-label', count + (count === 1 ? ' unread parent message' : ' unread parent messages'));
    el.pcUnreadBadge.hidden = count === 0;
  }

  function clearList() {
    if (!el.pcMessageList) return;
    while (el.pcMessageList.firstChild) el.pcMessageList.removeChild(el.pcMessageList.firstChild);
  }

  function appendUnavailable() {
    if (!el.pcMessageList) return;
    var item = document.createElement('li');
    item.className = 'pc-unavailable';
    item.textContent = UNAVAILABLE;
    el.pcMessageList.appendChild(item);
  }

  function appendMessage(message) {
    if (!el.pcMessageList) return;
    var item = document.createElement('li');
    item.className = 'pc-msg ' + (message.mine ? 'mine' : 'theirs');

    var meta = document.createElement('span');
    meta.className = 'pc-meta';

    var label = document.createElement('span');
    label.className = 'pc-label';
    label.textContent = message.label || (message.mine ? 'You · trainer' : (state.thread ? state.thread.parentName : 'Parent'));

    var time = document.createElement('time');
    time.className = 'pc-time';
    time.textContent = formatTime(message.createdAt);
    if (message.createdAt && !isNaN(new Date(message.createdAt).getTime())) {
      time.setAttribute('datetime', String(message.createdAt));
    }

    meta.appendChild(label);
    meta.appendChild(time);

    var text = document.createElement('p');
    text.className = 'pc-text';
    text.textContent = message.body;

    item.appendChild(meta);
    item.appendChild(text);
    el.pcMessageList.appendChild(item);
  }

  function render() {
    clearList();
    if (el.pcEmpty) el.pcEmpty.hidden = true;

    if (state.unavailable) {
      appendUnavailable();
      setComposerDisabled(true);
      return;
    }

    setComposerDisabled(false);
    if (!state.messages.length) {
      if (el.pcEmpty) el.pcEmpty.hidden = false;
      return;
    }
    state.messages.forEach(appendMessage);
    if (el.pcMessageList) el.pcMessageList.scrollTop = el.pcMessageList.scrollHeight;
  }

  function renderUnavailable() {
    state.unavailable = true;
    state.messages = [];
    setNotice(UNAVAILABLE, 'warn', true);
    setStatus('Unavailable');
    render();
  }

  function applyThread(data, fallbackId) {
    var thread = normalizeThread(data, fallbackId);
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
    if (state.loading || !el.pcMessageList) return Promise.resolve();
    state.loading = true;
    setStatus('Loading…');

    return api('/parent-chat/unread')
      .then(function (summary) {
        var threads = asArray(summary.threads || (summary.data && summary.data.threads));
        if (!threads.length) throw noThread();
        var chosen = threads.slice().sort(function (a, b) {
          return (Number(b.unreadCount) || 0) - (Number(a.unreadCount) || 0);
        })[0];
        var studentId = chosen.studentId || chosen.threadId || chosen.id;
        if (!studentId) throw noThread();
        return api('/parent-chat/thread/' + encodeURIComponent(studentId))
          .then(function (data) { applyThread(data, String(studentId)); });
      })
      .catch(function (error) {
        if (error && error.noThread) {
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
    if (state.sending || state.unavailable || !el.pcInput) return;
    var text = (el.pcInput.value || '').trim();
    if (!text) return;

    var id = threadId();
    if (!id) {
      setNotice(UNAVAILABLE, 'warn', true);
      return;
    }

    state.sending = true;
    el.pcSend.disabled = true;

    api('/parent-chat/thread/' + encodeURIComponent(id) + '/messages', { method: 'POST', body: { body: text } })
      .then(function (data) {
        el.pcInput.value = '';
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
        el.pcInput.value = '';
        if (isBlocked(error)) setNotice(BLOCKED, 'warn', false);
        else setNotice(UNAVAILABLE, 'warn', true);
      })
      .then(function () {
        state.sending = false;
        if (el.pcSend) el.pcSend.disabled = state.unavailable;
        if (el.pcInput && !state.unavailable) el.pcInput.focus();
      });
  }

  function poll() {
    if (document.visibilityState !== 'visible' || state.loading || state.sending || state.unavailable) return;
    var id = threadId();
    if (!id) return;
    api('/parent-chat/thread/' + encodeURIComponent(id))
      .then(function (data) {
        var incoming = normalizeMessages(data);
        var thread = normalizeThread(data, id);
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

  function bind() {
    if (el.pcComposer) el.pcComposer.addEventListener('submit', send);
    if (el.pcRetry) el.pcRetry.addEventListener('click', function () { hideNotice(); load(); });
    if (el.pcInput) {
      el.pcInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        if (el.pcComposer && el.pcComposer.requestSubmit) el.pcComposer.requestSubmit();
        else if (el.pcComposer) el.pcComposer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }
    if (typeof window.setInterval === 'function') window.setInterval(poll, POLL_MS);
  }

  function init() {
    cacheDom();
    if (!el.pcMessageList) return;
    renderBadge();
    bind();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
