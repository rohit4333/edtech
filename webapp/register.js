/* Mathify installable web app bootstrap.
 *
 * One script injected by the server into every reviewed page adds the manifest,
 * registers a service worker that caches only static HTML/assets (never API or
 * founder-admin responses), and keeps the native permission contract honest:
 *
 *   - camera/microphone: requested once during native installation/first launch;
 *     the browser/PWA keeps its normal first-use prompt, and the classroom never
 *     asks for a second declaration;
 *   - chat photo upload: the scoped system file picker opens only after the
 *     learner or parent taps "Attach a maths photo". No broad storage or photo
 *     library permission is requested anywhere in the web app or native shells.
 */
(function () {
  'use strict';

  var MANIFEST = '/webapp/manifest.webmanifest';
  var SW = '/sw.js';
  var NATIVE_KEY = 'mathify.nativeShell';
  var MEDIA_KEY = 'mathify.cameraMicReady';
  var deferredInstall = null;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* private mode */ }
  }

  function addHeadAssets() {
    if (!document.head) return;
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = MANIFEST;
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      var theme = document.createElement('meta');
      theme.name = 'theme-color';
      theme.content = '#0c121d';
      document.head.appendChild(theme);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      var apple = document.createElement('meta');
      apple.name = 'apple-mobile-web-app-capable';
      apple.content = 'yes';
      document.head.appendChild(apple);
    }
  }

  function markNativeShell() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('native') !== '1') return;
    storageSet(NATIVE_KEY, '1');
    params.delete('native');
    var query = params.toString();
    try {
      window.history.replaceState(null, '',
        window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    } catch (error) { /* file: or restricted context */ }
  }

  function isNativeShell() {
    return storageGet(NATIVE_KEY) === '1';
  }

  /* Native shells request camera and microphone once, on first launch/install.
     Tracks are stopped immediately. Refusal is not fatal: the camera check can
     retry inside a real user gesture and the next native launch retries once. */
  function prepareCameraMic() {
    if (!isNativeShell() || storageGet(MEDIA_KEY) === '1') return Promise.resolve(false);
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(function (stream) {
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach(function (track) {
            try { track.stop(); } catch (error) { /* already stopped */ }
          });
        }
        storageSet(MEDIA_KEY, '1');
        return true;
      })
      .catch(function () { return false; });
  }

  /* The chat photo control uses the OS-scoped picker: the app receives only the
     image the person chooses, never a broad photo-library or storage grant. */
  function requestChatImageAccess() {
    return true;
  }

  function isChatImageControl(input, label) {
    if (!input || input.type !== 'file') return false;
    if (input.id === 'aiImage') return true;
    var hint = label ? (label.title || '') + ' ' + (label.getAttribute('aria-label') || '') : '';
    return /attach a maths photo/i.test(hint);
  }

  function bindScopedFilePickers() {
    document.addEventListener('click', function (event) {
      if (!isNativeShell()) return;
      var target = event.target;
      var input = null;
      var label = null;
      if (target && target.tagName === 'INPUT' && target.type === 'file') {
        input = target;
      } else if (target && typeof target.closest === 'function') {
        label = target.closest('label');
        if (label) input = label.querySelector('input[type="file"]');
      }
      if (!isChatImageControl(input, label)) return;
      if (input.getAttribute('data-mathify-scoped-picker') === '1') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestChatImageAccess();
      input.setAttribute('data-mathify-scoped-picker', '1');
      input.click();
      window.setTimeout(function () {
        input.removeAttribute('data-mathify-scoped-picker');
      }, 0);
    }, true);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var secure = window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1'].indexOf(window.location.hostname) !== -1;
    if (!secure) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(SW, { scope: '/', updateViaCache: 'none' }).catch(function () {
        /* The site stays fully usable online without a worker. */
      });
    });
  }

  addHeadAssets();
  markNativeShell();
  bindScopedFilePickers();

  window.MathifyWebApp = {
    isNativeShell: isNativeShell,
    isInstalled: function () {
      return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true || isNativeShell();
    },
    prepareCameraMic: prepareCameraMic,
    requestChatImageAccess: requestChatImageAccess,
    install: function () {
      if (!deferredInstall) return Promise.resolve(false);
      var prompt = deferredInstall;
      deferredInstall = null;
      return prompt.userChoice.then(function (choice) {
        return choice && choice.outcome === 'accepted';
      }).catch(function () { return false; });
    }
  };

  window.addEventListener('beforeinstallprompt', function (event) {
    deferredInstall = event;
  });

  if (isNativeShell()) prepareCameraMic();
  registerServiceWorker();
})();
