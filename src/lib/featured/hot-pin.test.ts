import { describe, expect, it } from "vitest";
import type { FrontSignal } from "./hot";
import {
  applyHotPins,
  HOT_PIN_HOURS,
  type HotArticle,
  type HotPinRepo,
  type NewHotPin,
  type PinRecord,
} from "./hot-pin";

const NOW = new Date("2026-10-04T15:00:00-04:00");
const H = 3_600_000;
const ago = (h: number, from = NOW) => new Date(from.getTime() - h * H);
const ahead = (h: number, from = NOW) => new Date(from.getTime() + h * H);

const sig = (sourceId: string, topicId = "t1", hoursAgo = 1, rank = 1): FrontSignal => ({
  sourceId,
  topicId,
  rank,
  seenAt: ago(hoursAgo),
});
/** 3 portais distintos com o assunto no topo na última hora. */
const threePortals = (topicId = "t1", hoursAgo = 1) => [
  sig("folha-do-cerrado", topicId, hoursAgo),
  sig("mt-agora", topicId, hoursAgo),
  sig("gazeta-do-pantanal", topicId, hoursAgo),
];

const article = (over: Partial<HotArticle> = {}): HotArticle => ({
  id: "a1",
  topicId: "t1",
  status: "published",
  sponsored: false,
  hasCover: true,
  sectionSlug: "cidade",
  sectionRoot: "cidade",
  newsScope: "cuiaba",
  nationalCommotion: false,
  confidenceScore: 0.8,
  publishedAt: ago(2),
  ...over,
});

const manualPin = (over: Partial<PinRecord> = {}): PinRecord => ({
  id: "m1",
  kind: "manual",
  slotKey: "home.lead",
  sectionSlug: null,
  articleId: "outra",
  topicId: null,
  startsAt: ago(1),
  endsAt: null,
  endedAt: null,
  dismissedAt: null,
  ...over,
});

let seq = 0;

interface Fake {
  repo: HotPinRepo;
  pins: PinRecord[];
  inserted: NewHotPin[];
  extended: { id: string; endsAt: Date }[];
  ended: string[];
  writes: () => number;
}

function fake(
  opts: {
    enabled?: boolean;
    minSources?: number | null;
    signals?: FrontSignal[];
    articles?: HotArticle[];
    pins?: PinRecord[];
  } = {},
): Fake {
  const pins = [...(opts.pins ?? [])];
  const inserted: NewHotPin[] = [];
  const extended: { id: string; endsAt: Date }[] = [];
  const ended: string[] = [];
  const repo: HotPinRepo = {
    hotEnabled: async () => opts.enabled ?? true,
    minSources: async () => (opts.minSources === undefined ? 3 : opts.minSources),
    signals: async (since) => (opts.signals ?? []).filter((s) => s.seenAt >= since),
    slots: async () => [
      { key: "home.lead", capacity: 1 },
      { key: "home.destaques", capacity: 3 },
      { key: "editoria.lead", capacity: 1 },
    ],
    articlesOfTopics: async (ids) => (opts.articles ?? []).filter((a) => ids.includes(a.topicId)),
    activePins: async (now) =>
      pins.filter(
        (p) =>
          p.endedAt === null &&
          p.startsAt.getTime() <= now.getTime() &&
          (p.endsAt === null || p.endsAt.getTime() > now.getTime()),
      ),
    topicHotPins: async (ids) =>
      pins.filter((p) => p.kind === "hot" && p.topicId !== null && ids.includes(p.topicId)),
    insertPin: async (p) => {
      inserted.push(p);
      pins.push({
        id: `h${++seq}`,
        kind: "hot",
        slotKey: p.slotKey,
        sectionSlug: p.sectionSlug,
        articleId: p.articleId,
        topicId: p.topicId,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        endedAt: null,
        dismissedAt: null,
      });
    },
    extendPin: async (id, endsAt) => {
      extended.push({ id, endsAt });
      const p = pins.find((x) => x.id === id);
      if (p) p.endsAt = endsAt;
    },
    endPin: async (id, at) => {
      ended.push(id);
      const p = pins.find((x) => x.id === id);
      if (p) p.endedAt = at;
    },
  };
  return {
    repo,
    pins,
    inserted,
    extended,
    ended,
    writes: () => inserted.length + extended.length + ended.length,
  };
}

const run = (f: Fake, now = NOW) => applyHotPins({ repo: f.repo, now: () => now });

describe("applyHotPins (pauta quente vira destaque, R8 a R11)", () => {
  it("assunto quente com matéria publicada vira manchete, destaque da editoria por 3 h", async () => {
    const f = fake({ signals: threePortals(), articles: [article()] });
    const r = await run(f);
    expect(r).toEqual({ pinned: 2, renewed: 0, skipped: 0 });
    expect(f.inserted.map((p) => [p.slotKey, p.sectionSlug, p.articleId, p.topicId])).toEqual([
      ["home.lead", null, "a1", "t1"],
      ["editoria.lead", "cidade", "a1", "t1"],
    ]);
    for (const p of f.inserted) {
      expect(p.endsAt).toEqual(ahead(HOT_PIN_HOURS));
      expect(p.sources).toBe(3);
    }
  });

  it("editoria.lead usa a editoria de topo da matéria (subeditoria → editoria-mãe)", async () => {
    const f = fake({
      signals: threePortals(),
      articles: [article({ sectionSlug: "transito", sectionRoot: "cidade" })],
    });
    await run(f);
    expect(f.inserted.find((p) => p.slotKey === "editoria.lead")?.sectionSlug).toBe("cidade");
  });

  it("escolhe a melhor matéria publicada do assunto (confiança, depois a mais nova)", async () => {
    const f = fake({
      signals: threePortals(),
      articles: [
        article({ id: "fraca", confidenceScore: 0.5 }),
        article({ id: "forte-antiga", confidenceScore: 0.9, publishedAt: ago(5) }),
        article({ id: "forte-nova", confidenceScore: 0.9, publishedAt: ago(1) }),
      ],
    });
    await run(f);
    expect(f.inserted[0]?.articleId).toBe("forte-nova");
  });

  it("sem matéria publicada do assunto nada é pinado", async () => {
    const f = fake({ signals: threePortals(), articles: [] });
    expect(await run(f)).toEqual({ pinned: 0, renewed: 0, skipped: 1 });
    expect(f.writes()).toBe(0);
  });

  it("matéria em revisão (ou rascunho) nunca vira destaque e nunca muda de status", async () => {
    const f = fake({
      signals: threePortals(),
      articles: [article({ status: "in_review" }), article({ id: "a2", status: "draft" })],
    });
    expect((await run(f)).pinned).toBe(0);
    expect(f.writes()).toBe(0);
  });

  it("matéria patrocinada nunca", async () => {
    const f = fake({ signals: threePortals(), articles: [article({ sponsored: true })] });
    expect((await run(f)).pinned).toBe(0);
    expect(f.writes()).toBe(0);
  });

  it("matéria sem capa aprovada não é pinada (o destaque exige capa, R39)", async () => {
    const f = fake({ signals: threePortals(), articles: [article({ hasCover: false })] });
    expect((await run(f)).pinned).toBe(0);
  });

  it("menos portais que hot_min_sources: nada; o limiar vem da configuração", async () => {
    const two = fake({ signals: threePortals().slice(0, 2), articles: [article()] });
    expect((await run(two)).pinned).toBe(0);
    const strict = fake({ minSources: 4, signals: threePortals(), articles: [article()] });
    expect((await run(strict)).pinned).toBe(0);
    const unset = fake({ minSources: null, signals: threePortals(), articles: [article()] });
    expect((await run(unset)).pinned).toBe(2);
  });

  it("pino manual vigente vence: a manchete fica com ele e o quente vai para os destaques", async () => {
    const f = fake({ signals: threePortals(), articles: [article()], pins: [manualPin()] });
    const r = await run(f);
    expect(f.inserted.map((p) => p.slotKey).sort()).toEqual(["editoria.lead", "home.destaques"]);
    expect(f.inserted.some((p) => p.slotKey === "home.lead")).toBe(false);
    expect(r.pinned).toBe(2);
    // Manual da editoria também vence.
    const g = fake({
      signals: threePortals(),
      articles: [article()],
      pins: [
        manualPin(),
        manualPin({ id: "m2", slotKey: "editoria.lead", sectionSlug: "cidade" }),
        manualPin({ id: "m3", slotKey: "home.destaques" }),
        manualPin({ id: "m4", slotKey: "home.destaques", articleId: "x" }),
        manualPin({ id: "m5", slotKey: "home.destaques", articleId: "y" }),
      ],
    });
    expect(await run(g)).toEqual({ pinned: 0, renewed: 0, skipped: 3 });
    expect(g.writes()).toBe(0);
  });

  it("pino manual vencido ou encerrado não bloqueia", async () => {
    const f = fake({
      signals: threePortals(),
      articles: [article()],
      pins: [manualPin({ endsAt: ago(0.5) }), manualPin({ id: "m2", endedAt: ago(0.2) })],
    });
    await run(f);
    expect(f.inserted.some((p) => p.slotKey === "home.lead")).toBe(true);
  });

  it("assunto dispensado não volta pelo mesmo sinal; volta só com sinal posterior", async () => {
    const dismissed: PinRecord = {
      id: "h0",
      kind: "hot",
      slotKey: "home.lead",
      sectionSlug: null,
      articleId: "a1",
      topicId: "t1",
      startsAt: ago(2),
      endsAt: ahead(1),
      endedAt: ago(0.5),
      dismissedAt: ago(0.5),
    };
    const same = fake({ signals: threePortals("t1", 1), articles: [article()], pins: [dismissed] });
    expect(await run(same)).toEqual({ pinned: 0, renewed: 0, skipped: 1 });
    expect(same.writes()).toBe(0);

    // Só 2 portais depois da dispensa: ainda não.
    const partial = fake({
      signals: [
        ...threePortals("t1", 1),
        sig("mt-agora", "t1", 0.2),
        sig("folha-do-cerrado", "t1", 0.1),
      ],
      articles: [article()],
      pins: [{ ...dismissed }],
    });
    expect((await run(partial)).pinned).toBe(0);

    // 3 portais de novo depois da dispensa: é um sinal novo.
    const fresh = fake({
      signals: [...threePortals("t1", 1), ...threePortals("t1", 0.2)],
      articles: [article()],
      pins: [{ ...dismissed }],
    });
    expect((await run(fresh)).pinned).toBe(2);
  });

  it("hot_featured_enabled desligada: não lê sinal nem grava nada", async () => {
    const f = fake({ enabled: false, signals: threePortals(), articles: [article()] });
    expect(await run(f)).toEqual({ pinned: 0, renewed: 0, skipped: 0 });
    expect(f.writes()).toBe(0);
  });

  it("idempotente: rodar de novo no mesmo instante não grava nada", async () => {
    const f = fake({ signals: threePortals(), articles: [article()] });
    await run(f);
    const before = f.writes();
    expect(await run(f)).toEqual({ pinned: 0, renewed: 0, skipped: 0 });
    expect(f.writes()).toBe(before);
  });

  it("renova +3 h enquanto o sinal dura, sem passar de 12 h desde o início", async () => {
    const f = fake({ signals: threePortals(), articles: [article()] });
    await run(f);
    // 2 h depois, sinal ainda quente: renova até agora + 3 h.
    const t2 = ahead(2);
    const f2signals = threePortals("t1", 0);
    const g = fake({
      signals: f2signals.map((s) => ({ ...s, seenAt: t2 })),
      articles: [article()],
    });
    g.pins.push(...f.pins);
    const r = await run(g, t2);
    expect(r).toEqual({ pinned: 0, renewed: 2, skipped: 0 });
    expect(g.extended.every((e) => e.endsAt.getTime() === ahead(3, t2).getTime())).toBe(true);

    // 10 h depois do início: renova só até o teto de 12 h.
    const t10 = ahead(10);
    const h = fake({
      signals: threePortals("t1", 0).map((s) => ({ ...s, seenAt: t10 })),
      articles: [article()],
    });
    h.pins.push(...g.pins.map((p) => ({ ...p, endsAt: ahead(1, t10) })));
    await run(h, t10);
    expect(h.extended.every((e) => e.endsAt.getTime() === ahead(12).getTime())).toBe(true);

    // 12 h depois do início: não renova nem pina de novo.
    const t12 = ahead(12.1);
    const k = fake({
      signals: threePortals("t1", 0).map((s) => ({ ...s, seenAt: t12 })),
      articles: [article()],
    });
    k.pins.push(...h.pins);
    expect(await run(k, t12)).toEqual({ pinned: 0, renewed: 0, skipped: 1 });
    expect(k.writes()).toBe(0);
  });

  it("matéria do pino saiu do ar: troca pela melhor publicada, sem estender o teto", async () => {
    const f = fake({ signals: threePortals(), articles: [article()] });
    await run(f);
    const g = fake({
      signals: threePortals(),
      articles: [article({ status: "unpublished" }), article({ id: "a2" })],
    });
    g.pins.push(...f.pins);
    const r = await run(g, ahead(0.5));
    expect(g.ended.sort()).toEqual(f.pins.map((p) => p.id).sort());
    expect(g.inserted.map((p) => p.articleId)).toEqual(["a2", "a2"]);
    expect(r.pinned).toBe(2);
  });

  it("national sem comoção não entra; com comoção nacional entra", async () => {
    const national = fake({
      signals: threePortals(),
      articles: [article({ newsScope: "national" })],
    });
    expect((await run(national)).pinned).toBe(0);
    const unknown = fake({ signals: threePortals(), articles: [article({ newsScope: null })] });
    expect((await run(unknown)).pinned).toBe(0);
    const commotion = fake({
      signals: threePortals(),
      articles: [article({ newsScope: "national", nationalCommotion: true })],
    });
    expect((await run(commotion)).pinned).toBe(2);
    const mt = fake({ signals: threePortals(), articles: [article({ newsScope: "mt" })] });
    expect((await run(mt)).pinned).toBe(2);
  });

  it("dois assuntos quentes: o mais sinalizado fica com a manchete, o outro com um destaque", async () => {
    const f = fake({
      signals: [...threePortals("t1"), sig("quarto-portal", "t1"), ...threePortals("t2")],
      articles: [
        article(),
        article({ id: "b1", topicId: "t2", sectionSlug: "politica", sectionRoot: "politica" }),
      ],
    });
    await run(f);
    const where = (id: string) =>
      f.inserted
        .filter((p) => p.articleId === id)
        .map((p) => `${p.slotKey}:${p.sectionSlug ?? ""}`);
    expect(where("a1").sort()).toEqual(["editoria.lead:cidade", "home.lead:"]);
    expect(where("b1").sort()).toEqual(["editoria.lead:politica", "home.destaques:"]);
  });
});
