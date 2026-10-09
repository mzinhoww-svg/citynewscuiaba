import { describe, expect, it } from "vitest";
import { pickWeekEvents, venueKey, weekRange, type WeekEvent } from "./pick-week";

// Segunda, 12/10/2026, 08:00 em Cuiabá (12:00 UTC): o horário do cron.
const MONDAY = new Date("2026-10-12T12:00:00Z");

let n = 0;
function ev(over: Partial<WeekEvent> = {}): WeekEvent {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    slug: `evento-${n}`,
    title: `Evento ${n}`,
    startsAt: "2026-10-14T23:00:00Z",
    endsAt: null,
    venue: `Lugar ${n}`,
    neighborhood: null,
    venueSlug: null,
    priceCents: 0,
    isFree: true,
    priceUnknown: false,
    origin: "organizer",
    sourceName: "Fonte Exemplo",
    confirmedByName: null,
    confirmed: true,
    confirmedAt: "2026-10-01T12:00:00Z",
    image: null,
    ...over,
  };
}

const img = {
  src: "/api/media/00000000-0000-4000-8000-0000000000aa",
  alt: "x",
  kind: "reproduction" as const,
  credit: "Fonte",
};

describe("weekRange", () => {
  it("segunda 08:00 em Cuiabá → segunda 00:00 a domingo 23:59:59 da mesma semana", () => {
    const r = weekRange(MONDAY);
    expect(r.weekStart).toBe("2026-10-12");
    expect(r.start.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-19T03:59:59.000Z");
    expect(r.days).toHaveLength(7);
    expect(r.days[6]).toBe("2026-10-18");
  });

  it("domingo à noite (já segunda em UTC) ainda é a mesma semana de Cuiabá", () => {
    expect(weekRange(new Date("2026-10-19T02:00:00Z")).weekStart).toBe("2026-10-12");
  });

  it("quarta cai na semana iniciada na segunda anterior", () => {
    expect(weekRange(new Date("2026-10-14T15:00:00Z")).weekStart).toBe("2026-10-12");
  });

  it("aceita a semana pela data da segunda", () => {
    expect(weekRange(MONDAY, "2026-10-05").weekStart).toBe("2026-10-05");
  });
});

describe("pickWeekEvents", () => {
  const range = weekRange(MONDAY);

  it("no máximo 6", () => {
    const list = Array.from({ length: 10 }, () => ev());
    expect(pickWeekEvents(list, range)).toHaveLength(6);
  });

  it("no máximo 2 por local (venue_id do Guia ou nome normalizado)", () => {
    const list = [
      ev({ venue: "Teatro do Cerrado" }),
      ev({ venue: "teatro do cerrado " }),
      ev({ venue: "Teatro do  Cerrádo" }),
      ev({ venue: "Outro", venueSlug: "casa-x" }),
      ev({ venue: "Outro nome", venueSlug: "casa-x" }),
      ev({ venue: "Terceiro", venueSlug: "casa-x" }),
      ev({ venue: "Praça" }),
    ];
    const picked = pickWeekEvents(list, range);
    const counts = new Map<string, number>();
    for (const e of picked) counts.set(venueKey(e), (counts.get(venueKey(e)) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBe(2);
    expect(picked).toHaveLength(5);
  });

  it("com imagem primeiro: eventos com foto ganham a vaga mesmo começando depois", () => {
    const early = Array.from({ length: 6 }, (_, i) => ev({ startsAt: `2026-10-13T1${i}:00:00Z` }));
    const late = Array.from({ length: 3 }, (_, i) =>
      ev({ startsAt: `2026-10-17T1${i}:00:00Z`, image: img }),
    );
    const picked = pickWeekEvents([...early, ...late], range);
    expect(picked).toHaveLength(6);
    for (const e of late) expect(picked.map((p) => p.id)).toContain(e.id);
    // A saída é cronológica (o carrossel segue a semana).
    const starts = picked.map((p) => Date.parse(p.startsAt));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("retirado, não confirmado e fora da semana ficam de fora; em cartaz desde antes entra", () => {
    const kept = ev();
    const running = ev({ startsAt: "2026-10-01T23:00:00Z", endsAt: "2026-10-20T23:00:00Z" });
    const list = [
      kept,
      running,
      ev({ withdrawnAt: "2026-10-10T00:00:00Z" }),
      ev({ confirmedAt: null }),
      ev({ startsAt: "2026-10-20T23:00:00Z" }),
      ev({ startsAt: "2026-10-11T23:00:00Z" }),
    ];
    expect(pickWeekEvents(list, range).map((e) => e.id)).toEqual([running.id, kept.id]);
  });

  it("tirados do pacote ficam de fora e a vaga vai para o próximo", () => {
    const list = Array.from({ length: 7 }, (_, i) => ev({ startsAt: `2026-10-13T1${i}:00:00Z` }));
    const picked = pickWeekEvents(list, range, { exclude: [list[0]!.id] });
    expect(picked.map((e) => e.id)).toEqual(list.slice(1).map((e) => e.id));
  });

  it("evento repetido (mesmo id) entra uma vez", () => {
    const a = ev();
    expect(pickWeekEvents([a, a], range)).toHaveLength(1);
  });
});
