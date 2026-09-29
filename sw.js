const CACHE_NAME = "ps5-relapse-offline-v1";
const CORE = [
  "./",
  "./index.html",
  "./src/firmware.js",
  "./src/main.js",
  "./src/site.js",
  "./src/relapse_exploit.js",
  "./src/rop.js",
  "./src/webkit.js",
  "./src/kexp.js",
  "./src/utils/int64.js",
  "./src/utils/mem.js",
  "./src/utils/rop_slave.js",
  "./src/utils/syscalls.js",
  "./payloads/elfldr-ps5-1360.elf",
  "./payloads/etaHEN.elf",
  "./payloads/kexp_2026_05_25.bin",
  "./payloads/kstuff.elf",
  "./payloads/shadowmountplus.elf"
];

const OFFSETS = [
  "7.00","7.01","7.20","7.40","7.60","7.61","8.00","8.20","8.40","8.60",
  "9.00","9.20","9.40","9.60","10.00","10.01","10.20","10.40","10.60",
  "11.00","11.20","11.60","12.00","12.02","12.20","12.40","12.60",
  "12.70","13.00","13.20","13.40","13.42","13.60"
].map(v => "./offsets/" + v + ".js");

const ASSETS = CORE.concat(OFFSETS);

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function notify(type, extra) {
  const clients = await self.clients.matchAll({type:"window", includeUncontrolled:true});
  for (const client of clients) client.postMessage(Object.assign({type}, extra || {}));
}

async function prepareCache() {
  const cache = await caches.open(CACHE_NAME);
  let done = 0;
  await notify("CACHE_PROGRESS", {percent:0});
  for (const url of ASSETS) {
    try {
      let cached = await cache.match(url);
      if (!cached) {
        const request = new Request(url, {cache:"reload"});
        const response = await fetch(request);
        if (!response.ok) throw new Error("HTTP " + response.status);
        await cache.put(url, response.clone());
      }
      done++;
      await notify("CACHE_PROGRESS", {percent:Math.round(done * 100 / ASSETS.length)});
    } catch (e) {
      await notify("CACHE_ERROR", {message:"failed: " + url});
      throw e;
    }
  }
  await notify("CACHE_READY");
}

let preparing = null;
self.addEventListener("message", event => {
  if (!event.data || event.data.type !== "CACHE_PREPARE") return;
  if (!preparing) preparing = prepareCache().catch(() => {}).finally(() => { preparing = null; });
  event.waitUntil(preparing);
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = url.pathname + (url.pathname.endsWith("/firmware.js") ? "" : "");
    const cached = await cache.match(key) || await cache.match(req);
    if (cached) return cached;
    try {
      const network = await fetch(req);
      if (network.ok && (url.pathname.startsWith("/src/") || url.pathname.startsWith("/offsets/") || url.pathname.startsWith("/payloads/") || url.pathname === "/index.html" || url.pathname === "/")) {
        cache.put(key, network.clone()).catch(() => {});
      }
      return network;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  })());
});
