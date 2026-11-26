/* ==========================================================================
   MATHIFY — classroom
   Vanilla JS. Whiteboard ink, session timer, panels, chat and quick checks.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ toast */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  $$('[data-toast]').forEach(function (el) {
    el.addEventListener('click', function () { toast(el.getAttribute('data-toast')); });
  });

  /* -------------------------------------------------- session context + api */
  var params = new URLSearchParams(window.location.search);
  var sessionId = window.MATHIFY_SESSION_ID || params.get('session') || params.get('sessionId') || null;
  var classroomApi = window.mathifyClassroomApi || null;
  var studentName = 'Student';

  /* Students start with camera/audio controls available. Only an explicit
     trainer revoke locks them, and that transition forces both tracks on. */
  var mediaPermission = {
    studentCanToggleMedia: true,
    forceMicOn: false,
    forceCameraOn: false,
    studentMuted: false,
    studentCameraOff: false,
    version: 0
  };
  var networkState = null;
  var viewerRole = (window.MATHIFY_USER && window.MATHIFY_USER.role) ||
    (classroomApi && classroomApi.role) || 'trainer';
  if (params.get('view') === 'student' || params.get('role') === 'student') viewerRole = 'student';

  function isStudentViewer() {
    return params.get('view') === 'student' || params.get('role') === 'student' ||
      viewerRole === 'student';
  }

  function applyStudentName(value) {
    var next = String(value || '').trim();
    if (!next) return;
    studentName = next;
    $$('[data-student-name]').forEach(function (el) { el.textContent = next; });
    renderChat();
  }

  function loadSessionContext() {
    if (!sessionId || !classroomApi) return Promise.resolve(false);
    return classroomApi.getSessionState(sessionId).then(function (state) {
      var name = state && state.participants && state.participants.student &&
        state.participants.student.name;
      applyStudentName(name);
      if (state && state.viewerRole) {
        viewerRole = state.viewerRole;
        window.MATHIFY_USER = window.MATHIFY_USER || { role: state.viewerRole };
      }
      if (state && state.mediaPermissions) applyMediaPermission(state.mediaPermissions);
      if (state && state.reactionPermissions) applyReactionPermission(state.reactionPermissions);
      if (state && state.network) applyNetworkState(state.network);
      return true;
    }).catch(function (error) {
      console.warn('[mathify] Session context unavailable:', error.message);
      toast('Session data unavailable · local preview only.');
      return false;
    });
  }

  /* ----------------------------------------------------------------- timers */
  var recTime = $('#recTime');
  var sessionSeconds = 42 * 60 + 18;
  var ended = false;
  var ending = false;

  function clock(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var stepSeconds = 12 * 60 + 40;
  var stepTime = $('#stepTime');
  function paintStepTime() {
    if (stepTime) stepTime.textContent = clock(Math.max(0, stepSeconds)) + ' left';
  }
  paintStepTime();

  setInterval(function () {
    if (ended) return;
    sessionSeconds += 1;
    if (recTime) recTime.textContent = clock(sessionSeconds);
    if (stepSeconds > 0) {
      stepSeconds -= 1;
      paintStepTime();
    }
  }, 1000);

  /* ------------------------------------------------------------------- chat */
  var messages = [
    { whoKey: 'student', text: 'Can we do one more bar model?', time: '5:09' },
    { who: 'You', text: 'After this one — page 2.', time: '5:09', me: true },
    { whoKey: 'student', text: 'Got it — 1 part is 6 cm.', time: '5:10' }
  ];

  function nowTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m;
  }

  function renderChat() {
    $$('[data-chat-log]').forEach(function (log) {
      log.innerHTML = '';
      messages.forEach(function (m) {
        var wrap = document.createElement('div');
        wrap.className = 'chat-msg' + (m.me ? ' me' : '');
        var who = document.createElement('span');
        who.className = 'cm-who';
        who.appendChild(document.createTextNode(
          m.who || (m.whoKey === 'student' ? studentName : 'You')
        ));
        var time = document.createElement('time');
        time.textContent = m.time;
        who.appendChild(time);
        var p = document.createElement('p');
        p.textContent = m.text;
        wrap.appendChild(who);
        wrap.appendChild(p);
        log.appendChild(wrap);
      });
      log.scrollTop = log.scrollHeight;
    });
  }

  function clearUnread() {
    var side = $('#sideUnread');
    var count = $('#chatCount');
    if (side) side.hidden = true;
    if (count) count.hidden = true;
  }

  var chatCursor = 0;
  var seenChatIds = Object.create(null);

  function chatTime(at) {
    var d = at ? new Date(at) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m;
  }

  function appendChat(message, own) {
    if (!message || !message.text) return;
    if (message.id && seenChatIds[message.id]) return;
    if (message.id) seenChatIds[message.id] = true;
    messages.push({
      id: message.id,
      who: own ? 'You' : (message.from === 'student' ? studentName : 'Trainer'),
      text: message.text,
      time: message.time || chatTime(message.at),
      me: Boolean(own)
    });
    renderChat();
  }

  $$('[data-chat-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('input', form);
      var value = input ? input.value.trim() : '';
      if (!value) return;
      if (input) input.value = '';
      if (!sessionId || !classroomApi || typeof classroomApi.sendChat !== 'function') {
        appendChat({ text: value, from: 'trainer', at: new Date().toISOString() }, true);
        toast('Local preview · message saved in this browser only.');
        return;
      }
      classroomApi.sendChat(sessionId, value).then(function (message) {
        appendChat(message, true);
        clearUnread();
        var status = $('#chatStatus');
        if (status) status.textContent = 'Message sent to ' + studentName + '.';
      }).catch(function (error) {
        if (input) input.value = value;
        toast('Message could not be sent: ' + error.message);
      });
      input && input.focus();
    });
    $('input', form) && $('input', form).addEventListener('focus', clearUnread);
  });

  function pollChat() {
    if (!sessionId || !classroomApi || typeof classroomApi.getSessionEvents !== 'function') return;
    classroomApi.getSessionEvents(sessionId, chatCursor).then(function (events) {
      events.forEach(function (event) {
        chatCursor = Math.max(chatCursor, Number(event.seq) || 0);
        if (event.event !== 'chat.sent') return;
        var payload = event.payload || {};
        appendChat(payload, classroomApi.role === payload.from);
      });
    }).catch(function () { /* Local preview keeps the visible log usable. */ });
  }
  if (sessionId) {
    pollChat();
    setInterval(pollChat, 3000);
  }

  renderChat();

  /* ----------------------------------------------------------------- panels */
  var sheetLayer = $('#layer');
  var sheets = $$('.sheet');
  var lastTrigger = null;
  var activeSheet = null;

  function openSheet(id, trigger) {
    var sheet = document.getElementById(id);
    if (!sheet || !sheetLayer) return;
    if (sheetLayer.hidden) {
      lastTrigger = trigger || document.activeElement;
      sheetLayer.hidden = false;
    }
    sheets.forEach(function (s) { s.hidden = s !== sheet; });
    activeSheet = sheet;
    if (id === 'sheet-chat') clearUnread();
    var focusTarget = id === 'sheet-chat' ? $('input', sheet) : $('.sheet-x', sheet);
    setTimeout(function () {
      if (focusTarget && focusTarget.offsetParent !== null) focusTarget.focus();
    }, 30);
  }

  function closeSheet() {
    if (!sheetLayer || sheetLayer.hidden) return;
    sheetLayer.hidden = true;
    sheets.forEach(function (s) { s.hidden = true; });
    activeSheet = null;
    if (lastTrigger && lastTrigger.offsetParent !== null && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus();
    }
  }

  $$('[data-sheet]').forEach(function (button) {
    button.addEventListener('click', function () {
      openSheet(button.getAttribute('data-sheet'), button);
    });
  });

  if (sheetLayer) {
    sheetLayer.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-sheet]')) closeSheet();
    });

    sheetLayer.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== 'Tab' || !activeSheet) return;
      var focusables = $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', activeSheet)
        .filter(function (el) { return el.getClientRects().length > 0; });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  var peopleBtn = $('#peopleBtn');
  var openPeople = $('#openPeople');
  var handBtn = $('#handBtn');
  var chatBtn = $('#chatBtn');
  var endBtn = $('#endBtn');

  peopleBtn && peopleBtn.addEventListener('click', function () { openSheet('sheet-people', peopleBtn); });
  openPeople && openPeople.addEventListener('click', function () { openSheet('sheet-people', openPeople); });
  handBtn && handBtn.addEventListener('click', function () { openSheet('sheet-people', handBtn); });

  chatBtn && chatBtn.addEventListener('click', function () {
    openSheet('sheet-chat', chatBtn);
  });

  endBtn && endBtn.addEventListener('click', function () {
    openSheet('sheet-end', endBtn);
  });

  /* --------------------------------------------------------------- end class */
  var confirmEnd = $('#confirmEnd');
  var liveWord = $('#liveWord');
  var recapStatus = $('#recapStatus');
  var recapSaved = $('#recapSaved');

  function paintEnded(savedText) {
    ended = true;
    document.body.classList.add('is-ended');
    if (liveWord) liveWord.textContent = 'Ended';
    if (endBtn) {
      endBtn.disabled = true;
      endBtn.textContent = 'Ended';
    }
    if (recapStatus) recapStatus.textContent = 'Session · ' + (savedText || 'saved');
    if (recapSaved) recapSaved.textContent = savedText || 'Saved just now';
    /* A 1:1 call does not stay open after the session is closed. */
    var endedCall = window.mathifyClassroomAgora;
    if (endedCall && typeof endedCall.leave === 'function') endedCall.leave();
  }

  function showRecapSheet() {
    closeSheet();
    setTimeout(function () { openSheet('sheet-recap', endBtn); }, 160);
  }

  function endClass() {
    if (ended || ending) return;
    ending = true;
    if (confirmEnd) {
      confirmEnd.disabled = true;
      confirmEnd.textContent = 'Saving…';
    }
    if (recapStatus) recapStatus.textContent = 'Saving recap…';

    var payload = {
      recap: {
        summary: 'Ratios · Lesson 15 with ' + studentName,
        highlights: ['Bar models', 'Equivalent ratios'],
        homework: 'Practice sheet 3'
      }
    };
    /* The server owns the score unless a signed-in host supplies one. */
    if (typeof window.MATHIFY_QUIZ_SCORE === 'number') {
      payload.currentQuizScore = window.MATHIFY_QUIZ_SCORE;
    }
    var recordingLink = $('#recordingLink');
    if (recordingLink && /^https?:\/\//i.test(recordingLink.value.trim())) {
      payload.recordingUrl = recordingLink.value.trim();
    }

    var task = sessionId && classroomApi
      ? classroomApi.endSession(sessionId, payload)
      : Promise.reject({ code: 'NO_SESSION', message: 'No live session id.' });

    task.then(function (data) {
      ending = false;
      paintEnded('saved');
      var recap = data && data.recap;
      if (recap) {
        window.MATHIFY_SESSION_RECAP = recap;
        if (recapStatus && recap.endedAt) {
          recapStatus.textContent = 'Session · saved ' + new Date(recap.endedAt).toLocaleTimeString();
        }
        if (recap.recordingUrl) {
          var recordingNote = $('#recordingNote');
          if (recordingNote) {
            recordingNote.textContent = 'Recording link is ready to share with ' +
              studentName + '’s parent.';
          }
        }
      }
      toast('Session ended · recap saved to ' + studentName + '’s profile.');
      showRecapSheet();
    }).catch(function (error) {
      ending = false;
      if (confirmEnd) {
        confirmEnd.disabled = false;
        confirmEnd.textContent = 'End & save recap';
      }
      if (error.code === 'SESSION_ALREADY_ENDED') {
        paintEnded('already ended');
        toast('This session was already ended.');
        showRecapSheet();
        return;
      }
      if (error.code === 'PARALLEL_CHECK_REQUIRED') {
        if (recapStatus) recapStatus.textContent = 'Finish the parallel check first';
        toast('Finish the parallel check before ending the session.');
        return;
      }
      if (error.code === 'NO_SESSION' || error.name === 'TypeError' || error.status === 404) {
        paintEnded('preview · not saved');
        toast('Local preview · no live session, so nothing was saved.');
        showRecapSheet();
        return;
      }
      if (recapStatus) recapStatus.textContent = 'Could not save · retry';
      toast('Could not save the session: ' + error.message);
    });
  }

  confirmEnd && confirmEnd.addEventListener('click', endClass);

  var sendRecap = $('#sendRecap');
  sendRecap && sendRecap.addEventListener('click', function () {
    sendRecap.disabled = true;
    sendRecap.textContent = 'Recap ready';
    toast('Recap ready for ' + studentName + '’s parent.');
  });

  /* -------------------------------------------------------------- media bar */
  var micBtn = $('#micBtn');
  var camBtn = $('#camBtn');
  var shareBtn = $('#shareBtn');
  var selfTile = $('#selfTile');
  var accessBtn = $('#studentMediaAccessBtn');
  /* Student Control mirrors the same server state as the call bar shortcut. */
  var scMediaBtn = $('#scMediaBtn');
  var scApplauseBtn = $('#scApplauseBtn');
  var scReactBtn = $('#scReactBtn');
  var scMuteBtn = $('#scMuteMicBtn');
  var scCameraBtn = $('#scCameraOffBtn');
  var scBoardBtn = $('#scBoardBtn');
  var reactionPermissionState = { studentCanReact: true, studentCanApplaud: true, version: 0 };

  function setIcon(button, id) {
    var use = button && button.querySelector('use');
    if (use) use.setAttribute('href', id);
  }

  function callModule() { return window.mathifyClassroomAgora; }

  var micOn = true;
  var camOn = true;

  function setMicVisual(on) {
    micOn = Boolean(on);
    if (micBtn) {
      micBtn.classList.toggle('is-off', !micOn);
      micBtn.setAttribute('aria-pressed', String(!micOn));
      micBtn.setAttribute('aria-label', micOn ? 'Mute microphone' : 'Unmute microphone');
      micBtn.title = micOn ? 'Mute microphone' : 'Unmute microphone';
      setIcon(micBtn, micOn ? '#i-mic' : '#i-mic-off');
    }
    var mic = selfTile && $('.t-mic', selfTile);
    if (mic) {
      mic.classList.toggle('is-muted', !micOn);
      setIcon(mic, micOn ? '#i-mic' : '#i-mic-off');
    }
    $$('.dock-trainer .dock-mic').forEach(function (dockMic) {
      dockMic.classList.toggle('is-muted', !micOn);
      setIcon(dockMic, micOn ? '#i-mic' : '#i-mic-off');
    });
  }

  function setCameraVisual(on) {
    camOn = Boolean(on);
    if (camBtn) {
      camBtn.classList.toggle('is-off', !camOn);
      camBtn.setAttribute('aria-pressed', String(!camOn));
      camBtn.setAttribute('aria-label', camOn ? 'Turn off camera' : 'Turn on camera');
      camBtn.title = camOn ? 'Turn off camera' : 'Turn on camera';
      setIcon(camBtn, camOn ? '#i-cam' : '#i-cam-off');
    }
    selfTile && selfTile.classList.toggle('cam-on', camOn);
    $$('.dock-trainer').forEach(function (dockTile) {
      dockTile.classList.toggle('cam-on', camOn);
    });
  }

  function mediaAllowed() {
    return !isStudentViewer() || mediaPermission.studentCanToggleMedia === true;
  }

  function rejectLockedControl() {
    toast('Your trainer has locked audio and video controls.');
  }

  micBtn && micBtn.addEventListener('click', function () {
    if (!mediaAllowed() || micBtn.disabled) { rejectLockedControl(); return; }
    setMicVisual(!micOn);
    var micCall = callModule();
    if (micCall && typeof micCall.setMicEnabled === 'function') micCall.setMicEnabled(micOn);
    toast(micOn ? 'Microphone on.' : 'Microphone muted.');
  });

  camBtn && camBtn.addEventListener('click', function () {
    if (!mediaAllowed() || camBtn.disabled) { rejectLockedControl(); return; }
    setCameraVisual(!camOn);
    var camCall = callModule();
    if (camCall && typeof camCall.setCameraEnabled === 'function') camCall.setCameraEnabled(camOn);
    toast(camOn ? 'Camera on.' : 'Camera off.');
  });

  function setMediaButtonsLocked(locked) {
    [micBtn, camBtn].forEach(function (button) {
      if (!button) return;
      button.disabled = Boolean(locked);
      button.setAttribute('aria-disabled', String(Boolean(locked)));
      button.title = locked
        ? 'Locked by your trainer · audio and camera stay on'
        : (button === micBtn ? 'Mute microphone' : 'Turn off camera');
    });
  }

  function forceStudentMediaOn() {
    var call = callModule();
    var result = call && typeof call.forceMediaOn === 'function'
      ? call.forceMediaOn()
      : { micApplied: false, cameraApplied: false, joined: false };
    setMicVisual(true);
    setCameraVisual(true);
    return result;
  }

  function applyAccessButton() {
    if (!accessBtn) return;
    var allowed = mediaPermission.studentCanToggleMedia === true;
    accessBtn.classList.toggle('is-on', allowed);
    accessBtn.setAttribute('aria-pressed', String(allowed));
    accessBtn.setAttribute('aria-label', allowed
      ? 'Access on — revoke student audio and video controls'
      : 'Access off — allow student audio and video controls');
    accessBtn.title = allowed
      ? 'Student can mute and switch camera off · click to lock'
      : 'Student controls locked · click to allow';
    var label = $('[data-media-access-label]', accessBtn);
    if (label) label.textContent = allowed ? 'Access on' : 'Access off';
    if (scMediaBtn) {
      scMediaBtn.classList.toggle('is-on', allowed);
      scMediaBtn.setAttribute('aria-pressed', String(allowed));
      var scLabel = $('[data-control-label]', scMediaBtn);
      if (scLabel) scLabel.textContent = allowed ? 'On' : 'Off';
      scMediaBtn.title = allowed
        ? 'Student can mute and switch off the camera · click to lock'
        : 'Student controls locked · click to allow';
    }
  }

  function applyApplauseButton() {
    if (!scApplauseBtn) return;
    var allowed = reactionPermissionState.studentCanApplaud !== false;
    scApplauseBtn.classList.toggle('is-on', allowed);
    scApplauseBtn.setAttribute('aria-pressed', String(allowed));
    var label = $('[data-control-label]', scApplauseBtn);
    if (label) label.textContent = allowed ? 'On' : 'Off';
    scApplauseBtn.title = allowed
      ? 'Student may applaud the trainer · click to pause'
      : 'Applause paused for this session · click to allow';
    var engagement = window.classroomEngagement;
    if (engagement && typeof engagement.setApplauseAllowed === 'function') {
      engagement.setApplauseAllowed(allowed);
    }
    if (engagement && typeof engagement.setReactionAllowed === 'function') {
      engagement.setReactionAllowed(reactionPermissionState.studentCanReact !== false);
    }
  }

  function applyReactButton() {
    var allowed = reactionPermissionState.studentCanReact !== false;
    var engagement = window.classroomEngagement;
    if (engagement && typeof engagement.setApplauseAllowed === 'function') {
      engagement.setApplauseAllowed(reactionPermissionState.studentCanApplaud !== false);
    }
    if (engagement && typeof engagement.setReactionAllowed === 'function') {
      engagement.setReactionAllowed(allowed);
    }
    if (!scReactBtn) return;
    scReactBtn.classList.toggle('is-on', allowed);
    scReactBtn.setAttribute('aria-pressed', String(allowed));
    var label = $('[data-control-label]', scReactBtn);
    if (label) label.textContent = allowed ? 'On' : 'Off';
    scReactBtn.title = allowed
      ? 'Student may send emoji reactions · click to pause'
      : 'Emoji reactions paused · click to allow';
    applyApplauseButton();
  }

  function applyReactionPermission(value) {
    if (!value || typeof value !== 'object') return;
    var incoming = Math.max(0, Number(value.version) || 0);
    var current = Math.max(0, Number(reactionPermissionState.version) || 0);
    if (incoming && incoming < current) return;
    reactionPermissionState = {
      studentCanReact: value.studentCanReact !== false,
      studentCanApplaud: value.studentCanApplaud !== false,
      version: incoming || current
    };
    applyReactButton();
  }

  function applyTrainerMediaButtons() {
    var muted = mediaPermission.studentMuted === true;
    var cameraOff = mediaPermission.studentCameraOff === true;
    if (scMuteBtn) {
      scMuteBtn.classList.toggle('is-on', muted);
      scMuteBtn.setAttribute('aria-pressed', String(muted));
      var micLabel = $('[data-control-label]', scMuteBtn);
      if (micLabel) micLabel.textContent = muted ? 'Muted' : 'On';
      scMuteBtn.title = muted ? 'Kid is muted · click to unmute' : 'Mute the kid’s microphone';
    }
    if (scCameraBtn) {
      scCameraBtn.classList.toggle('is-on', cameraOff);
      scCameraBtn.setAttribute('aria-pressed', String(cameraOff));
      var cameraLabel = $('[data-control-label]', scCameraBtn);
      if (cameraLabel) cameraLabel.textContent = cameraOff ? 'Off' : 'On';
      scCameraBtn.title = cameraOff ? 'Kid camera is off · click to turn it on' : 'Turn off the kid’s camera';
    }
  }

  function applyBoardButton() {
    if (!scBoardBtn) return;
    scBoardBtn.classList.toggle('is-on', sharing === true);
    scBoardBtn.setAttribute('aria-pressed', String(Boolean(sharing)));
    var label = $('[data-control-label]', scBoardBtn);
    if (label) label.textContent = sharing ? 'On' : 'Off';
  }

  /* Force-on always runs before the lock. The honest status distinguishes a
     track that was enabled from a browser that has not granted the device yet. */
  function applyMediaPermission(value) {
    if (!value || typeof value !== 'object') return Promise.resolve(false);
    var incoming = Math.max(0, Number(value.version) || 0);
    var current = Math.max(0, Number(mediaPermission.version) || 0);
    if (incoming && incoming < current) return Promise.resolve(false);

    var allowed = value.studentCanToggleMedia !== false;
    mediaPermission = {
      studentCanToggleMedia: allowed,
      forceMicOn: value.forceMicOn === true,
      forceCameraOn: value.forceCameraOn === true,
      studentMuted: value.studentMuted === true,
      studentCameraOff: value.studentCameraOff === true,
      version: incoming || current
    };
    applyAccessButton();
    applyTrainerMediaButtons();

    if (!isStudentViewer()) return Promise.resolve(true);

    /* An intentional trainer mute/camera-off always wins over the Access
       force-on default. A null track means "leave it as it is". */
    var micOn = mediaPermission.studentMuted ? false : (!allowed ? true : null);
    var cameraOn = mediaPermission.studentCameraOff ? false : (!allowed ? true : null);
    var remoteResult = null;
    function applyRemoteState() {
      var call = callModule();
      if (!call || typeof call.applyTrainerMediaState !== 'function') return;
      remoteResult = call.applyTrainerMediaState({ micOn: micOn, cameraOn: cameraOn });
      if (micOn !== null) setMicVisual(micOn);
      if (cameraOn !== null) setCameraVisual(cameraOn);
    }

    if (!allowed) {
      /* Force-on always runs before the lock; then an explicit off is applied
         by the trainer's authority, even while the controls are locked. */
      var applied = forceStudentMediaOn();
      setMediaButtonsLocked(true);
      var lockedCall = callModule();
      if (lockedCall && typeof lockedCall.setMediaControlsLocked === 'function') {
        lockedCall.setMediaControlsLocked(true);
      }
      applyRemoteState();
      var message = applied.joined
        ? (remoteResult && (!remoteResult.micApplied || !remoteResult.cameraApplied)
          ? 'Trainer locked controls. Some devices could not be switched as requested.'
          : 'Trainer locked media controls. Microphone and camera are on.')
        : 'Trainer locked media controls. Microphone and camera will start on when you join.';
      if (lockedCall && typeof lockedCall.setStatus === 'function') lockedCall.setStatus(message);
      toast('Your trainer locked audio and video controls.');
    } else {
      setMediaButtonsLocked(false);
      var openCall = callModule();
      if (openCall && typeof openCall.setMediaControlsLocked === 'function') {
        openCall.setMediaControlsLocked(false);
      }
      applyRemoteState();
      if (remoteResult && (remoteResult.micApplied === false || remoteResult.cameraApplied === false)) {
        toast('Your trainer changed audio or video. Allow device access if a control did not change.');
      }
    }
    return Promise.resolve(true);
  }

  function applyNetworkState(value) {
    if (!value || typeof value !== 'object') return;
    networkState = value;
    var ready = value.canStartCall === true;
    var reason = ready ? '' : 'Both people must pass the connection speed check before class.';
    var call = callModule();
    if (call && typeof call.setNetworkReady === 'function') call.setNetworkReady(ready, reason);
    if (window.mathifyNetworkCheck && typeof window.mathifyNetworkCheck.describe === 'function' &&
        call && typeof call.setStatus === 'function') {
      call.setStatus(window.mathifyNetworkCheck.describe(value));
    }
  }

  function setStudentMediaAccess(next) {
    if (!sessionId || !classroomApi || typeof classroomApi.setMediaPermission !== 'function') {
      toast('Student media access needs a live session.');
      return;
    }
    var buttons = [accessBtn, scMediaBtn].filter(Boolean);
    buttons.forEach(function (button) { button.disabled = true; });
    classroomApi.setMediaPermission(sessionId, next).then(function (permission) {
      applyMediaPermission(permission);
      toast(next
        ? 'Student may now mute and switch off the camera.'
        : 'Student controls locked; audio and camera stay on.');
    }).catch(function (error) {
      toast('Media access update failed: ' + error.message);
    }).then(function () {
      buttons.forEach(function (button) { button.disabled = false; });
    });
  }

  accessBtn && accessBtn.addEventListener('click', function () {
    setStudentMediaAccess(mediaPermission.studentCanToggleMedia !== true);
  });
  scMediaBtn && scMediaBtn.addEventListener('click', function () {
    setStudentMediaAccess(mediaPermission.studentCanToggleMedia !== true);
  });

  function setTrainerMedia(patch, message) {
    if (!sessionId || !classroomApi || typeof classroomApi.setTrainerMediaState !== 'function') {
      toast('Trainer media control needs a live session.');
      return;
    }
    var buttons = [scMuteBtn, scCameraBtn].filter(Boolean);
    buttons.forEach(function (button) { button.disabled = true; });
    classroomApi.setTrainerMediaState(sessionId, patch).then(function (permission) {
      applyMediaPermission(permission);
      toast(message);
    }).catch(function (error) {
      toast('Media control update failed: ' + error.message);
    }).then(function () {
      buttons.forEach(function (button) { button.disabled = false; });
    });
  }

  scMuteBtn && scMuteBtn.addEventListener('click', function () {
    var next = mediaPermission.studentMuted !== true;
    setTrainerMedia({ micOn: !next }, next ? 'Kid is muted.' : 'Kid microphone is on.');
  });
  scCameraBtn && scCameraBtn.addEventListener('click', function () {
    var next = mediaPermission.studentCameraOff !== true;
    setTrainerMedia({ cameraOn: !next }, next ? 'Kid camera is off.' : 'Kid camera is on.');
  });

  scApplauseBtn && scApplauseBtn.addEventListener('click', function () {
    if (!sessionId || !classroomApi || typeof classroomApi.setReactionPermission !== 'function') {
      toast('Applause permission needs a live session.');
      return;
    }
    var next = reactionPermissionState.studentCanApplaud !== true;
    scApplauseBtn.disabled = true;
    classroomApi.setReactionPermission(sessionId, { studentCanApplaud: next }).then(function (permission) {
      applyReactionPermission(permission);
      toast(next ? 'Student may applaud again.' : 'Applause paused for this student.');
    }).catch(function (error) {
      toast('Applause permission update failed: ' + error.message);
    }).then(function () {
      scApplauseBtn.disabled = false;
    });
  });

  scReactBtn && scReactBtn.addEventListener('click', function () {
    if (!sessionId || !classroomApi || typeof classroomApi.setReactionPermission !== 'function') {
      toast('Emoji permission needs a live session.');
      return;
    }
    var next = reactionPermissionState.studentCanReact !== true;
    scReactBtn.disabled = true;
    classroomApi.setReactionPermission(sessionId, { studentCanReact: next }).then(function (permission) {
      applyReactionPermission(permission);
      toast(next ? 'Student may use emoji again.' : 'Emoji reactions paused for this student.');
    }).catch(function (error) {
      toast('Emoji permission update failed: ' + error.message);
    }).then(function () {
      scReactBtn.disabled = false;
    });
  });

  var sharing = false;
  function setBoardShare(next) {
    sharing = Boolean(next);
    if (shareBtn) {
      shareBtn.classList.toggle('is-on', sharing);
      shareBtn.setAttribute('aria-pressed', String(sharing));
      shareBtn.setAttribute('aria-label', sharing ? 'Stop sharing board' : 'Share board');
      shareBtn.title = sharing ? 'Stop sharing board' : 'Share board';
    }
    $$('.call-pip').forEach(function (pip) { pip.classList.toggle('is-sharing', sharing); });
    applyBoardButton();
    /* Sound is paused whenever a shared surface is visible. */
    var engagement = window.classroomEngagement;
    if (engagement && typeof engagement.setScreenSharing === 'function') {
      engagement.setScreenSharing(sharing);
    }
  }

  shareBtn && shareBtn.addEventListener('click', function () {
    setBoardShare(!sharing);
    toast(sharing ? 'Board shared with ' + studentName + '.' : 'Board share stopped.');
  });
  scBoardBtn && scBoardBtn.addEventListener('click', function () {
    if (!sessionId || !classroomApi || typeof classroomApi.shareBoard !== 'function') {
      toast('Board sharing needs a live session.');
      return;
    }
    var next = !sharing;
    scBoardBtn.disabled = true;
    classroomApi.shareBoard(sessionId, next).then(function () {
      setBoardShare(next);
      toast(next ? 'Board shared with ' + studentName + '.' : 'Board share stopped.');
    }).catch(function (error) {
      toast('Board sharing update failed: ' + error.message);
    }).then(function () {
      scBoardBtn.disabled = false;
    });
  });

  /* Quiz mode is handled in session.js so the board can be hidden cleanly. */

  /* ---------------------------------------------------------------- planner */
  var planSteps = $('#planSteps');
  var plannerMeta = $('#plannerMeta');
  var nowStep = $('#nowStep');

  function countDone() {
    return planSteps ? $$('#planSteps li.done').length : 0;
  }

  function updatePlannerMeta() {
    if (!plannerMeta) return;
    var current = planSteps && $('#planSteps li.current');
    if (current) plannerMeta.textContent = 'Step ' + (countDone() + 1) + ' of 5';
    else plannerMeta.textContent = 'Wrap-up';
  }

  function activateStep(li) {
    if (!li) return;
    li.classList.add('current');
    li.classList.remove('done');
    var state = $('.step-state', li);
    if (state) state.remove();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-btn';
    btn.setAttribute('data-done-step', '');
    btn.textContent = 'Mark done';
    li.appendChild(btn);
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-done-step]');
    if (!btn || !planSteps) return;
    var li = btn.closest('li');
    if (!li) return;
    li.classList.remove('current');
    li.classList.add('done');
    var mark = $('.step-mark', li);
    if (mark) mark.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>';
    btn.remove();
    var done = document.createElement('span');
    done.className = 'step-state';
    done.textContent = 'Done';
    li.appendChild(done);

    var next = li.nextElementSibling;
    if (next) {
      activateStep(next);
      if (nowStep) nowStep.textContent = next.getAttribute('data-step') || 'Next step';
      stepSeconds = (Number(next.getAttribute('data-min')) || 10) * 60;
      paintStepTime();
      toast('Step marked done · ' + (next.getAttribute('data-step') || 'next step') + ' is up.');
    } else {
      if (nowStep) nowStep.textContent = 'Lesson complete';
      if (stepTime) stepTime.textContent = '0:00 left';
      toast('All five steps are done. Nice pace.');
    }
    updatePlannerMeta();
  });

  updatePlannerMeta();

  /* -------------------------------------------------------------- whiteboard */
  var paper = $('#paper');
  var canvas = $('#ink');
  var ctx = canvas && canvas.getContext('2d');
  var pageEls = $$('.sheet-page');
  var pageNow = $('#pageNow');
  var pagePrev = $('#pagePrev');
  var pageNext = $('#pageNext');
  var saveChip = $('#saveChip');
  var saveText = saveChip && $('span', saveChip);
  var boardHint = $('#boardHint');
  var brush = $('#brush');

  var COLORS = { ink: '#0E1420', coral: '#FF5B2E', teal: '#12968C', amber: '#B4740B' };
  var WIDTHS = { pen: 2.6, marker: 17, eraser: 26 };
  var ALPHA = { pen: 1, marker: 0.26, eraser: 1 };

  var layers = {
    1: { strokes: [], undo: [], redo: [] },
    2: { strokes: [], undo: [], redo: [] },
    3: { strokes: [], undo: [], redo: [] }
  };
  var page = 1;
  var tool = 'pen';
  var color = 'ink';
  var drawing = false;
  var activePointer = null;
  var savedTimer = null;

  function layer() { return layers[page]; }

  function cloneStrokes(list) {
    return list.map(function (s) {
      return {
        tool: s.tool,
        color: s.color,
        points: s.points.map(function (p) { return [p[0], p[1]]; })
      };
    });
  }

  function touchBoard() {
    if (!saveChip) return;
    saveChip.classList.add('is-saving');
    if (saveText) saveText.textContent = 'Saving…';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      saveChip.classList.remove('is-saving');
      if (saveText) saveText.textContent = 'Saved';
    }, 620);
  }

  function styleStroke(s) {
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = ALPHA[s.tool] || 1;
    ctx.strokeStyle = COLORS[s.color] || COLORS.ink;
    ctx.fillStyle = COLORS[s.color] || COLORS.ink;
    ctx.lineWidth = WIDTHS[s.tool] || WIDTHS.pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawDot(s) {
    if (!ctx || !s.points.length) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var p = s.points[s.points.length - 1];
    ctx.save();
    styleStroke(s);
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, (WIDTHS[s.tool] || 2.6) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSegment(s, a, b) {
    if (!ctx) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.save();
    styleStroke(s);
    ctx.beginPath();
    ctx.moveTo(a[0] * w, a[1] * h);
    ctx.lineTo(b[0] * w, b[1] * h);
    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    layer().strokes.forEach(function (s) {
      if (s.points.length === 1) {
        drawDot(s);
        return;
      }
      ctx.save();
      styleStroke(s);
      ctx.beginPath();
      ctx.moveTo(s.points[0][0] * canvas.clientWidth, s.points[0][1] * canvas.clientHeight);
      for (var i = 1; i < s.points.length; i += 1) {
        ctx.lineTo(s.points[i][0] * canvas.clientWidth, s.points[i][1] * canvas.clientHeight);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  function fitCanvas() {
    if (!canvas || !paper || !ctx) return;
    var rect = paper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width;
    var y = (event.clientY - rect.top) / rect.height;
    return [
      Math.min(Math.max(x, 0), 1),
      Math.min(Math.max(y, 0), 1)
    ];
  }

  function setTool(next) {
    tool = next;
    $$('[data-tool]').forEach(function (btn) {
      var on = btn.getAttribute('data-tool') === next;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    paper && paper.classList.toggle('tool-eraser', next === 'eraser');
    paper && paper.classList.toggle('tool-marker', next === 'marker');
    if (brush) brush.style.opacity = '0';
  }

  function setColor(next) {
    color = next;
    $$('[data-color]').forEach(function (btn) {
      var on = btn.getAttribute('data-color') === next;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function setPage(next) {
    page = next;
    pageEls.forEach(function (el) {
      el.hidden = Number(el.getAttribute('data-page')) !== next;
    });
    if (pageNow) pageNow.textContent = String(next);
    if (pagePrev) pagePrev.disabled = next <= 1;
    if (pageNext) pageNext.disabled = next >= pageEls.length;
    redraw();
  }

  function undo() {
    var l = layer();
    if (!l.undo.length) {
      toast('Nothing to undo on this page.');
      return;
    }
    l.redo.push(cloneStrokes(l.strokes));
    l.strokes = l.undo.pop();
    redraw();
    touchBoard();
  }

  function redo() {
    var l = layer();
    if (!l.redo.length) {
      toast('Nothing to redo on this page.');
      return;
    }
    l.undo.push(cloneStrokes(l.strokes));
    l.strokes = l.redo.pop();
    redraw();
    touchBoard();
  }

  function clearPage() {
    var l = layer();
    if (!l.strokes.length) {
      toast('This page is already clear.');
      return;
    }
    l.undo.push(cloneStrokes(l.strokes));
    if (l.undo.length > 40) l.undo.shift();
    l.strokes = [];
    l.redo = [];
    redraw();
    touchBoard();
    toast('Page cleared · Undo to restore.');
  }

  $$('[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () { setTool(btn.getAttribute('data-tool')); });
  });

  $$('[data-color]').forEach(function (btn) {
    btn.addEventListener('click', function () { setColor(btn.getAttribute('data-color')); });
  });

  $$('[data-act]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var act = btn.getAttribute('data-act');
      if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'clear') clearPage();
    });
  });

  pagePrev && pagePrev.addEventListener('click', function () { if (page > 1) setPage(page - 1); });
  pageNext && pageNext.addEventListener('click', function () { if (page < pageEls.length) setPage(page + 1); });

  if (canvas && ctx && paper) {
    function interactiveTarget(target) {
      return target && target.closest && target.closest('button, a, input, select, textarea, [data-expand], .trainer-panel');
    }

    paper.addEventListener('pointerdown', function (event) {
      if (interactiveTarget(event.target)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (drawing) return;
      event.preventDefault();
      drawing = true;
      activePointer = event.pointerId;
      try { paper.setPointerCapture(event.pointerId); } catch (e) {}
      var l = layer();
      l.undo.push(cloneStrokes(l.strokes));
      if (l.undo.length > 40) l.undo.shift();
      l.redo = [];
      var stroke = { tool: tool, color: color, points: [pointFromEvent(event)] };
      l.strokes.push(stroke);
      drawDot(stroke);
      if (boardHint) boardHint.classList.add('is-gone');
      touchBoard();
    });

    paper.addEventListener('pointermove', function (event) {
      if (brush && (tool === 'eraser' || tool === 'marker')) {
        var rect = paper.getBoundingClientRect();
        brush.style.left = (event.clientX - rect.left) + 'px';
        brush.style.top = (event.clientY - rect.top) + 'px';
        brush.style.opacity = '1';
      }
      if (!drawing || event.pointerId !== activePointer) return;
      event.preventDefault();
      var l = layer();
      var stroke = l.strokes[l.strokes.length - 1];
      if (!stroke) return;
      var p = pointFromEvent(event);
      var last = stroke.points[stroke.points.length - 1];
      var rect = canvas.getBoundingClientRect();
      var dx = (p[0] - last[0]) * rect.width;
      var dy = (p[1] - last[1]) * rect.height;
      if (Math.sqrt(dx * dx + dy * dy) < 1.4) return;
      stroke.points.push(p);
      drawSegment(stroke, last, p);
    });

    function stopDraw(event) {
      if (event && activePointer !== null && event.pointerId !== activePointer) return;
      if (!drawing) return;
      drawing = false;
      activePointer = null;
      touchBoard();
    }

    paper.addEventListener('pointerup', stopDraw);
    paper.addEventListener('pointercancel', stopDraw);
    paper.addEventListener('pointerleave', function () {
      if (brush) brush.style.opacity = '0';
    });
    paper.addEventListener('pointerenter', function (event) {
      if (brush && (tool === 'eraser' || tool === 'marker')) {
        var rect = paper.getBoundingClientRect();
        brush.style.left = (event.clientX - rect.left) + 'px';
        brush.style.top = (event.clientY - rect.top) + 'px';
        brush.style.opacity = '1';
      }
    });
  }

  window.addEventListener('resize', fitCanvas);
  if (window.ResizeObserver && paper) {
    new ResizeObserver(function () { fitCanvas(); }).observe(paper);
  }

  /* ---------------------------------------------------------------- shortcuts */
  document.addEventListener('keydown', function (event) {
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;
    if (typing) return;
    if (sheetLayer && !sheetLayer.hidden) return;
    if (document.body.classList.contains('quiz-live')) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.key.toLowerCase() === 'p') setTool('pen');
    if (event.key.toLowerCase() === 'h') setTool('marker');
    if (event.key.toLowerCase() === 'e') setTool('eraser');
  });

  /* -------------------------------------------------------------------- init */
  applyReactButton();
  applyBoardButton();
  loadSessionContext();

  /* Live 1:1 call. The existing floating PiP is the call surface; the SDK is
     loaded only on Join, and channel/uid/token always come from the server.
     Students start unlocked; an explicit trainer revoke forces tracks on. */
  applyMediaPermission(mediaPermission);
  setMicVisual(true);
  setCameraVisual(true);

  var classroomCall = window.mathifyClassroomAgora;
  if (classroomCall && typeof classroomCall.init === 'function') {
    classroomCall.init({
      sessionId: sessionId,
      statusNode: $('#agoraCallStatus'),
      micEnabled: micOn,
      cameraEnabled: camOn,
      networkReady: false,
      networkReason: 'Run the connection speed check before class.'
    });
  }
  if (networkState) applyNetworkState(networkState);
  if (window.mathifyNetworkCheck && typeof window.mathifyNetworkCheck.init === 'function') {
    window.mathifyNetworkCheck.init({
      sessionId: sessionId,
      api: classroomApi,
      button: $('#networkCheckBtn'),
      onState: applyNetworkState
    });
  }

  setTool('pen');
  setColor('ink');
  setPage(1);

  var startPage = Number(params.get('page'));
  if (startPage >= 1 && startPage <= 3) setPage(startPage);
  var startSheet = params.get('sheet');
  if (startSheet) {
    setTimeout(function () { openSheet('sheet-' + startSheet, null); }, 80);
  }

  requestAnimationFrame(function () {
    fitCanvas();
    renderChat();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fitCanvas(); });
  }

  /* -------------------------------------------------- concrete quick actions */
  function copyText(text, successMessage) {
    if (!text) { toast('Nothing available to copy yet.'); return Promise.resolve(false); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        toast(successMessage);
        return true;
      }).catch(function () {
        toast('Copy was blocked by the browser.');
        return false;
      });
    }
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    document.body.removeChild(field);
    toast(copied ? successMessage : 'Copy is unavailable in this browser.');
    return Promise.resolve(copied);
  }

  var copySessionLink = $('#copySessionLink');
  if (copySessionLink) {
    copySessionLink.addEventListener('click', function () {
      var base = window.location.origin + window.location.pathname;
      var link = sessionId
        ? base + '?sessionId=' + encodeURIComponent(sessionId) + '&view=student'
        : base + '?view=student';
      copyText(link, 'Student session link copied.');
    });
  }

  var copyRecordingLink = $('#copyRecordingLink');
  if (copyRecordingLink) {
    copyRecordingLink.addEventListener('click', function () {
      if (!sessionId || !classroomApi || typeof classroomApi.getSessionState !== 'function') {
        toast('Recording link is available when a live session is connected.');
        return;
      }
      classroomApi.getSessionState(sessionId).then(function (state) {
        copyText(state && state.recordingUrl, 'Recording link copied.');
      }).catch(function (error) {
        toast('Recording link is not ready yet: ' + error.message);
      });
    });
  }

  var notifyParentBtn = $('#notifyParentBtn');
  if (notifyParentBtn) {
    notifyParentBtn.addEventListener('click', function () {
      if (!sessionId || !classroomApi || typeof classroomApi.notifyParent !== 'function') {
        toast('Parent handoff needs a connected session.');
        return;
      }
      notifyParentBtn.disabled = true;
      classroomApi.notifyParent(sessionId, 'Your child is in a live 1-on-1 maths session.')
        .then(function (data) {
          var delivery = (data && data.delivery) || {};
          var sent = Boolean((delivery.slack && delivery.slack.sent) || (delivery.email && delivery.email.sent));
          toast(sent ? 'Parent recap sent.' : 'Recap prepared · parent messaging is not configured in this preview.');
        })
        .catch(function (error) { toast('Parent recap failed: ' + error.message); })
        .then(function () { notifyParentBtn.disabled = false; });
    });
  }

  var shareBoardBtn = $('#shareBoardBtn');
  if (shareBoardBtn) {
    shareBoardBtn.addEventListener('click', function () {
      setBoardShare(!sharing);
      if (!sessionId || !classroomApi || typeof classroomApi.shareBoard !== 'function') {
        toast(sharing ? 'Board sharing is on for this local preview.' : 'Board sharing stopped.');
        return;
      }
      classroomApi.shareBoard(sessionId, sharing).catch(function (error) {
        setBoardShare(!sharing);
        toast('Board sharing failed: ' + error.message);
      });
    });
  }

  /* Trainer-issued rewards. The catalog comes from public policy; the server
     validates the id and owns the label, point value and student trophy list. */
  var badgeSelect = $('#badgeSelect');
  var awardBadgeBtn = $('#awardBadgeBtn');
  if (classroomApi && typeof classroomApi.getPublicConfig === 'function') {
    classroomApi.getPublicConfig().then(function (config) {
      if (!badgeSelect || !Array.isArray(config.badges)) return;
      badgeSelect.innerHTML = '';
      config.badges.forEach(function (badge) {
        var option = document.createElement('option');
        option.value = badge.id;
        option.textContent = badge.label + ' · ' + badge.points + ' pts';
        badgeSelect.appendChild(option);
      });
    }).catch(function () { /* static options remain usable */ });
  }
  awardBadgeBtn && awardBadgeBtn.addEventListener('click', function () {
    if (!sessionId || !classroomApi || typeof classroomApi.awardBadge !== 'function') {
      toast('Badges can be awarded in a live session.');
      return;
    }
    var badgeId = badgeSelect && badgeSelect.value;
    if (!badgeId) { toast('Choose a badge first.'); return; }
    awardBadgeBtn.disabled = true;
    classroomApi.awardBadge(sessionId, badgeId).then(function (badge) {
      toast(badge.label + ' awarded · ' + badge.points + ' reward points.');
    }).catch(function (error) {
      toast('Badge award failed: ' + error.message);
    }).then(function () {
      awardBadgeBtn.disabled = false;
    });
  });

  var saveBoardBtn = $('#saveBoardBtn');
  if (saveBoardBtn && canvas) {
    saveBoardBtn.addEventListener('click', function () {
      if (typeof canvas.toBlob !== 'function') { toast('Board export is unavailable in this browser.'); return; }
      canvas.toBlob(function (blob) {
        if (!blob) { toast('Board export failed.'); return; }
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'mathify-board-' + (sessionId || 'session') + '.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast('Board saved as an image.');
      }, 'image/png');
    });
  }

  /* Shared hooks for the 1:1 session layer in session.js. */
  window.classroomSession = {
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    fitCanvas: fitCanvas,
    setPage: setPage,
    currentPage: function () { return page; },
    sessionId: sessionId,
    api: classroomApi,
    agora: window.mathifyClassroomAgora,
    studentName: function () { return studentName; },
    setStudentName: applyStudentName,
    applyMediaPermission: applyMediaPermission,
    mediaPermission: function () { return mediaPermission; },
    applyReactionPermission: applyReactionPermission,
    reactionPermission: function () { return reactionPermissionState; },
    applyNetworkState: applyNetworkState,
    networkState: function () { return networkState; }
  };

})();
