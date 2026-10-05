// @vitest-environment node
// UX-W1-T3 (item 8): a agenda pública não corta em 100 sem aviso. `listAgendaEvents` devolve o
// total real e um cursor opaco e estável (empates de início desempatados pelo id).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAgendaEvents, listAgendaEventsThrough } from "@/lib/db/queries/events";
import { service } from "./studio";

const run = Date.now();
const HOOD = `Bairro Paginação ${run}`;
const ids: string[] = [];
const filter = { from: "2026-01-01T00:00:00Z", neighborhood: HOOD };

beforeAll(async () => {
  // 130 eventos futuros: 60 começam no mesmo instante (empate), 70 em horários distintos.
  const start = Date.UTC(2099, 0, 1, 12);
  const rows = Array.from({ length: 130 }, (_, i) => ({
    slug: `pag-${run}-${i}`,
    title: `Evento de paginação ${i}`,
    starts_at: new Date(i < 60 ? start : start + i * 3_600_000).toISOString(),
    venue: "Arena Pantanal",
    neighborhood: HOOD,
    category: "musica",
    origin: "official",
    confirmed_at: new Date().toISOString(),
  }));
  const r = await service
    .from("event_listings")
    .insert(rows as never)
    .select("id");
  if (r.error) throw r.error;
  ids.push(...(r.data ?? []).map((e) => e.id));
});

afterAll(async () => {
  await service.from("event_listings").delete().in("id", ids);
});

const value = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("agenda paginada", () => {
  it("130 eventos: 100 na primeira página, total real; o cursor traz os 30 restantes", async () => {
    const first = value(await listAgendaEvents(filter, { limit: 100 }));
    expect(first.rows).toHaveLength(100);
    expect(first.total).toBe(130);
    expect(first.nextCursor).not.toBeNull();

    const second = value(await listAgendaEvents(filter, { limit: 100, cursor: first.nextCursor! }));
    expect(second.rows).toHaveLength(30);
    expect(second.total).toBe(130);
    expect(second.nextCursor).toBeNull();

    const all = [...first.rows, ...second.rows].map((e) => e.id);
    expect(new Set(all)).toEqual(new Set(ids));
  });

  it("páginas pequenas atravessam o empate de horário sem repetir nem pular", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 30; i++) {
      const page = value(await listAgendaEvents(filter, { limit: 9, cursor }));
      seen.push(...page.rows.map((e) => e.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(130);
    expect(new Set(seen).size).toBe(130);
  });

  it("até o cursor (inclusive) devolve exatamente a primeira página", async () => {
    const first = value(await listAgendaEvents(filter, { limit: 100 }));
    const head = value(await listAgendaEventsThrough(filter, first.nextCursor!));
    expect(head.map((e) => e.id)).toEqual(first.rows.map((e) => e.id));
  });
});
