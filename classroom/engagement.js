/* ==========================================================================
   MATHIFY — classroom engagement layer
   Reactions and celebrations are deliberately separate UI layers. A reaction
   is a role-tagged gesture; a celebration is a server-owned recognition event.
   They never render at the same time, never touch camera or microphone tracks,
   and never carry correctness, hints or trainer notes.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var api = window.mathifyClassroomApi;
  var sessionId = window.MATHIFY_SESSION_ID ||
    new URLSearchParams(window.location.search).get('session') ||
    new URLSearchParams(window.location.search).get('sessionId') || null;
  var role = (window.MATHIFY_USER && window.MATHIFY_USER.role) || (api && api.role) || 'trainer';
  if (role === 'founder') role = 'trainer';
  var isStudent = new URLSearchParams(window.location.search).get('view') === 'student' ||
    new URLSearchParams(window.location.search).get('role') === 'student' || role === 'student';

  var STORE_PREF = 'mathify.engagement.pref.' + role;
  var STORE_SOUND = 'mathify.engagement.sound';

  var celebrationLayer = $('#celebrationLayer');
  var reactionLayer = $('#reactionLayer');
  var prefSelect = $('#celebrationPref');
  var soundButton = $('#engagementSoundBtn');
  var kudosButton = $('#sendKudosBtn');
  var studentTile = $('#studentTile');

  var config = null;
  var soundOn = readStore(STORE_SOUND) === 'on';
  var screenSharing = false;
  var applauseAllowed = true;
  var reactAllowed = true;
  var activeLayer = null;
  var activeTimer = null;
  var pendingReaction = null;
  var celebrationCount = 0;
  var lastCelebrationAt = 0;
  var audioContext = null;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function readStore(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  function writeStore(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* private mode */ }
  }
  function notify(message) {
    var bridge = window.classroomSession;
    if (bridge && typeof bridge.toast === 'function') bridge.toast(message);
  }
  function reducedMotion() {
    return Boolean(motionQuery && motionQuery.matches);
  }

  /* ------------------------------------------------------------ preferences */
  function defaultConfig() {
    return {
      version: 'fallback',
      types: [
        { id: 'paper_ribbons', label: 'Paper Ribbons', durationMs: 3000, sound: 'drum_roll_short' },
        { id: 'origami_balloons', label: 'Origami Balloons', durationMs: 3500, sound: 'chime_paper' },
        { id: 'torn_confetti', label: 'Torn Confetti', durationMs: 3200, sound: 'applause_soft' }
      ],
      preferences: {
        allowedOverrides: ['paper_ribbons', 'origami_balloons', 'torn_confetti'],
        priority: ['student', 'trainer', 'default']
      },
      throttle: { maxPerSession: 5, minGapBetweenMs: 3000 },
      accessibility: { respectReducedMotion: true }
    };
  }

  function populatePreferences() {
    if (!prefSelect) return;
    var source = config || defaultConfig();
    var allowed = source.preferences && Array.isArray(source.preferences.allowedOverrides)
      ? source.preferences.allowedOverrides : [];
    var types = Array.isArray(source.types) ? source.types : [];
    var current = readStore(STORE_PREF) || '';
    prefSelect.innerHTML = '';

    var fallback = document.createElement('option');
    fallback.value = '';
    fallback.textContent = 'Default (set by trainer policy)';
    prefSelect.appendChild(fallback);

    types.forEach(function (item) {
      if (!item || allowed.indexOf(item.id) < 0) return;
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label || item.id;
      prefSelect.appendChild(option);
    });
    prefSelect.value = allowed.indexOf(current) >= 0 ? current : '';
  }

  function applyApplauseAllowed(value) {
    applauseAllowed = value !== false;
    $$('[data-reaction="👏"][data-target="trainer"]').forEach(function (button) {
      if (!button.getAttribute('data-base-title')) {
        button.setAttribute('data-base-title', button.getAttribute('title') || 'Applaud your trainer');
      }
      button.disabled = !applauseAllowed;
      button.setAttribute('aria-pressed', String(applauseAllowed));
      button.title = applauseAllowed
        ? button.getAttribute('data-base-title')
        : 'Your trainer has paused applause for this session';
    });
  }

  function applyReactionAllowed(value) {
    reactAllowed = value !== false;
    $$('[data-reaction]:not([data-target="trainer"])').forEach(function (button) {
      button.disabled = !reactAllowed;
      button.setAttribute('aria-pressed', String(reactAllowed));
      button.title = reactAllowed
        ? (button.getAttribute('title') || 'Send a reaction')
        : 'Your trainer has paused emoji reactions for this session';
    });
  }

  function loadPermissionState() {
    if (!api || !sessionId || typeof api.getSessionState !== 'function') return;
    api.getSessionState(sessionId).then(function (state) {
      if (state && state.permissions) {
        applyApplauseAllowed(state.permissions.canStudentApplaud);
        applyReactionAllowed(state.permissions.canStudentReact);
      }
    }).catch(function () { /* keep the safe default */ });
  }

  function loadConfig() {
    if (!api || typeof api.getPublicConfig !== 'function') {
      config = defaultConfig();
      populatePreferences();
      return Promise.resolve(config);
    }
    return api.getPublicConfig().then(function (data) {
      config = (data && data.celebrations && Array.isArray(data.celebrations.types))
        ? data.celebrations : defaultConfig();
      populatePreferences();
      return config;
    }).catch(function () {
      config = defaultConfig();
      populatePreferences();
      return config;
    });
  }

  function preference() {
    return prefSelect ? prefSelect.value : (readStore(STORE_PREF) || '');
  }

  /* ------------------------------------------------------------------ sound */
  /* Sounds are synthesized locally with WebAudio. There are no audio assets,
     no network calls, no autoplay and no sound for reduced-motion users. The
     volume is capped at 0.6 by policy and scaled down further for a calm room. */
  function playSound(id) {
    if (!soundOn || screenSharing || reducedMotion() || !id) return;
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
      var volume = Math.max(0, Math.min(0.6, 0.16));
      var now = audioContext.currentTime;

      function tone(frequency, start, length, type, gain) {
        var osc = audioContext.createOscillator();
        var amp = audioContext.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(frequency, now + start);
        amp.gain.setValueAtTime(0.0001, now + start);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * (gain || 1)), now + start + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
        osc.connect(amp);
        amp.connect(audioContext.destination);
        osc.start(now + start);
        osc.stop(now + start + length + 0.03);
      }

      if (id === 'drum_roll_short' || id === 'tabla_pulse') {
        [0, 0.16, 0.32, 0.48].forEach(function (start, index) {
          tone(150 + index * 18, start, 0.14, 'sine', 1);
        });
      } else if (id === 'chime_paper' || id === 'welcome_bell') {
        tone(660, 0, 0.6, 'triangle', 0.7);
        tone(880, 0.08, 0.5, 'triangle', 0.5);
      } else if (id === 'sparkle') {
        [880, 1046, 1318].forEach(function (frequency, index) {
          tone(frequency, index * 0.1, 0.16, 'sine', 0.5);
        });
      } else if (id === 'applause_soft') {
        /* Three quiet filtered-style bursts without loading any asset. */
        [0, 0.22, 0.44].forEach(function (start) {
          tone(320, start, 0.1, 'triangle', 0.35);
          tone(430, start + 0.04, 0.08, 'triangle', 0.25);
        });
      } else if (id === 'ui_click_soft') {
        tone(520, 0, 0.08, 'sine', 0.3);
      }
    } catch (error) { /* audio is an optional enhancement */ }
  }

  function renderSoundButton() {
    if (!soundButton) return;
    soundButton.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundButton.setAttribute('aria-pressed', String(soundOn));
    soundButton.title = soundOn
      ? 'Celebration sound is on for this device. Turn it off any time.'
      : 'Celebration sound is off. Turn it on to hear quiet recognition sounds.';
  }

  function toggleSound() {
    soundOn = !soundOn;
    writeStore(STORE_SOUND, soundOn ? 'on' : 'off');
    renderSoundButton();
    if (soundOn) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        try {
          if (!audioContext) audioContext = new AudioCtor();
          if (audioContext.state === 'suspended') audioContext.resume();
        } catch (error) { /* ignore */ }
      }
    }
    notify(soundOn ? 'Celebration sound on for this device.' : 'Celebration sound off.');
  }

  /* ------------------------------------------------------------------ layers */
  function resetLayers() {
    activeLayer = null;
    if (celebrationLayer) {
      celebrationLayer.hidden = true;
      celebrationLayer.innerHTML = '';
    }
    if (reactionLayer) {
      reactionLayer.hidden = true;
      reactionLayer.innerHTML = '';
    }
    if (studentTile) {
      studentTile.classList.remove('is-spotlight');
      var badge = $('.spotlight-badge', studentTile);
      if (badge) badge.remove();
    }
  }

  function flushPendingReaction() {
    if (!pendingReaction) return;
    var payload = pendingReaction;
    pendingReaction = null;
    renderReaction(payload);
  }

  function clearActive() {
    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    resetLayers();
    flushPendingReaction();
  }

  function activateLayer(name, durationMs) {
    if (activeTimer) clearTimeout(activeTimer);
    activeLayer = name;
    var safeDuration = Math.max(400, Math.min(5000, Number(durationMs) || 3000));
    activeTimer = setTimeout(clearActive, safeDuration);
  }

  /* ------------------------------------------------------------ celebration */
  function piece(type, colorKey) {
    var el = document.createElement('span');
    el.className = 'celebration-piece is-' + type + ' tone-' + colorKey;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function renderCelebration(payload) {
    if (!payload || !celebrationLayer) return;
    var type = String(payload.celebrationType || '');
    var source = config || defaultConfig();
    var known = (Array.isArray(source.types) ? source.types : []).some(function (item) {
      return item && item.id === type;
    });
    if (!known) return;

    var now = Date.now();
    var limits = source.throttle || { maxPerSession: 5, minGapBetweenMs: 3000 };
    var max = Number(limits.maxPerSession) || 5;
    var gap = Number(limits.minGapBetweenMs) || 3000;
    if (celebrationCount >= max || (lastCelebrationAt && now - lastCelebrationAt < gap)) return;
    celebrationCount += 1;
    lastCelebrationAt = now;

    /* Only one layer is ever visible. An in-flight or queued reaction is
       dropped when a trainer recognition moment takes precedence. */
    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    pendingReaction = null;
    resetLayers();
    var animation = payload.animation || {};
    var duration = Number(animation.durationMs) || 3000;
    var spotlight = payload.spotlight || {};
    var badgeText = String(spotlight.badgeText || 'Well done').slice(0, 120);

    celebrationLayer.hidden = false;
    celebrationLayer.setAttribute('role', 'status');
    celebrationLayer.setAttribute('aria-live', 'polite');

    var badge = document.createElement('span');
    badge.className = 'engagement-badge';
    badge.textContent = badgeText;
    celebrationLayer.appendChild(badge);

    if (!reducedMotion()) {
      var colors = Array.isArray(animation.colors) && animation.colors.length
        ? animation.colors : ['coral', 'ink', 'paper'];
      var count = Math.max(6, Math.min(90, Number(animation.count) || 20));
      var fragment = document.createDocumentFragment();
      for (var index = 0; index < count; index += 1) {
        var item = piece(type, colors[index % colors.length]);
        item.style.setProperty('--piece-delay', ((index % 12) * 0.07).toFixed(2) + 's');
        item.style.setProperty('--piece-x', ((index * 37) % 100) + '%');
        item.style.setProperty('--piece-drift', ((index % 5) * 12 - 24) + 'px');
        fragment.appendChild(item);
      }
      celebrationLayer.appendChild(fragment);
      playSound(payload.sound && payload.sound.id);
    }

    if (spotlight.enabled && studentTile) {
      studentTile.classList.add('is-spotlight');
      var tileBadge = document.createElement('span');
      tileBadge.className = 'spotlight-badge';
      tileBadge.textContent = badgeText;
      studentTile.appendChild(tileBadge);
    }

    activateLayer('celebration', duration);
  }

  /* --------------------------------------------------------------- reactions */
  function renderReaction(payload) {
    if (!payload || !reactionLayer) return;
    var emoji = String(payload.emoji || '');
    if (['💡', '🤔', '✅', '👏', '⭐', '🎯'].indexOf(emoji) < 0) return;

    /* A gesture during a celebration is queued, never drawn over it. The
       celebration timer flushes it after the shared spotlight has cleared. */
    if (activeLayer === 'celebration') {
      pendingReaction = payload;
      return;
    }
    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    resetLayers();
    reactionLayer.hidden = false;
    reactionLayer.setAttribute('role', 'status');
    reactionLayer.setAttribute('aria-live', 'polite');
    var chip = document.createElement('span');
    chip.className = 'reaction-chip';
    chip.textContent = emoji;
    var label = document.createElement('span');
    label.className = 'visually-hidden';
    var audience = payload.toRole === 'trainer'
      ? ' for the trainer'
      : payload.toRole === 'student' ? ' for the student' : '';
    label.textContent = (payload.fromRole === 'student' ? 'Student' : 'Trainer') +
      ' reaction' + audience;
    chip.appendChild(label);
    reactionLayer.appendChild(chip);
    activateLayer('reaction', 1400);
  }

  /* ------------------------------------------------------------------ events */
  function sendReaction(emoji) {
    if (emoji === '👏' && isStudent && !applauseAllowed) {
      notify('Your trainer has paused applause for this session.');
      return;
    }
    if (!api || !sessionId || typeof api.sendReaction !== 'function') return;
    api.sendReaction(sessionId, emoji).catch(function (error) {
      notify(error && error.message ? error.message : 'Reaction could not be sent.');
    });
  }

  function sendKudos() {
    if (!api || !sessionId || typeof api.sendCelebration !== 'function') return;
    api.sendCelebration(sessionId, 'trainer_kudos', preference()).then(function (result) {
      if (result && result.fired === false) notify('Please wait a moment before another celebration.');
    }).catch(function (error) {
      notify(error && error.message ? error.message : 'Celebration could not be sent.');
    });
  }

  function bindControls() {
    $$('[data-reaction]').forEach(function (button) {
      button.addEventListener('click', function () { sendReaction(button.getAttribute('data-reaction')); });
    });
    if (prefSelect) {
      prefSelect.addEventListener('change', function () { writeStore(STORE_PREF, prefSelect.value); });
    }
    if (soundButton) soundButton.addEventListener('click', toggleSound);
    if (kudosButton) kudosButton.addEventListener('click', sendKudos);
    if (studentTile) {
      /* A spotlight is a visual overlay only. It must not enable a camera. */
      var videos = studentTile.querySelectorAll('video');
      if (videos.length && !reducedMotion()) studentTile.classList.add('has-video');
    }
  }

  renderSoundButton();
  bindControls();
  loadConfig();
  loadPermissionState();

  window.classroomEngagement = {
    onCelebration: renderCelebration,
    onReaction: renderReaction,
    onReactionPermission: function (value) {
      var source = value || {};
      applyApplauseAllowed(source.studentCanApplaud);
      applyReactionAllowed(source.studentCanReact);
    },
    setApplauseAllowed: applyApplauseAllowed,
    setReactionAllowed: applyReactionAllowed,
    setScreenSharing: function (value) {
      screenSharing = Boolean(value);
      if (screenSharing && soundOn) notify('Celebration sound paused while sharing.');
    },
    isScreenSharing: function () { return screenSharing; },
    isSoundOn: function () { return soundOn; },
    reducedMotion: reducedMotion,
    preference: preference,
    clear: clearActive
  };
})();
