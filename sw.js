/* Accent Lab service worker: offline shell, saved lessons and recordings, and the speech-model runtime. */
const VERSION = '13a0c1e275';
const SHELL = 'shell-' + VERSION;
const DATA = 'data-' + VERSION;
const MEDIA = 'media-v2';
const RUNTIME = 'runtime-v1';
const PRECACHE = ["./assets/asr.worker-HzUXKGOX.js","./assets/index-DIHO6nr1.js","./assets/index-Dc2IwuyQ.css","./assets/microsoft.cognitiveservices.speech.sdk-CnjlNzmd.js","./assets/source-sans-3-cyrillic-ext-wght-normal-DRCEkt1i.woff2","./assets/source-sans-3-cyrillic-wght-normal-CBKVyBaP.woff2","./assets/source-sans-3-greek-ext-wght-normal-xJtVpetf.woff2","./assets/source-sans-3-greek-wght-normal-DMoEshA0.woff2","./assets/source-sans-3-latin-ext-wght-normal-C9MlJypZ.woff2","./assets/source-sans-3-latin-wght-normal-CJ0msDsQ.woff2","./assets/source-sans-3-vietnamese-wght-normal-C54N3Iud.woff2","./data/alts.json","./data/audio.json","./data/checks.json","./data/files.json","./data/sounds.json","./data/stories/index.json","./data/words.json","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./manifest.webmanifest","./splash/splash-1125x2436.png","./splash/splash-1170x2532.png","./splash/splash-1179x2556.png","./splash/splash-1206x2622.png","./splash/splash-1242x2688.png","./splash/splash-1284x2778.png","./splash/splash-1290x2796.png","./splash/splash-1320x2868.png","./splash/splash-750x1334.png","./splash/splash-828x1792.png"];

self.addEventListener('install', e => {
  // straight from the server, not the browser's HTTP cache, which may still hold the previous version for a few minutes
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, MEDIA, RUNTIME, 'transformers-cache']);
    const keys = await caches.keys();
    // older data caches are dropped: they could reference recordings that no longer exist
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    // recordings are stored under content-hashed names; remove the ones this version no longer uses
    try {
      const r = await fetch(new URL('./data/files.json', self.registration.scope).href, { cache: 'no-store' });
      if (r.ok) {
        const { files } = await r.json();
        const live = new Set(files.map(f => new URL('./' + f[0], self.registration.scope).href));
        const mc = await caches.open(MEDIA);
        for (const req of await mc.keys()) if (!live.has(req.url)) await mc.delete(req);
      }
    } catch { /* offline: prune next time */ }
    await self.clients.claim();
  })());
});

async function rangeResponse(req, full) {
  const range = req.headers.get('range');
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}

async function cacheFirst(cacheName, req, key) {
  const cache = await caches.open(cacheName);
  let hit = await cache.match(key);
  if (!hit) {
    const res = await fetch(key);
    if (!res.ok) return res;
    await cache.put(key, res.clone());
    hit = res;
  }
  return hit;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;
  const key = req.url.split('#')[0];
  // the speech model is cached by the recognizer itself (Transformers.js): pass through
  if (u.pathname.includes('/models/')) return;
  if (u.pathname.includes('/audio/')) { e.respondWith(cacheFirst(MEDIA, req, key).then(r => rangeResponse(req, r.clone()))); return; }
  if (u.pathname.includes('/ort/')) { e.respondWith(cacheFirst(RUNTIME, req, key)); return; }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(new URL('./index.html', self.registration.scope).href)));
    return;
  }
  if (u.pathname.includes('/data/')) {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = (await c.match(req)) || (await caches.match(req));
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || Response.error());
      return hit || net;
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

self.addEventListener('message', e => {
  if (e.data?.type !== 'cache-all') return;
  const urls = e.data.urls; const client = e.source;
  (async () => {
    const mc = await caches.open(MEDIA), dc = await caches.open(DATA);
    let done = 0, bytes = 0, i = 0;
    const worker = async () => {
      while (i < urls.length) {
        const u = urls[i++];
        try {
          const c = u.includes('/audio/') ? mc : dc;
          if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) { bytes += Number(r.headers.get('content-length') || 0); await c.put(u, r); } }
        } catch (err) { /* keep going */ }
        done++;
        if (done % 5 === 0 || done === urls.length) client?.postMessage({ type: 'cache-progress', done, total: urls.length, bytes });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  })();
});
