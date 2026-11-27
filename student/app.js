/* ==========================================================================
   MATHIFY — student desk
   No dependencies. State via ?state=soon|live|empty|loading
   ========================================================================== */
(function () {
  'use strict';

  var STATES = ['soon', 'live', 'ended', 'empty', 'loading'];
  var params = new URLSearchParams(window.location.search);
  var requested = params.get('state');
  var state = STATES.indexOf(requested) !== -1 ? requested : 'soon';

  var countdownEl = document.getElementById('countdown');
  var pendingCount = document.querySelector('.block-head .count');
  var timer = null;

  /* ---------- state ---------- */
  function applyState(next) {
    state = next;
    document.body.dataset.state = state;

    document.querySelectorAll('.only-soon').forEach(function (el) {
      el.hidden = state !== 'soon';
    });
    document.querySelectorAll('.only-live').forEach(function (el) {
      el.hidden = state !== 'live';
    });
    document.querySelectorAll('.only-ended').forEach(function (el) {
      el.hidden = state !== 'ended';
    });
    document.querySelectorAll('.only-empty').forEach(function (el) {
      el.hidden = state !== 'empty';
    });

    if (pendingCount) pendingCount.textContent = state === 'empty' ? '00' : '03';
  }

  function startCountdown() {
    if (timer) window.clearInterval(timer);
    if (state !== 'soon') return;

    var end = Date.now() + 42 * 60 * 1000;

    function tick() {
      var ms = Math.max(0, end - Date.now());
      var mins = Math.floor(ms / 60000);
      var secs = Math.floor((ms % 60000) / 1000);

      if (countdownEl) {
        countdownEl.textContent =
          String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }

      if (ms === 0) {
        window.clearInterval(timer);
        applyState('live');
      }
    }

    tick();
    timer = window.setInterval(tick, 1000);
  }

  /* ---------- batch switcher ---------- */
  var batchBtn = document.getElementById('batchBtn');
  var batchMenu = document.getElementById('batchMenu');
  var batchLabelEl = document.getElementById('batchLabel');

  function closeBatch() {
    if (!batchMenu || !batchBtn) return;
    batchMenu.hidden = true;
    batchBtn.setAttribute('aria-expanded', 'false');
  }

  if (batchBtn && batchMenu) {
    batchBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = batchMenu.hidden;
      batchMenu.hidden = !open;
      batchBtn.setAttribute('aria-expanded', String(open));
    });

    batchMenu.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (!option) return;

      batchMenu.querySelectorAll('[role="option"]').forEach(function (el) {
        el.setAttribute('aria-selected', String(el === option));
      });
      batchLabelEl.textContent = option.dataset.value;
      closeBatch();
      batchBtn.focus();
    });

    document.addEventListener('click', function (event) {
      if (!batchMenu.hidden && !event.target.closest('.batch-wrap')) closeBatch();
    });
  }

  /* ---------- rail nav + mobile tabs ---------- */
  function activate(group, target) {
    group.forEach(function (el) {
      el.classList.toggle('active', el === target);
      if (el === target) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      activate(navLinks, link);
    });
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activate(tabs, tab);
      var target = document.getElementById(tab.dataset.tabTarget);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* placeholder links should never jump the page */
  document.querySelectorAll('a[href="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
    });
  });

  /* show the right shortcut hint per platform */
  var kbd = document.querySelector('.search kbd');
  if (kbd) {
    var isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    kbd.textContent = isMac ? '⌘K' : 'Ctrl K';
  }

  /* ---------- tutor panel ---------- */
  var fab = document.getElementById('aiFab');
  var panel = document.getElementById('aiPanel');
  var closeBtn = document.getElementById('aiClose');
  var input = document.getElementById('aiInput');
  var form = document.getElementById('aiForm');
  var body = document.getElementById('aiBody');

  function openPanel() {
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Close Study Buddy');
    refreshQuota();
    window.setTimeout(function () {
      if (input) input.focus();
    }, 30);
  }

  function closePanel() {
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open Study Buddy');
  }

  function togglePanel() {
    if (!panel) return;
    if (panel.hidden) openPanel();
    else closePanel();
  }

  if (fab) fab.addEventListener('click', togglePanel);
  if (closeBtn) closeBtn.addEventListener('click', function () {
    closePanel();
    fab.focus();
  });

  document.querySelectorAll('[data-open-ai]').forEach(function (btn) {
    btn.addEventListener('click', openPanel);
  });

  /* ---------- study buddy conversation (Cloudflare-backed) ---------- */
  var imageInput = document.getElementById('aiImage');
  var attachRow = document.getElementById('aiAttachRow');
  var attachName = document.getElementById('aiAttachName');
  var attachClear = document.getElementById('aiAttachClear');
  var pendingImage = null;
  var quotaNode = document.getElementById('aiQuota');
  var remainingImages = null;
  var MAX_IMAGE_BYTES = 1024 * 1024;
  var ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  function showQuota(quota) {
    if (!quotaNode || !quota || typeof quota.remaining !== 'number') return;
    remainingImages = quota.remaining;
    quotaNode.hidden = false;
    quotaNode.textContent = quota.remaining === 0
      ? 'Photo questions finished for today. Text questions are still unlimited - come back tomorrow!'
      : quota.remaining + ' of ' + quota.limit + ' photo questions left today - text questions are unlimited.';
  }

  function refreshQuota() {
    var api = window.mathifyStudentApi;
    if (!api || typeof api.getStudyBuddyQuota !== 'function') return;
    api.getStudyBuddyQuota().then(showQuota).catch(function () {});
  }

  function addMessage(text, who) {
    if (!body) return null;
    var p = document.createElement('p');
    p.className = 'msg ' + who;
    p.textContent = text;
    body.appendChild(p);
    body.scrollTop = body.scrollHeight;
    return p;
  }

  function setPendingImage(value) {
    pendingImage = value || null;
    if (attachRow) attachRow.hidden = !pendingImage;
    if (attachName) attachName.textContent = pendingImage ? pendingImage.name : '';
  }

  function askBuddy(text, image) {
    var api = window.mathifyStudentApi;
    if (!api || typeof api.askStudyBuddy !== 'function') {
      return Promise.resolve({
        reply: 'Study Buddy is unavailable right now. Please retry in a moment.',
        source: 'offline'
      });
    }
    return api.askStudyBuddy(text, image);
  }

  if (imageInput) {
    imageInput.addEventListener('change', function () {
      var file = imageInput.files && imageInput.files[0];
      imageInput.value = '';
      if (!file) return;
      if (remainingImages === 0) {
        addMessage("That's 10 photo questions for today. Come back tomorrow - you can still ask me anything in text!", 'bot');
        return;
      }
      if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
        addMessage('I can read PNG, JPG, WEBP or GIF photos 📎', 'bot');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        addMessage('That photo is a bit large. Try one under 1 MB 🙂', 'bot');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        setPendingImage({ data: String(reader.result), mime: file.type, name: file.name });
        addMessage('Photo attached — ask me what to try first!', 'bot');
      };
      reader.onerror = function () {
        addMessage('I could not read that photo. Please try again.', 'bot');
      };
      reader.readAsDataURL(file);
    });
  }

  if (attachClear) {
    attachClear.addEventListener('click', function () {
      setPendingImage(null);
      if (imageInput) imageInput.value = '';
    });
  }

  if (form && input) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text && !pendingImage) return;

      addMessage(text || 'Take a look at this 👀', 'me');
      input.value = '';
      var image = pendingImage;
      setPendingImage(null);
      var pending = addMessage('Thinking…', 'bot');

      askBuddy(text, image).then(function (data) {
        if (!pending) return;
        pending.textContent = (data && data.reply) || 'No reply was returned. Please retry.';
        if (data && data.source && data.source !== 'ai') pending.dataset.source = data.source;
        if (data && data.quota) showQuota(data.quota);
      }).catch(function (error) {
        if (!pending) return;
        var code = error && (error.code || (error.data && error.data.error));
        if (code === 'IMAGE_QUOTA_EXCEEDED' || (error && error.status === 400)) {
          pending.textContent = (error && error.message) ||
            "That's 10 photo questions for today. Come back tomorrow!";
          pending.dataset.source = 'quota';
          if (code === 'IMAGE_QUOTA_EXCEEDED') remainingImages = 0;
          return;
        }
        pending.textContent = 'Study Buddy could not be reached. Please retry in a moment.';
        pending.dataset.source = 'offline';
      });
    });
  }

  document.querySelectorAll('.ai-chips button').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (!input || !form) return;
      input.value = chip.textContent.trim();
      form.requestSubmit();
    });
  });

  /* ---------- app strip ---------- */
  var strip = document.getElementById('appStrip');
  var stripClose = document.getElementById('stripClose');
  var STRIP_KEY = 'mathify.appStrip';

  try {
    if (strip && window.localStorage.getItem(STRIP_KEY) === 'hidden') strip.remove();
  } catch (error) {
    /* storage blocked — keep the strip */
  }

  if (strip && stripClose) {
    stripClose.addEventListener('click', function () {
      try {
        window.localStorage.setItem(STRIP_KEY, 'hidden');
      } catch (error) {
        /* ignore */
      }
      strip.style.transition = 'opacity .18s ease';
      strip.style.opacity = '0';
      window.setTimeout(function () {
        strip.remove();
      }, 180);
    });
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (event) {
    var search = document.getElementById('searchInput');

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (search) search.focus();
      return;
    }

    if (event.key === 'Escape') {
      closeBatch();
      if (panel && !panel.hidden) {
        closePanel();
        if (fab) fab.focus();
      }
      if (search && document.activeElement === search) search.blur();
    }
  });

  /* ---------- leave calendar ---------- */
  var api = window.mathifyStudentApi;
  if (api && window.mathifyLeaveCalendar) {
    window.mathifyLeaveCalendar.mount({
      mount: '#leaveCalendar',
      role: 'student',
      request: api.request
    });
  }

  /* ---------- actionable controls ---------- */
  var noticeEl = document.createElement('div');
  noticeEl.className = 'study-notice';
  noticeEl.setAttribute('role', 'status');
  noticeEl.hidden = true;
  document.body.appendChild(noticeEl);

  function showNotice(text, persistent) {
    noticeEl.textContent = text;
    noticeEl.hidden = false;
    if (!persistent) window.setTimeout(function () { noticeEl.hidden = true; }, 4200);
  }

  function activeSessionId() {
    return window.MATHIFY_SESSION_ID || params.get('sessionId') || 'ses_math_001';
  }

  function openClassroom() {
    /* The role and view are explicit: a copied student link must never open a
       trainer-shaped room when the same browser also holds a trainer token. */
    window.location.href = '../classroom/connect.html?sessionId=' +
      encodeURIComponent(activeSessionId()) + '&role=student&view=student&state=' +
      encodeURIComponent(state === 'ended' ? 'ended' : 'live');
  }

  function watchRecording() {
    if (!api || typeof api.request !== 'function') return;
    api.request('/recordings/' + encodeURIComponent(activeSessionId()) + '/url')
      .then(function (data) {
        if (data && data.url) window.location.href = data.url;
        else showNotice('That recording is not ready yet.');
      })
      .catch(function () { showNotice('A private link could not be created. Please retry.'); });
  }

  function checkDevices() {
    var devices = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!devices) {
      showNotice('Device check is unavailable in this browser. The classroom will request camera and mic access when you join.');
      return;
    }
    devices({ video: true, audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      showNotice('Camera and microphone are ready.');
    }).catch(function () {
      showNotice('Camera or microphone access was blocked. Allow access in your browser before joining.');
    });
  }

  var sessionActions = {
    join: openClassroom,
    device: checkDevices,
    recording: watchRecording,
    practice: function () {
      openPractice();
    },
    schedule: function () {
      var target = document.getElementById('schedule');
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  document.querySelectorAll('[data-session-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      var action = sessionActions[button.dataset.sessionAction];
      if (action) action();
    });
  });

  /* ---------- mastery self-practice · 10 per batch, 80 per topic ----------
     Each round is +15% harder than the last. The server supplies the exact
     difficultyPercent and topic counters; we only render and honour them. */
  var practiceSlot = document.getElementById('practiceSlot');
  var practiceList = document.getElementById('practiceList');
  var practiceCounter = document.getElementById('practiceCounter');
  var practiceStatus = document.getElementById('practiceStatus');
  var practiceMore = document.getElementById('practiceMore');
  var practiceRest = document.getElementById('practiceRest');
  var practiceState = {
    batch: null,
    batchNumber: 0,
    answered: 0,
    topic: null,
    topicComplete: false
  };
  var PRACTICE_TOPIC_LIMIT = 80;

  function batchLabel(number) {
    return ('0' + number).slice(-2);
  }

  function setPracticeStatus(text) {
    if (practiceStatus) practiceStatus.textContent = text;
  }

  function difficultyText(batch) {
    var percent = batch ? Number(batch.difficultyPercent) : 0;
    return Number.isFinite(percent) && percent > 0 ? '+' + percent + '% harder' : 'Baseline';
  }

  function topicProgressText(batch) {
    if (!batch) return '';
    var total = Number(batch.topicTotal);
    var limit = Number(batch.topicLimit);
    if (!Number.isFinite(limit) || limit <= 0) limit = PRACTICE_TOPIC_LIMIT;
    if (!Number.isFinite(total) || total < 0) return '';
    return total + ' / ' + limit + ' topic questions';
  }

  function statusText(action, batch) {
    var parts = [action];
    if (batch) {
      parts.push(difficultyText(batch));
      var progress = topicProgressText(batch);
      if (progress) parts.push(progress);
    }
    return parts.filter(Boolean).join(' · ');
  }

  function mergePracticeTopic(source) {
    if (!practiceState.batch || !source) return;
    ['topicTotal', 'topicLimit', 'topicRemaining'].forEach(function (key) {
      if (source[key] !== undefined && source[key] !== null) practiceState.batch[key] = source[key];
    });
    if (source.topicComplete !== undefined) practiceState.batch.topicComplete = source.topicComplete;
  }

  function isTopicCompleteError(error) {
    if (!error) return false;
    var code = error.code || (error.data && error.data.error);
    return code === 'TOPIC_PRACTICE_COMPLETE';
  }

  function fallbackRestMessage() {
    var topic = practiceState.topic;
    return 'Beautifully done! You have practised ' + PRACTICE_TOPIC_LIMIT +
      ' questions' + (topic ? ' in ' + topic : '') + '. Take a rest — you have earned it 🌟';
  }

  function showPracticeRest(message) {
    practiceState.topicComplete = true;
    var text = message && String(message).trim() ? String(message).trim() : fallbackRestMessage();
    if (practiceRest) {
      practiceRest.textContent = text;
      practiceRest.hidden = false;
    }
    if (practiceMore) practiceMore.hidden = true;
    if (practiceList) {
      practiceList.querySelectorAll('.practice-options button').forEach(function (item) {
        item.disabled = true;
      });
    }
    setPracticeStatus('Topic complete · time to rest');
  }

  function updatePracticeCounter() {
    if (!practiceCounter) return;
    var size = practiceState.batch ? practiceState.batch.questions.length : 10;
    practiceCounter.textContent = 'Batch ' + batchLabel(practiceState.batchNumber) +
      ' · ' + practiceState.answered + ' / ' + size + ' answered · ' + difficultyText(practiceState.batch);
  }

  function renderPracticeBatch(batch) {
    if (!practiceList) return;
    practiceList.innerHTML = '';
    batch.questions.forEach(function (question) {
      var card = document.createElement('div');
      card.className = 'practice-q';

      var top = document.createElement('div');
      top.className = 'q-top';
      var label = document.createElement('span');
      label.className = 'mono';
      label.textContent = 'Q ' + batchLabel(question.position) + ' · ' + (question.difficulty || 'Practice');
      var tag = document.createElement('span');
      tag.className = 'mono';
      tag.textContent = 'Self practice';
      top.appendChild(label);
      top.appendChild(tag);

      var prompt = document.createElement('p');
      prompt.textContent = question.prompt;

      var options = document.createElement('div');
      options.className = 'practice-options';
      question.options.forEach(function (option, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option;
        button.addEventListener('click', function () {
          answerPracticeQuestion(question.id, index, button, card);
        });
        options.appendChild(button);
      });

      var feedback = document.createElement('span');
      feedback.className = 'practice-feedback';
      feedback.hidden = true;

      card.appendChild(top);
      card.appendChild(prompt);
      card.appendChild(options);
      card.appendChild(feedback);
      practiceList.appendChild(card);
    });
    if (practiceRest) practiceRest.hidden = true;
    practiceState.topicComplete = false;
    if (practiceMore) {
      practiceMore.hidden = true;
      practiceMore.textContent = 'Fetch another 10 · 15% harder ↓';
    }
    setPracticeStatus(statusText('Ready', batch));
  }

  function answerPracticeQuestion(questionId, optionIndex, button, card) {
    var api = window.mathifyStudentApi;
    if (!practiceState.batch || !api || typeof api.answerPractice !== 'function' || practiceState.topicComplete) {
      setPracticeStatus('Practice is offline');
      return;
    }
    var buttons = card.querySelectorAll('.practice-options button');
    buttons.forEach(function (item) { item.disabled = true; });
    setPracticeStatus('Checking…');

    api.answerPractice(practiceState.batch.id, questionId, optionIndex).then(function (data) {
      var result = (data && data.result) || {};
      var feedback = card.querySelector('.practice-feedback');
      button.dataset.result = result.correct === true ? 'correct' : 'wrong';
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = result.correct === true
          ? 'Correct — nice thinking ✓'
          : 'Not quite — try the next one';
      }
      practiceState.answered = Math.max(
        practiceState.answered,
        Number(result.answeredCount) || practiceState.answered + 1
      );
      mergePracticeTopic(result);
      updatePracticeCounter();

      /* The server gates completion on all ten answers being saved, not just
         on the offered count. Trust that flag so the final batch stays usable. */
      if (result.topicComplete === true) {
        showPracticeRest(result.restMessage);
        return;
      }
      setPracticeStatus(statusText(result.complete ? 'Batch complete' : 'Answered', practiceState.batch));
      if (result.complete && practiceMore) practiceMore.hidden = false;
    }).catch(function (error) {
      buttons.forEach(function (item) { item.disabled = false; });
      if (isTopicCompleteError(error)) {
        showPracticeRest(error && error.message);
        return;
      }
      setPracticeStatus('Could not save that answer');
    });
  }

  function loadPracticeBatch() {
    if (practiceState.topicComplete) return;
    var api = window.mathifyStudentApi;
    if (!api || typeof api.fetchPracticeBatch !== 'function') {
      setPracticeStatus('Practice is offline');
      return;
    }
    setPracticeStatus('Fetching 10…');
    api.fetchPracticeBatch(null, practiceState.batch ? practiceState.batch.id : null).then(function (data) {
      var batch = data && data.batch;
      if (!batch || !Array.isArray(batch.questions) || batch.questions.length !== 10) {
        setPracticeStatus('Questions are unavailable');
        return;
      }
      practiceState.batch = batch;
      practiceState.batchNumber += 1;
      practiceState.answered = 0;
      practiceState.topic = batch.topic || batch.topicName || practiceState.topic;
      renderPracticeBatch(batch);
      updatePracticeCounter();
      if (practiceSlot) practiceSlot.hidden = false;
      if (batch.topicComplete === true) {
        showPracticeRest(batch.restMessage);
      }
    }).catch(function (error) {
      if (isTopicCompleteError(error)) {
        showPracticeRest(error && error.message);
        return;
      }
      setPracticeStatus('Could not fetch questions — retry');
    });
  }

  function openPractice() {
    if (!practiceSlot || !practiceList) return;
    practiceSlot.hidden = false;
    if (practiceSlot.scrollIntoView) {
      practiceSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (practiceState.topicComplete) return;
    if (!practiceState.batch || practiceState.answered >= practiceState.batch.questions.length) {
      loadPracticeBatch();
    }
  }

  if (practiceMore) {
    practiceMore.addEventListener('click', function () {
      loadPracticeBatch();
    });
  }

  /* Recording chapters jump straight to a timestamp. Recordings are private:
     the browser asks for a short-lived signed link through the API instead of
     storing a permanent public URL. */
  var recordingSessionId = null;
  var chapterHost = document.getElementById('recChapters');
  function openChapter(seconds) {
    if (!recordingSessionId || !api || typeof api.request !== 'function') return;
    api.request('/recordings/' + encodeURIComponent(recordingSessionId) + '/url')
      .then(function (data) {
        var url = data && data.url;
        if (!url) return;
        window.location.href = url + (url.indexOf('?') === -1 ? '?' : '&') +
          't=' + Math.max(0, Number(seconds) || 0);
      })
      .catch(function () { /* access is refused without session membership */ });
  }
  document.querySelectorAll('[data-chapter-seconds]').forEach(function (button) {
    button.addEventListener('click', function () {
      openChapter(button.getAttribute('data-chapter-seconds'));
    });
  });
  var trophyList = document.getElementById('trophyList');
  var trophyPoints = document.getElementById('trophyPoints');
  var walletSessions = document.getElementById('walletSessions');

  function renderWallet(dashboard) {
    if (!walletSessions) return;
    var remaining = dashboard && dashboard.student && dashboard.student.sessionsRemaining;
    walletSessions.textContent = (remaining === null || remaining === undefined)
      ? 'Pack not loaded'
      : remaining + ' sessions left';
  }

  function renderTrophies(dashboard) {
    if (!trophyList) return;
    var badges = (dashboard && dashboard.badges) || [];
    var points = dashboard && dashboard.trophyPoints !== undefined
      ? dashboard.trophyPoints
      : badges.reduce(function (total, item) { return total + (Number(item.points) || 0); }, 0);
    if (trophyPoints) trophyPoints.textContent = points + ' pts';
    trophyList.innerHTML = '';
    if (!badges.length) {
      var empty = document.createElement('p');
      empty.className = 'trophy-empty';
      empty.textContent = 'Your trainer’s badges will appear here as trophies.';
      trophyList.appendChild(empty);
      return;
    }
    badges.slice(-12).forEach(function (badge) {
      var item = document.createElement('div');
      item.className = 'trophy';
      item.setAttribute('data-badge-id', String(badge.badgeId || badge.id || ''));
      var glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-trophy"/></svg>';
      var copy = document.createElement('span');
      var title = document.createElement('b');
      title.textContent = String(badge.label || 'Badge');
      var meta = document.createElement('span');
      meta.textContent = (Number(badge.points) || 0) + ' reward pts';
      copy.appendChild(title);
      copy.appendChild(meta);
      item.appendChild(glyph);
      item.appendChild(copy);
      trophyList.appendChild(item);
    });
  }

  /* Attendance comes from the same reconnect-safe presence clock as the
     trainer's teaching timer. The child sees only their own status and minutes. */
  function applyLiveAttendance(value) {
    var node = document.getElementById('liveAttendance');
    if (!node || !value) return;
    if (!value.activeMinutes && !value.present) return;
    node.hidden = false;
    node.textContent = value.present
      ? 'Attendance marked · ' + value.activeMinutes + ' min in class'
      : 'In class · ' + value.activeMinutes + '/' + value.requiredMinutes + ' min counted';
  }

  /* Subject is server-owned. An optional session-state call only enriches the
     panel; its failure must never block the desk or claim a linked class. */
  function hydrateSubject(dashboard) {
    if (!window.MathifySubjects || typeof window.MathifySubjects.mountStudent !== 'function') return;
    window.MathifySubjects.mountStudent(dashboard);
    var next = dashboard && dashboard.nextSession;
    var sessionId = next && (next.id || next.sessionId);
    if (!sessionId || !api || typeof api.getSessionState !== 'function') return;
    try {
      api.getSessionState(sessionId).then(function (state) {
        window.MathifySubjects.mountStudent(dashboard, state);
        applyLiveAttendance(state && state.studentAttendance);
      }).catch(function () { /* optional state is not linked yet */ });
    } catch (error) { /* keep the server-owned dashboard fallback */ }
  }

  if (api && typeof api.request === 'function') {
    api.request('/student/dashboard').then(function (data) {
      renderWallet(data && data.dashboard);
      renderTrophies(data && data.dashboard);
      hydrateSubject(data && data.dashboard);
      var profileName = document.getElementById('profileName');
      var student = data && data.dashboard && data.dashboard.student;
      if (profileName && student && student.name) profileName.textContent = student.name;
      var recordings = data && data.dashboard && data.dashboard.recordings;
      if (!Array.isArray(recordings) || !recordings.length) return;
      var recording = recordings[0];
      recordingSessionId = recording.available && recording.id ? recording.id : null;
      if (!recordingSessionId || !Array.isArray(recording.chapters) || !recording.chapters.length) return;
      chapterHost.innerHTML = '';
      recording.chapters.forEach(function (chapter) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'rec-link';
        button.setAttribute('data-chapter-seconds', String(chapter.seconds || 0));
        var minutes = Math.floor((chapter.seconds || 0) / 60);
        var remainder = String((chapter.seconds || 0) % 60).padStart(2, '0');
        button.textContent = chapter.label + ' · ' + minutes + ':' + remainder;
        button.addEventListener('click', function () { openChapter(chapter.seconds); });
        chapterHost.appendChild(button);
      });
    }).catch(function () { /* offline preview keeps the static chapters */ });
  }

  /* ---------- search, notifications, profile ---------- */
  var searchInput = document.getElementById('searchInput');
  var searchHits = [];
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchHits.forEach(function (node) { node.classList.remove('study-search-hit'); });
      searchHits = [];
      var term = searchInput.value.trim().toLowerCase();
      if (term.length < 2) return;
      var walker = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.textContent.toLowerCase().indexOf(term) === -1) continue;
        var element = node.parentElement;
        if (!element || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
        element.classList.add('study-search-hit');
        searchHits.push(element);
      }
      if (searchHits.length && searchHits[0].scrollIntoView) {
        searchHits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  var mobileSearchBtn = document.getElementById('mobileSearchBtn');
  if (mobileSearchBtn && searchInput) {
    mobileSearchBtn.addEventListener('click', function () { searchInput.focus(); });
  }

  function bindPopover(buttonId, panelId) {
    var button = document.getElementById(buttonId);
    var panel = document.getElementById(panelId);
    if (!button || !panel) return;
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = panel.hidden;
      ['notificationsPanel', 'profilePanel'].forEach(function (id) {
        var other = document.getElementById(id);
        if (other && other !== panel) other.hidden = true;
      });
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
  bindPopover('notificationsBtn', 'notificationsPanel');
  bindPopover('profileBtn', 'profilePanel');
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn && window.mathifyStudentApi && typeof window.mathifyStudentApi.logout === 'function') {
    logoutBtn.addEventListener('click', window.mathifyStudentApi.logout);
  }

  if (api) {
    api.ensureAuth().catch(function () {
      showNotice('Offline preview · live student data is unavailable. Retry when the API is reachable.', true);
    });
  }

  /* ---------- boot ---------- */
  applyState(state);
  startCountdown();
})();
