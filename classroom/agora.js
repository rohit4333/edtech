/* Mathify classroom live-call module.
 *
 * The floating PiP in index.html is the 1:1 call surface. Agora identity is
 * always server-owned: this module only forwards the verified session id and
 * uses the returned appId / channelName / uid / peerUid. It never supplies a
 * channel, a uid, a role or a token of its own. */
(function () {
  'use strict';

  var RTC_CDN = 'https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4/+esm';

  var state = {
    sessionId: null,
    statusNode: null,
    nodes: null,
    client: null,
    sdk: null,
    localTracks: [],
    remoteVideoTrack: null,
    remoteAudioTrack: null,
    joined: false,
    joining: false,
    destroyed: false,
    channelName: '',
    uid: null,
    peerUid: null,
    micEnabled: true,
    cameraEnabled: false,
    controlsLocked: false,
    observer: false,
    networkReady: false,
    networkReason: 'Run the connection speed check before class.',
    peerLabel: '',
    handlers: null
  };

  var keepAliveTimer = null;

  var api = {
    init: init,
    destroy: destroy,
    join: join,
    leave: leave,
    setMicEnabled: setMicEnabled,
    setCameraEnabled: setCameraEnabled,
    forceMediaOn: forceMediaOn,
    applyTrainerMediaState: applyTrainerMediaState,
    setMediaControlsLocked: setMediaControlsLocked,
    setNetworkReady: setNetworkReady,
    setObserverOptIn: setObserverOptIn,
    reaffirmMedia: reaffirmMedia,
    setStatus: status,
    getState: getState
  };

  function findNodes() {
    var pip = document.getElementById('callPip');
    if (!pip) return null;
    return {
      pip: pip,
      local: pip.querySelector('[data-agora-video="local"]'),
      remote: pip.querySelector('[data-agora-video="remote"]'),
      localTile: pip.querySelector('.dock-trainer'),
      remoteTile: pip.querySelector('.dock-student'),
      peerLabel: pip.querySelector('[data-agora-peer-label]'),
      joinBtn: document.getElementById('agoraJoinBtn'),
      leaveBtn: document.getElementById('agoraLeaveBtn'),
      live: document.getElementById('pipLive'),
      liveWord: document.getElementById('pipLiveWord'),
      status: state.statusNode || document.getElementById('agoraCallStatus')
    };
  }

  function status(message) {
    var node = state.nodes && state.nodes.status;
    if (node) node.textContent = message || '';
  }

  function setLive(word, mode) {
    var live = state.nodes && state.nodes.live;
    if (live) live.setAttribute('data-state', mode || 'off');
    var label = state.nodes && state.nodes.liveWord;
    if (label) label.textContent = word || 'Off';
    else if (live) live.setAttribute('aria-label', 'Call ' + (word || 'off'));
  }

  function clear(node) {
    if (node) node.innerHTML = '';
  }

  function markVideo(tile, on) {
    if (tile) tile.classList.toggle('has-video', Boolean(on));
  }

  function syncButtons() {
    var nodes = state.nodes;
    if (!nodes) return;
    if (nodes.joinBtn) {
      nodes.joinBtn.disabled = state.destroyed || state.joined || state.joining ||
        !state.sessionId || !state.networkReady;
      nodes.joinBtn.textContent = state.joining ? 'Joining…'
        : (state.networkReady ? 'Join' : 'Check speed');
      nodes.joinBtn.title = state.networkReady ? 'Join the private 1:1 call' : state.networkReason;
    }
    if (nodes.leaveBtn) nodes.leaveBtn.disabled = !state.joined && !state.joining;
  }

  function isPeer(user) {
    if (!user || state.peerUid === null || state.peerUid === undefined) return false;
    return String(user.uid) === String(state.peerUid);
  }

  function labelPeer() {
    var node = state.nodes && state.nodes.peerLabel;
    if (!node) return;
    if (!state.peerLabel) state.peerLabel = node.textContent;
    if (state.peerUid !== null && state.peerUid !== undefined) {
      node.textContent = 'Peer ' + state.peerUid;
    }
  }

  function restorePeerLabel() {
    var node = state.nodes && state.nodes.peerLabel;
    if (node && state.peerLabel) node.textContent = state.peerLabel;
  }

  /* Returns the actual applied result. A missing or closed track is never
     reported as a successful force-on; the caller shows a degraded status. */
  function safeSetEnabled(track, enabled) {
    if (!track || typeof track.setEnabled !== 'function') return false;
    try { track.setEnabled(Boolean(enabled)); return true; } catch (error) { return false; }
  }

  function stopTrack(track) {
    if (!track || typeof track.stop !== 'function') return;
    try { track.stop(); } catch (error) { /* track may be closed */ }
  }

  function stopRemote() {
    stopTrack(state.remoteVideoTrack);
    stopTrack(state.remoteAudioTrack);
    state.remoteVideoTrack = null;
    state.remoteAudioTrack = null;
  }

  function setMicEnabled(enabled) {
    if (state.observer) return false;
    if (state.controlsLocked && !enabled) return false;
    state.micEnabled = Boolean(enabled);
    return safeSetEnabled(state.localTracks[0], state.micEnabled);
  }

  function setCameraEnabled(enabled) {
    if (state.observer) return false;
    if (state.controlsLocked && !enabled) return false;
    state.cameraEnabled = Boolean(enabled);
    return safeSetEnabled(state.localTracks[1], state.cameraEnabled);
  }

  /* Ordered revoke transition: call this BEFORE setMediaControlsLocked(true). */
  function forceMediaOn() {
    if (state.observer) {
      return {
        micApplied: false,
        cameraApplied: false,
        micTrackPresent: false,
        cameraTrackPresent: false,
        joined: state.joined,
        observer: true
      };
    }
    var micApplied = safeSetEnabled(state.localTracks[0], true);
    var cameraApplied = safeSetEnabled(state.localTracks[1], true);
    state.micEnabled = true;
    state.cameraEnabled = true;
    return {
      micApplied: micApplied,
      cameraApplied: cameraApplied,
      micTrackPresent: Boolean(state.localTracks[0]),
      cameraTrackPresent: Boolean(state.localTracks[1]),
      joined: state.joined
    };
  }

  /* An intentional trainer action is allowed even while controls are locked.
     A null value means "leave this track as it is". Results are honest: a
     missing, closed or permission-denied track is never reported as applied. */
  function applyTrainerMediaState(settings) {
    if (state.observer) {
      return {
        micApplied: false,
        cameraApplied: false,
        micTrackPresent: false,
        cameraTrackPresent: false,
        joined: state.joined,
        observer: true
      };
    }
    var input = settings || {};
    var result = {
      micApplied: false,
      cameraApplied: false,
      micTrackPresent: Boolean(state.localTracks[0]),
      cameraTrackPresent: Boolean(state.localTracks[1]),
      joined: state.joined
    };
    if (input.micOn === true || input.micOn === false) {
      if (input.micOn === false && state.controlsLocked) {
        /* Explicit trainer mute still overrides the student-control lock. */
        state.controlsLocked = false;
        result.micApplied = safeSetEnabled(state.localTracks[0], false);
        state.controlsLocked = true;
      } else {
        result.micApplied = safeSetEnabled(state.localTracks[0], input.micOn);
      }
      state.micEnabled = input.micOn;
    }
    if (input.cameraOn === true || input.cameraOn === false) {
      if (input.cameraOn === false && state.controlsLocked) {
        state.controlsLocked = false;
        result.cameraApplied = safeSetEnabled(state.localTracks[1], false);
        state.controlsLocked = true;
      } else {
        result.cameraApplied = safeSetEnabled(state.localTracks[1], input.cameraOn);
      }
      state.cameraEnabled = input.cameraOn;
    }
    return result;
  }

  function setMediaControlsLocked(locked) {
    state.controlsLocked = Boolean(locked);
    return state.controlsLocked;
  }

  function setNetworkReady(ready, reason) {
    state.networkReady = Boolean(ready);
    state.networkReason = reason || (state.networkReady
      ? 'Join the private 1:1 call.'
      : 'Run the connection speed check before class.');
    syncButtons();
    return state.networkReady;
  }

  /* Reaffirms the desired state without overriding an intentional mute/off.
     Called on quiz/whiteboard transitions, tab focus and a light keep-alive so
     a mobile browser suspension cannot silently leave a camera or mic off. */
  function reaffirmMedia() {
    if (state.observer || !state.joined || !state.localTracks.length) return false;
    var changed = false;
    if (state.micEnabled && safeSetEnabled(state.localTracks[0], true)) changed = true;
    if (state.cameraEnabled && safeSetEnabled(state.localTracks[1], true)) changed = true;
    return changed;
  }

  function makeError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function friendlyError(error) {
    var code = error && error.code;
    var httpStatus = error && error.status;
    if (code === 'SDK_LOAD_FAILED') {
      return 'The video SDK could not load. Check your connection and try again.';
    }
    if (code === 'TOKEN_UNAVAILABLE') {
      return 'No live video token was issued for this session.';
    }
    if (code === 'AGORA_NOT_CONFIGURED' || httpStatus === 503) {
      return 'Live video is not configured on this server yet.';
    }
    if (code === 'NETWORK_BELOW_MINIMUM') {
      return 'The class cannot start until both people pass the connection speed check.';
    }
    if (code === 'SESSION_CHANNEL_MISSING' || httpStatus === 409) {
      return 'This session has no video channel yet.';
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return 'This session could not be verified for video.';
    }
    var message = error && error.message ? String(error.message) : '';
    if (/failed to fetch|network|load module|dynamically imported/i.test(message)) {
      return 'The video SDK could not load. Check your connection and try again.';
    }
    return message ? 'Could not start the call: ' + message : 'Could not start the call.';
  }

  /* Only the server-issued peer is ever subscribed to. The channel is 1:1 and
     no other participant is played into this page. */
  function wireEvents() {
    var client = state.client;
    if (!client) return;

    client.on('user-published', function (user, mediaType) {
      if (!isPeer(user)) return;
      return client.subscribe(user, mediaType).then(function () {
        if (mediaType === 'video' && user.videoTrack && state.nodes && state.nodes.remote) {
          stopTrack(state.remoteVideoTrack);
          state.remoteVideoTrack = user.videoTrack;
          clear(state.nodes.remote);
          user.videoTrack.play(state.nodes.remote);
          markVideo(state.nodes.remoteTile, true);
        } else if (mediaType === 'audio' && user.audioTrack) {
          stopTrack(state.remoteAudioTrack);
          state.remoteAudioTrack = user.audioTrack;
          user.audioTrack.play();
        }
      }).catch(function (error) {
        status('Could not play peer ' + mediaType + ': ' + (error.message || 'unknown error'));
      });
    });

    client.on('user-unpublished', function (user, mediaType) {
      if (!isPeer(user)) return;
      if (mediaType === 'video') {
        stopTrack(state.remoteVideoTrack);
        state.remoteVideoTrack = null;
        clear(state.nodes && state.nodes.remote);
        markVideo(state.nodes && state.nodes.remoteTile, false);
      }
    });

    client.on('user-left', function (user) {
      if (!isPeer(user)) return;
      stopRemote();
      clear(state.nodes && state.nodes.remote);
      markVideo(state.nodes && state.nodes.remoteTile, false);
      status('Peer ' + state.peerUid + ' left the call.');
    });

    client.on('token-privilege-will-expire', function () {
      status('The call token is expiring soon. Leave and rejoin to continue.');
    });
  }

  /* Stops every track, clears both tiles and leaves the channel. Used by
     Leave, by a failed join and by page unload. */
  function forceCleanup() {
    var client = state.client;
    var leaveDone = Promise.resolve();
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }

    state.localTracks.forEach(stopTrack);
    state.localTracks = [];
    stopRemote();

    state.client = null;
    state.joined = false;
    state.joining = false;

    if (client && typeof client.leave === 'function') {
      try {
        var leaving = client.leave();
        if (leaving && typeof leaving.catch === 'function') leaveDone = leaving.catch(function () {});
      } catch (error) { /* client was never joined */ }
    }

    clear(state.nodes && state.nodes.local);
    clear(state.nodes && state.nodes.remote);
    markVideo(state.nodes && state.nodes.localTile, false);
    markVideo(state.nodes && state.nodes.remoteTile, false);
    restorePeerLabel();
    return leaveDone;
  }

  function join() {
    if (state.destroyed) return Promise.resolve(false);
    if (state.joined || state.joining) return Promise.resolve(state.joined);
    if (!state.sessionId) {
      status('Open a session before joining a call.');
      return Promise.resolve(false);
    }
    if (!state.networkReady) {
      status(state.networkReason);
      return Promise.resolve(false);
    }
    var classroomApi = window.mathifyClassroomApi;
    if (!classroomApi || typeof classroomApi.getRtcToken !== 'function') {
      status('The session API is not ready. Reload the page and try again.');
      return Promise.resolve(false);
    }

    state.joining = true;
    syncButtons();
    setLive('Connecting', 'pending');
    status('Loading video…');

    return Promise.resolve()
      .then(function () { return import(RTC_CDN); })
      .then(function (module) {
        var sdk = module && (module.default || module);
        if (!sdk || typeof sdk.createClient !== 'function') {
          throw makeError('SDK_LOAD_FAILED', 'Agora SDK unavailable.');
        }
        state.sdk = sdk;
        status('Getting a call token…');
        return classroomApi.getRtcToken(state.sessionId, { observer: state.observer });
      })
      .then(function (rtc) {
        if (state.destroyed) throw makeError('TOKEN_UNAVAILABLE', 'Call was closed.');
        var token = rtc && (rtc.rtcToken || rtc.token);
        var valid = rtc && rtc.appId && rtc.channelName &&
          rtc.uid !== undefined && rtc.uid !== null &&
          typeof token === 'string' && token.length > 0 &&
          (!rtc.provider || rtc.provider === 'agora') &&
          (!rtc.mode || rtc.mode === 'agora');
        if (!valid) throw makeError('TOKEN_UNAVAILABLE', 'No usable RTC token.');

        state.channelName = rtc.channelName;
        state.uid = rtc.uid;
        state.peerUid = rtc.peerUid;
        /* A subscriber token or an explicit observer opt-in is read-only: join
           the channel to receive the two participants, but never publish. */
        state.observer = state.observer || rtc.role === 'subscriber' || rtc.observer === true;
        state.client = state.sdk.createClient({ mode: 'rtc', codec: 'vp8' });
        wireEvents();
        status(state.observer ? 'Joining as observer…' : 'Joining…');

        return state.client.join(rtc.appId, rtc.channelName, token, rtc.uid)
          .then(function () {
            if (state.observer) {
              state.localTracks = [];
              return true;
            }
            return state.sdk.createMicrophoneAndCameraTracks()
              .then(function (tracks) {
                state.localTracks = tracks || [];
                safeSetEnabled(state.localTracks[0], state.micEnabled);
                safeSetEnabled(state.localTracks[1], state.cameraEnabled);
                if (state.localTracks[1] && state.nodes && state.nodes.local) {
                  clear(state.nodes.local);
                  state.localTracks[1].play(state.nodes.local);
                  markVideo(state.nodes.localTile, true);
                }
                return state.client.publish(state.localTracks);
              })
              .then(function () { return true; });
          })
          .then(function () {
            if (state.destroyed) {
              forceCleanup();
              return false;
            }
            state.joined = true;
            state.joining = false;
            if (!state.observer && !keepAliveTimer) {
              keepAliveTimer = setInterval(function () { reaffirmMedia(); }, 5000);
            }
            labelPeer();
            syncButtons();
            setLive(state.observer ? 'Observing' : 'Live', 'on');
            status(state.observer
              ? 'Observing the 1:1 call. You can see and hear the participants; they cannot see or hear you.'
              : (state.peerUid !== null && state.peerUid !== undefined
                ? 'Connected to peer ' + state.peerUid + '. Camera and voice stay in this 1:1 room.'
                : 'Connected. Your peer will appear when they join.'));
            return true;
          });
      })
      .catch(function (error) {
        forceCleanup();
        setLive('Off', 'off');
        syncButtons();
        status(friendlyError(error));
        return false;
      });
  }

  function leave() {
    if (!state.joined && !state.joining) return Promise.resolve(false);
    var wasJoined = state.joined;
    return forceCleanup().then(function () {
      setLive('Off', 'off');
      syncButtons();
      status('Left the call.');
      return wasJoined;
    });
  }

  function bind() {
    unbind();
    var nodes = state.nodes;
    if (!nodes) return;
    state.handlers = {
      join: function () { join(); },
      leave: function () { leave(); },
      unload: function () {
        if (state.joined || state.joining || state.localTracks.length) forceCleanup();
      },
      visible: function () {
        if (!document.hidden && state.joined) reaffirmMedia();
      }
    };
    if (nodes.joinBtn) nodes.joinBtn.addEventListener('click', state.handlers.join);
    if (nodes.leaveBtn) nodes.leaveBtn.addEventListener('click', state.handlers.leave);
    window.addEventListener('pagehide', state.handlers.unload);
    window.addEventListener('beforeunload', state.handlers.unload);
    document.addEventListener('visibilitychange', state.handlers.visible);
  }

  function unbind() {
    var handlers = state.handlers;
    if (!handlers) return;
    if (state.nodes) {
      if (state.nodes.joinBtn) state.nodes.joinBtn.removeEventListener('click', handlers.join);
      if (state.nodes.leaveBtn) state.nodes.leaveBtn.removeEventListener('click', handlers.leave);
    }
    window.removeEventListener('pagehide', handlers.unload);
    window.removeEventListener('beforeunload', handlers.unload);
    if (handlers.visible) document.removeEventListener('visibilitychange', handlers.visible);
    state.handlers = null;
  }

  function setObserverOptIn(value) {
    state.observer = value === true;
    return api;
  }

  function init(options) {
    var opts = options || {};
    unbind();
    state.sessionId = opts.sessionId || null;
    state.statusNode = opts.statusNode || document.getElementById('agoraCallStatus') || null;
    if (typeof opts.micEnabled === 'boolean') state.micEnabled = opts.micEnabled;
    if (typeof opts.cameraEnabled === 'boolean') state.cameraEnabled = opts.cameraEnabled;
    if (typeof opts.networkReady === 'boolean') state.networkReady = opts.networkReady;
    if (typeof opts.networkReason === 'string') state.networkReason = opts.networkReason;
    state.observer = opts.observer === true;
    state.destroyed = false;
    state.nodes = findNodes();
    bind();
    syncButtons();
    setLive('Off', 'off');
    status(state.sessionId
      ? 'Ready for a private 1:1 call. Join when you are.'
      : 'Open a session to use live video.');
    return api;
  }

  function destroy() {
    if (state.destroyed) return api;
    state.destroyed = true;
    unbind();
    forceCleanup();
    setLive('Off', 'off');
    state.sessionId = null;
    state.statusNode = null;
    state.nodes = null;
    state.sdk = null;
    state.peerUid = null;
    state.uid = null;
    state.channelName = '';
    return api;
  }

  function getState() {
    return {
      joined: state.joined,
      joining: state.joining,
      sessionId: state.sessionId,
      channelName: state.channelName,
      uid: state.uid,
      peerUid: state.peerUid,
      micEnabled: state.micEnabled,
      cameraEnabled: state.cameraEnabled,
      controlsLocked: state.controlsLocked,
      observer: state.observer,
      networkReady: state.networkReady,
      networkReason: state.networkReason
    };
  }

  window.mathifyClassroomAgora = api;
})();
