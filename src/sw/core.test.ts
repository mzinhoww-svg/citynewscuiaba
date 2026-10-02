import { describe, expect, it } from "vitest";
import { CACHES, type IndexEntry } from "./contract";
import {
  assetUrlsFromHtml,
  cacheForKind,
  cacheKey,
  cachedAtFor,
  isCacheableResponse,
  offlineListing,
  overBucketLimit,
  parsePayload,
  planEviction,
  routeKind,
  safeTarget,
  staleLabel,
  titleFromHtml,
} from "./core";
import { SW_SECTIONS } from "./sections";

const MB = 1024 * 1024;
const ORIGIN = "https://citynews.example";
const SEND = "b1000000-0000-4000-8000-000000000001";
const e = (cache: string, mb: number, hour: string, url = `${cache}/${hour}`): IndexEntry => ({
  url,
  cache,
  title: null,
  bytes: mb * MB,
  cachedAt: `2026-09-28T${hour}:00Z`,
  lastAccess: `2026-09-28T${hour}:00Z`,
});

describe("routeKind", () => {
  it("allowlist de rota", () => {
    expect(
      ["/", "/cidade", "/materia/chuva-forte", "/favoritos"].map((p) => routeKind(p, SW_SECTIONS)),
    ).toEqual(["pagina", "pagina", "materia", "favoritos"]);
    for (const p of [
      "/estudio",
      "/estudio/fila",
      "/api/events",
      "/perfil",
      "/busca",
      "/alertas",
      "/privacidade",
      "/pergunte",
      "/nao-existe",
      "/materia/a/b",
      "/materia/Maiúscula",
      "/entrar",
      "/criar-conta",
    ])
      expect(routeKind(p, SW_SECTIONS), p).toBeNull();
    expect(cacheForKind("materia")).toBe(CACHES.lidas);
    expect(cacheForKind("pagina")).toBe(CACHES.paginas);
    expect(cacheForKind("favoritos")).toBe(CACHES.salvos);
    expect(cacheKey("https://x/materia/a?b=1#c", "https://x")).toBe("/materia/a");
  });
});

describe("isCacheableResponse (Review Focus 1)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  const base = { method: "GET", status: 200, sameOrigin: true };
  it("só guarda com marcador, 200 e sem Set-Cookie; ignora o no-store do Next", () => {
    expect(
      isCacheableResponse({
        ...base,
        headers: h({
          "x-cn-offline": "1",
          "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
        }),
      }),
    ).toBe(true);
    expect(
      isCacheableResponse({ ...base, headers: h({ "cache-control": "public, max-age=60" }) }),
    ).toBe(false);
    expect(
      isCacheableResponse({ ...base, headers: h({ "x-cn-offline": "1", "set-cookie": "a=1" }) }),
    ).toBe(false);
    expect(isCacheableResponse({ ...base, status: 410, headers: h({ "x-cn-offline": "1" }) })).toBe(
      false,
    );
    expect(
      isCacheableResponse({ ...base, method: "POST", headers: h({ "x-cn-offline": "1" }) }),
    ).toBe(false);
    expect(
      isCacheableResponse({ ...base, sameOrigin: false, headers: h({ "x-cn-offline": "1" }) }),
    ).toBe(false);
    expect(isCacheableResponse({ ...base, headers: h({ "x-cn-offline": "0" }) })).toBe(false);
  });
});

describe("LRU", () => {
  it("acima de 25 MB tira lidas, depois páginas, nunca salvas", () => {
    const out = planEviction(
      [
        e(CACHES.salvos, 10, "08:00"),
        e(CACHES.paginas, 8, "09:00"),
        e(CACHES.lidas, 6, "10:00"),
        e(CACHES.lidas, 6, "11:00"),
      ],
      25 * MB,
    );
    expect(out.map((x) => x.cache)).toEqual([CACHES.lidas]);
    expect(out[0]!.lastAccess).toBe("2026-09-28T10:00:00Z");
    const big = [
      e(CACHES.salvos, 30, "08:00"),
      e(CACHES.lidas, 1, "09:00"),
      e(CACHES.paginas, 1, "10:00"),
      e(CACHES.assets, 1, "11:00"),
      e(CACHES.shell, 1, "07:00"),
    ];
    const all = planEviction(big, 25 * MB);
    expect(all.some((x) => x.cache === CACHES.salvos || x.cache === CACHES.shell)).toBe(false);
    expect(all.map((x) => x.cache)).toEqual([CACHES.lidas, CACHES.paginas, CACHES.assets]);
    expect(planEviction([e(CACHES.lidas, 5, "09:00")], 25 * MB)).toEqual([]);
  });
  it("cota cheia libera o dobro do necessário", () => {
    const entries = [
      e(CACHES.lidas, 4, "09:00"),
      e(CACHES.lidas, 4, "10:00"),
      e(CACHES.lidas, 4, "11:00"),
      e(CACHES.paginas, 4, "12:00"),
    ];
    // 16 MB usados, teto 20: gravar 2 MB → precisa liberar 2·2 − (20−16) = 0? não: need = 16−20+4 = 0 → nada.
    expect(planEviction(entries, 20 * MB, 2 * MB)).toEqual([]);
    // gravar 4 MB → need = 16 − 20 + 8 = 4 MB → tira a lida mais antiga.
    expect(planEviction(entries, 20 * MB, 4 * MB).map((x) => x.lastAccess)).toEqual([
      "2026-09-28T09:00:00Z",
    ]);
  });
  it("31ª lida sai a mais antiga; 13ª página sai a mais antiga", () => {
    const lidas = Array.from({ length: 31 }, (_, i) =>
      e(CACHES.lidas, 0.1, `${String(i).padStart(2, "0")}:00`, `/materia/l-${i}`),
    );
    expect(overBucketLimit(lidas, CACHES.lidas, 30).map((x) => x.url)).toEqual(["/materia/l-0"]);
    const paginas = Array.from({ length: 13 }, (_, i) =>
      e(CACHES.paginas, 0.1, `${String(i).padStart(2, "0")}:00`, `/p-${i}`),
    );
    expect(overBucketLimit(paginas, CACHES.paginas, 12).map((x) => x.url)).toEqual(["/p-0"]);
    expect(overBucketLimit(paginas.slice(0, 5), CACHES.paginas, 12)).toEqual([]);
  });
});

describe("payload e toque", () => {
  it("payload inválido vira aviso genérico; u externo vira /", () => {
    expect(parsePayload("lixo")).toEqual({
      title: "CityNews",
      body: "Há novidades no CityNews.",
      tag: "cn",
      url: "/",
      sendId: null,
    });
    expect(parsePayload(null)).toMatchObject({ title: "CityNews" });
    expect(parsePayload({ v: 2, t: "T", b: "B" })).toMatchObject({ title: "CityNews" });
    expect(parsePayload({ v: 1, t: "T", b: "B", u: "//evil.example", g: "g", s: SEND }).url).toBe(
      "/",
    );
    expect(
      parsePayload({ v: 1, t: "T", b: "B", u: "https://evil.example/x", g: "g", s: SEND }).url,
    ).toBe("/");
    expect(
      parsePayload(JSON.stringify({ v: 1, t: "T", b: "B", u: "/materia/x", g: "g", s: SEND })),
    ).toEqual({ title: "T", body: "B", tag: "g", url: "/materia/x", sendId: SEND });
    expect(parsePayload({ v: 1, t: "T", b: "B", u: "/", g: "g", s: "não-uuid" }).sendId).toBeNull();
  });
  it("toque aceita data.url e o data.href legado", () => {
    expect(safeTarget({ url: "/materia/x" }, ORIGIN)).toBe("/materia/x");
    expect(safeTarget({ href: "/alertas" }, ORIGIN)).toBe("/alertas");
    expect(safeTarget({ href: "https://evil.example" }, ORIGIN)).toBe("/");
    expect(safeTarget({ url: `${ORIGIN}/materia/y?a=1` }, ORIGIN)).toBe("/materia/y?a=1");
    expect(safeTarget({ url: "//evil.example/x" }, ORIGIN)).toBe("/");
    expect(safeTarget(null, ORIGIN)).toBe("/");
  });
});

describe("rótulos e listagem", () => {
  it("rótulo de cópia antiga em Cuiabá", () => {
    expect(staleLabel(new Date("2026-09-28T18:32:00Z"), new Date("2026-09-28T20:00:00Z"))).toBe(
      "Salva às 14h32, pode estar desatualizada.",
    );
    expect(staleLabel(new Date("2026-09-27T18:32:00Z"), new Date("2026-09-28T20:00:00Z"))).toBe(
      "Salva em 27/09 às 14h32, pode estar desatualizada.",
    );
    // 03:30Z do dia 29 é 23:30 do dia 28 em Cuiabá: mesmo dia que 20:00Z do dia 28.
    expect(staleLabel(new Date("2026-09-28T20:00:00Z"), new Date("2026-09-29T03:30:00Z"))).toBe(
      "Salva às 16h00, pode estar desatualizada.",
    );
  });
  it("título sem o sufixo da marca", () => {
    expect(titleFromHtml("<title>Chuva forte · CityNews Cuiabá</title>")).toBe("Chuva forte");
    expect(titleFromHtml("<title>CityNews Cuiabá</title>")).toBe("CityNews Cuiabá");
    expect(titleFromHtml("<title>A &amp; B | CityNews</title>")).toBe("A & B");
    expect(titleFromHtml("<html></html>")).toBeNull();
  });
  it("listagem: páginas, salvas e lidas (mais recentes primeiro)", () => {
    const now = new Date("2026-09-28T20:00:00Z");
    const l = offlineListing(
      [
        { ...e(CACHES.paginas, 1, "10:00", "/cidade"), title: "Cidade" },
        { ...e(CACHES.paginas, 1, "11:00", "/"), title: "Início" },
        { ...e(CACHES.salvos, 1, "09:00", "/materia/s"), title: "Salva" },
        { ...e(CACHES.salvos, 1, "09:00", "/favoritos"), title: "Favoritos" },
        { ...e(CACHES.lidas, 1, "12:00", "/materia/a"), title: "A" },
        { ...e(CACHES.lidas, 1, "13:00", "/materia/b"), title: "B" },
        e(CACHES.assets, 1, "13:00", "/_next/static/x.js"),
      ],
      now,
    );
    expect(l.paginas.map((x) => x.url)).toEqual(["/", "/cidade"]);
    expect(l.salvas.map((x) => x.url)).toEqual(["/materia/s"]);
    expect(l.lidas.map((x) => [x.url, x.label])).toEqual([
      ["/materia/b", "Salva às 09h00"],
      ["/materia/a", "Salva às 08h00"],
    ]);
  });
  it("cachedAtFor: mapa do cliente, senão índice só offline", () => {
    const map = new Map([["c1", "2026-09-28T18:32:00Z"]]);
    const entries = [e(CACHES.lidas, 1, "10:00", "/materia/x")];
    expect(cachedAtFor(map, "c1", "/materia/x", entries, true)).toBe("2026-09-28T18:32:00Z");
    expect(cachedAtFor(map, "c2", "/materia/x", entries, true)).toBeNull();
    expect(cachedAtFor(map, "c2", "/materia/x", entries, false)).toBe("2026-09-28T10:00:00Z");
    expect(cachedAtFor(map, "c2", "/materia/y", entries, false)).toBeNull();
  });
  it("assets da página", () => {
    expect(
      assetUrlsFromHtml(
        '<link href="/_next/static/a.css"><script src="/_next/static/b.js?x=1"></script><img src="/foto.jpg">',
      ),
    ).toEqual(["/_next/static/a.css", "/_next/static/b.js"]);
  });
});
