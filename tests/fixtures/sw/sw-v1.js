/*
 * Service worker do CityNews (P2-T9, P17/P18). Sem dados pessoais: guarda só as páginas das
 * 20 últimas matérias salvas (e os arquivos delas) para leitura offline, mais /favoritos e a
 * página "sem conexão". Também abre a matéria quando o leitor toca num alerta.
 * Rede primeiro: com conexão, tudo vem do servidor; o cache só responde quando a rede falha.
 */
const CACHE = "cn-salvos-v1";
const SHELL = ["/favoritos", "/offline.html", "/offline.css"];
const MAX_SAVED = 20;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const sameOrigin = (url) => {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin;
  } catch {
    return false;
  }
};

/** Guarda a página e os arquivos estáticos que ela usa (CSS, JS, fontes). */
async function cachePage(cache, path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(path, res);
  const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(
    [...new Set(assets)].map((a) =>
      cache.match(a).then((hit) => (hit ? undefined : cache.add(a).catch(() => undefined))),
    ),
  );
}

async function syncSaved(paths) {
  const keep = paths.filter((p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//")).slice(0, MAX_SAVED);
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  for (const req of keys) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/materia/") && !keep.includes(path)) await cache.delete(req);
  }
  for (const p of keep) {
    if (!(await cache.match(p))) await cachePage(cache, p).catch(() => undefined);
  }
  await cachePage(cache, "/favoritos").catch(() => undefined);
  for (const u of ["/offline.html", "/offline.css"])
    if (!(await cache.match(u))) await cache.add(u).catch(() => undefined);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cache-saved" && Array.isArray(data.paths)) event.waitUntil(syncSaved(data.paths));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !sameOrigin(req.url)) return;
  const url = new URL(req.url);
  const isPage = req.mode === "navigate";
  const isAsset = url.pathname.startsWith("/_next/static/");
  if (!isPage && !isAsset) return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(isPage ? url.pathname : req);
      if (hit) return hit;
      if (isPage) return (await cache.match("/offline.html")) || Response.error();
      return Response.error();
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  const target = sameOrigin(href) ? href : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
