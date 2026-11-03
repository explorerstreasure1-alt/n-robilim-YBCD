/* NOCTA PWA: app shell + indirilen dil blokları ve sesler. */
const STATIC = "nocta-static-v2";
const DATA = "nocta-data-v2";
const LEGACY = "nocta-v1"; // önceki sürümde indirilmiş sesleri koru
const SHELL = [
  "/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/maskable-512.png", "/icons/apple-touch-icon.png",
  "/images/night-window.jpg", "/images/dawn-window.jpg", "/images/panel-texture.jpg",
  "/licenses/tatoeba-examples.txt",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => (key.startsWith("nocta-static-") && key !== STATIC) ||
        (key.startsWith("nocta-data-") && key !== DATA))
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// İlk yükleme service worker aktifleşmeden gerçekleşebilir. Sayfadan gelen
// Next.js dosyalarını açıkça önbelleğe al ki uygulama kabuğu çevrimdışı açılsın.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.slice(0, 80).filter((raw) => {
    try {
      const url = new URL(raw, self.location.origin);
      return url.origin === self.location.origin && url.pathname.startsWith("/_next/");
    } catch { return false; }
  });
  event.waitUntil(caches.open(STATIC).then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))));
});

async function cachedData(request) {
  const fresh = await (await caches.open(DATA)).match(request);
  if (fresh) return fresh;
  return (await caches.open(LEGACY)).match(request);
}

// Çevrimdışıyken tam cümle birebir bulunamazsa aynı dil için daha önce indirilen
// herhangi bir ses örneğine düşmek, en azından test ve kullanım sırasında sessizlikten iyidir.
async function cachedTtsFallback(request) {
  const direct = await cachedData(request);
  if (direct) return direct;
  const lang = new URL(request.url).searchParams.get('lang');
  if (!lang) return null;
  for (const cacheName of [DATA, LEGACY]) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const hit = keys.find((candidate) => {
      const url = new URL(candidate.url);
      return url.pathname === '/api/tts' && url.searchParams.get('lang') === lang;
    });
    if (hit) return cache.match(hit);
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === "/") {
          const cache = await caches.open(STATIC);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await (await caches.open(STATIC)).match("/")) ||
          (await (await caches.open(LEGACY)).match("/")) ||
          new Response("İnternet bağlantısı yok. NOCTA'yı önce çevrimiçi açın.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (["/api/tts", "/api/blocks", "/api/words", "/api/examples"].includes(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (!response.ok) return (url.pathname === '/api/tts' ? await cachedTtsFallback(request) : await cachedData(request)) || response;
        const cache = await caches.open(DATA);
        await cache.put(request, response.clone());
        return response;
      } catch {
        const fallback = url.pathname === '/api/tts' ? await cachedTtsFallback(request) : await cachedData(request);
        return fallback || Response.json({ error: "offline" }, { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/") || url.pathname.startsWith("/licenses/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await (await caches.open(LEGACY)).match(request)) || new Response("", { status: 504 });
      }
    })());
  }
});
