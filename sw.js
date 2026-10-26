/* Offline support. The app shell is network-first (so updates arrive when online);
 * the OCR engine and Japanese model are cache-first (large and versioned by path). */
const VERSION = '2026-10-26.3';
const SHELL_CACHE = 'shell-' + VERSION;
const BIG_CACHE = 'ocr-tesseract-5.1.1';
const FONT_CACHE = 'fonts-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/app.css', 'assets/data.js', 'assets/nito.js', 'assets/engine.js', 'assets/ocr-parse.js', 'assets/ing-icons.js', 'assets/ocr.js', 'assets/app.js',
  'vendor/tesseract/tesseract.min.js', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/vendor/')) {
      event.respondWith(caches.open(BIG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }));
      return;
    }
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    }));
  }
});
