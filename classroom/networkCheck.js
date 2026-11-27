/* Mathify classroom connection preflight.
 *
 * The test is deliberately boring: a cache-busted download, a same-size upload
 * and one small latency request to this origin. The browser times the transfer;
 * the server records the result against the JWT role and decides whether the
 * 1:1 class may open. No peer speed, device detail or secret is exposed. */
(function () {
  'use strict';

  var api = null;
  var sessionId = null;
  var button = null;
  var onState = function () {};
  var running = false;

  function now() {
    return (window.performance && typeof window.performance.now === 'function')
      ? window.performance.now() : Date.now();
  }

  function base() {
    return (api && api.base) || window.MATHIFY_API_BASE || '/api';
  }

  function round(value, places) {
    var scale = Math.pow(10, places || 0);
    return Math.round(Number(value) * scale) / scale;
  }

  function mbps(bytes, elapsedMs) {
    if (!Number.isFinite(bytes) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
    return bytes * 8 * 1000 / elapsedMs / 1000000;
  }

  function status(message) {
    var node = document.getElementById('callStatus');
    if (node && message) node.textContent = message;
  }

  function timedFetch(url, options, countedBytes) {
    var start = now();
    return fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('The speed test endpoint did not respond.');
      return response.arrayBuffer().then(function (buffer) {
        return {
          elapsedMs: Math.max(1, now() - start),
          bytes: countedBytes !== undefined ? countedBytes : (buffer ? buffer.byteLength : 0)
        };
      });
    });
  }

  function describe(network) {
    if (!network) return 'Run the connection speed check before class.';
    var role = (api && api.role) === 'student' ? 'student' : 'trainer';
    var own = network[role] || {};
    var required = network.required || {};
    if (own.ok !== true && own.status === 'expired') {
      return 'Connection result expired. Test again before class.';
    }
    if (own.ok !== true) {
      return 'Your connection is below the minimum. Please fix your internet, then test again.';
    }
    if (network.canStartCall !== true) {
      return 'Your connection is ready. Waiting for the other person to pass.';
    }
    return 'Connection ready for a private 1:1 class (' + (required.downloadMbps || 15) +
      ' Mbps down, ' + (required.uploadMbps || 10) + ' Mbps up).';
  }

  function init(options) {
    var settings = options || {};
    api = settings.api || window.mathifyClassroomApi || null;
    sessionId = settings.sessionId || window.MATHIFY_SESSION_ID || null;
    button = settings.button || document.getElementById('networkCheckBtn') || null;
    if (typeof settings.onState === 'function') onState = settings.onState;

    if (button) {
      button.addEventListener('click', function () {
        run().catch(function () {});
      });
    }
    return window.mathifyNetworkCheck;
  }

  function run() {
    if (running) return Promise.resolve(false);
    if (!api || !sessionId || typeof api.getSessionState !== 'function') {
      status('Open a session before testing your connection.');
      return Promise.resolve(false);
    }

    running = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Testing…';
    }
    status('Checking your connection speed…');

    var config = null;
    var download = null;
    var upload = null;
    var latency = null;

    return api.getSessionState(sessionId)
      .then(function (state) {
        config = (state && state.network) || {};
        var bytes = Math.max(1024, Number(config.probeBytes) || 524288);
        var stamp = Date.now();
        return timedFetch(
          base() + '/network/probe?bytes=' + bytes + '&t=' + stamp,
          { cache: 'no-store', credentials: 'same-origin' }
        );
      })
      .then(function (result) {
        download = result;
        var bytes = Math.max(1024, Number(config.probeBytes) || 524288);
        var payload = new Array(bytes + 1).join('x');
        var body = JSON.stringify({ bytes: bytes, data: payload });
        return timedFetch(
          base() + '/network/probe?t=' + Date.now(),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: body
          },
          body.length
        );
      })
      .then(function (result) {
        upload = result;
        return timedFetch(
          base() + '/network/probe?bytes=64&t=' + Date.now(),
          { cache: 'no-store', credentials: 'same-origin' }
        );
      })
      .then(function (result) {
        latency = result;
        return api.reportNetworkCheck(sessionId, {
          downloadMbps: round(mbps(download.bytes, download.elapsedMs), 2),
          uploadMbps: round(mbps(upload.bytes, upload.elapsedMs), 2),
          latencyMs: Math.round(latency.elapsedMs)
        });
      })
      .then(function (network) {
        onState(network, true);
        status(describe(network));
        return network && network.canStartCall === true;
      })
      .catch(function (error) {
        status('The connection test failed: ' + ((error && error.message) || 'try again.'));
        return false;
      })
      .then(function (passed) {
        running = false;
        if (button) {
          button.disabled = false;
          button.textContent = 'Check speed';
        }
        return passed;
      });
  }

  window.mathifyNetworkCheck = { init: init, run: run, describe: describe };
})();
