/* Mathify camera look + mic evidence — dependency-free preview helpers.
 *
 * Honest limitation: no ML person segmentation is bundled here. The "blur"
 * preset is a radial soft-focus mask over the outer frame (the centre stays
 * clear); the Mathify presets are masked Paper & Ink washes over the preview.
 * The mic bars read real RMS/frequency energy from existing MediaStreams via
 * AudioContext + AnalyserNode. A remote level is shown only when the current
 * LiveKit audio element actually exposes a MediaStream; otherwise the page
 * says local-only rather than inventing a number. Nothing here re-draws a
 * MediaStream, and choices stay in localStorage rather than travelling with
 * a lesson.
 */
(function (globalScope) {
  'use strict';

  var BACKGROUNDS = [
    { value: 'off', label: 'Off' },
    { value: 'blur', label: 'Blur' },
    { value: 'paper', label: 'Mathify paper' },
    { value: 'ink', label: 'Mathify ink' },
    { value: 'coral', label: 'Mathify coral' },
  ];
  var LIGHTING = [
    { value: 'auto', label: 'Auto' },
    { value: 'brighter', label: 'Brighter' },
    { value: 'softer', label: 'Softer' },
  ];
  var DEFAULTS = { background: 'off', lighting: 'auto' };

  var config = null;
  var settings = { background: 'off', lighting: 'auto' };
  var feedAvailable = false;
  var appliedTrack = null;
  var appliedLighting = null;

  function roleName(value) {
    return value === 'student' ? 'student' : 'trainer';
  }

  function storageKey(role) {
    return 'mathify.cameraLook.' + roleName(role);
  }

  function hasValue(list, value) {
    return list.some(function (item) {
      return item.value === value;
    });
  }

  function normalise(value) {
    var input = value && typeof value === 'object' ? value : {};
    return {
      background: hasValue(BACKGROUNDS, input.background) ? input.background : DEFAULTS.background,
      lighting: hasValue(LIGHTING, input.lighting) ? input.lighting : DEFAULTS.lighting,
    };
  }

  function resolveNode(value) {
    if (!value) return null;
    if (typeof value !== 'string') return value;
    if (
      !globalScope ||
      !globalScope.document ||
      typeof globalScope.document.querySelector !== 'function'
    )
      return null;
    return globalScope.document.querySelector(value);
  }

  function getStorage() {
    if (config && config.storage) return config.storage;
    return globalScope && globalScope.localStorage ? globalScope.localStorage : null;
  }

  function readStored() {
    var store = getStorage();
    if (!store || typeof store.getItem !== 'function') return normalise(null);
    try {
      var raw = store.getItem(storageKey(config && config.role));
      return raw ? normalise(JSON.parse(raw)) : normalise(null);
    } catch (error) {
      return normalise(null);
    }
  }

  function persist() {
    var store = getStorage();
    if (!store || typeof store.setItem !== 'function') return;
    try {
      store.setItem(storageKey(config && config.role), JSON.stringify(settings));
    } catch (error) {
      /* Storage can be unavailable in private browsing; the preview still works. */
    }
  }

  function clearStored() {
    var store = getStorage();
    if (!store || typeof store.removeItem !== 'function') return;
    try {
      store.removeItem(storageKey(config && config.role));
    } catch (error) {
      /* A stale local preference is harmless. */
    }
  }

  /* Advanced capture settings are best-effort. Browsers may ignore or reject
     any one of them, so every call has a compensation-only fallback and no
     rejection is allowed to interrupt camera startup. */
  function constraintAttempts(lighting) {
    var compensation = lighting === 'brighter' ? 0.5 : lighting === 'softer' ? -0.35 : 0;
    return [
      {
        whiteBalanceMode: 'continuous',
        exposureMode: 'continuous',
        focusMode: 'continuous',
        exposureCompensation: compensation,
      },
      { exposureCompensation: compensation },
    ];
  }

  function attemptConstraints(track, attempts, index) {
    if (!track || typeof track.applyConstraints !== 'function' || index >= attempts.length) return;
    var result = null;
    try {
      result = track.applyConstraints(attempts[index]);
    } catch (error) {
      attemptConstraints(track, attempts, index + 1);
      return;
    }
    if (result && typeof result.catch === 'function') {
      result.catch(function () {
        attemptConstraints(track, attempts, index + 1);
      });
    }
  }

  function syncConstraints(force) {
    if (!feedAvailable || !config || typeof config.getTrack !== 'function') return;
    var track = null;
    try {
      track = config.getTrack();
    } catch (error) {
      return;
    }
    if (!track || typeof track.applyConstraints !== 'function') return;
    if (!force && track === appliedTrack && settings.lighting === appliedLighting) return;
    appliedTrack = track;
    appliedLighting = settings.lighting;
    attemptConstraints(track, constraintAttempts(settings.lighting), 0);
  }

  function disableNode(node, disabled) {
    if (!node) return;
    node.disabled = disabled;
    if (typeof node.setAttribute === 'function') {
      node.setAttribute('aria-disabled', String(disabled));
    }
  }

  function render() {
    if (!config) return;
    if (config.backgroundSelect) config.backgroundSelect.value = settings.background;
    if (config.lightingSelect) config.lightingSelect.value = settings.lighting;

    var tile = config.tile;
    if (tile && tile.dataset) {
      tile.dataset.cameraLookBg = settings.background;
      tile.dataset.cameraLookLight = settings.lighting;
      tile.dataset.cameraLookReady = feedAvailable ? 'true' : 'false';
    }
    var disabled = !feedAvailable;
    disableNode(config.backgroundSelect, disabled);
    disableNode(config.lightingSelect, disabled);
    disableNode(config.resetButton, disabled);
    if (config.panel && config.panel.dataset) {
      config.panel.dataset.cameraLookDisabled = disabled ? 'true' : 'false';
    }
    if (config.hintNode) {
      config.hintNode.textContent = disabled
        ? 'Available when your camera feed is live.'
        : 'Preview only · your lesson feed is unchanged.';
    }
    if (config.resetButton && typeof config.resetButton.setAttribute === 'function') {
      config.resetButton.title = disabled
        ? 'Camera look is unavailable until the camera feed is live'
        : 'Reset background and lighting';
    }
    syncConstraints(false);
  }

  function init(options) {
    config = options || {};
    config.tile = resolveNode(config.tile);
    config.panel = resolveNode(config.panel);
    config.hintNode = resolveNode(config.hintNode);
    config.backgroundSelect = resolveNode(config.backgroundSelect);
    config.lightingSelect = resolveNode(config.lightingSelect);
    config.resetButton = resolveNode(config.resetButton);
    settings = readStored();
    feedAvailable = false;
    appliedTrack = null;
    appliedLighting = null;

    if (config.backgroundSelect && typeof config.backgroundSelect.addEventListener === 'function') {
      config.backgroundSelect.addEventListener('change', function () {
        if (!feedAvailable) return;
        settings.background = normalise({
          background: config.backgroundSelect.value,
          lighting: settings.lighting,
        }).background;
        persist();
        render();
      });
    }
    if (config.lightingSelect && typeof config.lightingSelect.addEventListener === 'function') {
      config.lightingSelect.addEventListener('change', function () {
        if (!feedAvailable) return;
        settings.lighting = normalise({
          background: settings.background,
          lighting: config.lightingSelect.value,
        }).lighting;
        persist();
        render();
      });
    }
    if (config.resetButton && typeof config.resetButton.addEventListener === 'function') {
      config.resetButton.addEventListener('click', function () {
        if (!feedAvailable) return;
        clearStored();
        settings = normalise(null);
        render();
      });
    }
    render();
  }

  function setFeedAvailable(value) {
    var next = Boolean(value);
    feedAvailable = next;
    if (!feedAvailable) appliedTrack = null;
    render();
  }

  /* Local mic evidence reads the existing MediaStream track. An optional
     remote source is analysed only when the LiveKit audio element exposes a
     real MediaStream; an absent source stays visibly local-only. */
  var audio = {
    config: null,
    context: null,
    local: null,
    remote: null,
    mode: 'idle',
    localMuted: false,
    frame: 0,
    raf: null,
    cancelRaf: null,
  };

  function audioContextClass() {
    if (audio.config && audio.config.AudioContext) return audio.config.AudioContext;
    if (!globalScope) return null;
    return globalScope.AudioContext || globalScope.webkitAudioContext || null;
  }

  function asAudioStream(source, context) {
    if (!source) return null;
    if (typeof source.getAudioTracks === 'function') return source;
    if (source.srcObject && typeof source.srcObject.getAudioTracks === 'function') {
      return source.srcObject;
    }
    if (!context || typeof context.createMediaStreamSource !== 'function') return null;
    if (
      typeof source.kind === 'string' &&
      (source.kind === 'audio' || typeof source.enabled === 'boolean')
    ) {
      try {
        var Stream = globalScope && globalScope.MediaStream ? globalScope.MediaStream : null;
        return Stream ? new Stream([source]) : null;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function safeSource(getter) {
    if (typeof getter !== 'function') return null;
    try {
      return getter();
    } catch (error) {
      return null;
    }
  }

  function createMonitor(context, stream) {
    if (
      !context ||
      !stream ||
      typeof context.createMediaStreamSource !== 'function' ||
      typeof context.createAnalyser !== 'function'
    )
      return null;
    try {
      var sourceNode = context.createMediaStreamSource(stream);
      var analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;
      sourceNode.connect(analyser);
      return {
        stream: stream,
        node: sourceNode,
        analyser: analyser,
        samples: new Uint8Array(analyser.fftSize),
        level: 0,
      };
    } catch (error) {
      return null;
    }
  }

  function stopMonitor(name) {
    var monitor = audio[name];
    if (!monitor) return;
    try {
      if (monitor.node && typeof monitor.node.disconnect === 'function') monitor.node.disconnect();
    } catch (error) {
      /* The node is already detached. */
    }
    audio[name] = null;
  }

  /* RMS from the time domain is the primary reading; averaged frequency
     energy is the fallback for implementations without time-domain samples. */
  function measure(monitor) {
    if (!monitor || !monitor.analyser || !monitor.samples) return 0;
    var data = monitor.samples;
    try {
      if (typeof monitor.analyser.getByteTimeDomainData === 'function') {
        monitor.analyser.getByteTimeDomainData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i += 1) {
          var sample = (data[i] - 128) / 128;
          sum += sample * sample;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 3.4);
      }
      if (typeof monitor.analyser.getByteFrequencyData === 'function') {
        monitor.analyser.getByteFrequencyData(data);
        var total = 0;
        for (var j = 0; j < data.length; j += 1) total += data[j];
        return Math.min(1, (total / data.length / 255) * 2.6);
      }
    } catch (error) {
      return 0;
    }
    return 0;
  }

  function paintIndicator(node, level, state, label) {
    if (!node) return;
    if (node.dataset) node.dataset.audioState = state;
    if (typeof node.setAttribute === 'function') node.setAttribute('aria-label', label);
    if (node.style && typeof node.style.setProperty === 'function') {
      node.style.setProperty('--audio-opacity', (0.3 + level * 0.7).toFixed(2));
      node.style.setProperty('--audio-scale', (1 + level * 0.2).toFixed(2));
      node.style.setProperty('--audio-scale-end', (1.18 + level * 0.24).toFixed(2));
      node.style.setProperty('--audio-glow', (level * 12).toFixed(1) + 'px');
    }
    var text = node.querySelector && node.querySelector('.audio-visual-label');
    if (text) text.textContent = label;
  }

  function paintStates(localLevel, remoteLevel) {
    var configNode = audio.config || {};
    var suspended = Boolean(audio.context && audio.context.state === 'suspended');
    var localState =
      audio.mode === 'muted' || audio.localMuted
        ? 'muted'
        : suspended
          ? 'suspended'
          : audio.mode !== 'live'
            ? 'idle'
            : localLevel > 0.045
              ? 'active'
              : 'live';
    var remoteAvailable = Boolean(audio.remote);
    var remoteState =
      audio.mode !== 'live'
        ? 'idle'
        : !remoteAvailable
          ? 'idle'
          : remoteLevel > 0.045
            ? 'active'
            : 'live';
    var localLabel =
      localState === 'active'
        ? 'Microphone audio detected'
        : localState === 'live'
          ? 'Microphone ready, no audio detected'
          : localState === 'muted'
            ? 'Microphone muted'
            : localState === 'suspended'
              ? 'Audio visual paused, resume needed'
              : 'Microphone unavailable';
    var remoteLabel =
      remoteState === 'active'
        ? 'Other person audio detected'
        : remoteState === 'live'
          ? 'Other person microphone ready'
          : 'Other person level unavailable · local mic only';
    paintIndicator(configNode.audioVisual, localLevel, localState, localLabel);
    paintIndicator(configNode.selfAudioPulse, localLevel, localState, localLabel);
    paintIndicator(configNode.peerAudioVisual, remoteLevel, remoteState, remoteLabel);
    paintIndicator(configNode.peerAudioPulse, remoteLevel, remoteState, remoteLabel);
    if (configNode.audioSourceHint) {
      configNode.audioSourceHint.textContent = remoteAvailable
        ? 'Both levels come from live audio streams.'
        : 'Local mic only · remote level is not shared.';
    }
    if (configNode.audioResumeBtn) {
      configNode.audioResumeBtn.hidden = localState !== 'suspended';
    }
  }

  function tick() {
    if (!audio.config) return;
    var localLevel = audio.local ? measure(audio.local) : 0;
    var remoteLevel = audio.remote ? measure(audio.remote) : 0;
    paintStates(localLevel, remoteLevel);
    if (audio.raf) audio.frame = audio.raf(tick);
  }

  function animationFunctions() {
    var scope = globalScope || {};
    return {
      raf:
        typeof scope.requestAnimationFrame === 'function'
          ? scope.requestAnimationFrame.bind(scope)
          : function (callback) {
              return setTimeout(callback, 120);
            },
      cancel:
        typeof scope.cancelAnimationFrame === 'function'
          ? scope.cancelAnimationFrame.bind(scope)
          : function (id) {
              clearTimeout(id);
            },
    };
  }

  function startAnimation() {
    if (audio.frame) return;
    var fns = animationFunctions();
    audio.raf = fns.raf;
    audio.cancelRaf = fns.cancel;
    audio.frame = audio.raf(tick);
  }

  function stopAnimation() {
    if (audio.frame && audio.cancelRaf) audio.cancelRaf(audio.frame);
    audio.frame = 0;
  }

  function syncMonitors() {
    if (!audio.config || audio.mode !== 'live') return;
    var context = audio.context;
    if (!context || context.state === 'closed') {
      stopMonitor('local');
      stopMonitor('remote');
      paintStates(0, 0);
      return;
    }
    var track = safeSource(audio.config.getTrack);
    audio.localMuted = Boolean(
      track && (track.readyState === 'ended' || track.enabled === false || track.muted === true)
    );
    var localStream = audio.localMuted ? null : asAudioStream(track, context);
    if (localStream && (!audio.local || audio.local.stream !== localStream)) {
      stopMonitor('local');
      audio.local = createMonitor(context, localStream);
    } else if (!localStream) {
      stopMonitor('local');
    }
    var remoteStream = asAudioStream(safeSource(audio.config.getRemoteSource), context);
    if (remoteStream && (!audio.remote || audio.remote.stream !== remoteStream)) {
      stopMonitor('remote');
      audio.remote = createMonitor(context, remoteStream);
    } else if (!remoteStream) {
      stopMonitor('remote');
    }
    paintStates(0, 0);
  }

  function ensureContext() {
    if (audio.context) return audio.context;
    var ContextClass = audioContextClass();
    if (!ContextClass) return null;
    try {
      audio.context = new ContextClass();
    } catch (error) {
      audio.context = null;
    }
    return audio.context;
  }

  function resumeAudio() {
    if (!audio.context || typeof audio.context.resume !== 'function') return;
    try {
      Promise.resolve(audio.context.resume())
        .then(function () {
          syncMonitors();
          startAnimation();
        })
        .catch(function () {
          paintStates(0, 0);
        });
    } catch (error) {
      paintStates(0, 0);
    }
  }

  function initAudio(options) {
    audio.config = options || {};
    [
      'audioVisual',
      'selfAudioPulse',
      'peerAudioVisual',
      'peerAudioPulse',
      'audioSourceHint',
      'audioResumeBtn',
    ].forEach(function (key) {
      audio.config[key] = resolveNode(audio.config[key]);
    });
    audio.mode = 'idle';
    audio.localMuted = false;
    audio.context = null;
    audio.local = null;
    audio.remote = null;
    stopAnimation();
    if (
      audio.config.audioResumeBtn &&
      typeof audio.config.audioResumeBtn.addEventListener === 'function'
    ) {
      audio.config.audioResumeBtn.addEventListener('click', resumeAudio);
    }
    paintStates(0, 0);
  }

  function setAudioAvailability(mode) {
    var next = mode === 'muted' ? 'muted' : mode === 'live' ? 'live' : 'idle';
    audio.mode = next;
    if (next !== 'live') {
      stopAnimation();
      stopMonitor('local');
      stopMonitor('remote');
      audio.localMuted = next === 'muted';
      paintStates(0, 0);
      return;
    }
    if (!ensureContext()) {
      stopAnimation();
      stopMonitor('local');
      stopMonitor('remote');
      paintStates(0, 0);
      return;
    }
    syncMonitors();
    startAnimation();
  }

  var controller = {
    BACKGROUNDS: BACKGROUNDS,
    LIGHTING: LIGHTING,
    storageKey: storageKey,
    normalise: normalise,
    constraintAttempts: constraintAttempts,
    measure: measure,
    init: init,
    setFeedAvailable: setFeedAvailable,
    initAudio: initAudio,
    setAudioAvailability: setAudioAvailability,
    resumeAudio: resumeAudio,
    settings: function () {
      return { background: settings.background, lighting: settings.lighting };
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = controller;
  if (globalScope) globalScope.mathifyCameraLook = controller;
})(typeof window !== 'undefined' ? window : null);
