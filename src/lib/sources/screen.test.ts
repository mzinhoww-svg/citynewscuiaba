import { describe, expect, it } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";
import { DEFAULT_REC_CONFIG } from "@/lib/ranking";
import {
  buildTab,
  capPopularItems,
  fromProfile,
  isNoHistory,
  parseSourcesQuery,
  personalizeEntries,
  sourcesHref,
  toCardData,
  type SourceListEntry,
} from "./screen";

const now = new Date("2026-09-27T18:00:00Z");

function entry(slug: string, over: Partial<SourceListEntry> = {}): SourceListEntry {
  return {
    slug,
    name: slug.toUpperCase(),
    href: `/fontes/${slug}`,
    categories: ["cidade"],
    locality: "cuiaba",
    popularity: 0.5,
    individual: 0,
    recency: 0.5,
    engagement: 0.5,
    operational: 1,
    diversity: 0.5,
    trend: 0.5,
    followed: false,
    pinned: false,
    excluded: false,
    blocked: false,
    isNewForUser: true,
    localHighlight: false,
    verified: false,
    recentVisit: false,
    similar: false,
    reach: 18_000,
    trendDirection: "stable",
    itemsToday: 3,
    lastUpdatedAt: "2026-09-27T17:00:00Z",
    ...over,
  };
}

const entries: SourceListEntry[] = [
  entry("folha", { popularity: 1, diversity: 0, verified: true }),
  entry("diario", { popularity: 0.9, diversity: 0.1 }),
  entry("mtagora", { popularity: 0.8, diversity: 0.2, locality: "mt", categories: ["economia"] }),
  entry("varzea", { popularity: 0.3, diversity: 0.7, locality: "varzea-grande" }),
  entry("radio", { popularity: 0.6, diversity: 0.4, categories: ["esportes"] }),
  entry("correio", { popularity: 0.4, diversity: 0.6, locality: "mt" }),
  entry("agro", { popularity: 0.2, diversity: 0.8, locality: "mt", categories: ["economia"] }),
  entry("cena", { popularity: 0.1, diversity: 0.9, categories: ["cultura"] }),
  entry("placar", { popularity: 0.5, trend: 1, locality: "mt", categories: ["esportes"] }),
  entry("brasil", { popularity: 0.45, diversity: 0.55, locality: "nacional" }),
];

function profile(over: Partial<AnonProfile> = {}): AnonProfile {
  return {
    anonId: null,
    createdAt: now.toISOString(),
    follows: [],
    saved: [],
    history: [],
    searches: [],
    interests: [],
    hidden: [],
    ...over,
  };
}

const opts = (personalization: boolean, hidden: string[] = []) => ({
  personalization,
  hidden,
  config: DEFAULT_REC_CONFIG,
  limit: 12,
});

describe("parâmetros da URL (?aba=, filtros)", () => {
  it("padrão: Mais acessadas nesta semana, sem filtro; valores inválidos são ignorados", () => {
    expect(parseSourcesQuery({})).toEqual({ tab: "popular", period: "semana" });
    expect(parseSourcesQuery({ aba: "xyz", periodo: "ano", regiao: "sp", tema: "x" })).toEqual({
      tab: "popular",
      period: "semana",
    });
  });

  it("lê aba, período, região e tema e volta a montar a mesma URL", () => {
    const q = parseSourcesQuery({
      aba: "recomendadas",
      periodo: "hoje",
      regiao: "mt",
      tema: ["cultura", "esportes"],
    });
    expect(q).toEqual({ tab: "recommended", period: "hoje", region: "mt", theme: "cultura" });
    expect(sourcesHref(q)).toBe("/fontes?aba=recomendadas&periodo=hoje&regiao=mt&tema=cultura");
    expect(sourcesHref(q, { region: null, tab: "popular" })).toBe(
      "/fontes?periodo=hoje&tema=cultura",
    );
    expect(sourcesHref({ tab: "popular", period: "semana" })).toBe("/fontes");
  });
});

describe("perfil local", () => {
  it("seguir funciona sem Personalização (escolha explícita, não rastreamento)", () => {
    const reader = fromProfile(
      profile({ follows: [{ kind: "source", id: "cena", at: now.toISOString() }] }),
    );
    const list = personalizeEntries(entries, reader, false, now);
    expect(list.find((e) => e.slug === "cena")!.followed).toBe(true);
    const followed = buildTab(list, "followed", opts(false));
    expect(followed.map((r) => r.slug)).toEqual(["cena"]);
    expect(followed[0]!.reason).toBe("followed");
  });

  it("histórico só conta com Personalização", () => {
    const history = [3, 2, 1].map((d) => ({
      ref: `article:${d}`,
      sourceSlug: "cena",
      section: "cultura",
      at: new Date(now.getTime() - d * 86_400_000).toISOString(),
      seconds: 90,
      scrollPct: 80,
    }));
    const reader = fromProfile(profile({ anonId: "x", history }));
    const off = personalizeEntries(entries, reader, false, now);
    expect(off.every((e) => e.individual === 0 && !e.recentVisit)).toBe(true);
    const on = personalizeEntries(entries, reader, true, now);
    const cena = on.find((e) => e.slug === "cena")!;
    expect(cena.individual).toBeGreaterThan(0);
    expect(cena.recentVisit).toBe(true);
    expect(on.find((e) => e.slug === "folha")!.individual).toBe(0);
  });

  it("estado sem histórico: personalização desligada ou nenhum histórico e nenhuma fonte seguida", () => {
    expect(isNoHistory(fromProfile(null), true)).toBe(true);
    expect(isNoHistory(fromProfile(profile()), true)).toBe(true);
    const followed = fromProfile(
      profile({ follows: [{ kind: "source", id: "cena", at: now.toISOString() }] }),
    );
    expect(isNoHistory(followed, true)).toBe(false);
    expect(isNoHistory(followed, false)).toBe(true);
  });
});

describe("abas (spec §7.5)", () => {
  it("Review Focus 1: personalização desligada, Recomendadas mostra populares da região, nunca vazia", () => {
    const r = buildTab(
      personalizeEntries(entries, fromProfile(null), false, now),
      "recommended",
      opts(false),
    );
    expect(r.length).toBeGreaterThan(4);
    const regular = r.filter((x) => !x.discovery);
    expect(regular.length).toBeGreaterThan(0);
    expect(regular.every((x) => x.reason === "regional_popular")).toBe(true);
  });

  it("critério 6: sem histórico, populares e locais nunca ficam vazias", () => {
    const list = personalizeEntries(entries, fromProfile(null), true, now);
    for (const tab of ["popular", "trending", "recommended", "local", "verified", "new"] as const)
      expect(buildTab(list, tab, opts(true)).length, tab).toBeGreaterThan(0);
  });

  it("ocultada some de todas as listas", () => {
    const list = personalizeEntries(entries, fromProfile(null), false, now);
    for (const tab of ["popular", "recommended", "local"] as const)
      expect(buildTab(list, tab, opts(false, ["folha"])).map((r) => r.slug)).not.toContain("folha");
  });

  it("Tendência ordena Mais acessadas pela alta da semana", () => {
    const list = personalizeEntries(entries, fromProfile(null), false, now);
    expect(buildTab(list, "popular", { ...opts(false), period: "tendencia" })[0]!.slug).toBe(
      "placar",
    );
  });
});

describe("card", () => {
  it("cada card tem justificativa fixa (sem 'gostar') e dados aproximados", () => {
    const list = personalizeEntries(entries, fromProfile(null), true, now);
    for (const tab of ["popular", "recommended", "new"] as const)
      for (const r of buildTab(list, tab, opts(true))) {
        const card = toCardData(
          list.find((e) => e.slug === r.slug)!,
          r,
          {},
          now,
        );
        expect(card.reason.length).toBeGreaterThan(5);
        expect(card.reason).not.toMatch(/gost/i);
        expect(card.category).not.toBe("");
      }
  });

  it("fonte sem atualização há 3 h ou mais fica marcada como parada", () => {
    const r = buildTab(entries, "popular", opts(false))[0]!;
    const stale = toCardData({ ...entries[0]!, lastUpdatedAt: "2026-09-27T14:30:00Z" }, r, {}, now);
    expect(stale.stale).toBe(true);
    expect(toCardData(entries[0]!, r, {}, now).stale).toBe(false);
  });
});

describe("teto de 25% visível (Review Focus 3)", () => {
  it("lista de 8 itens mostra a fonte dominante no máximo 2 vezes, na ordem das mais acessadas", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, sourceSlug: "folha" })),
      { id: "d1", sourceSlug: "diario" },
      { id: "m1", sourceSlug: "mtagora" },
      { id: "r1", sourceSlug: "radio" },
      { id: "r2", sourceSlug: "radio" },
      { id: "r3", sourceSlug: "radio" },
      { id: "c1", sourceSlug: "cena" },
    ];
    const out = capPopularItems(items, ["folha", "diario", "mtagora", "radio", "cena"], 8, 0.25);
    expect(out).toHaveLength(7);
    expect(out.filter((i) => i.sourceSlug === "folha")).toHaveLength(2);
    expect(out.filter((i) => i.sourceSlug === "radio")).toHaveLength(2);
    expect(out[0]!.sourceSlug).toBe("folha");
  });
});
