/* Offline + speed: everything the app needs is served from this device after the first visit.
   __BUILD__ is replaced with the commit id on every deploy, so a new version replaces the old cache. */
const VERSION = "__BUILD__";
const CACHE = "kf-app-" + VERSION;      // app files: replaced on every update
const DATA_CACHE = "kf-data";             // Gurbani data + photos: kept across updates (data folders are content-hashed)
const SHELL = ["./", "index.html", "display.html", "engine.js?v=" + VERSION, "worker.js?v=" + VERSION,
  "manifest.webmanifest", "icon.svg", "icon-192.png", "bg/index.json?v=" + VERSION];

async function currentDataDir() {
  try { const r = await fetch("data/current.json", { cache: "no-cache" }); const c = await r.json(); return `data/${c.v}/`; } catch (e) { return null; }
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    const dir = await currentDataDir();
    if (dir) { const d = await caches.open(DATA_CACHE); await Promise.all([dir + "meta.json", dir + "index.txt"].map(u => d.match(u).then(h => h || d.add(u)))); }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("kf-app-") && k !== CACHE).map(k => caches.delete(k)));
    // drop Gurbani data from older builds
    const dir = await currentDataDir();
    if (dir) {
      const d = await caches.open(DATA_CACHE);
      for (const req of await d.keys()) { const p = new URL(req.url).pathname; if (p.includes("/data/") && !p.includes("/" + dir)) await d.delete(req); }
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;
  // pages: try the network briefly so updates show up, fall back to the saved copy
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej("slow"), 2500))]);
        if (net.ok) cache.put(req, net.clone());
        return net;
      } catch (err) {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
      }
    })());
    return;
  }
  // which data folder is current: ask the network quickly, fall back to the saved answer
  if (url.pathname.endsWith("/data/current.json")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await Promise.race([fetch(req, { cache: "no-cache" }), new Promise((_, rej) => setTimeout(() => rej("slow"), 2500))]);
        if (net.ok) cache.put("data/current.json", net.clone());
        return net;
      } catch (err) { return (await cache.match("data/current.json")) || Response.error(); }
    })());
    return;
  }
  // everything else (Gurbani data, scripts, photos, fonts): saved copy first, download once
  e.respondWith((async () => {
    const keep = url.pathname.includes("/data/") || url.pathname.includes("/bg/") || fonts;
    const cache = await caches.open(keep ? DATA_CACHE : CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const net = await fetch(req);
    if (net.ok || net.type === "opaque") cache.put(req, net.clone());
    return net;
  })());
});
