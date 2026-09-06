// Filled with the build version and exact output URLs by scripts/build-pwa.mjs.
const CACHE = "__MORPHER_CACHE__";
const SHELL = "__MORPHER_SHELL__";
const FONT_CACHE = "__MORPHER_FONT_CACHE__";
const FONTS = "__MORPHER_FONTS__";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  // Wait for all existing windows to close before replacing their worker.
  // Never reload a studio session with unsaved work for an update.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("morpher91-") &&
                key !== CACHE &&
                key !== FONT_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Keep the HTML and its hashed chunks from the same fully installed build.
  // Use the canonical URL: Cloudflare redirects /index.html to /, and a
  // cached response that followed a redirect cannot satisfy a navigation.
  const path = request.mode === "navigate" ? "/" : url.pathname;
  if (FONTS.includes(path)) {
    const response = (async () => {
      let cache;
      try {
        cache = await caches.open(FONT_CACHE);
      } catch {
        /* Storage unavailable. */
      }
      const cached = await cache?.match(path).catch(() => undefined);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok)
        await cache?.put(path, fresh.clone()).catch(() => undefined);
      return fresh;
    })();
    event.respondWith(response);
    return;
  }
  if (!SHELL.includes(path)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(async (cache) => (await cache.match(path)) ?? fetch(request)),
  );
});
