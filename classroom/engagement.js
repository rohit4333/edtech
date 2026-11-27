/* ==========================================================================
   MATHIFY — classroom engagement layer
   Reactions are role-tagged gestures that render as a full-screen, layered
   celebration on both sides. Celebrations are server-owned recognition events.
   Both use the same Paper & Ink stage, never touch camera or microphone tracks,
   never carry correctness/hints/trainer notes, and always play a locally
   synthesised sound. There is no mute control.
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
  var celebrationLayer = $('#celebrationLayer');
  var reactionLayer = $('#reactionLayer');
  var kudosButton = $('#sendKudosBtn');
  var studentTile = $('#studentTile');

  var EMOJIS = ['💡', '🤔', '✅', '👏', '⭐', '🎯', '🎉', '🥳', '❤️', '🔥'];
  var PARTICLE_EMOJIS = ['🎉', '🥳', '👏', '⭐', '✨', '🎊', '💛', '🔥'];
  var STYLE_EMOJI = {
    paper_ribbons: '🎊',
    origami_balloons: '🎈',
    drum_pulse: '🥁',
    star_shower: '⭐',
    torn_confetti: '🎉',
    milestone_seal: '🏅'
  };
  var EMOJI_STYLE = {
    '💡': 'paper_ribbons', '🤔': 'origami_balloons', '✅': 'drum_pulse',
    '👏': 'torn_confetti', '⭐': 'star_shower', '🎯': 'milestone_seal',
    '🎉': 'torn_confetti', '🥳': 'star_shower', '❤️': 'paper_ribbons', '🔥': 'drum_pulse'
  };

  var config = null;
  var soundOn = true;
  var screenSharing = false;
  var applauseAllowed = true;
  var reactAllowed = true;
  var activeLayer = null;
  var activeTimer = null;
  var pendingReaction = null;
  var celebrationCount = 0;
  var lastCelebrationAt = 0;
  var lastLocalFireAt = 0;
  var lastLocalType = '';
  var lastLocalReactionAt = 0;
  var lastLocalReactionEmoji = '';
  var audioContext = null;
  var stylePreference = readStore(STORE_PREF) || '';
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

  function unlockAudio() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (error) { /* audio is an optional enhancement */ }
  }

  /* Sound is synthesised locally from allowed ids. No asset, no network call,
     no toggle: every reaction and celebration plays a quiet, capped cue. */
  function playSound(id, volumeValue) {
    if (!id) return;
    unlockAudio();
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor || !audioContext) return;
    try {
      var volume = Math.max(0, Math.min(0.6, Number(volumeValue) || 0.32));
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
        [0, 0.13, 0.26, 0.39, 0.52].forEach(function (start, index) {
          tone(150 + index * 18, start, 0.13, 'sine', 1);
        });
      } else if (id === 'chime_paper' || id === 'welcome_bell') {
        tone(660, 0, 0.6, 'triangle', 0.7);
        tone(880, 0.08, 0.5, 'triangle', 0.5);
        tone(1046, 0.17, 0.42, 'triangle', 0.35);
      } else if (id === 'sparkle') {
        [880, 1046, 1318, 1568].forEach(function (frequency, index) {
          tone(frequency, index * 0.08, 0.18, 'sine', 0.5);
        });
      } else if (id === 'applause_soft') {
        [0, 0.18, 0.36, 0.54].forEach(function (start) {
          tone(320, start, 0.1, 'triangle', 0.35);
          tone(430, start + 0.04, 0.08, 'triangle', 0.25);
        });
      } else if (id === 'ui_click_soft') {
        tone(520, 0, 0.08, 'sine', 0.3);
      }
    } catch (error) { /* audio is an optional enhancement */ }
  }

  /* ------------------------------------------------------------ preferences */
  function defaultConfig() {
    return {
      version: 'fallback',
      types: [
        { id: 'paper_ribbons', label: 'Paper Ribbons', durationMs: 3000, sound: 'drum_roll_short' },
        { id: 'origami_balloons', label: 'Origami Balloons', durationMs: 3500, sound: 'chime_paper' },
        { id: 'drum_pulse', label: 'Drum Pulse', durationMs: 2500, sound: 'tabla_pulse' },
        { id: 'star_shower', label: 'Star Shower', durationMs: 2800, sound: 'sparkle' },
        { id: 'torn_confetti', label: 'Torn Confetti', durationMs: 3200, sound: 'applause_soft' },
        { id: 'milestone_seal', label: 'Milestone Seal', durationMs: 4000, sound: 'welcome_bell' }
      ],
      preferences: {
        allowedOverrides: ['paper_ribbons', 'origami_balloons', 'drum_pulse', 'star_shower', 'torn_confetti', 'milestone_seal'],
        priority: ['student', 'trainer', 'default']
      },
      throttle: { maxPerSession: 5, minGapBetweenMs: 3000 },
      accessibility: { respectReducedMotion: true, localMuteAllowed: false }
    };
  }

  function syncStyleButtons() {
    var source = config || defaultConfig();
    var allowed = source.preferences && Array.isArray(source.preferences.allowedOverrides)
      ? source.preferences.allowedOverrides : [];
    $$('[data-celebration-style]').forEach(function (button) {
      var id = button.getAttribute('data-celebration-style');
      button.hidden = allowed.length > 0 && allowed.indexOf(id) < 0;
      button.setAttribute('aria-pressed', String(stylePreference === id));
    });
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
      syncStyleButtons();
      return Promise.resolve(config);
    }
    return api.getPublicConfig().then(function (data) {
      config = (data && data.celebrations && Array.isArray(data.celebrations.types))
        ? data.celebrations : defaultConfig();
      syncStyleButtons();
      return config;
    }).catch(function () {
      config = defaultConfig();
      syncStyleButtons();
      return config;
    });
  }

  function preference() {
    return stylePreference;
  }

  function typeConfig(type) {
    var types = (config && Array.isArray(config.types)) ? config.types : defaultConfig().types;
    return types.find(function (item) { return item && item.id === type; }) || null;
  }

  /* ------------------------------------------------------------------ layers */
  function resetLayers() {
    activeLayer = null;
    if (celebrationLayer) {
      celebrationLayer.hidden = true;
      celebrationLayer.className = 'engagement-layer';
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

  function el(className, text) {
    var node = document.createElement('span');
    node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setParticleStyles(node, options) {
    node.style.setProperty('--px', String(options.px) + '%');
    node.style.setProperty('--py', String(options.py) + '%');
    node.style.setProperty('--dx', String(options.dx) + 'px');
    node.style.setProperty('--dy', String(options.dy) + 'px');
    node.style.setProperty('--rot', String(options.rot) + 'deg');
    node.style.setProperty('--size', String(options.size) + 'px');
    node.style.setProperty('--delay', (Number(options.delay) || 0).toFixed(2) + 's');
    node.style.setProperty('--dur', (Number(options.dur) || 2.4).toFixed(2) + 's');
  }

  function addEmojiWaves(stage, emoji, count) {
    var fragment = document.createDocumentFragment();
    for (var index = 0; index < count; index += 1) {
      var wave = index % 3;
      var node = el('emoji-particle ' + (wave === 0 ? 'emoji-rise' : wave === 1 ? 'emoji-fall' : 'emoji-burst'));
      node.setAttribute('aria-hidden', 'true');
      node.textContent = index % 3 === 0 ? emoji : PARTICLE_EMOJIS[index % PARTICLE_EMOJIS.length];
      var px = wave === 2 ? 50 : 5 + ((index * 37) % 90);
      var py = wave === 1 ? -8 : wave === 2 ? 56 : 30 + ((index * 19) % 55);
      var angle = ((index * 47) % 360) * Math.PI / 180;
      var radius = 90 + ((index * 29) % 180);
      setParticleStyles(node, {
        px: px,
        py: py,
        dx: wave === 2 ? Math.round(Math.cos(angle) * radius) : ((index % 5) * 18 - 36),
        dy: wave === 0 ? -60 - ((index % 4) * 28) : wave === 1 ? window.innerHeight + 80 : Math.round(Math.sin(angle) * radius),
        rot: (index % 2 ? 1 : -1) * (30 + (index % 7) * 18),
        size: 24 + (index % 6) * 4,
        delay: (index % 10) * 0.075,
        dur: 1.9 + (index % 5) * 0.16
      });
      fragment.appendChild(node);
    }
    stage.appendChild(fragment);
  }

  function addStyleLayer(stage, type, colors, count) {
    var palette = Array.isArray(colors) && colors.length ? colors : ['coral', 'ink', 'paper'];
    var fragment = document.createDocumentFragment();
    for (var index = 0; index < count; index += 1) {
      var node = el('celebration-piece is-' + type + ' tone-' + palette[index % palette.length]);
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('--piece-delay', ((index % 14) * 0.055).toFixed(2) + 's');
      node.style.setProperty('--piece-x', ((index * 41) % 100) + '%');
      node.style.setProperty('--piece-drift', ((index % 7) * 12 - 36) + 'px');
      fragment.appendChild(node);
    }
    stage.appendChild(fragment);
  }

  function renderCelebrationScene(options) {
    if (!celebrationLayer) return;
    var source = options || {};
    var type = String(source.type || 'paper_ribbons');
    var duration = Math.max(400, Math.min(5000, Number(source.durationMs) || 3000));
    var badgeText = String(source.badgeText || 'Celebrate').slice(0, 120);
    var hero = String(source.emoji || STYLE_EMOJI[type] || '🎉').slice(0, 8);

    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    pendingReaction = null;
    resetLayers();

    celebrationLayer.hidden = false;
    celebrationLayer.className = 'engagement-layer is-' + (source.kind === 'emoji' ? 'emoji' : 'style');
    celebrationLayer.setAttribute('role', 'status');
    celebrationLayer.setAttribute('aria-live', 'polite');

    var stage = el('celebration-stage');
    stage.appendChild(el('celebration-wash'));
    [0, 1, 2].forEach(function (index) {
      var ring = el('celebration-ring ring-' + index);
      ring.setAttribute('aria-hidden', 'true');
      stage.appendChild(ring);
    });

    var badge = el('engagement-badge');
    badge.appendChild(el('celebration-hero', hero));
    badge.appendChild(el('celebration-copy', badgeText));
    stage.appendChild(badge);

    if (!reducedMotion()) {
      addEmojiWaves(stage, String(source.particleEmoji || hero), Math.max(18, Math.min(48, Number(source.count) || 30)));
      addStyleLayer(stage, type, source.colors, Math.max(8, Math.min(90, Number(source.styleCount) || 24)));
    }

    celebrationLayer.appendChild(stage);
    var item = typeConfig(type);
    playSound(source.soundId || (item && item.sound) || 'sparkle', source.volume);

    if (source.spotlight && studentTile) {
      studentTile.classList.add('is-spotlight');
      var tileBadge = el('spotlight-badge', badgeText);
      studentTile.appendChild(tileBadge);
    }

    activateLayer('celebration', duration);
  }

  /* ------------------------------------------------------------ celebration */
  function renderCelebration(payload) {
    if (!payload || !celebrationLayer) return;
    var type = String(payload.celebrationType || '');
    /* A locally fired animation already played. Ignore its own server echo. */
    if (lastLocalFireAt && Date.now() - lastLocalFireAt < 1200 && type === lastLocalType) return;
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

    var animation = payload.animation || {};
    var spotlight = payload.spotlight || {};
    var item = typeConfig(type) || {};
    renderCelebrationScene({
      kind: 'style',
      type: type,
      emoji: STYLE_EMOJI[type],
      badgeText: String(spotlight.badgeText || item.label || 'Well done'),
      durationMs: Number(animation.durationMs) || Number(item.durationMs) || 3000,
      colors: Array.isArray(animation.colors) && animation.colors.length ? animation.colors : ['coral', 'ink', 'paper'],
      count: 30,
      styleCount: Math.max(12, Math.min(90, Number(animation.count) || 24)),
      soundId: payload.sound && payload.sound.id ? payload.sound.id : item.sound,
      volume: payload.sound && payload.sound.volume,
      spotlight: spotlight.enabled === true
    });
  }

  /* --------------------------------------------------------------- reactions */
  function renderReaction(payload, force) {
    if (!payload || !celebrationLayer) return;
    var emoji = String(payload.emoji || '');
    if (EMOJIS.indexOf(emoji) < 0) return;
    /* Ignore the echo of a gesture this tab already animated locally. */
    if (!force && payload.fromRole === role && lastLocalReactionAt &&
        Date.now() - lastLocalReactionAt < 1000 && emoji === lastLocalReactionEmoji) return;

    /* A remote gesture during a celebration is queued, never drawn over it.
       A local click always animates immediately, like Meet/Zoom reactions. */
    if (!force && activeLayer === 'celebration') {
      pendingReaction = payload;
      return;
    }

    var type = EMOJI_STYLE[emoji] || 'paper_ribbons';
    var item = typeConfig(type) || {};
    var audience = payload.toRole === 'trainer'
      ? ' for the trainer'
      : payload.toRole === 'student' ? ' for the student' : '';
    var sender = payload.fromRole === 'student' ? 'Student' : 'Trainer';
    renderCelebrationScene({
      kind: 'emoji',
      type: type,
      emoji: emoji,
      particleEmoji: emoji,
      badgeText: sender + ' celebration' + audience,
      durationMs: 2600,
      colors: ['coral', 'ink', 'paper'],
      count: 36,
      styleCount: 18,
      soundId: item.sound || 'sparkle'
    });
  }

  /* ------------------------------------------------------------------ events */
  function sendReaction(emoji) {
    if (emoji === '👏' && isStudent && !applauseAllowed) {
      notify('Your trainer has paused applause for this session.');
      return;
    }
    if (emoji !== '👏' && isStudent && !reactAllowed) {
      notify('Your trainer has paused emoji reactions for this session.');
      return;
    }
    unlockAudio();
    playSound('ui_click_soft', 0.18);
    renderReaction({
      emoji: emoji,
      fromRole: role,
      toRole: emoji === '👏' ? (isStudent ? 'trainer' : 'student') : 'room'
    }, true);
    lastLocalReactionAt = Date.now();
    lastLocalReactionEmoji = emoji;
    if (!api || !sessionId || typeof api.sendReaction !== 'function') return;
    api.sendReaction(sessionId, emoji).catch(function (error) {
      notify(error && error.message ? error.message : 'Reaction could not be sent.');
    });
  }

  function fireCelebration(type) {
    if (isStudent) return;
    unlockAudio();
    playSound('ui_click_soft', 0.18);
    var selected = type || 'star_shower';
    var item = typeConfig(selected) || {};
    renderCelebrationScene({
      kind: 'style',
      type: selected,
      emoji: STYLE_EMOJI[selected],
      badgeText: item.label || 'Star moment',
      durationMs: Number(item.durationMs) || 3000,
      colors: ['coral', 'ink', 'paper'],
      count: 30,
      styleCount: 24,
      soundId: item.sound || 'sparkle'
    });
    lastLocalFireAt = Date.now();
    lastLocalType = selected;
    if (!api || !sessionId || typeof api.sendCelebration !== 'function') return;
    api.sendCelebration(sessionId, 'trainer_kudos', type || '').catch(function (error) {
      notify(error && error.message ? error.message : 'Celebration could not be sent.');
    });
  }

  function sendStyle(type) {
    stylePreference = type;
    writeStore(STORE_PREF, type);
    syncStyleButtons();
    fireCelebration(type);
  }

  function sendKudos() {
    fireCelebration(preference() || 'star_shower');
  }

  function bindControls() {
    $$('[data-reaction]').forEach(function (button) {
      button.addEventListener('click', function () { sendReaction(button.getAttribute('data-reaction')); });
    });
    $$('[data-celebration-style]').forEach(function (button) {
      button.addEventListener('click', function () { sendStyle(button.getAttribute('data-celebration-style')); });
    });
    if (kudosButton) kudosButton.addEventListener('click', sendKudos);
    if (studentTile) {
      /* A spotlight is a visual overlay only. It must not enable a camera. */
      var videos = studentTile.querySelectorAll('video');
      if (videos.length && !reducedMotion()) studentTile.classList.add('has-video');
    }
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);
  }

  syncStyleButtons();
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
    setScreenSharing: function (value) { screenSharing = Boolean(value); },
    isScreenSharing: function () { return screenSharing; },
    isSoundOn: function () { return soundOn; },
    reducedMotion: reducedMotion,
    preference: preference,
    fireCelebration: fireCelebration,
    clear: clearActive
  };
})();
