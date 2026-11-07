/* كوليكار: يحفظ واجهة التطبيق على الهاتف لتفتح حتى بلا إنترنت.
   كل طلب يجرّب الإنترنت أولاً، فأي تحديث ترفعه يصل خلال دقائق، والنسخة المحفوظة احتياط فقط.
   طلبات الخادم (Apps Script) لا تمر من هنا ولا تُحفظ أبداً. */
const CACHE = 'kolicar-v1';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'privacy.html', 'icon-192.png', 'icon-512.png', 'maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then(hit => hit || (req.mode === 'navigate' ? caches.match(self.registration.scope) : Response.error()))));
});
