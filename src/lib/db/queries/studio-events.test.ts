import { describe, expect, it } from "vitest";
import { LOCKABLE_COLUMNS } from "@/lib/agenda/merge";
import type { EventInput } from "@/lib/agenda/event-form";
import type { DbClient } from "@/lib/db/client";
import {
  changedColumns,
  createEvent,
  lockedAfterEdit,
  parseStudioEventFilters,
  restoreEvent,
  situationOf,
  updateEvent,
  withdrawEvent,
  type StoredStudioEvent,
} from "./studio-events";

const NOW = new Date("2026-10-08T15:00:00Z");
const ID = "e1000000-0000-4000-8000-000000000001";
const USER = "c1000000-0000-4000-8000-000000000003";

const stored: StoredStudioEvent = {
  id: ID,
  slug: "noite-do-siriri-1710-abc123",
  title: "Noite do Siriri",
  starts_at: "2026-10-18T00:00:00+00:00",
  ends_at: null,
  venue: "Casa Cerrado Vivo",
  neighborhood: null,
  price_cents: null,
  price_unknown: true,
  category: "musica",
  age_rating: "consulte",
  accessibility: null,
  source_url: "https://cerradovivo.example/siriri",
  description: "Roda de siriri.",
  locked_fields: ["title"],
  withdrawn_at: null,
};

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: stored.title,
  startsAt: "2026-10-18T00:00:00.000Z",
  endsAt: null,
  venue: stored.venue,
  neighborhood: null,
  priceCents: null,
  priceUnknown: true,
  category: "musica",
  ageRating: "consulte",
  accessibility: null,
  sourceUrl: stored.source_url,
  description: stored.description,
  ...over,
});

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

/** Cliente falso do PostgREST: registra as chamadas e responde do `row` guardado. */
function fakeDb(row: StoredStudioEvent | null) {
  const calls: Call[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  let current = row ? { ...row } : null;
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (call.op === "insert") return { data: null, error: null };
      const match = call.filters.every(([col, v]) =>
        col === "is:withdrawn_at"
          ? v === null
            ? current?.withdrawn_at === null
            : current?.withdrawn_at !== null
          : current?.[col as keyof StoredStudioEvent] === v,
      );
      if (!current || !match) return { data: null, error: null };
      if (call.op === "update") current = { ...current, ...(call.payload as object) };
      return { data: { ...current }, error: null };
    };
    const b = {
      select: () => b,
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return Promise.resolve(result());
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return b;
      },
      eq: (col: string, v: unknown) => {
        call.filters.push([col, v]);
        return b;
      },
      is: (col: string, v: unknown) => {
        call.filters.push([`is:${col}`, v]);
        return b;
      },
      not: (col: string, _op: string, v: unknown) => {
        call.filters.push([`is:${col}`, v === null ? "not-null" : v]);
        return b;
      },
      maybeSingle: () => Promise.resolve(result()),
    };
    return b;
  }
  const db = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as DbClient;
  return { db, calls, rpcs, current: () => current };
}

const actor = (db: DbClient) => ({ db, userId: USER, now: NOW });

describe("parseStudioEventFilters", () => {
  it("lê os filtros válidos da URL", () => {
    expect(
      parseStudioEventFilters(
        new URLSearchParams(
          "q=siriri&de=2026-10-01&ate=2026-10-31&fonte=cerrado-vivo&origem=redacao&situacao=retirado&pagina=2",
        ),
      ),
    ).toEqual({
      q: "siriri",
      from: "2026-10-01",
      to: "2026-10-31",
      source: "cerrado-vivo",
      origin: "newsroom",
      situacao: "retirado",
      page: 2,
    });
  });

  it("valores inválidos são ignorados", () => {
    expect(
      parseStudioEventFilters(
        new URLSearchParams("de=31/10&origem=robo&situacao=apagado&pagina=-1&fonte=<b>"),
      ),
    ).toEqual({
      q: null,
      from: null,
      to: null,
      source: null,
      origin: null,
      situacao: null,
      page: 1,
    });
  });
});

describe("situationOf", () => {
  const base = {
    confirmed_at: "2026-10-01T00:00:00Z",
    withdrawn_at: null,
    starts_at: "2026-10-18T00:00:00Z",
    ends_at: null,
  };
  it("retirado vence tudo; sem confirmação; encerrado pelo fim ou pelo início", () => {
    expect(situationOf(base, NOW)).toBe("no_ar");
    expect(situationOf({ ...base, withdrawn_at: "2026-10-02T00:00:00Z" }, NOW)).toBe("retirado");
    expect(situationOf({ ...base, confirmed_at: null }, NOW)).toBe("sem_confirmacao");
    expect(situationOf({ ...base, starts_at: "2026-10-01T00:00:00Z" }, NOW)).toBe("encerrado");
    expect(
      situationOf(
        { ...base, starts_at: "2026-10-08T12:00:00Z", ends_at: "2026-10-08T18:00:00Z" },
        NOW,
      ),
    ).toBe("no_ar");
  });
});

describe("changedColumns / lockedAfterEdit", () => {
  it("compara instantes pelo valor, não pelo texto", () => {
    expect(changedColumns(stored, input())).toEqual([]);
  });

  it("acusa título, preço e faixa etária alterados", () => {
    expect(
      changedColumns(stored, input({ title: "Siriri", priceCents: 0, priceUnknown: false })),
    ).toEqual(["title", "price_cents", "price_unknown"]);
    expect(changedColumns(stored, input({ ageRating: "livre" }))).toEqual(["age_rating"]);
  });

  it("trava só colunas da coleta, sem duplicar", () => {
    expect(lockedAfterEdit(["title"], ["title", "venue", "age_rating", "accessibility"])).toEqual([
      "title",
      "venue",
    ]);
  });
});

describe("updateEvent", () => {
  it('título alterado acrescenta "title" a locked_fields sem duplicar', async () => {
    const fake = fakeDb({ ...stored, locked_fields: ["venue"] });
    const r = await updateEvent(ID, input({ title: "Noite do Siriri Moderno" }), actor(fake.db));
    expect(r.ok).toBe(true);
    expect(fake.current()?.locked_fields).toEqual(["venue", "title"]);
    expect(fake.current()?.title).toBe("Noite do Siriri Moderno");

    const again = await updateEvent(
      ID,
      input({ title: "Noite do Siriri, edição 2" }),
      actor(fake.db),
    );
    expect(again.ok).toBe(true);
    expect(fake.current()?.locked_fields).toEqual(["venue", "title"]);
  });

  it("grava updated_at e só as colunas alteradas; audita o diff", async () => {
    const fake = fakeDb(stored);
    await updateEvent(ID, input({ venue: "Sesc Arsenal" }), actor(fake.db));
    const upd = fake.calls.find((c) => c.op === "update");
    expect(upd?.payload).toEqual({
      venue: "Sesc Arsenal",
      locked_fields: ["title", "venue"],
      updated_at: NOW.toISOString(),
    });
    expect(fake.rpcs).toEqual([
      {
        fn: "studio_audit",
        args: {
          p_actor: USER,
          p_action: "event.update",
          p_object_ref: `event:${ID}`,
          p_details: {
            changed: ["venue"],
            diff: { venue: { from: "Casa Cerrado Vivo", to: "Sesc Arsenal" } },
            locked_fields: ["title", "venue"],
          },
        },
      },
    ]);
  });

  it("sem mudança não grava nem audita; evento inexistente → not_found", async () => {
    const fake = fakeDb(stored);
    expect(await updateEvent(ID, input(), actor(fake.db))).toEqual({
      ok: true,
      value: { id: ID, slug: stored.slug, changed: [] },
    });
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    expect(fake.rpcs).toEqual([]);
    const none = fakeDb(null);
    expect(await updateEvent(ID, input(), actor(none.db))).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("createEvent", () => {
  it("origem newsroom, confirmado agora e todos os campos travados; audita", async () => {
    const fake = fakeDb(null);
    const r = await createEvent(input({ title: "Feira do Porto" }), actor(fake.db));
    expect(r.ok).toBe(true);
    const ins = fake.calls.find((c) => c.op === "insert");
    expect(ins?.payload).toMatchObject({
      title: "Feira do Porto",
      origin: "newsroom",
      confirmed_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      locked_fields: Object.keys(LOCKABLE_COLUMNS),
      age_rating: "consulte",
    });
    expect((ins?.payload as { slug: string }).slug).toMatch(/^feira-do-porto-1710-[0-9a-f]{6}$/);
    expect(fake.rpcs[0]?.args).toMatchObject({ p_action: "event.create" });
  });
});

describe("withdrawEvent / restoreEvent", () => {
  it("retira (withdrawn_at = agora) e devolve (null), com updated_at e auditoria", async () => {
    const fake = fakeDb(stored);
    const w = await withdrawEvent(ID, actor(fake.db));
    expect(w).toEqual({ ok: true, value: { id: ID, slug: stored.slug, changed: true } });
    expect(fake.current()?.withdrawn_at).toBe(NOW.toISOString());
    expect(fake.rpcs.at(-1)?.args).toMatchObject({ p_action: "event.withdraw" });

    const twice = await withdrawEvent(ID, actor(fake.db));
    expect(twice).toEqual({ ok: true, value: { id: ID, slug: stored.slug, changed: false } });
    expect(fake.rpcs).toHaveLength(1);

    const back = await restoreEvent(ID, actor(fake.db));
    expect(back.ok).toBe(true);
    expect(fake.current()?.withdrawn_at).toBeNull();
    expect(fake.rpcs.at(-1)?.args).toMatchObject({ p_action: "event.restore" });
  });
});
