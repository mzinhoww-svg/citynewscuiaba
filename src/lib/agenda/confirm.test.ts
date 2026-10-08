import { describe, expect, it } from "vitest";
import { dedupeKeyOf } from "./normalize";
import { confirmEvents } from "./confirm";
import { dedupeEvents } from "./dedupe";
import type { NormalizedEvent } from "./types";

function ev(over: Partial<NormalizedEvent> & { title: string; startsAt: string }): NormalizedEvent {
  const venue = over.venue ?? "Cine Teatro Cuiabá";
  return {
    endsAt: null,
    venue,
    neighborhood: null,
    priceCents: null,
    priceUnknown: true,
    category: "musica",
    sourceUrl: "https://fonte.example/x",
    sourceId: "s",
    origin: "organizer",
    description: "",
    dedupeKey: dedupeKeyOf(over.title, over.startsAt, venue),
    venueKnown: true,
    sourceRef: null,
    confirms: false,
    confirmedBySourceId: null,
    evidence: {},
    ...over,
  };
}

// 19h e 20h de Cuiabá (UTC-4)
const SYMPLA = ev({
  title: "Show do Fulano",
  startsAt: "2026-10-10T23:00:00.000Z",
  sourceRef: "uuid-sympla",
});
const CINE = ev({
  title: "Fulano – Show",
  startsAt: "2026-10-11T00:00:00.000Z",
  confirms: true,
  sourceRef: "uuid-cine",
});

describe("confirmEvents", () => {
  it("confirma pelo local e título, adota o horário do par e registra o conflito", () => {
    const [out] = confirmEvents([SYMPLA], [CINE]);
    expect(out?.confirmedBySourceId).toBe("uuid-cine");
    expect(out?.startsAt).toBe(CINE.startsAt);
    expect(out?.evidence.conflito).toEqual({
      campo: "horario",
      descoberta: SYMPLA.startsAt,
      venue: "Cine Teatro Cuiabá",
    });
  });

  it("sem diferença não grava conflito", () => {
    const same = ev({ title: "Fulano – Show", startsAt: CINE.startsAt, sourceRef: "x" });
    const [out] = confirmEvents([same], [CINE]);
    expect(out?.confirmedBySourceId).toBe("uuid-cine");
    expect(out?.evidence.conflito).toBeUndefined();
  });

  it("mesmo título em outro dia não confirma", () => {
    const other = ev({ title: CINE.title, startsAt: "2026-10-12T00:00:00.000Z", confirms: true });
    const [out] = confirmEvents([SYMPLA], [other]);
    expect(out?.confirmedBySourceId).toBeNull();
    expect(out?.startsAt).toBe(SYMPLA.startsAt);
  });

  it("local diferente não confirma; local vazio confirma e adota o do par", () => {
    const elsewhere = ev({
      title: CINE.title,
      startsAt: CINE.startsAt,
      venue: "Arena Pantanal",
      confirms: true,
    });
    expect(confirmEvents([SYMPLA], [elsewhere])[0]?.confirmedBySourceId).toBeNull();
    const noVenue = ev({ title: SYMPLA.title, startsAt: CINE.startsAt, venue: "" });
    const [out] = confirmEvents([noVenue], [CINE]);
    expect(out?.confirmedBySourceId).toBe("uuid-cine");
    expect(out?.venue).toBe("Cine Teatro Cuiabá");
    expect(out?.evidence.conflito?.campo).toBe("local");
  });

  it("mantém a dedupeKey própria ao adotar dados do par", () => {
    const noVenue = ev({ title: SYMPLA.title, startsAt: CINE.startsAt, venue: "" });
    const [out] = confirmEvents([noVenue], [CINE]);
    expect(out?.dedupeKey).toBe(noVenue.dedupeKey);
    expect(out?.dedupeKey).not.toBe(CINE.dedupeKey);
  });

  it("par sem local não gera conflito de local", () => {
    const bare = ev({
      title: CINE.title,
      startsAt: SYMPLA.startsAt,
      venue: "",
      confirms: true,
      sourceRef: "u",
    });
    const [out] = confirmEvents([SYMPLA], [bare]);
    expect(out?.confirmedBySourceId).toBe("u");
    expect(out?.venue).toBe(SYMPLA.venue);
    expect(out?.evidence.conflito).toBeUndefined();
  });

  it("vários pares: escolhe o de maior similaridade; empate, o primeiro", () => {
    const loose = ev({
      title: "Show Fulano Especial",
      startsAt: CINE.startsAt,
      confirms: true,
      sourceRef: "loose",
    });
    const exact = ev({
      title: "Show do Fulano",
      startsAt: CINE.startsAt,
      confirms: true,
      sourceRef: "exact",
    });
    const twin = ev({
      title: "Fulano Show",
      startsAt: CINE.startsAt,
      confirms: true,
      sourceRef: "twin",
    });
    expect(confirmEvents([SYMPLA], [loose, exact])[0]?.confirmedBySourceId).toBe("exact");
    expect(confirmEvents([SYMPLA], [exact, twin])[0]?.confirmedBySourceId).toBe("exact");
    expect(confirmEvents([SYMPLA], [twin, exact])[0]?.confirmedBySourceId).toBe("twin");
  });

  it("título pouco parecido não confirma", () => {
    const other = ev({ title: "Festival de Jazz", startsAt: SYMPLA.startsAt, confirms: true });
    expect(confirmEvents([SYMPLA], [other])[0]?.confirmedBySourceId).toBeNull();
  });

  it("evento que já confirma não é alterado", () => {
    const [out] = confirmEvents([CINE], [CINE]);
    expect(out).toEqual(CINE);
  });
});

describe("dedupeEvents prefere o confirmante", () => {
  it("não confirmado primeiro: mantém o que confirma", () => {
    const a = ev({ title: "Show do Fulano", startsAt: CINE.startsAt });
    const b = ev({ title: "Fulano Show", startsAt: CINE.startsAt, confirms: true });
    expect(dedupeEvents([a, b])).toEqual([b]);
    expect(dedupeEvents([b, a])).toEqual([b]);
  });

  it("registro guardado (sourceId vazio) nunca é substituído", () => {
    const stored = ev({ title: "Show do Fulano", startsAt: CINE.startsAt, sourceId: "" });
    const b = ev({ title: "Fulano Show", startsAt: CINE.startsAt, confirms: true });
    expect(dedupeEvents([stored, b])).toEqual([stored]);
  });
});
