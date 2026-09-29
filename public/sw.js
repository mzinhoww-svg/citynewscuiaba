/* CityNews · gerado por scripts/build-sw.mjs a partir de src/sw e src/offline-page. Não edite. */
"use strict";
(() => {
  // src/content/pt-BR/offline.ts
  var OFFLINE_TEXT = {
    brand: "CityNews Cuiab\xE1",
    title: "Sem conex\xE3o",
    intro: "Voc\xEA est\xE1 sem internet. Estas p\xE1ginas est\xE3o guardadas neste aparelho:",
    pages: "P\xE1ginas",
    saved: "Salvas",
    read: "Lidas recentemente",
    empty: "Nada guardado ainda. Com internet, as p\xE1ginas que voc\xEA abrir ficam dispon\xEDveis aqui.",
    retry: "Tentar de novo",
    /** Rótulo de cópia antiga: `staleLabel` monta "Salva às 14h32, pode estar desatualizada." */
    staleNotice: "pode estar desatualizada.",
    savedAt: "Salva \xE0s",
    savedOn: "Salva em",
    backOnline: "Conex\xE3o de volta.",
    refresh: "Atualizar"
  };
  var SW_TEXT = {
    genericTitle: "CityNews",
    genericBody: "H\xE1 novidades no CityNews."
  };

  // src/sw/contract.ts
  var CACHES = {
    shell: "cn-shell-v1",
    /** Salvas: mesmo nome e conteúdo do SW anterior; nunca apagado nem no LRU. */
    salvos: "cn-salvos-v1",
    paginas: "cn-paginas-v1",
    lidas: "cn-lidas-v1",
    assets: "cn-assets-v1"
  };
  var LIMITS = {
    salvos: 20,
    paginas: 12,
    lidas: 30,
    capBytes: 25 * 1024 * 1024,
    networkTimeoutMs: 4e3,
    assetSweepEvery: 50
  };
  var OFFLINE_MARKER_HEADER = "x-cn-offline";
  var NEVER_CACHE = [
    "/estudio",
    "/api",
    "/entrar",
    "/criar-conta",
    "/perfil",
    "/privacidade",
    "/busca",
    "/pergunte",
    "/alertas"
  ];
  var SHELL_URLS = [
    "/offline.html",
    "/offline.js",
    "/offline.css",
    "/icons/icon-192.png",
    "/icons/badge-72.png",
    "/manifest.webmanifest"
  ];

  // src/sw/core.ts
  var SLUG = /^[a-z0-9-]{1,120}$/;
  function routeKind(path, sections) {
    if (NEVER_CACHE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
    if (path === "/") return "pagina";
    if (path === "/favoritos") return "favoritos";
    const m = /^\/materia\/([^/]+)$/.exec(path);
    if (m) return SLUG.test(m[1]) ? "materia" : null;
    const s = /^\/([a-z0-9-]+)$/.exec(path);
    if (s && sections.includes(s[1])) return "pagina";
    return null;
  }
  function cacheForKind(kind) {
    if (kind === "materia") return CACHES.lidas;
    if (kind === "favoritos") return CACHES.salvos;
    return CACHES.paginas;
  }
  function isCacheableResponse(r) {
    if (r.method !== "GET" || r.status !== 200 || !r.sameOrigin) return false;
    if (r.headers.get(OFFLINE_MARKER_HEADER) !== "1") return false;
    if (r.headers.has("set-cookie")) return false;
    return true;
  }
  var byLastAccess = (a, b) => a.lastAccess.localeCompare(b.lastAccess);
  function overBucketLimit(entries, cache, max) {
    const inBucket = entries.filter((e) => e.cache === cache).sort(byLastAccess);
    return inBucket.length > max ? inBucket.slice(0, inBucket.length - max) : [];
  }
  var EVICTION_ORDER = [CACHES.lidas, CACHES.paginas, CACHES.assets];
  function planEviction(entries, capBytes, extraBytes = 0) {
    const total = entries.filter((e) => e.cache !== CACHES.shell).reduce((n, e) => n + e.bytes, 0);
    let need = total - capBytes + (extraBytes > 0 ? extraBytes * 2 : 0);
    if (need <= 0) return [];
    const out = [];
    for (const cache of EVICTION_ORDER) {
      for (const e of entries.filter((x) => x.cache === cache).sort(byLastAccess)) {
        if (need <= 0) return out;
        out.push(e);
        need -= e.bytes;
      }
    }
    return out;
  }
  var BRAND_SUFFIX = /\s*[·|–-]\s*CityNews( Cuiabá)?\s*$/;
  function titleFromHtml(html) {
    const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    if (!m) return null;
    const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim().replace(BRAND_SUFFIX, "").trim();
    return t || null;
  }
  function decodeEntities(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
  }
  function assetUrlsFromHtml(html) {
    const out = /* @__PURE__ */ new Set();
    for (const m of html.matchAll(/(?:href|src)="(\/_next\/static\/[^"?#]+)/g)) out.add(m[1]);
    return [...out];
  }
  function internalPath(u) {
    if (typeof u !== "string" || !/^\/(?!\/)/.test(u) || /[\u0000-\u001F\s\\]/.test(u)) return null;
    return u;
  }
  var GENERIC = {
    title: SW_TEXT.genericTitle,
    body: SW_TEXT.genericBody,
    tag: "cn",
    url: "/",
    sendId: null
  };
  function parsePayload(raw) {
    let data = raw;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch {
        return { ...GENERIC };
      }
    }
    if (!data || typeof data !== "object") return { ...GENERIC };
    const p = data;
    if (p.v !== 1 || typeof p.t !== "string" || typeof p.b !== "string" || !p.t.trim())
      return { ...GENERIC };
    return {
      title: p.t.slice(0, 120),
      body: p.b.slice(0, 200),
      tag: typeof p.g === "string" && p.g ? p.g.slice(0, 64) : "cn",
      url: internalPath(p.u) ?? "/",
      sendId: typeof p.s === "string" && /^[0-9a-f-]{36}$/i.test(p.s) ? p.s : null
    };
  }
  function safeTarget(data, origin) {
    const d = data && typeof data === "object" ? data : {};
    const raw = typeof d.url === "string" ? d.url : typeof d.href === "string" ? d.href : "/";
    const internal = internalPath(raw);
    if (internal) return internal;
    try {
      const u = new URL(raw, origin);
      if (u.origin === origin) return `${u.pathname}${u.search}`;
    } catch {
    }
    return "/";
  }
  var CUIABA_OFFSET_MS = -4 * 36e5;
  function cuiaba(d) {
    const t = new Date(d.getTime() + CUIABA_OFFSET_MS);
    const dd = String(t.getUTCDate()).padStart(2, "0");
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
    const hh = String(t.getUTCHours()).padStart(2, "0");
    const mi = String(t.getUTCMinutes()).padStart(2, "0");
    return { day: `${t.getUTCFullYear()}-${mm}-${dd}`, time: `${hh}h${mi}` };
  }
  function savedAtLabel(cachedAt, now) {
    const c = cuiaba(cachedAt);
    if (c.day === cuiaba(now).day) return `${OFFLINE_TEXT.savedAt} ${c.time}`;
    const [, mm, dd] = c.day.split("-");
    return `${OFFLINE_TEXT.savedOn} ${dd}/${mm} \xE0s ${c.time}`;
  }
  function item(e, now) {
    return {
      url: e.url,
      title: e.title ?? e.url,
      cachedAt: e.cachedAt,
      label: savedAtLabel(new Date(e.cachedAt), now)
    };
  }
  function offlineListing(entries, now) {
    const newestFirst = (a, b) => b.lastAccess.localeCompare(a.lastAccess);
    return {
      paginas: entries.filter((e) => e.cache === CACHES.paginas).sort((a, b) => a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)).map((e) => item(e, now)),
      salvas: entries.filter((e) => e.cache === CACHES.salvos && e.url.startsWith("/materia/")).sort(newestFirst).map((e) => item(e, now)),
      lidas: entries.filter((e) => e.cache === CACHES.lidas).sort(newestFirst).map((e) => item(e, now))
    };
  }
  function cachedAtFor(clientMap, clientId, url, entries, online) {
    const known = clientMap.get(clientId);
    if (known) return known;
    if (online) return null;
    return entries.find((e) => e.url === url)?.cachedAt ?? null;
  }
  function cacheKey(url, origin) {
    try {
      return new URL(url, origin).pathname;
    } catch {
      return "/";
    }
  }

  // src/sw/sections.ts
  var SW_SECTIONS = [
    "cidade",
    "politica",
    "economia",
    "cultura",
    "esportes",
    "entretenimento",
    "gastronomia",
    "servicos",
    "guia-cuiaba",
    "seguranca",
    "saude",
    "agenda",
    "clima",
    "mobilidade"
  ];

  // src/sw/shared-db.ts
  var DB_NAME = "cn-sw";
  var DB_VERSION = 1;
  var dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("entries"))
            db.createObjectStore("entries", { keyPath: "url" });
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => {
            req.result.close();
            dbPromise = null;
          };
          resolve(req.result);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  }
  function run(store, mode, fn) {
    return open().then(
      (db) => new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
    );
  }
  async function getMeta(k) {
    const v = await run("meta", "readonly", (s) => s.get(k));
    return v ?? null;
  }
  async function setMeta(k, v) {
    await run("meta", "readwrite", (s) => s.put(v, k));
  }
  async function putEntry(e) {
    await run("entries", "readwrite", (s) => s.put(e));
  }
  async function allEntries() {
    const v = await run("entries", "readonly", (s) => s.getAll());
    return Array.isArray(v) ? v : [];
  }
  async function deleteEntries(urls) {
    const db = await open();
    if (!db || urls.length === 0) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction("entries", "readwrite");
        const s = tx.objectStore("entries");
        for (const u of urls) s.delete(u);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  async function touch(url, at) {
    const e = await run("entries", "readonly", (s) => s.get(url));
    if (e) await putEntry({ ...e, lastAccess: at });
  }

  // src/sw/index.ts
  var ORIGIN = self.location.origin;
  var KEEP = new Set(Object.values(CACHES));
  var servedFromCache = /* @__PURE__ */ new Map();
  var writesSinceSweep = 0;
  var sameOrigin = (url) => {
    try {
      return new URL(url, ORIGIN).origin === ORIGIN;
    } catch {
      return false;
    }
  };
  async function bytesOf(res) {
    try {
      return (await res.clone().arrayBuffer()).byteLength;
    } catch {
      return 0;
    }
  }
  async function removeEntries(entries) {
    if (entries.length === 0) return;
    for (const e of entries) {
      try {
        const c = await caches.open(e.cache);
        await c.delete(e.url);
      } catch {
      }
    }
    await deleteEntries(entries.map((e) => e.url));
  }
  async function enforceLimits(extraBytes = 0) {
    const entries = await allEntries();
    const over = [
      ...overBucketLimit(entries, CACHES.lidas, LIMITS.lidas),
      ...overBucketLimit(entries, CACHES.paginas, LIMITS.paginas)
    ];
    await removeEntries(over);
    const rest = entries.filter((e) => !over.includes(e));
    await removeEntries(planEviction(rest, LIMITS.capBytes, extraBytes));
  }
  async function putWithIndex(cache, url, res, title) {
    const bytes = await bytesOf(res);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const store = async () => {
      const c = await caches.open(cache);
      await c.put(url, res.clone());
    };
    try {
      await store();
    } catch (e) {
      if (!(e instanceof Error && e.name === "QuotaExceededError")) return false;
      await enforceLimits(bytes);
      try {
        await store();
      } catch {
        return false;
      }
    }
    const previous = (await allEntries()).find((x) => x.url === url);
    await putEntry({
      url,
      cache,
      title,
      bytes,
      cachedAt: now,
      lastAccess: previous?.lastAccess ?? now
    });
    await enforceLimits();
    writesSinceSweep++;
    if (writesSinceSweep >= LIMITS.assetSweepEvery) {
      writesSinceSweep = 0;
      await sweepOrphanAssets();
    }
    return true;
  }
  async function sweepOrphanAssets() {
    try {
      const used = /* @__PURE__ */ new Set();
      for (const name of [CACHES.salvos, CACHES.paginas, CACHES.lidas]) {
        const c = await caches.open(name);
        for (const req of await c.keys()) {
          const path = new URL(req.url).pathname;
          if (path.startsWith("/_next/static/")) continue;
          const res = await c.match(req);
          if (!res) continue;
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("text/html")) continue;
          for (const a of assetUrlsFromHtml(await res.clone().text())) used.add(a);
        }
      }
      const assets = await caches.open(CACHES.assets);
      const gone = [];
      for (const req of await assets.keys()) {
        const path = new URL(req.url).pathname;
        if (!used.has(path)) {
          await assets.delete(req);
          gone.push(path);
        }
      }
      await deleteEntries(gone);
    } catch {
    }
  }
  async function cachePage(cache, path) {
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await putWithIndex(cache, path, res, titleFromHtml(html));
    await cacheAssets(html);
  }
  async function cacheAssets(html) {
    const assets = await caches.open(CACHES.assets);
    await Promise.all(
      assetUrlsFromHtml(html).map(async (a) => {
        if (await assets.match(a)) return;
        try {
          const res = await fetch(a);
          if (res.ok) {
            await assets.put(a, res.clone());
            await putEntry({
              url: a,
              cache: CACHES.assets,
              title: null,
              bytes: await bytesOf(res),
              cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
              lastAccess: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        } catch {
        }
      })
    );
  }
  async function syncSaved(paths) {
    const keep = paths.filter((p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//")).slice(0, LIMITS.salvos);
    const cache = await caches.open(CACHES.salvos);
    const gone = [];
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/materia/") && !keep.includes(path)) {
        await cache.delete(req);
        gone.push(path);
      }
    }
    await deleteEntries(gone);
    for (const p of keep) {
      if (!await cache.match(p)) await cachePage(CACHES.salvos, p).catch(() => void 0);
    }
    await cachePage(CACHES.salvos, "/favoritos").catch(() => void 0);
    for (const u of ["/offline.html", "/offline.css"])
      if (!await cache.match(u)) await cache.add(u).catch(() => void 0);
  }
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHES.shell).then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => void 0)))).catch(() => void 0).then(() => self.skipWaiting())
    );
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
        await self.clients.claim();
        await sweepOrphanAssets();
      })()
    );
  });
  function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(
        (r) => {
          clearTimeout(t);
          resolve(r);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }
  async function offlinePage() {
    for (const name of [CACHES.shell, CACHES.salvos]) {
      const hit = await (await caches.open(name)).match("/offline.html");
      if (hit) return hit;
    }
    return Response.error();
  }
  async function fromCaches(path) {
    for (const name of [CACHES.salvos, CACHES.lidas, CACHES.paginas]) {
      const hit = await (await caches.open(name)).match(path);
      if (hit) return { res: hit, cache: name };
    }
    return null;
  }
  async function handleNavigation(event, path) {
    const kind = routeKind(path, SW_SECTIONS);
    const req = event.request;
    try {
      const res = await withTimeout(fetch(req), LIMITS.networkTimeoutMs);
      if (kind && isCacheableResponse({
        method: req.method,
        status: res.status,
        sameOrigin: true,
        headers: res.headers
      })) {
        const cache = cacheForKind(kind);
        const html = await res.clone().text();
        event.waitUntil(
          (async () => {
            await putWithIndex(cache, path, res.clone(), titleFromHtml(html));
            await touch(path, (/* @__PURE__ */ new Date()).toISOString());
            await cacheAssets(html);
          })()
        );
      }
      return res;
    } catch {
      const hit = kind ? await fromCaches(path) : null;
      if (hit) {
        const entries = await allEntries();
        const entry = entries.find((e) => e.url === path);
        const cachedAt = entry?.cachedAt ?? (/* @__PURE__ */ new Date(0)).toISOString();
        if (event.resultingClientId) servedFromCache.set(event.resultingClientId, cachedAt);
        if (entry) await touch(path, (/* @__PURE__ */ new Date()).toISOString());
        return hit.res;
      }
      return offlinePage();
    }
  }
  async function handleAsset(req) {
    const path = new URL(req.url).pathname;
    for (const name of [CACHES.assets, CACHES.salvos]) {
      const hit = await (await caches.open(name)).match(path);
      if (hit) return hit;
    }
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(CACHES.assets);
      const copy = res.clone();
      void bytesOf(res).then(
        (bytes) => c.put(path, copy).then(
          () => putEntry({
            url: path,
            cache: CACHES.assets,
            title: null,
            bytes,
            cachedAt: (/* @__PURE__ */ new Date()).toISOString(),
            lastAccess: (/* @__PURE__ */ new Date()).toISOString()
          })
        ).catch(() => void 0)
      );
    }
    return res;
  }
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET" || !sameOrigin(req.url)) return;
    const url = new URL(req.url);
    if (req.mode === "navigate") {
      event.respondWith(handleNavigation(event, cacheKey(url.pathname, ORIGIN)));
      return;
    }
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(handleAsset(req).catch(() => Response.error()));
      return;
    }
    if (SHELL_URLS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
      event.respondWith(
        (async () => {
          for (const name of [CACHES.shell, CACHES.salvos]) {
            const hit = await (await caches.open(name)).match(url.pathname);
            if (hit) return hit;
          }
          return fetch(req);
        })().catch(() => Response.error())
      );
    }
  });
  async function receipt(sendId, e) {
    if (!sendId) return;
    try {
      const consent = await getMeta("consent");
      if (!consent?.metrics) return;
      await fetch("/api/push/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ s: sendId, e, d: consent.device, b: consent.browser }),
        keepalive: true
      });
    } catch {
    }
  }
  self.addEventListener("push", (event) => {
    let raw = null;
    try {
      raw = event.data ? event.data.text() : null;
    } catch {
      raw = null;
    }
    const p = parsePayload(raw);
    event.waitUntil(
      self.registration.showNotification(p.title || SW_TEXT.genericTitle, {
        body: p.body,
        tag: p.tag,
        data: { url: p.url, s: p.sendId },
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        lang: "pt-BR",
        // `renotify` saiu das tipagens do TS, mas os navegadores ainda o leem (spec §8.4).
        ...{ renotify: false }
      }).then(() => receipt(p.sendId, "delivered"))
    );
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data;
    const target = safeTarget(data, ORIGIN);
    const sendId = data && typeof data === "object" && typeof data.s === "string" ? data.s : null;
    event.waitUntil(
      (async () => {
        const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of list) {
          if ("focus" in c) {
            await c.navigate(target).catch(() => void 0);
            await c.focus();
            await receipt(sendId, "clicked");
            return;
          }
        }
        await self.clients.openWindow(target);
        await receipt(sendId, "clicked");
      })()
    );
  });
  self.addEventListener("pushsubscriptionchange", (event) => {
    const ev = event;
    ev.waitUntil(
      (async () => {
        const meta = await getMeta("push");
        if (!meta) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: meta.publicKey
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscriptions/rotate", {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: `Bearer ${meta.token}` },
          body: JSON.stringify({
            oldEndpoint: ev.oldSubscription?.endpoint ?? "",
            endpoint: sub.endpoint,
            keys: json.keys
          })
        });
      })().catch(() => void 0)
    );
  });
  async function reply(event, value) {
    const port = event.ports[0];
    if (port) port.postMessage(value);
    else if (event.source && "postMessage" in event.source)
      event.source.postMessage(value);
  }
  async function clearOffline() {
    for (const name of [CACHES.lidas, CACHES.paginas]) await caches.delete(name);
    const entries = await allEntries();
    await deleteEntries(
      entries.filter((e) => e.cache === CACHES.lidas || e.cache === CACHES.paginas).map((e) => e.url)
    );
    servedFromCache.clear();
    await sweepOrphanAssets();
  }
  self.addEventListener("message", (event) => {
    const data = event.data ?? {};
    switch (data.type) {
      case "cache-saved":
        if (Array.isArray(data.paths)) event.waitUntil(syncSaved(data.paths));
        return;
      case "consent":
        event.waitUntil(
          setMeta("consent", {
            metrics: data.metrics === true,
            device: data.device ?? "desktop",
            browser: data.browser ?? "other"
          })
        );
        return;
      case "served-from-cache":
        event.waitUntil(
          (async () => {
            const clientId = event.source && "id" in event.source ? event.source.id : "";
            const url = typeof data.url === "string" ? cacheKey(data.url, ORIGIN) : "/";
            const online = self.navigator.onLine;
            const cachedAt = cachedAtFor(
              servedFromCache,
              clientId,
              url,
              online ? [] : await allEntries(),
              online
            );
            await reply(event, { cachedAt });
          })()
        );
        return;
      case "list-offline":
        event.waitUntil(
          (async () => {
            const listing = offlineListing(await allEntries(), /* @__PURE__ */ new Date());
            await reply(event, listing);
          })()
        );
        return;
      case "clear-offline":
        event.waitUntil(clearOffline().then(() => reply(event, { cleared: true })));
        return;
      default:
        return;
    }
  });
})();
