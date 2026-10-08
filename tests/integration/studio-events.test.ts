// @vitest-environment node
// AGM-T7: eventos da Agenda no Estúdio contra o banco local — RLS da editoria `agenda`, origem
// `newsroom`, travas por edição, retirada que some do público (anon) e auditoria aceita pelo
// banco (`studio_audit_actions`, migration 0198).
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { EventInput } from "@/lib/agenda/event-form";
import { LOCKABLE_COLUMNS } from "@/lib/agenda/merge";
import type { Database } from "@/lib/db/types";
import {
  createEvent,
  listStudioEvents,
  restoreEvent,
  updateEvent,
  withdrawEvent,
} from "@/lib/db/queries/studio-events";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const anon = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const created: string[] = [];
const TAG = `agm-t7-${Date.now().toString(36)}`;
const START = new Date(Date.now() + 5 * 86_400_000).toISOString();

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: `Feira do Porto ${TAG}`,
  startsAt: START,
  endsAt: null,
  venue: "Praça do Porto",
  neighborhood: "Porto",
  priceCents: 0,
  priceUnknown: false,
  category: "feira",
  ageRating: "livre",
  accessibility: null,
  sourceUrl: "https://feira.example/porto",
  description: "Feira de produtores do Porto.",
  ...over,
});

afterAll(async () => {
  if (created.length) {
    await service
      .from("audit_log")
      .delete()
      .in(
        "object_ref",
        created.map((id) => `event:${id}`),
      );
    await service.from("event_listings").delete().in("id", created);
  }
});

async function actor(user: keyof typeof SEED_USERS) {
  return { db: await clientOf(user), userId: SEED_USERS[user].id, now: new Date() };
}

describe("eventos do Estúdio no banco", () => {
  it("editor da Agenda cadastra (newsroom, no ar, tudo travado), edita, retira e devolve", async () => {
    const otavio = await actor("otavio");
    const c = await createEvent(input(), otavio);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    created.push(c.value.id);

    const row = await service
      .from("event_listings")
      .select("origin, confirmed_at, locked_fields, dedupe_key, updated_at")
      .eq("id", c.value.id)
      .single();
    expect(row.data).toMatchObject({ origin: "newsroom", dedupe_key: null });
    expect(row.data?.confirmed_at).not.toBeNull();
    expect([...(row.data?.locked_fields ?? [])].sort()).toEqual(
      Object.keys(LOCKABLE_COLUMNS).sort(),
    );
    const pub = await anon.from("event_listings").select("id").eq("id", c.value.id);
    expect(pub.data).toHaveLength(1);

    const u = await updateEvent(c.value.id, input({ title: `Feira do Porto nova ${TAG}` }), otavio);
    expect(u.ok && u.value.changed).toEqual(["title"]);
    const audit = await service
      .from("audit_log")
      .select("action, details")
      .eq("object_ref", `event:${c.value.id}`)
      .order("id", { ascending: true });
    expect(audit.data?.map((a) => a.action)).toEqual(["event.create", "event.update"]);
    expect(audit.data?.[1]?.details).toMatchObject({
      changed: ["title"],
      diff: { title: { from: `Feira do Porto ${TAG}`, to: `Feira do Porto nova ${TAG}` } },
    });

    const w = await withdrawEvent(c.value.id, otavio);
    expect(w.ok && w.value.changed).toBe(true);
    expect((await anon.from("event_listings").select("id").eq("id", c.value.id)).data).toEqual([]);
    // A equipe continua vendo o retirado na lista do Estúdio.
    const list = await asUser("otavio", () =>
      listStudioEvents({
        q: TAG,
        from: null,
        to: null,
        source: null,
        origin: "newsroom",
        situacao: "retirado",
        page: 1,
      }),
    );
    expect(list.rows.map((r) => r.id)).toEqual([c.value.id]);
    expect(list.rows[0]?.situation).toBe("retirado");

    const r = await restoreEvent(c.value.id, otavio);
    expect(r.ok && r.value.changed).toBe(true);
    expect((await anon.from("event_listings").select("id").eq("id", c.value.id)).data).toHaveLength(
      1,
    );
    const live = await asUser("otavio", () =>
      listStudioEvents({
        q: TAG,
        from: null,
        to: null,
        source: null,
        origin: null,
        situacao: "no_ar",
        page: 1,
      }),
    );
    expect(live.rows.map((x) => x.id)).toEqual([c.value.id]);
  });

  it("quem não é da editoria Agenda não grava (RLS)", async () => {
    const juliana = await actor("juliana");
    const c = await createEvent(input({ title: `Sem papel ${TAG}` }), juliana);
    expect(c).toEqual({ ok: false, error: "forbidden" });
    const seeded = await service
      .from("event_listings")
      .select("id")
      .eq("slug", "noite-de-rasqueado-no-sesc-arsenal")
      .single();
    const w = await withdrawEvent(seeded.data!.id, juliana);
    expect(w.ok).toBe(false);
    const still = await service
      .from("event_listings")
      .select("withdrawn_at")
      .eq("id", seeded.data!.id)
      .single();
    expect(still.data?.withdrawn_at).toBeNull();
  });
});
