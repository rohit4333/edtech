/* Brand-safe celebrations for the 1:1 classroom.
 *
 * Config is the single source of truth for the six animation types, event
 * mapping and throttling. The service emits an allowlisted payload only: no
 * answer keys, hints, trainer notes, ids, phone numbers or social links.
 * Sound is rendered locally by the client and is always on, with no mute. */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'celebrations.json');
const ALLOWED_SOUND_IDS = [
  'ui_click_soft',
  'drum_roll_short',
  'chime_paper',
  'tabla_pulse',
  'sparkle',
  'applause_soft',
  'welcome_bell'
];

let config = null;
let configMtime = 0;

function readConfig() {
  const stat = fs.statSync(CONFIG_PATH);
  if (!config || stat.mtimeMs > configMtime) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    configMtime = stat.mtimeMs;
  }
  return config;
}

function publicConfig() {
  const source = readConfig();
  return {
    version: source.version,
    enabled: source.enabled !== false,
    palette: Array.isArray(source.palette) ? source.palette.slice() : [],
    types: Object.keys(source.celebrationLibrary || {}).filter(function (key) {
      const item = source.celebrationLibrary[key];
      return item && item.enabled !== false;
    }).map(function (key) {
      const item = source.celebrationLibrary[key];
      return {
        id: key,
        label: String(item.label || key).slice(0, 60),
        durationMs: Number(item.animation && item.animation.durationMs) || 0,
        sound: ALLOWED_SOUND_IDS.indexOf(item.sound) >= 0 ? item.sound : null,
        bestFor: String(item.bestFor || '').slice(0, 80)
      };
    }),
    triggers: Object.keys(source.eventMapping || {}),
    preferences: {
      allowedOverrides: source.preferences && Array.isArray(source.preferences.allowedOverrides)
        ? source.preferences.allowedOverrides.slice() : [],
      priority: source.preferences && Array.isArray(source.preferences.priority)
        ? source.preferences.priority.slice() : ['student', 'trainer', 'default']
    },
    throttle: {
      maxPerSession: Number(source.throttle && source.throttle.maxPerSession) || 5,
      minGapBetweenMs: Number(source.throttle && source.throttle.minGapBetweenMs) || 3000
    },
    accessibility: {
      respectReducedMotion: source.accessibility && source.accessibility.respectReducedMotion !== false,
      reducedMotionFallback: 'static_badge',
      localMuteAllowed: source.accessibility && source.accessibility.localMuteAllowed !== false,
      cameraPrivacyRespected: true
    }
  };
}

function trigger(name) {
  const source = readConfig();
  if (!source.eventMapping || !Object.prototype.hasOwnProperty.call(source.eventMapping, name)) return null;
  return source.eventMapping[name];
}

function libraryType(name) {
  const source = readConfig();
  if (!source.celebrationLibrary || !Object.prototype.hasOwnProperty.call(source.celebrationLibrary, name)) return null;
  const item = source.celebrationLibrary[name];
  return item && item.enabled !== false ? item : null;
}

function allowedOverride(pref) {
  const source = readConfig();
  const allowed = source.preferences && Array.isArray(source.preferences.allowedOverrides)
    ? source.preferences.allowedOverrides
    : [];
  return typeof pref === 'string' && allowed.indexOf(pref) >= 0 && libraryType(pref) ? pref : null;
}

function selectType(eventName, studentPref, trainerPref, random) {
  const mapping = trigger(eventName);
  if (!mapping) return null;

  if (sourcePreferencePriority('student')) {
    const student = allowedOverride(studentPref);
    if (student) return student;
  }
  if (sourcePreferencePriority('trainer')) {
    const trainer = allowedOverride(trainerPref);
    if (trainer) return trainer;
  }

  if (mapping.randomize === true && Array.isArray(mapping.randomizePool) && mapping.randomizePool.length) {
    const pool = mapping.randomizePool.filter(libraryType);
    if (pool.length) {
      const pick = typeof random === 'function' ? random() : Math.random();
      const index = Math.min(pool.length - 1, Math.max(0, Math.floor(pick * pool.length)));
      return pool[index];
    }
  }

  return libraryType(mapping.defaultType) ? mapping.defaultType : null;
}

function sourcePreferencePriority(which) {
  const source = readConfig();
  const prefs = source.preferences || {};
  const key = which === 'student' ? 'studentCanChoose' : 'trainerCanChoose';
  return prefs[key] !== false;
}

const sessions = new Map();

function throttleState(sessionId) {
  const key = String(sessionId || 'anonymous');
  if (!sessions.has(key)) sessions.set(key, { count: 0, lastAt: 0 });
  return sessions.get(key);
}

function passesThrottle(sessionId, now) {
  const source = readConfig();
  const state = throttleState(sessionId);
  const max = Number(source.throttle && source.throttle.maxPerSession) || 5;
  const gap = Number(source.throttle && source.throttle.minGapBetweenMs) || 3000;
  if (state.count >= max) return false;
  if (state.lastAt && now - state.lastAt < gap) return false;
  return true;
}

function record(sessionId, now) {
  const state = throttleState(sessionId);
  state.count += 1;
  state.lastAt = now;
}

function safeName(value) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'Student';
}

function safeText(value) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allowlistedAnimation(animation, palette) {
  const source = animation && typeof animation === 'object' ? animation : {};
  const keys = ['type', 'durationMs', 'count', 'colors', 'rippleColors', 'origin', 'fallStyle',
    'riseStyle', 'trajectory', 'opacity', 'stringVisible', 'foldTexture', 'rotation', 'paperTexture',
    'beatSync', 'pulseScale', 'centerVisual', 'rippleCount', 'style', 'shineSweep', 'shineColor',
    'textTemplate', 'scaleAnimation', 'sealIcon'];
  const safe = {};
  keys.forEach(function (key) {
    if (source[key] !== undefined) safe[key] = clone(source[key]);
  });
  ['colors', 'rippleColors'].forEach(function (key) {
    if (Array.isArray(safe[key])) {
      safe[key] = safe[key].filter(function (color) { return palette.indexOf(color) >= 0; });
    }
  });
  if (safe.shineColor && palette.indexOf(safe.shineColor) < 0) delete safe.shineColor;
  safe.durationMs = Math.max(250, Math.min(4000, Number(safe.durationMs) || 3000));
  return safe;
}

/* The only object that may cross the realtime boundary. Flat keys and no
   identifiers keep this safe for both roles. */
function safePayload(result) {
  return {
    event: 'shared.celebration',
    sessionId: String(result.sessionId || ''),
    trigger: String(result.trigger || ''),
    celebrationType: String(result.celebrationType || ''),
    audience: Array.isArray(result.audience) ? result.audience.slice(0, 2) : [],
    studentName: safeName(result.studentName),
    sound: {
      id: ALLOWED_SOUND_IDS.indexOf(result.sound && result.sound.id) >= 0 ? result.sound.id : null,
      volume: Math.max(0, Math.min(0.6, Number(result.sound && result.sound.volume) || 0.6))
    },
    spotlight: {
      enabled: result.spotlight && result.spotlight.enabled === true,
      target: 'student',
      durationMs: Math.max(250, Math.min(4000, Number(result.spotlight && result.spotlight.durationMs) || 3000)),
      badgeText: safeText(result.spotlight && result.spotlight.badgeText)
    },
    animation: result.animation && typeof result.animation === 'object' ? clone(result.animation) : {},
    at: String(result.at || new Date().toISOString())
  };
}

function evaluateTrigger(eventName, context) {
  const cfg = readConfig();
  const input = context && typeof context === 'object' ? context : {};
  if (cfg.enabled === false || !cfg.sharedCelebration || cfg.sharedCelebration.enabled === false) return null;
  if (cfg.sharedCelebration.suppressDuringActiveQuiz !== false && input.quizActive === true) return null;

  const mapping = trigger(eventName);
  if (!mapping) return null;

  const now = Number.isFinite(input.now) ? input.now : Date.now();
  if (!passesThrottle(input.sessionId, now)) return null;

  const type = selectType(eventName, input.studentPref, input.trainerPref, input.random);
  if (!type) return null;
  const item = libraryType(type);
  if (!item || ALLOWED_SOUND_IDS.indexOf(item.sound) < 0) return null;

  const rawBadge = String(mapping.badgeText || '').replace('{studentName}', safeName(input.studentName));
  const result = {
    sessionId: input.sessionId,
    trigger: eventName,
    celebrationType: type,
    audience: Array.isArray(cfg.sharedCelebration.audience) ? cfg.sharedCelebration.audience : [],
    studentName: safeName(input.studentName),
    sound: { id: item.sound, volume: 0.6 },
    spotlight: {
      enabled: cfg.sharedCelebration.spotlightStudent !== false,
      target: 'student',
      durationMs: Number(mapping.spotlightDurationMs) || Number(item.animation.durationMs) || 3000,
      badgeText: rawBadge
    },
    animation: allowlistedAnimation(item.animation, Array.isArray(cfg.palette) ? cfg.palette : []),
    at: new Date(now).toISOString()
  };

  record(input.sessionId, now);
  return safePayload(result);
}

function reset() {
  sessions.clear();
}

module.exports = {
  publicConfig,
  trigger,
  libraryType,
  selectType,
  evaluateTrigger,
  safePayload,
  reset
};
