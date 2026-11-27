/* Mathify — shared RTC media frame UI.
 *
 * LiveKit owns the tracks; this helper owns what the viewer sees on the frame.
 * It follows audio levels from participant.audioLevel (never a hidden audio
 * element), mirrors microphone mute/unmute events into tile badges, and paints
 * the active-speaker/muted border states with the project palette tokens.
 *
 * ES5-style so it can be loaded directly by any classroom deck before the
 * page-specific client script. No presence, attendance, pay or trainer data is
 * read here: every input is a LiveKit participant object already in the page.
 */
(function () {
  'use strict';

  var raf = window.requestAnimationFrame || function (callback) {
    return window.setTimeout(function () { callback(Date.now()); }, 16);
  };
  var cancelRaf = window.cancelAnimationFrame || function (id) {
    window.clearTimeout(id);
  };

  function element(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }

  function clamp(value) {
    var number = Number(value);
    if (!isFinite(number) || number <= 0) return 0;
    return number > 1 ? 1 : number;
  }

  function isAudioPublication(publication) {
    if (!publication) return false;
    if (publication.kind === 'audio') return true;
    var source = publication.source;
    if (source === undefined) source = publication.trackSource;
    return typeof source === 'string' && source.toLowerCase() === 'microphone';
  }

  function remoteParticipant(room) {
    if (!room) return null;
    if (typeof room.getRemoteParticipants === 'function') {
      var listed = room.getRemoteParticipants();
      if (listed && listed.length) return listed[0];
    }
    var map = room.remoteParticipants;
    if (!map) return null;
    if (typeof map.values === 'function') {
      var iterator = map.values();
      if (iterator && typeof iterator.next === 'function') {
        var entry = iterator.next();
        return entry && !entry.done ? entry.value : null;
      }
    }
    if (Array.isArray(map)) return map[0] || null;
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    }
    return null;
  }

  /* Bind LiveKit events for one two-person frame deck. `options.self` and
     `options.peer` may carry tile/mic/speaking/level selectors or elements;
     `options.controlLevel` points at the level bar inside the mic button. */
  function bind(room, options) {
    var settings = options || {};
    var events = settings.events ||
      (window.LivekitClient && window.LivekitClient.RoomEvent) || {};
    var icons = settings.icons || { on: '#i-mic', off: '#i-mic-off' };
    var sides = {};
    var listeners = [];
    var rafId = null;

    ['self', 'peer'].forEach(function (name) {
      var config = settings[name] || {};
      sides[name] = {
        tile: element(config.tile),
        mic: element(config.mic),
        speaking: element(config.speaking),
        level: element(config.level),
        levelValue: 0,
        levelTarget: 0,
        speakingActive: false,
        micOn: true,
        disposed: false
      };
    });
    var controlLevel = element(settings.controlLevel);

    function eventName(name) {
      return (settings.eventNames && settings.eventNames[name]) || events[name] || name;
    }

    function listen(name, handler) {
      if (!room || typeof room.on !== 'function') return;
      var key = eventName(name);
      try {
        room.on(key, handler);
        listeners.push({ key: key, handler: handler });
      } catch (error) { /* SDK mismatch: page still renders static frames */ }
    }

    function unlisten() {
      for (var index = 0; index < listeners.length; index += 1) {
        if (room && typeof room.off === 'function') {
          try { room.off(listeners[index].key, listeners[index].handler); }
          catch (error) { /* room already gone */ }
        }
      }
      listeners.length = 0;
    }

    function paintLevel(side, value) {
      var state = sides[side];
      if (!state || state.disposed) return;
      var rounded = Math.round(value * 100) / 100;
      var active = rounded > 0.04 ? 'active' : 'idle';
      if (state.level) {
        state.level.style.setProperty('--mic-level', String(rounded));
        state.level.setAttribute('data-level', active);
      }
      /* The mic button reports the receiving side, not its own microphone. */
      if (side === 'peer' && controlLevel) {
        controlLevel.style.setProperty('--mic-level', String(rounded));
        controlLevel.setAttribute('data-level', active);
      }
    }

    function schedule() {
      if (rafId === null) rafId = raf(tick);
    }

    function tick() {
      rafId = null;
      var active = false;
      ['self', 'peer'].forEach(function (side) {
        var state = sides[side];
        if (!state || state.disposed) return;
        var current = state.levelValue;
        var target = state.levelTarget;
        var next;
        if (target >= current) {
          next = target;
        } else {
          next = current * 0.82;
          if (next < target + 0.008) next = target;
        }
        if (Math.abs(next - current) < 0.005) next = target;
        state.levelValue = next;
        paintLevel(side, next);
        if (next > 0 || target > 0) active = true;
      });
      if (active) schedule();
    }

    function targetLevel(side, value) {
      var state = sides[side];
      if (!state || state.disposed) return;
      state.levelTarget = clamp(value);
      schedule();
    }

    function setSpeaking(side, value) {
      var state = sides[side];
      if (!state || state.disposed) return;
      var active = Boolean(value) && state.micOn !== false;
      state.speakingActive = active;
      if (state.tile) state.tile.setAttribute('data-speaking', active ? 'true' : 'false');
      if (state.speaking) {
        state.speaking.hidden = !active;
        state.speaking.setAttribute('aria-hidden', active ? 'false' : 'true');
      }
    }

    function setMicState(side, value) {
      var state = sides[side];
      if (!state || state.disposed) return;
      state.micOn = Boolean(value);
      if (state.mic) {
        var use = state.mic.querySelector('use');
        if (use) use.setAttribute('href', state.micOn ? icons.on : icons.off);
        state.mic.setAttribute('aria-label', state.micOn ? 'Microphone on' : 'Microphone off');
        state.mic.setAttribute('data-mic', state.micOn ? 'on' : 'off');
      }
      if (state.tile) {
        state.tile.setAttribute('data-muted', state.micOn ? 'false' : 'true');
        state.tile.setAttribute('data-audio', state.micOn ? 'on' : 'off');
      }
      if (!state.micOn) {
        setSpeaking(side, false);
        targetLevel(side, 0);
      }
    }

    function participantFor(side) {
      if (!room) return null;
      return side === 'self' ? room.localParticipant : remoteParticipant(room);
    }

    function sideForParticipant(participant) {
      if (!participant) return null;
      if (participant.isLocal) return 'self';
      var local = room && room.localParticipant;
      if (local && participant.identity && participant.identity === local.identity) return 'self';
      return 'peer';
    }

    function updateLevelFrom(side, participant) {
      if (!participant) {
        setSpeaking(side, false);
        targetLevel(side, 0);
        return;
      }
      var level = clamp(participant.audioLevel);
      targetLevel(side, level);
      setSpeaking(side, Boolean(participant.isSpeaking) && level > 0.02);
    }

    function sync() {
      ['self', 'peer'].forEach(function (side) {
        var participant = participantFor(side);
        if (participant && typeof participant.isMicrophoneEnabled === 'boolean') {
          setMicState(side, participant.isMicrophoneEnabled);
        }
        updateLevelFrom(side, participant);
      });
    }

    function onActiveSpeakers(speakers) {
      var list = speakers || [];
      var seen = { self: false, peer: false };
      for (var index = 0; index < list.length; index += 1) {
        var participant = list[index];
        var side = sideForParticipant(participant);
        if (!side) continue;
        seen[side] = true;
        updateLevelFrom(side, participant);
      }
      ['self', 'peer'].forEach(function (side) {
        if (!seen[side]) updateLevelFrom(side, participantFor(side));
      });
    }

    function applyTrackState(muted, publication, participant) {
      if (!isAudioPublication(publication)) return;
      var side = sideForParticipant(participant);
      if (!side) return;
      var enabled = !muted;
      setMicState(side, enabled);
      if (typeof settings.onMicState === 'function') settings.onMicState(side, enabled);
    }

    function onTrackMuted(publication, participant) {
      applyTrackState(true, publication, participant);
    }

    function onTrackUnmuted(publication, participant) {
      applyTrackState(false, publication, participant);
    }

    function clear(side) {
      var state = sides[side];
      if (!state || state.disposed) return;
      setMicState(side, true);
      setSpeaking(side, false);
      targetLevel(side, 0);
    }

    function onParticipantDisconnected(participant) {
      if (sideForParticipant(participant) !== 'peer') return;
      clear('peer');
      if (typeof settings.onPeerDisconnected === 'function') {
        settings.onPeerDisconnected(participant);
      }
    }

    function onDisconnected() {
      clear('self');
      clear('peer');
      if (typeof settings.onDisconnected === 'function') settings.onDisconnected();
    }

    function dispose() {
      unlisten();
      if (rafId !== null) cancelRaf(rafId);
      rafId = null;
      ['self', 'peer'].forEach(function (side) { sides[side].disposed = true; });
    }

    listen('ActiveSpeakersChanged', onActiveSpeakers);
    listen('TrackMuted', onTrackMuted);
    listen('TrackUnmuted', onTrackUnmuted);
    listen('ParticipantDisconnected', onParticipantDisconnected);
    listen('Disconnected', onDisconnected);
    sync();

    return {
      setMicState: setMicState,
      setSpeaking: setSpeaking,
      setLevel: targetLevel,
      sync: sync,
      clear: clear,
      dispose: dispose
    };
  }

  window.mathifyRtcMediaUi = { bind: bind, version: 1 };
})();
