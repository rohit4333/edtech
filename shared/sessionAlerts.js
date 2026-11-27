/* Small, dependency-free alert tones for live session cues.
 *
 * The server owns every decision about when a cue fires. This file only renders
 * a soft chime after an authenticated session event arrives, and it never
 * changes class state. Audio is best effort: browsers that block autoplay still
 * get the visual warning. */
(function () {
  'use strict';

  var context = null;

  function audioContext() {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!context) {
      try { context = new Ctor(); } catch (error) { return null; }
    }
    return context;
  }

  function tone(ctx, frequency, startAt, duration, volume) {
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  /* Two quiet sine notes read as a gentle ping without sounding like an alarm.
     "warning" is deliberately softer and longer than the join/leave cues. */
  var SOUNDS = {
    warning: [
      { frequency: 659.25, offset: 0, duration: 0.16, volume: 0.035 },
      { frequency: 880, offset: 0.18, duration: 0.2, volume: 0.03 }
    ],
    join: [
      { frequency: 523.25, offset: 0, duration: 0.11, volume: 0.025 },
      { frequency: 659.25, offset: 0.1, duration: 0.13, volume: 0.022 }
    ],
    leave: [
      { frequency: 440, offset: 0, duration: 0.11, volume: 0.022 },
      { frequency: 349.23, offset: 0.1, duration: 0.14, volume: 0.02 }
    ]
  };

  function ping(kind) {
    var notes = SOUNDS[kind] || SOUNDS.join;
    var ctx = audioContext();
    if (!ctx) return false;
    function schedule() {
      var start = ctx.currentTime + 0.02;
      notes.forEach(function (note) {
        tone(ctx, note.frequency, start + note.offset, note.duration, note.volume);
      });
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().then(schedule).catch(function () { /* autoplay blocked */ });
      return true;
    }
    schedule();
    return true;
  }

  window.MathifySessionAlerts = { ping: ping };
})();
