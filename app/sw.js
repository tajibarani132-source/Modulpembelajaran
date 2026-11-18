/* sw.js — service worker: aplikasi tetap berjalan tanpa internet (PWA) */
var VERSION = 'modul-rps-v1.1.0';
var ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/util.js', 'js/server.js', 'js/extract.js', 'js/parse.js', 'js/diagram.js', 'js/template.js', 'js/ai.js', 'js/docmodel.js', 'js/pdf.js', 'js/docx.js', 'js/app.js',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/mammoth.browser.min.js', 'vendor/pdfmake.min.js', 'vendor/standard-fonts/Times.js', 'vendor/jszip.min.js', 'vendor/anthropic-sdk.js',
  'img/logo-iain.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png', 'img/favicon-64.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API AI & server lokal tidak ditangani SW
  var scope = self.registration.scope;
  // API dan panel admin Server Pusat (bila aplikasi disajikan dari server pusat) selalu langsung ke jaringan
  if (req.url.indexOf(scope + 'api/') === 0 || req.url.indexOf(scope + 'admin') === 0) return;
  if (req.mode === 'navigate') {
    // halaman: utamakan jaringan agar pembaruan cepat terlihat, cadangan dari cache
    var isApp = url.href.split(/[?#]/)[0] === scope || url.pathname === new URL('index.html', scope).pathname;
    e.respondWith(fetch(req).then(function (res) {
      if (isApp && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', copy); }); }
      return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
