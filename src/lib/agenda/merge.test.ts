import { describe, expect, it } from "vitest";
import { dedupeKeyOf } from "./normalize";
import { LOCKABLE_COLUMNS, mergeForSave, sortConfirmedFirst, type StoredEvent } from "./merge";
import type { NormalizedEvent } from "./types";

const INCOMING: NormalizedEvent = {
  title: "Show do Fulano",
  startsAt: "2026-10-10T23:00:00.000Z",
  endsAt: null,
  venue: "Cine Teatro Cuiabá",
  neighborhood: null,
  priceCents: 5000,
  priceUnknown: false,
  category: "musica",
  sourceUrl: "https://fonte.example/x",
  sourceId: "s",
  origin: "organizer",
  description: "descrição da coleta",
  dedupeKey: dedupeKeyOf("Show do Fulano", "2026-10-10T23:00:00.000Z", "Cine Teatro Cuiabá"),
  venueKnown: true,
  sourceRef: null,
  confirms: false,
  confirmedBySourceId: null,
  evidence: {},
};

const STORED: StoredEvent = {
  id: "1",
  lockedFields: ["title", "venue"],
  withdrawnAt: null,
  title: "Fulano ao vivo",
  startsAt: INCOMING.startsAt,
  endsAt: null,
  venue: "Teatro Editado",
  neighborhood: null,
  priceCents: 3000,
  priceUnknown: false,
  category: "musica",
  description: "texto do editor",
  sourceUrl: INCOMING.sourceUrl,
};

describe("mergeForSave", () => {
  it("campos travados vêm do guardado; o resto é atualizado", () => {
    const out = mergeForSave(INCOMING, STORED);
    expect(out?.title).toBe("Fulano ao vivo");
    expect(out?.venue).toBe("Teatro Editado");
    expect(out?.priceCents).toBe(5000);
    expect(out?.description).toBe("descrição da coleta");
  });

  it("travas em snake_case mapeiam para os campos; nomes desconhecidos são ignorados", () => {
    expect(LOCKABLE_COLUMNS.starts_at).toBe("startsAt");
    const out = mergeForSave(INCOMING, { ...STORED, lockedFields: ["price_cents", "nada"] });
    expect(out?.priceCents).toBe(3000);
    expect(out?.title).toBe("Show do Fulano");
  });

  it("retirado não é regravado", () => {
    expect(mergeForSave(INCOMING, { ...STORED, withdrawnAt: "2026-10-09T10:00:00Z" })).toBeNull();
  });

  it("sem registro guardado devolve o recebido", () => {
    expect(mergeForSave(INCOMING, null)).toEqual(INCOMING);
  });
});

describe("sortConfirmedFirst", () => {
  it("confirmados primeiro dentro do dia local, estável", () => {
    const l = [
      { id: "nao10", startsAt: "2026-10-10T15:00:00.000Z", confirmed: false },
      { id: "sim10", startsAt: "2026-10-10T20:00:00.000Z", confirmed: true },
      { id: "sim11", startsAt: "2026-10-11T15:00:00.000Z", confirmed: true },
      { id: "nao10b", startsAt: "2026-10-10T16:00:00.000Z", confirmed: false },
    ];
    expect(sortConfirmedFirst(l).map((x) => x.id)).toEqual(["sim10", "nao10", "nao10b", "sim11"]);
  });
});
