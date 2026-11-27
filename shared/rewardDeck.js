/* ==========================================================================
   MATHIFY — trainer celebration deck for live session pages
   The trainer dashboard and camera check page load this deck, but it mounts
   only after the server confirms the session is live. It never mounts before
   the session starts or on student surfaces. The 1:1 classroom owns its own
   engagement bar. Every click animates locally first, then sends an allowlisted
   event. Sound is always on and volume-capped; there is no mute toggle.
   ========================================================================== */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var connectPage = document.body.classList.contains('connect-page') ||
    /\/connect\.html$/.test(window.location.pathname);
  var trainerDashboard = /(^|\/)trainer\//.test(window.location.pathname);
  var trainerSurface = connectPage || trainerDashboard;
  var studentView = params.get('view') === 'student' || params.get('role') === 'student' ||
    (window.MATHIFY_USER && window.MATHIFY_USER.role === 'student') ||
    /(^|\/)student\//.test(window.location.pathname);
  var trainerCredential = false;
  try {
    trainerCredential = Boolean(
      window.localStorage.getItem('mathify.trainer.token') ||
      window.localStorage.getItem('mathify.classroom.token.trainer') ||
      window.localStorage.getItem('mathify.classroom.token.founder')
    );
  } catch (error) { /* private mode; role params still work */ }
  var declaredRole = params.get('role') ||
    (window.MATHIFY_USER && window.MATHIFY_USER.role) ||
    (trainerCredential ? 'trainer' : '');
  var sessionLive = false;

  if (!trainerSurface || studentView ||
      !(declaredRole === 'trainer' || declaredRole === 'founder') || !trainerCredential) return;
  /* The 1:1 classroom already owns a richer engagement bar. Never double it. */
  if (document.querySelector('[data-celebration-style]')) return;

  var STYLES = [
    { id: 'paper_ribbons', label: 'Paper ribbons', emoji: '🎊',
      icon: '<path d="M4 7c3-3 5 3 8 0s5 3 8 0M4 13c3-3 5 3 8 0s5 3 8 0M8 4l-2 16M16 4l2 16"/>' },
    { id: 'origami_balloons', label: 'Origami balloons', emoji: '🎈',
      icon: '<path d="M12 3 18 9 12 17 6 9Z"/><path d="M12 3v14M6 9h12"/>' },
    { id: 'drum_pulse', label: 'Drum pulse', emoji: '🥁',
      icon: '<ellipse cx="12" cy="9" rx="7" ry="3"/><path d="M5 9v6c0 1.7 3.1 3 7 3s7-1.3 7-3V9"/>' },
    { id: 'star_shower', label: 'Star shower', emoji: '⭐',
      icon: '<path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/>' },
    { id: 'torn_confetti', label: 'Torn confetti', emoji: '🎉',
      icon: '<path d="M5 4l4 4M15 3l-1 5M20 9l-5 2M18 19l-4-3M7 20l3-5M3 12h5"/><circle cx="12" cy="12" r="1.3"/>' },
    { id: 'milestone_seal', label: 'Milestone seal', emoji: '🏅',
      icon: '<circle cx="12" cy="13" r="7"/><path d="M9 3l1.5 4h3L15 3M9 13l2 2 4-4"/>' }
  ];
  var EMOJIS = ['👏', '⭐', '🎯', '🎉', '🥳', '🔥'];
  var PARTICLE_EMOJIS = ['🎉', '🥳', '👏', '⭐', '✨', '🎊', '🔥'];
  var EMOJI_STYLE = {
    '👏': 'torn_confetti', '⭐': 'star_shower', '🎯': 'milestone_seal',
    '🎉': 'torn_confetti', '🥳': 'star_shower', '🔥': 'drum_pulse'
  };

  var deck = null;
  var stage = null;
  var stageTimer = null;
  var audioBound = false;
  var stylePreference = '';
  var audioContext = null;

  function sessionId() {
    return params.get('sessionId') || params.get('session') || window.MATHIFY_SESSION_ID || null;
  }

  function unlockAudio() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch (error) { /* audio is an optional enhancement */ }
  }

  /* Always-on, locally synthesised cue. No asset, no network call, no toggle. */
  function playSound() {
    unlockAudio();
    if (!audioContext) return;
    try {
      var volume = Math.max(0, Math.min(0.6, 0.3));
      var now = audioContext.currentTime;
      [660, 880, 1046].forEach(function (frequency, index) {
        var osc = audioContext.createOscillator();
        var amp = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, now + index * 0.07);
        amp.gain.setValueAtTime(0.0001, now + index * 0.07);
        amp.gain.exponentialRampToValueAtTime(volume * (0.7 - index * 0.12), now + index * 0.07 + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.07 + 0.42);
        osc.connect(amp);
        amp.connect(audioContext.destination);
        osc.start(now + index * 0.07);
        osc.stop(now + index * 0.07 + 0.46);
      });
    } catch (error) { /* audio is an optional enhancement */ }
  }

  function particle(index, emoji) {
    var node = document.createElement('span');
    var wave = index % 3;
    var angle = ((index * 47) % 360) * Math.PI / 180;
    var radius = 90 + ((index * 29) % 180);
    node.className = 'rd-particle ' + (wave === 0 ? 'rd-rise' : wave === 1 ? 'rd-fall' : 'rd-burst');
    node.setAttribute('aria-hidden', 'true');
    node.textContent = index % 3 === 0 ? emoji : PARTICLE_EMOJIS[index % PARTICLE_EMOJIS.length];
    node.style.setProperty('--px', String(wave === 2 ? 50 : 5 + ((index * 37) % 90)) + '%');
    node.style.setProperty('--py', String(wave === 1 ? -8 : wave === 2 ? 56 : 30 + ((index * 19) % 55)) + '%');
    node.style.setProperty('--dx', String(wave === 2
      ? Math.round(Math.cos(angle) * radius)
      : ((index % 5) * 18 - 36)) + 'px');
    node.style.setProperty('--dy', String(wave === 0
      ? -60 - ((index % 4) * 28)
      : wave === 1 ? window.innerHeight + 80 : Math.round(Math.sin(angle) * radius)) + 'px');
    node.style.setProperty('--rot', String((index % 2 ? 1 : -1) * (30 + (index % 7) * 18)) + 'deg');
    node.style.setProperty('--size', String(24 + (index % 6) * 4) + 'px');
    node.style.setProperty('--delay', ((index % 10) * 0.075).toFixed(2) + 's');
    node.style.setProperty('--dur', (1.9 + (index % 5) * 0.16).toFixed(2) + 's');
    return node;
  }

  function show(emoji, badgeText) {
    if (!stage) return;
    if (stageTimer) { clearTimeout(stageTimer); stageTimer = null; }
    stage.innerHTML = '';
    stage.hidden = false;
    stage.setAttribute('role', 'status');
    stage.setAttribute('aria-live', 'polite');

    var inner = document.createElement('div');
    inner.className = 'rd-stage-inner';
    var wash = document.createElement('span');
    wash.className = 'rd-wash';
    inner.appendChild(wash);
    [0, 1, 2].forEach(function (index) {
      var ring = document.createElement('span');
      ring.className = 'rd-ring rd-ring-' + index;
      ring.setAttribute('aria-hidden', 'true');
      inner.appendChild(ring);
    });
    var badge = document.createElement('span');
    badge.className = 'rd-badge';
    var hero = document.createElement('span');
    hero.className = 'rd-hero';
    hero.textContent = String(emoji || '🎉').slice(0, 8);
    var copy = document.createElement('span');
    copy.className = 'rd-copy';
    copy.textContent = String(badgeText || 'Celebrate').slice(0, 120);
    badge.appendChild(hero);
    badge.appendChild(copy);
    inner.appendChild(badge);

    var fragment = document.createDocumentFragment();
    for (var index = 0; index < 36; index += 1) fragment.appendChild(particle(index, hero.textContent));
    inner.appendChild(fragment);
    stage.appendChild(inner);
    playSound();
    stageTimer = setTimeout(function () {
      stage.hidden = true;
      stage.innerHTML = '';
      stageTimer = null;
    }, 3200);
  }

  function post(path, body) {
    var id = sessionId();
    if (!id) return;
    if (window.mathifyClassroomApi && typeof window.mathifyClassroomApi.sendCelebration === 'function' &&
        path.indexOf('/celebrate') >= 0) {
      return window.mathifyClassroomApi.sendCelebration(id, 'trainer_kudos', body.trainerPref || '');
    }
    if (window.mathifyClassroomApi && typeof window.mathifyClassroomApi.sendReaction === 'function' &&
        path.indexOf('/reactions') >= 0) {
      return window.mathifyClassroomApi.sendReaction(id, body.emoji);
    }
    if (window.mathifyTrainerApi && typeof window.mathifyTrainerApi.request === 'function') {
      return window.mathifyTrainerApi.request('/sessions/' + encodeURIComponent(id) + path, {
        method: 'POST',
        body: body
      });
    }
  }

  function fireStyle(id) {
    var style = STYLES.find(function (item) { return item.id === id; }) || STYLES[3];
    stylePreference = style.id;
    if (deck) {
      Array.prototype.forEach.call(deck.querySelectorAll('[data-rd-style]'), function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-rd-style') === style.id));
      });
    }
    show(style.emoji, style.label);
    post('/celebrate', { trigger: 'trainer_kudos', trainerPref: style.id });
  }

  function fireReaction(emoji) {
    var safeEmoji = EMOJIS.indexOf(emoji) >= 0 ? emoji : '🎉';
    show(safeEmoji, 'Trainer celebration');
    post('/reactions', { emoji: safeEmoji });
  }

  function canMount() {
    return Boolean(trainerSurface && sessionLive && sessionId());
  }

  function mount() {
    if (!canMount() || deck) return false;
    deck = document.createElement('div');
    deck.className = 'reward-deck';
    deck.id = 'rewardDeck';
    deck.setAttribute('role', 'group');
    deck.setAttribute('aria-label', 'Celebration controls');
    deck.innerHTML = '<div class="rd-set" aria-label="Trainer reactions">' +
      EMOJIS.map(function (emoji) {
        return '<button type="button" class="rd-btn rd-emoji" data-rd-emoji="' + emoji + '" ' +
          'aria-label="Celebrate with ' + emoji + '" title="Celebrate with ' + emoji + '">' + emoji + '</button>';
      }).join('') + '</div>' +
      '<div class="rd-set" aria-label="Celebration styles">' +
      STYLES.map(function (style) {
        return '<button type="button" class="rd-btn rd-style" data-rd-style="' + style.id + '" ' +
          'aria-label="' + style.label + ' celebration" title="' + style.label + '" aria-pressed="false">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + style.icon + '</svg></button>';
      }).join('') + '</div>';
    document.body.appendChild(deck);

    stage = document.createElement('div');
    stage.className = 'rd-stage';
    stage.id = 'rewardStage';
    stage.hidden = true;
    document.body.appendChild(stage);

    Array.prototype.forEach.call(deck.querySelectorAll('[data-rd-emoji]'), function (button) {
      button.addEventListener('click', function () { fireReaction(button.getAttribute('data-rd-emoji')); });
    });
    Array.prototype.forEach.call(deck.querySelectorAll('[data-rd-style]'), function (button) {
      button.addEventListener('click', function () { fireStyle(button.getAttribute('data-rd-style')); });
    });
    if (!audioBound) {
      document.addEventListener('pointerdown', unlockAudio, { passive: true });
      document.addEventListener('keydown', unlockAudio);
      audioBound = true;
    }
    return true;
  }

  function unmount() {
    if (stageTimer) { clearTimeout(stageTimer); stageTimer = null; }
    if (deck && deck.parentNode) deck.parentNode.removeChild(deck);
    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    deck = null;
    stage = null;
  }

  function ensureMounted() {
    if (canMount()) return mount();
    unmount();
    return false;
  }

  function applyState(state) {
    sessionLive = Boolean(state && state.status === 'live');
    ensureMounted();
  }

  function failClosed() {
    /* A state read error must never enable the deck. */
    sessionLive = false;
    ensureMounted();
  }

  function loadSessionState() {
    var id = sessionId();
    if (!id) return;
    if (connectPage && window.mathifyClassroomApi &&
        typeof window.mathifyClassroomApi.getSessionState === 'function') {
      window.mathifyClassroomApi.getSessionState(id).then(applyState).catch(failClosed);
      return;
    }
    if (window.mathifyTrainerApi && typeof window.mathifyTrainerApi.getSessionState === 'function') {
      window.mathifyTrainerApi.getSessionState(id).then(applyState).catch(failClosed);
      return;
    }
    if (window.mathifyTrainerApi && typeof window.mathifyTrainerApi.request === 'function') {
      window.mathifyTrainerApi.request('/sessions/' + encodeURIComponent(id) + '/state')
        .then(function (data) { applyState(data && data.state); })
        .catch(failClosed);
    }
  }

  loadSessionState();
  window.setInterval(loadSessionState, 2000);

  window.mathifyRewardDeck = {
    mount: mount,
    fireStyle: fireStyle,
    fireReaction: fireReaction,
    preference: function () { return stylePreference; },
    isMounted: function () { return Boolean(deck); },
    isLive: function () { return sessionLive; }
  };
})();
