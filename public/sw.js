const CACHE_NAME = "dyna-serv-wims-shell-v2";
const RUNTIME_CACHE_NAME = "dyna-serv-wims-runtime-v1";
const SHELL_ASSETS = ["/offline.html", "/manifest.webmanifest", "/logo.svg", "/logo-hd.png"];

function isCacheableGet(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return false;
  // Never replay API responses as if they were authoritative live data. The
  // offline queue owns physical observations; mutations still go through the
  // server when connectivity returns.
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/auth/")) return false;
  return true;
}

async function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  try {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // A cache quota or clone failure must never break the live request.
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheSuccessfulResponse(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/offline.html");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![CACHE_NAME, RUNTIME_CACHE_NAME].includes(key))
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (!isCacheableGet(event.request)) return;
  event.respondWith(networkFirst(event.request));
});
