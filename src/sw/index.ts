/**
 * Service worker do CityNews (spec 2026-09-28 §8; PW-T3). Só liga eventos ao `core` (puro):
 * pré-cache do shell, leitura offline (home, editorias, lidas, salvas), LRU de 25 MB, push com
 * aviso sempre visível, toque no aviso e rotação da inscrição. Empacotado por esbuild em
 * `public/sw.js` (`pnpm sw:build`); o arquivo gerado é versionado e conferido no CI.
 *
 * Compatibilidade com o SW anterior: mensagem `cache-saved`, cache `cn-salvos-v1` (nunca
 * apagado) e `notificationclick` com `data.href` legado.
 */
import { SW_TEXT } from "@/content/pt-BR/offline";
import {
  CACHES,
  LIMITS,
  SHELL_URLS,
  SW_VERSION,
  type IndexEntry,
  type OfflineListing,
  type SwInbound,
} from "./contract";
import {
  assetUrlsFromHtml,
  bypassesSw,
  cacheForKind,
  cacheKey,
  cachedAtFor,
  isCacheableResponse,
  isStudioWindow,
  offlineListing,
  overBucketLimit,
  parsePayload,
  planEviction,
  routeKind,
  safeTarget,
  titleFromHtml,
} from "./core";
import { SW_SECTIONS } from "./sections";
import { allEntries, deleteEntries, getMeta, putEntry, setMeta, touch } from "./shared-db";

declare const self: ServiceWorkerGlobalScope;

const VERSION = SW_VERSION;
const ORIGIN = self.location.origin;
const KEEP = new Set<string>(Object.values(CACHES));
/** `clientId` da navegação atendida do cache → `cachedAt` da cópia (spec §7.8). */
const servedFromCache = new Map<string, string>();
let writesSinceSweep = 0;

const sameOrigin = (url: string): boolean => {
  try {
    return new URL(url, ORIGIN).origin === ORIGIN;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Índice e LRU
// ---------------------------------------------------------------------------
async function bytesOf(res: Response): Promise<number> {
  try {
    return (await res.clone().arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

async function removeEntries(entries: IndexEntry[]): Promise<void> {
  if (entries.length === 0) return;
  for (const e of entries) {
    try {
      const c = await caches.open(e.cache);
      await c.delete(e.url);
    } catch {
      /* segue */
    }
  }
  await deleteEntries(entries.map((e) => e.url));
}

/** Limites por balde e teto total, depois de cada gravação. */
async function enforceLimits(extraBytes = 0): Promise<void> {
  const entries = await allEntries();
  const over = [
    ...overBucketLimit(entries, CACHES.lidas, LIMITS.lidas),
    ...overBucketLimit(entries, CACHES.paginas, LIMITS.paginas),
  ];
  await removeEntries(over);
  const rest = entries.filter((e) => !over.includes(e));
  await removeEntries(planEviction(rest, LIMITS.capBytes, extraBytes));
}

async function putWithIndex(
  cache: string,
  url: string,
  res: Response,
  title: string | null,
): Promise<boolean> {
  const bytes = await bytesOf(res);
  const now = new Date().toISOString();
  const store = async () => {
    const c = await caches.open(cache);
    await c.put(url, res.clone());
  };
  try {
    await store();
  } catch (e) {
    if (!(e instanceof Error && e.name === "QuotaExceededError")) return false;
    // Cota cheia: libera o dobro e tenta uma vez (spec §15).
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
    lastAccess: previous?.lastAccess ?? now,
  });
  await enforceLimits();
  writesSinceSweep++;
  if (writesSinceSweep >= LIMITS.assetSweepEvery) {
    writesSinceSweep = 0;
    await sweepOrphanAssets();
  }
  return true;
}

/** Assets que nenhuma página guardada usa mais. */
async function sweepOrphanAssets(): Promise<void> {
  try {
    const used = new Set<string>();
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
    const gone: string[] = [];
    for (const req of await assets.keys()) {
      const path = new URL(req.url).pathname;
      if (!used.has(path)) {
        await assets.delete(req);
        gone.push(path);
      }
    }
    await deleteEntries(gone);
  } catch {
    /* varredura é oportunista */
  }
}

// ---------------------------------------------------------------------------
// Salvas (compatível com o SW anterior)
// ---------------------------------------------------------------------------
/**
 * Guarda uma página salva. Mesmo invariante da navegação (PWA-10): só rota da allowlist, buscada
 * sem cookie (`credentials: "omit"`, então nunca a versão de quem tem sessão) e só com o
 * marcador `x-cn-offline` que o proxy põe em respostas sem sessão.
 */
async function cachePage(cache: string, path: string): Promise<void> {
  if (routeKind(path, SW_SECTIONS) === null) return;
  const res = await fetch(path, { credentials: "omit" });
  if (
    !isCacheableResponse({
      method: "GET",
      status: res.status,
      sameOrigin: !res.redirected || sameOrigin(res.url),
      headers: res.headers,
    })
  )
    return;
  const html = await res.clone().text();
  await putWithIndex(cache, path, res, titleFromHtml(html));
  await cacheAssets(html);
}

async function cacheAssets(html: string): Promise<void> {
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
            cachedAt: new Date().toISOString(),
            lastAccess: new Date().toISOString(),
          });
        }
      } catch {
        /* asset opcional */
      }
    }),
  );
}

async function syncSaved(paths: unknown[]): Promise<void> {
  const keep = paths
    .filter(
      (p): p is string =>
        typeof p === "string" &&
        p.startsWith("/") &&
        !p.startsWith("//") &&
        routeKind(p, SW_SECTIONS) === "materia",
    )
    .slice(0, LIMITS.salvos);
  const cache = await caches.open(CACHES.salvos);
  const gone: string[] = [];
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/materia/") && !keep.includes(path)) {
      await cache.delete(req);
      gone.push(path);
    }
  }
  await deleteEntries(gone);
  for (const p of keep) {
    if (!(await cache.match(p))) await cachePage(CACHES.salvos, p).catch(() => undefined);
  }
  await cachePage(CACHES.salvos, "/favoritos").catch(() => undefined);
  for (const u of ["/offline.html", "/offline.css"])
    if (!(await cache.match(u))) await cache.add(u).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// install / activate
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHES.shell)
      .then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => undefined))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
      await sweepOrphanAssets();
    })(),
  );
});

// ---------------------------------------------------------------------------
// fetch (spec §8.4)
// ---------------------------------------------------------------------------
function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
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
      },
    );
  });
}

async function offlinePage(): Promise<Response> {
  for (const name of [CACHES.shell, CACHES.salvos]) {
    const hit = await (await caches.open(name)).match("/offline.html");
    if (hit) return hit;
  }
  return Response.error();
}

async function fromCaches(path: string): Promise<{ res: Response; cache: string } | null> {
  for (const name of [CACHES.salvos, CACHES.lidas, CACHES.paginas]) {
    const hit = await (await caches.open(name)).match(path);
    if (hit) return { res: hit, cache: name };
  }
  return null;
}

async function handleNavigation(event: FetchEvent, path: string): Promise<Response> {
  const kind = routeKind(path, SW_SECTIONS);
  const req = event.request;
  try {
    // Tempo limite de 4 s só onde há cópia para servir; o resto espera a rede (PWA-06).
    const res = kind ? await withTimeout(fetch(req), LIMITS.networkTimeoutMs) : await fetch(req);
    if (
      kind &&
      isCacheableResponse({
        method: req.method,
        status: res.status,
        sameOrigin: true,
        headers: res.headers,
      })
    ) {
      const cache = cacheForKind(kind);
      // A resposta sai já, sem ler o corpo (streaming e Suspense do App Router intactos, PWA-07);
      // as cópias são lidas dentro do `waitUntil`.
      const forText = res.clone();
      const forCache = res.clone();
      event.waitUntil(
        (async () => {
          const html = await forText.text();
          await putWithIndex(cache, path, forCache, titleFromHtml(html));
          await touch(path, new Date().toISOString());
          await cacheAssets(html);
        })().catch(() => undefined),
      );
    }
    return res;
  } catch {
    const hit = kind ? await fromCaches(path) : null;
    if (hit) {
      const entries = await allEntries();
      const entry = entries.find((e) => e.url === path);
      const cachedAt = entry?.cachedAt ?? new Date(0).toISOString();
      if (event.resultingClientId) servedFromCache.set(event.resultingClientId, cachedAt);
      if (entry) await touch(path, new Date().toISOString());
      return hit.res;
    }
    return offlinePage();
  }
}

async function handleAsset(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  for (const name of [CACHES.assets, CACHES.salvos]) {
    const hit = await (await caches.open(name)).match(path);
    if (hit) return hit;
  }
  const res = await fetch(req);
  if (res.ok) {
    const c = await caches.open(CACHES.assets);
    const copy = res.clone();
    void bytesOf(res).then((bytes) =>
      c
        .put(path, copy)
        .then(() =>
          putEntry({
            url: path,
            cache: CACHES.assets,
            title: null,
            bytes,
            cachedAt: new Date().toISOString(),
            lastAccess: new Date().toISOString(),
          }),
        )
        .catch(() => undefined),
    );
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !sameOrigin(req.url)) return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    // Estúdio, API, entrar, perfil e o retorno de login vão direto à rede (PWA-06).
    if (bypassesSw(url.pathname)) return;
    event.respondWith(handleNavigation(event, cacheKey(url.pathname, ORIGIN)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleAsset(req).catch(() => Response.error()));
    return;
  }
  // Shell (página Sem conexão, ícones, manifesto): cache primeiro, para funcionar sem rede.
  if (
    (SHELL_URLS as readonly string[]).includes(url.pathname) ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      (async () => {
        for (const name of [CACHES.shell, CACHES.salvos]) {
          const hit = await (await caches.open(name)).match(url.pathname);
          if (hit) return hit;
        }
        return fetch(req);
      })().catch(() => Response.error()),
    );
  }
});

// ---------------------------------------------------------------------------
// push / notificationclick / pushsubscriptionchange
// ---------------------------------------------------------------------------
async function receipt(sendId: string | null, e: "delivered" | "clicked"): Promise<void> {
  if (!sendId) return;
  try {
    const consent = await getMeta("consent");
    if (!consent?.metrics) return;
    await fetch("/api/push/receipt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s: sendId, e, d: consent.device, b: consent.browser }),
      keepalive: true,
    });
  } catch {
    /* recibo é opcional */
  }
}

self.addEventListener("push", (event) => {
  let raw: unknown = null;
  try {
    raw = event.data ? event.data.text() : null;
  } catch {
    raw = null;
  }
  const p = parsePayload(raw);
  event.waitUntil(
    self.registration
      .showNotification(p.title || SW_TEXT.genericTitle, {
        body: p.body,
        tag: p.tag,
        data: { url: p.url, s: p.sendId },
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        lang: "pt-BR",
        // `renotify` saiu das tipagens do TS, mas os navegadores ainda o leem (spec §8.4).
        ...({ renotify: false } as NotificationOptions),
      })
      .then(() => receipt(p.sendId, "delivered")),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as unknown;
  const target = safeTarget(data, ORIGIN);
  const sendId =
    data && typeof data === "object" && typeof (data as { s?: unknown }).s === "string"
      ? (data as { s: string }).s
      : null;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        // Nunca navega a aba do Estúdio (rascunho não salvo, PWA-11).
        if (isStudioWindow(c.url, ORIGIN)) continue;
        if ("focus" in c) {
          await c.navigate(target).catch(() => undefined);
          await c.focus();
          await receipt(sendId, "clicked");
          return;
        }
      }
      await self.clients.openWindow(target);
      await receipt(sendId, "clicked");
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const ev = event as ExtendableEvent & { oldSubscription?: PushSubscription | null };
  ev.waitUntil(
    (async () => {
      const meta = await getMeta("push");
      if (!meta) return;
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: meta.publicKey,
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscriptions/rotate", {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${meta.token}` },
        body: JSON.stringify({
          oldEndpoint: ev.oldSubscription?.endpoint ?? "",
          endpoint: sub.endpoint,
          keys: json.keys,
        }),
      });
    })().catch(() => undefined),
  );
});

// ---------------------------------------------------------------------------
// message (spec §8.4)
// ---------------------------------------------------------------------------
async function reply(event: ExtendableMessageEvent, value: unknown): Promise<void> {
  const port = event.ports[0];
  if (port) port.postMessage(value);
  else if (event.source && "postMessage" in event.source)
    (event.source as Client).postMessage(value);
}

async function clearOffline(): Promise<void> {
  for (const name of [CACHES.lidas, CACHES.paginas]) await caches.delete(name);
  const entries = await allEntries();
  await deleteEntries(
    entries.filter((e) => e.cache === CACHES.lidas || e.cache === CACHES.paginas).map((e) => e.url),
  );
  servedFromCache.clear();
  await sweepOrphanAssets();
}

self.addEventListener("message", (event) => {
  const data = (event.data ?? {}) as Partial<SwInbound>;
  switch (data.type) {
    case "cache-saved":
      if (Array.isArray(data.paths)) event.waitUntil(syncSaved(data.paths));
      return;
    case "consent":
      event.waitUntil(
        setMeta("consent", {
          metrics: data.metrics === true,
          device: data.device ?? "desktop",
          browser: data.browser ?? "other",
        }),
      );
      return;
    case "served-from-cache":
      event.waitUntil(
        (async () => {
          const clientId = event.source && "id" in event.source ? (event.source as Client).id : "";
          const url = typeof data.url === "string" ? cacheKey(data.url, ORIGIN) : "/";
          const online = self.navigator.onLine;
          const cachedAt = cachedAtFor(
            servedFromCache,
            clientId,
            url,
            online ? [] : await allEntries(),
            online,
          );
          await reply(event, { cachedAt });
        })(),
      );
      return;
    case "list-offline":
      event.waitUntil(
        (async () => {
          const listing: OfflineListing = offlineListing(await allEntries(), new Date());
          await reply(event, listing);
        })(),
      );
      return;
    case "clear-offline":
      event.waitUntil(clearOffline().then(() => reply(event, { cleared: true })));
      return;
    default:
      return;
  }
});

// Mantém a versão no arquivo gerado (diff legível quando o SW muda).
void VERSION;
