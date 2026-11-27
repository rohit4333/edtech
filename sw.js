/* Mathify installable web app service worker.
 *
 * Offline support is for navigation and static assets only. Every API call,
 * every gated founder-admin document and every external SDK stays network-only
 * so auth, pay, presence, attendance and provider data are never cached. */
'use strict';

var CACHE = 'mathify-webapp-v35';
var OFFLINE = '/webapp/offline.html';
var SHELL = [
  '/',
  '/index.html',
  '/apps.html',
  '/login.html',
  '/register.html',
  '/password-reset.html',
  '/pricing.html',
  '/terms.html',
  '/privacy.html',
  '/refund.html',
  '/contact.html',
  '/home/index.html',
  '/student/index.html',
  '/trainer/index.html',
  '/parent/index.html',
  '/unified/index.html',
  '/founder/index.html',
  '/lms/index.html',
  '/planner-agent/index.html',
  '/rm/index.html',
  '/classroom/index.html',
  '/classroom/connect.html',
  '/classroom/app.js',
  '/classroom/session.js',
  '/classroom/call.css',
  '/classroom/room.css',
  '/classroom/engagement.css',
  '/webapp/register.js',
  '/webapp/manifest.webmanifest',
  '/webapp/icon-192.png',
  '/webapp/icon-512.png',
  '/webapp/icon-maskable-512.png',
  '/webapp/offline.html',
  '/shared/tokens.css',
  '/shared/sessionKeepalive.js',
  '/shared/fullBoard.js',
  '/shared/fullBoard.css',
  '/public.css',
  '/landing.css',
  '/landing.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(SHELL.map(function (url) {
      return cache.add(url).catch(function () { /* optional asset */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; })
      .map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

function isPrivate(pathname) {
  return pathname.indexOf('/api/') === 0 ||
    pathname.indexOf('/founder-admin') === 0 ||
    pathname.indexOf('/livekit') === 0 ||
    pathname.indexOf('/network/probe') === 0 ||
    pathname.indexOf('/webhook') === 0;
}

function networkFirst(request) {
  var cacheName = CACHE;
  return fetch(request).then(function (response) {
    if (response && response.ok && response.type === 'basic') {
      var copy = response.clone();
      caches.open(cacheName).then(function (cache) { cache.put(request, copy); });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      return cached || caches.match(OFFLINE);
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(function (cached) {
    var refresh = fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () { return cached; });
    return cached || refresh;
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url;
  try { url = new URL(request.url); } catch (error) { return; }
  if (url.origin !== self.location.origin || isPrivate(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
