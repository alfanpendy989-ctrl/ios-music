// Service worker sederhana: aplikasi tetap bisa dibuka tanpa internet
// setelah kunjungan pertama. Halaman: network-first; aset: cache-first
// (nama file aset memakai hash, jadi aman disimpan lama).
const CACHE = 'ios-music-player-v3';

// Saat dipasang: simpan halaman beserta semua aset yang dirujuknya, supaya
// kunjungan berikutnya langsung bisa offline.
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put('./', res);
  const urls = new Set(['./manifest.webmanifest', './icon-192.png']);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const u = new URL(m[1], self.registration.scope);
    if (u.origin === self.location.origin) urls.add(u.href);
  }
  await Promise.all([...urls].map((u) => cache.add(u).catch(() => undefined)));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    precache()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.headers.has('range')) return;

  const put = (res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
    }
    return res;
  };

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(put)
        .catch(() => caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match('./'))),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then(put)));
});
