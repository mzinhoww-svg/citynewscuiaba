import { describe, expect, it } from "vitest";
import { resolveSlot } from "./resolve";
import type { Candidate, Pin, Slot } from "./types";

const at = (local: string) => new Date(`${local}-04:00`);
const NOW = at("2026-10-03T14:10:00");

const LEAD: Slot = { key: "home.lead", page: "home", label: "Início · manchete", capacity: 1 };
const THREE: Slot = {
  key: "home.destaques",
  page: "home",
  label: "Início · destaques",
  capacity: 3,
};

function cand(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    publishedAt: at("2026-10-03T09:00:00"),
    sectionSlug: "cidade",
    confidenceScore: 0.6,
    sourceCount: 2,
    sponsored: false,
    hasCover: true,
    newsScope: "cuiaba",
    nationalCommotion: false,
    ...over,
  };
}

function pin(articleId: string, over: Partial<Pin> = {}): Pin {
  return {
    id: `pin-${articleId}`,
    slotKey: "home.lead",
    sectionSlug: null,
    articleId,
    position: 0,
    startsAt: at("2026-10-03T13:00:00"),
    endsAt: at("2026-10-03T18:00:00"),
    endedAt: null,
    ...over,
  };
}

const always = () => true;

describe("resolveSlot", () => {
  it("pino ativo vence o automático", () => {
    const auto = cand("auto", { confidenceScore: 1, sourceCount: 5 });
    const manual = cand("manual", { confidenceScore: 0.1, sourceCount: 1 });
    const r = resolveSlot({
      slot: LEAD,
      pins: [pin("manual")],
      candidates: [auto, manual],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["manual"]);
    expect(r.source).toBe("manual");
    expect(r.until).toEqual(at("2026-10-03T18:00:00"));
  });

  it("pino expirado em endsAt exato volta ao automático", () => {
    const auto = cand("auto");
    const manual = cand("manual");
    const input = {
      slot: LEAD,
      pins: [pin("manual")],
      candidates: [auto, manual],
      eligible: always,
    };
    expect(resolveSlot({ ...input, now: at("2026-10-03T17:59:59") }).source).toBe("manual");
    const r = resolveSlot({ ...input, now: at("2026-10-03T18:00:00") });
    expect(r.source).toBe("automatic");
    expect(r.items.map((c) => c.id)).toEqual(expect.not.arrayContaining(["nobody"]));
  });

  it("pino sem prazo (endsAt null) fica até remover; removido (endedAt) sai", () => {
    const manual = cand("manual");
    const open = pin("manual", { endsAt: null });
    expect(
      resolveSlot({
        slot: LEAD,
        pins: [open],
        candidates: [manual],
        now: at("2026-12-01T10:00:00"),
        eligible: always,
      }).source,
    ).toBe("manual");
    const ended = pin("manual", { endsAt: null, endedAt: at("2026-10-03T14:00:00") });
    expect(
      resolveSlot({ slot: LEAD, pins: [ended], candidates: [manual], now: NOW, eligible: always })
        .source,
    ).toBe("automatic");
  });

  it("pino que ainda não começou não vale", () => {
    const manual = cand("manual");
    const future = pin("manual", { startsAt: at("2026-10-03T15:00:00") });
    expect(
      resolveSlot({ slot: LEAD, pins: [future], candidates: [manual], now: NOW, eligible: always })
        .source,
    ).toBe("automatic");
  });

  it("matéria inelegível some do pino e a posição cai no automático, com aviso", () => {
    const auto = cand("auto");
    const gone = cand("gone");
    const r = resolveSlot({
      slot: LEAD,
      pins: [pin("gone")],
      candidates: [auto, gone],
      now: NOW,
      eligible: (id) => id !== "gone",
    });
    expect(r.items.map((c) => c.id)).toEqual(["auto"]);
    expect(r.source).toBe("automatic");
    expect(r.dropped).toEqual([{ pinId: "pin-gone", articleId: "gone", reason: "ineligible" }]);
  });

  it("pino de matéria que não está mais entre as candidatas (despublicada) cai no automático", () => {
    const r = resolveSlot({
      slot: LEAD,
      pins: [pin("sumiu")],
      candidates: [cand("auto")],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["auto"]);
    expect(r.dropped[0]).toMatchObject({ articleId: "sumiu", reason: "gone" });
  });

  it("R39: pino sem capa é ignorado e a posição cai no automático", () => {
    const r = resolveSlot({
      slot: LEAD,
      pins: [pin("semcapa")],
      candidates: [cand("semcapa", { hasCover: false }), cand("auto")],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["auto"]);
    expect(r.dropped[0]).toMatchObject({ reason: "no_cover" });
  });

  it("matéria patrocinada pinada nunca ocupa a posição", () => {
    const r = resolveSlot({
      slot: LEAD,
      pins: [pin("pat")],
      candidates: [cand("pat", { sponsored: true }), cand("auto")],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["auto"]);
  });

  it("capacidade 3 ordena os pinos por position e completa com o automático", () => {
    const cs = ["a", "b", "c", "d"].map((id) => cand(id));
    const pins = [
      pin("c", { id: "p3", slotKey: "home.destaques", position: 2 }),
      pin("a", { id: "p1", slotKey: "home.destaques", position: 0 }),
    ];
    const r = resolveSlot({ slot: THREE, pins, candidates: cs, now: NOW, eligible: always });
    expect(r.items.map((c) => c.id).slice(0, 2)).toEqual(["a", "c"]);
    expect(r.items).toHaveLength(3);
    expect(new Set(r.items.map((c) => c.id)).size).toBe(3);
  });

  it("pino de outra posição ou de outra editoria não vale", () => {
    const m = cand("m");
    const other = pin("m", { slotKey: "home.destaques" });
    expect(
      resolveSlot({ slot: LEAD, pins: [other], candidates: [m], now: NOW, eligible: always })
        .source,
    ).toBe("automatic");
    const ed: Slot = { key: "editoria.lead", page: "editoria", label: "Editoria", capacity: 1 };
    const pinEd = pin("m", { slotKey: "editoria.lead", sectionSlug: "politica" });
    expect(
      resolveSlot({
        slot: ed,
        section: "cidade",
        pins: [pinEd],
        candidates: [m],
        now: NOW,
        eligible: always,
      }).source,
    ).toBe("automatic");
    expect(
      resolveSlot({
        slot: ed,
        section: "politica",
        pins: [pinEd],
        candidates: [m],
        now: NOW,
        eligible: always,
      }).source,
    ).toBe("manual");
  });

  it("duas chamadas com now diferentes na mesma janela devolvem o mesmo items", () => {
    const cs = [
      cand("a", { confidenceScore: 0.5 }),
      cand("b", { confidenceScore: 0.8 }),
      cand("c", { confidenceScore: 0.7 }),
    ];
    const one = resolveSlot({
      slot: THREE,
      pins: [],
      candidates: cs,
      now: at("2026-10-03T14:00:00"),
      eligible: always,
    });
    const two = resolveSlot({
      slot: THREE,
      pins: [],
      candidates: [...cs].reverse(),
      now: at("2026-10-03T14:59:59"),
      eligible: always,
    });
    expect(one.items.map((c) => c.id)).toEqual(two.items.map((c) => c.id));
  });

  it("R39: automático pula candidata sem capa e a lista em needsImage", () => {
    const r = resolveSlot({
      slot: LEAD,
      pins: [],
      candidates: [
        cand("semcapa", { hasCover: false, confidenceScore: 1, sourceCount: 5 }),
        cand("com", { confidenceScore: 0.3 }),
      ],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["com"]);
    expect(r.needsImage).toEqual(["semcapa"]);
  });

  it("gancho da pauta quente: entre o manual e o automático", () => {
    const r = resolveSlot({
      slot: LEAD,
      pins: [],
      candidates: [
        cand("auto", { confidenceScore: 1, sourceCount: 5 }),
        cand("quente", { confidenceScore: 0.1, sourceCount: 1 }),
      ],
      hot: [cand("quente", { confidenceScore: 0.1, sourceCount: 1 })],
      now: NOW,
      eligible: always,
    });
    expect(r.items.map((c) => c.id)).toEqual(["quente"]);
    expect(r.source).toBe("hot");
  });

  it("sem candidatas e sem pinos, devolve vazio", () => {
    const r = resolveSlot({ slot: LEAD, pins: [], candidates: [], now: NOW, eligible: always });
    expect(r).toMatchObject({ items: [], source: "automatic", until: null });
  });
});
