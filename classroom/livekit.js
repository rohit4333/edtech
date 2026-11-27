/* Mathify classroom live-call module — LiveKit edition.
 *
 * The floating PiP in index.html is the 1:1 call surface. LiveKit identity,
 * room name and grants always come from the server; this module only forwards
 * the verified session id and the observer opt-in. The UMD client SDK is
 * loaded by index.html before this file and exposes window.LivekitClient. */
(function () {
  'use strict';

  var state = {
    sessionId: null,
    statusNode: null,
    nodes: null,
    room: null,
    rtc: null,
    roomName: '',
    identity: '',
    peerIdentity: '',
    micPublication: null,
    cameraPublication: null,
    remoteVideoTrack: null,
    remoteAudioTrack: null,
    remoteAudioElement: null,
    listeners: [],
    joined: false,
    joining: false,
    disconnecting: false,
    destroyed: false,
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
  var expiryTimer = null;

  var api = {
    init: init,
    destroy: destroy,
    join: joinClassroom,
    joinClassroom: joinClassroom,
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

  function sdk() {
    var client = window.LivekitClient;
    if (!client || typeof client.Room !== 'function' || !client.RoomEvent) {
      throw makeError('SDK_LOAD_FAILED', 'LiveKit SDK unavailable.');
    }
    return client;
  }

  function makeError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function findNodes() {
    var pip = document.getElementById('callPip');
    if (!pip) return null;
    return {
      pip: pip,
      local: pip.querySelector('[data-call-video="local"]'),
      remote: pip.querySelector('[data-call-video="remote"]'),
      localTile: pip.querySelector('.dock-trainer'),
      remoteTile: pip.querySelector('.dock-student'),
      peerLabel: pip.querySelector('[data-call-peer-label]'),
      joinBtn: document.getElementById('callJoinBtn'),
      leaveBtn: document.getElementById('callLeaveBtn'),
      live: document.getElementById('pipLive'),
      liveWord: document.getElementById('pipLiveWord'),
      status: state.statusNode || document.getElementById('callStatus')
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
    if (!node) return;
    try { node.innerHTML = ''; } catch (error) { /* detached node */ }
    if ('srcObject' in node) {
      try { node.srcObject = null; } catch (error) { /* read-only */ }
    }
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

  function isPeer(participant) {
    if (!participant || !state.peerIdentity) return false;
    return String(participant.identity) === String(state.peerIdentity);
  }

  function labelPeer() {
    var node = state.nodes && state.nodes.peerLabel;
    if (!node) return;
    if (!state.peerLabel) state.peerLabel = node.textContent;
    if (state.peerIdentity) node.textContent = 'Peer ' + state.peerIdentity;
  }

  function restorePeerLabel() {
    var node = state.nodes && state.nodes.peerLabel;
    if (node && state.peerLabel) node.textContent = state.peerLabel;
  }

  function on(room, event, handler) {
    room.on(event, handler);
    state.listeners.push([event, handler]);
  }

  function detach(track, element) {
    if (!track || !element || typeof track.detach !== 'function') return;
    try { track.detach(element); } catch (error) { /* track already closed */ }
  }

  function clearRemoteMedia() {
    detach(state.remoteVideoTrack, state.nodes && state.nodes.remote);
    if (state.remoteAudioElement) detach(state.remoteAudioTrack, state.remoteAudioElement);
    if (state.remoteAudioElement) {
      try { state.remoteAudioElement.pause(); } catch (error) { /* already paused */ }
      if (state.remoteAudioElement.parentNode) {
        state.remoteAudioElement.parentNode.removeChild(state.remoteAudioElement);
      }
    }
    state.remoteVideoTrack = null;
    state.remoteAudioTrack = null;
    state.remoteAudioElement = null;
    clear(state.nodes && state.nodes.remote);
    markVideo(state.nodes && state.nodes.remoteTile, false);
  }

  function clearLocalMedia() {
    detach(state.cameraPublication && state.cameraPublication.videoTrack,
      state.nodes && state.nodes.local);
    state.micPublication = null;
    state.cameraPublication = null;
    clear(state.nodes && state.nodes.local);
    markVideo(state.nodes && state.nodes.localTile, false);
  }

  function wireRoomEvents() {
    var room = state.room;
    if (!room) return;
    var events = window.LivekitClient.RoomEvent;

    on(room, events.TrackSubscribed, function (track, publication, participant) {
      if (!isPeer(participant)) return;
      if (track.kind === 'video') {
        clearRemoteMediaVideo();
        state.remoteVideoTrack = track;
        if (state.nodes && state.nodes.remote) {
          track.attach(state.nodes.remote);
          markVideo(state.nodes.remoteTile, true);
        }
      } else if (track.kind === 'audio') {
        clearRemoteAudio();
        state.remoteAudioTrack = track;
        var element = document.createElement('audio');
        element.autoplay = true;
        element.playsInline = true;
        element.setAttribute('hidden', 'hidden');
        element.setAttribute('aria-hidden', 'true');
        (state.nodes && state.nodes.pip ? state.nodes.pip : document.body).appendChild(element);
        state.remoteAudioElement = element;
        track.attach(element);
      }
    });

    on(room, events.TrackUnsubscribed, function (track, publication, participant) {
      if (!isPeer(participant)) return;
      if (track.kind === 'video') clearRemoteMediaVideo();
      else if (track.kind === 'audio') clearRemoteAudio();
    });

    on(room, events.ParticipantDisconnected, function (participant) {
      if (!isPeer(participant)) return;
      clearRemoteMedia();
      status('Peer left the call.');
    });

    on(room, events.Disconnected, function () {
      forceCleanup();
      setLive('Off', 'off');
      syncButtons();
      status('Left the call.');
    });

    on(room, events.Reconnecting, function () {
      status('Connection interrupted. Trying to reconnect…');
    });
    on(room, events.Reconnected, function () {
      status(state.observer ? 'Observing the 1:1 call.'
        : 'Reconnected. Camera and voice stay in this 1:1 room.');
    });

    on(room, events.LocalTrackPublished, function (publication) {
      if (state.observer || !publication || publication.source !== 'camera') return;
      state.cameraPublication = publication;
      if (publication.videoTrack && state.nodes && state.nodes.local) {
        clear(state.nodes.local);
        publication.videoTrack.attach(state.nodes.local);
        markVideo(state.nodes.localTile, true);
      }
    });

    on(room, events.LocalTrackUnpublished, function (publication) {
      if (!publication || publication.source !== 'camera') return;
      detach(state.cameraPublication && state.cameraPublication.videoTrack,
        state.nodes && state.nodes.local);
      state.cameraPublication = null;
      clear(state.nodes && state.nodes.local);
      markVideo(state.nodes && state.nodes.localTile, false);
    });

    on(room, events.TrackMuted, function (publication, participant) {
      if (!participant || participant.identity !== state.identity) return;
      if (publication.source === 'camera') markVideo(state.nodes && state.nodes.localTile, false);
    });
    on(room, events.TrackUnmuted, function (publication, participant) {
      if (!participant || participant.identity !== state.identity) return;
      if (publication.source === 'camera') markVideo(state.nodes && state.nodes.localTile, true);
    });

    on(room, events.TrackSubscriptionFailed, function () {
      status('Could not play the other person’s camera or microphone.');
    });
    on(room, events.MediaDevicesError, function () {
      status('Camera or microphone unavailable on this device.');
    });
  }

  function clearRemoteMediaVideo() {
    detach(state.remoteVideoTrack, state.nodes && state.nodes.remote);
    state.remoteVideoTrack = null;
    clear(state.nodes && state.nodes.remote);
    markVideo(state.nodes && state.nodes.remoteTile, false);
  }

  function clearRemoteAudio() {
    detach(state.remoteAudioTrack, state.remoteAudioElement);
    if (state.remoteAudioElement) {
      try { state.remoteAudioElement.pause(); } catch (error) { /* already paused */ }
      if (state.remoteAudioElement.parentNode) {
        state.remoteAudioElement.parentNode.removeChild(state.remoteAudioElement);
      }
    }
    state.remoteAudioTrack = null;
    state.remoteAudioElement = null;
  }

  function applyMic(enabled) {
    if (state.observer || !state.room || !state.room.localParticipant) return Promise.resolve(false);
    if (state.controlsLocked && !enabled) return Promise.resolve(false);
    return Promise.resolve(state.room.localParticipant.setMicrophoneEnabled(Boolean(enabled)))
      .then(function (publication) {
        state.micPublication = publication || null;
        return Boolean(publication);
      })
      .catch(function () { return false; });
  }

  function applyCamera(enabled) {
    if (state.observer || !state.room || !state.room.localParticipant) return Promise.resolve(false);
    if (state.controlsLocked && !enabled) return Promise.resolve(false);
    return Promise.resolve(state.room.localParticipant.setCameraEnabled(Boolean(enabled)))
      .then(function (publication) {
        state.cameraPublication = publication || null;
        return Boolean(publication);
      })
      .catch(function () { return false; });
  }

  function setMicEnabled(enabled) {
    if (state.observer) return Promise.resolve(false);
    state.micEnabled = Boolean(enabled);
    return applyMic(state.micEnabled);
  }

  function setCameraEnabled(enabled) {
    if (state.observer) return Promise.resolve(false);
    state.cameraEnabled = Boolean(enabled);
    return applyCamera(state.cameraEnabled);
  }

  /* Ordered revoke transition: call this BEFORE setMediaControlsLocked(true). */
  function forceMediaOn() {
    if (state.observer) {
      return { micApplied: false, cameraApplied: false, micTrackPresent: false,
        cameraTrackPresent: false, joined: state.joined, observer: true };
    }
    state.micEnabled = true;
    state.cameraEnabled = true;
    var canApply = Boolean(state.joined && state.room && state.rtc && !state.rtc.mock);
    applyMic(true);
    applyCamera(true);
    return {
      micApplied: canApply,
      cameraApplied: canApply,
      micTrackPresent: canApply,
      cameraTrackPresent: canApply,
      joined: state.joined
    };
  }

  /* An intentional trainer action is allowed even while controls are locked.
     A null value means "leave this track as it is". */
  function applyTrainerMediaState(settings) {
    if (state.observer) {
      return { micApplied: false, cameraApplied: false, micTrackPresent: false,
        cameraTrackPresent: false, joined: state.joined, observer: true };
    }
    var input = settings || {};
    var result = {
      micApplied: false,
      cameraApplied: false,
      micTrackPresent: Boolean(state.micPublication),
      cameraTrackPresent: Boolean(state.cameraPublication),
      joined: state.joined
    };
    if (input.micOn === true || input.micOn === false) {
      if (input.micOn === false && state.controlsLocked) {
        state.controlsLocked = false;
        applyMic(false);
        state.controlsLocked = true;
      } else applyMic(input.micOn);
      state.micEnabled = input.micOn;
      result.micApplied = Boolean(state.joined);
    }
    if (input.cameraOn === true || input.cameraOn === false) {
      if (input.cameraOn === false && state.controlsLocked) {
        state.controlsLocked = false;
        applyCamera(false);
        state.controlsLocked = true;
      } else applyCamera(input.cameraOn);
      state.cameraEnabled = input.cameraOn;
      result.cameraApplied = Boolean(state.joined);
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

  function reaffirmMedia() {
    if (state.observer || !state.joined || !state.room) return false;
    var changed = false;
    if (state.micEnabled) { applyMic(true); changed = true; }
    if (state.cameraEnabled) { applyCamera(true); changed = true; }
    return changed;
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
    if (code === 'LIVEKIT_NOT_CONFIGURED' || httpStatus === 503) {
      return 'Live video is not configured on this server yet.';
    }
    if (code === 'NETWORK_BELOW_MINIMUM') {
      return 'The class cannot start until both people pass the connection speed check.';
    }
    if (code === 'SESSION_ROOM_MISSING' || httpStatus === 409) {
      return 'This session has no video room yet.';
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return 'This session could not be verified for video.';
    }
    var message = error && error.message ? String(error.message) : '';
    return message ? 'Could not start the call: ' + message : 'Could not start the call.';
  }

  /* Joins the verified LiveKit room. Never creates its own room, identity or
     token. Observer joins never publish camera, microphone or data. */
  function joinClassroom() {
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
    if (!classroomApi || typeof classroomApi.getLiveKitToken !== 'function') {
      status('The session API is not ready. Reload the page and try again.');
      return Promise.resolve(false);
    }

    state.joining = true;
    syncButtons();
    setLive('Connecting', 'pending');
    status('Loading video…');

    return Promise.resolve()
      .then(function () {
        status('Getting a call token…');
        return classroomApi.getLiveKitToken(state.sessionId, { observer: state.observer });
      })
      .then(function (rtc) {
        if (state.destroyed) throw makeError('TOKEN_UNAVAILABLE', 'Call was closed.');
        var valid = rtc && typeof rtc.token === 'string' && rtc.token.length > 0 &&
          typeof rtc.url === 'string' && rtc.url.length > 0 &&
          typeof rtc.roomName === 'string' && rtc.roomName.length > 0 &&
          typeof rtc.identity === 'string' && rtc.identity.length > 0 &&
          rtc.provider === 'livekit' &&
          (rtc.mode === 'livekit' || rtc.mode === 'mock');
        if (!valid) throw makeError('TOKEN_UNAVAILABLE', 'No usable LiveKit token.');

        state.rtc = rtc;
        state.roomName = rtc.roomName;
        state.identity = rtc.identity;
        state.peerIdentity = rtc.peerIdentity || '';
        state.observer = state.observer || rtc.observer === true || rtc.role === 'subscriber';

        /* Deterministic mock mode never opens a real media connection. */
        if (rtc.mock === true || rtc.mode === 'mock') {
          state.joined = true;
          state.joining = false;
          setLive(state.observer ? 'Observing' : 'Live', 'on');
          status(state.observer
            ? 'Observing the 1:1 call (mock). No media is sent.'
            : 'Connected in mock mode. No media is sent.');
          labelPeer();
          syncButtons();
          return true;
        }

        var client = sdk();
        state.room = new client.Room({ autoSubscribe: true });
        wireRoomEvents();
        status(state.observer ? 'Joining as observer…' : 'Joining…');

        return state.room.connect(rtc.url, rtc.token, { autoSubscribe: true })
          .then(function () {
            if (typeof state.room.startAudio === 'function') {
              return Promise.resolve(state.room.startAudio()).catch(function () { return undefined; });
            }
            return undefined;
          })
          .then(function () {
            if (state.observer) return undefined;
            /* Publish camera + microphone through the documented Room helper. */
            return Promise.resolve(
              state.room.localParticipant.enableCameraAndMicrophone()
            ).then(function () {
              return Promise.all([
                state.room.localParticipant.setMicrophoneEnabled(state.micEnabled),
                state.room.localParticipant.setCameraEnabled(state.cameraEnabled)
              ]);
            }).then(function (publications) {
              state.micPublication = publications && publications[0] || null;
              state.cameraPublication = publications && publications[1] || null;
              return undefined;
            });
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
            var seconds = Number(rtc.expiresInSeconds || 0);
            if (seconds > 0 && !expiryTimer) {
              expiryTimer = setTimeout(function () {
                status('The call token is expiring soon. Leave and rejoin to continue.');
              }, Math.max(1000, (seconds - 120) * 1000));
            }
            labelPeer();
            syncButtons();
            setLive(state.observer ? 'Observing' : 'Live', 'on');
            status(state.observer
              ? 'Observing the 1:1 call. You can see and hear the participants; they cannot see or hear you.'
              : 'Connected. Camera and voice stay in this 1:1 room.');
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

  function forceCleanup() {
    var room = state.room;
    var done = Promise.resolve();

    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }

    if (room) {
      state.listeners.forEach(function (pair) {
        try { room.off(pair[0], pair[1]); } catch (error) { /* room already closed */ }
      });
    }
    state.listeners = [];

    clearRemoteMedia();
    clearLocalMedia();

    state.room = null;
    state.rtc = null;
    state.joined = false;
    state.joining = false;

    if (room && !state.disconnecting && typeof room.disconnect === 'function') {
      state.disconnecting = true;
      try {
        var leaving = room.disconnect(true);
        if (leaving && typeof leaving.catch === 'function') {
          done = leaving.catch(function () { return undefined; });
        }
      } catch (error) { /* room was never connected */ }
      state.disconnecting = false;
    }

    restorePeerLabel();
    setLive('Off', 'off');
    return done;
  }

  function leave() {
    if (!state.joined && !state.joining) return Promise.resolve(false);
    var wasJoined = state.joined;
    return forceCleanup().then(function () {
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
      join: function () { joinClassroom(); },
      leave: function () { leave(); },
      unload: function () {
        if (state.joined || state.joining || state.room) forceCleanup();
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
    state.statusNode = opts.statusNode || document.getElementById('callStatus') || null;
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
    state.peerIdentity = '';
    state.identity = '';
    state.roomName = '';
    return api;
  }

  function getState() {
    return {
      joined: state.joined,
      joining: state.joining,
      sessionId: state.sessionId,
      channelName: state.roomName,
      roomName: state.roomName,
      uid: state.identity,
      peerUid: state.peerIdentity,
      micEnabled: state.micEnabled,
      cameraEnabled: state.cameraEnabled,
      controlsLocked: state.controlsLocked,
      observer: state.observer,
      networkReady: state.networkReady,
      networkReason: state.networkReason
    };
  }

  window.mathifyClassroomLiveKit = api;
  window.mathifyClassroomRtc = api;
})();
