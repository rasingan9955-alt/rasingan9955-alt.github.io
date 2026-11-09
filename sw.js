/* كوليكار: يحفظ واجهة التطبيق على الهاتف لتفتح حتى بلا إنترنت، ويعرض الإشعارات.
   كل طلب يجرّب الإنترنت أولاً، فأي تحديث ترفعه يصل خلال دقائق، والنسخة المحفوظة احتياط فقط.
   طلبات الخادم (Apps Script) لا تمر من هنا ولا تُحفظ أبداً. */
const CACHE = 'kolicar-v2';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'download.html', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'badge-96.png'];

/* رابط الخادم يأتي من config.js نفسه، فلا يُكتب في مكانين */
self.window = self;
try { importScripts('config.js'); } catch (e) {}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== META).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/\.apk$/i.test(url.pathname)) return;
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then(hit => hit || (req.mode === 'navigate' ? caches.match(self.registration.scope) : Response.error()))));
});

/* ================= الإشعارات =================
   خدمة الإشعارات (Google أو Mozilla أو Apple) توصل «جرساً» فارغاً فقط.
   عندها يسأل الهاتف خادم كوليكار عن نص الإشعار بعنوان اشتراكه السري، ثم يعرضه.
   هكذا لا يمر أي اسم أو هاتف أو طرد عبر تلك الخدمة. */
const META = 'kolicar-meta';
const SINCE = new URL('__kolicar_since', self.registration.scope).href;

async function apiUrl() {
  let u = String((self.KOLICAR || {}).api || '').trim();
  if (u) return u;
  try {
    const t = await (await fetch('config.js', { cache: 'no-cache' })).text();
    const m = /api:\s*'([^']+)'/.exec(t); if (m) u = m[1].trim();
  } catch (e) {}
  return u;
}
async function getSince() { try { const r = await (await caches.open(META)).match(SINCE); return r ? (+(await r.text()) || 0) : 0; } catch (e) { return 0; } }
async function setSince(t) { try { await (await caches.open(META)).put(SINCE, new Response(String(t))); } catch (e) {} }

async function inbox() {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return [];
  const api = await apiUrl();
  if (!/^https?:\/\//.test(api)) return [];
  const since = await getSince();
  const res = await fetch(api, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'inbox', p: { ep: sub.endpoint, since: since } }),
    redirect: 'follow', credentials: 'omit', cache: 'no-store'
  });
  const j = await res.json();
  const items = j && j.ok && Array.isArray(j.items) ? j.items.filter(m => m && m.title) : [];
  if (items.length) await setSince(Math.max.apply(null, items.map(m => +m.t || 0)));
  return items;
}

function show(m) {
  return self.registration.showNotification(String(m.title || 'كوليكار').slice(0, 120), {
    body: String(m.body || '').slice(0, 300),
    tag: String(m.tag || 'kolicar').slice(0, 60),
    renotify: true, lang: 'ar', dir: 'rtl',
    icon: 'icon-192.png', badge: 'badge-96.png', vibrate: [120, 60, 120],
    data: { url: String(m.url || './') }
  });
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [];
    try { const j = e.data ? e.data.json() : null; if (j && j.title) items = [j]; } catch (x) {}
    if (!items.length) { try { items = await inbox(); } catch (x) { items = []; } }
    /* المتصفح يشترط إشعاراً ظاهراً لكل جرس */
    if (!items.length) items = [{ title: 'كوليكار', body: 'لديك تحديث جديد. افتح التطبيق لتراه.', url: './', tag: 'kolicar' }];
    await Promise.all(items.slice(-4).map(show));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url;
  try { url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope); } catch (x) { url = new URL(self.registration.scope); }
  if (url.origin !== self.location.origin) url = new URL(self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (w) { try { w.postMessage({ kc: 'open', url: url.href }); } catch (x) {} return w.focus ? w.focus() : null; }
    return self.clients.openWindow ? self.clients.openWindow(url.href) : null;
  }));
});
