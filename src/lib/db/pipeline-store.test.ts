import { createFrontpageRepo, createIngestRepo, createRunStore } from "./pipeline-store";
import type { DbClient } from "./client";

type Call = [string, ...unknown[]];

/** Query builder falso: grava a cadeia de chamadas e resolve com as linhas já filtradas. */
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: Call[] = [];
  const result = () => {
    let out = rows;
    for (const [op, col, val] of calls) {
      if (op === "neq") out = out.filter((r) => r[col as string] !== val);
    }
    return { data: out, error: null };
  };
  const builder: Record<string, unknown> = {};
  const chain =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push([op, ...args]);
      return builder;
    };
  for (const op of ["select", "in", "is", "eq", "order", "update"]) builder[op] = chain(op);
  builder.neq = chain("neq");
  builder.maybeSingle = () => {
    const r = result();
    return Promise.resolve({ data: r.data[0] ?? null, error: null });
  };
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  const db = { from: () => builder } as unknown as DbClient;
  return { db, calls };
}

const NEWS = {
  id: "n1",
  slug: "folha-do-cerrado",
  kind: "rss",
  status: "active",
  priority: 1,
  editorial_score: 3,
  frequency_minutes: null,
  terms_min_interval_minutes: null,
  rate_limit_per_hour: 60,
  consumption: {},
  last_fetched_at: null,
};
const EVENTS = { ...NEWS, id: "e1", slug: "agenda-fictícia", kind: "events" };

describe("fontes de eventos fora do pipeline de notícias (AGM-T1)", () => {
  it("activeSources não devolve fonte kind='events'", async () => {
    const { db, calls } = fakeDb([NEWS, EVENTS]);
    const out = await createRunStore(db).activeSources();
    expect(calls).toContainEqual(["neq", "kind", "events"]);
    expect(out.map((s) => s.slug)).toEqual(["folha-do-cerrado"]);
  });

  it("frontpageSources filtra kind='events'", async () => {
    const { db, calls } = fakeDb([]);
    await createFrontpageRepo(db).frontpageSources();
    expect(calls).toContainEqual(["neq", "kind", "events"]);
  });

  it("sourceBySlug e sourceById não resolvem fonte kind='events' (Coletar agora e ativação de notícias)", async () => {
    const a = fakeDb([]);
    await createIngestRepo(a.db).sourceBySlug("x");
    expect(a.calls).toContainEqual(["neq", "kind", "events"]);
    const b = fakeDb([]);
    await createIngestRepo(b.db).sourceById("x");
    expect(b.calls).toContainEqual(["neq", "kind", "events"]);
  });
});
