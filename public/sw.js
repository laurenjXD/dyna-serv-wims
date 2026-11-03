// Only public, session-independent assets may enter CacheStorage.
const CACHE_NAME = "dyna-serv-wims-shell-v3";
const SHELL_ASSETS = ["/offline.html", "/manifest.webmanifest", "/logo.svg", "/logo-hd.png"];

async function publicAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function documentNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match("/offline.html");
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("dyna-serv-wims-") && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Next.js data requests must never receive an offline HTML fallback.
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return;
  if (!url.search && SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(publicAsset(request));
  } else if (request.mode === "navigate") {
    event.respondWith(documentNavigation(request));
  }
});
