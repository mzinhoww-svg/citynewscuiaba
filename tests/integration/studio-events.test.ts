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

const venueIds: string[] = [];
const listIds: string[] = [];

afterAll(async () => {
  if (listIds.length) {
    await service.from("guide_list_items").delete().in("list_id", listIds);
    await service.from("guide_lists").delete().in("id", listIds);
  }
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);
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
      Object.keys(LOCKABLE_COLUMNS)
        .filter((c) => c !== "venue_id")
        .sort(),
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

  describe("vínculo com o lugar do Guia (ARD-T3)", () => {
    const CRITERIA =
      "Reunimos teatros fictícios de Cuiabá para o teste do vínculo com a Agenda, com dados públicos.";
    let teatro = "";
    let outro = "";

    async function publicVenue(name: string, slug: string) {
      const v = await service
        .from("venues")
        .insert({ slug: `${slug}-${TAG}`, name, category: "teatro" })
        .select("id")
        .single();
      if (v.error) throw v.error;
      venueIds.push(v.data.id);
      return v.data.id;
    }

    it("prepara dois lugares públicos do Guia", async () => {
      teatro = await publicVenue(`Teatro Lume ${TAG}`, "teatro-lume");
      outro = await publicVenue(`Cine Brisa ${TAG}`, "cine-brisa");
      const l = await service
        .from("guide_lists")
        .insert({
          slug: `teatros-${TAG}`,
          title: `Teatros ${TAG}`,
          category: "teatro",
          criteria: CRITERIA,
          status: "published",
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (l.error) throw l.error;
      listIds.push(l.data.id);
      const items = await service.from("guide_list_items").insert([
        { list_id: l.data.id, venue_id: teatro, position: 1 },
        { list_id: l.data.id, venue_id: outro, position: 2 },
      ]);
      expect(items.error).toBeNull();
    });

    it("cadastro sem escolha casa pelo local e não trava; escolha explícita trava", async () => {
      const otavio = await actor("otavio");
      const auto = await createEvent(
        input({ title: `Peça automática ${TAG}`, venue: `Lume ${TAG} - Cuiabá` }),
        otavio,
      );
      expect(auto.ok).toBe(true);
      if (!auto.ok) return;
      created.push(auto.value.id);
      const a = await service
        .from("event_listings")
        .select("venue_id, locked_fields")
        .eq("id", auto.value.id)
        .single();
      expect(a.data?.venue_id).toBe(teatro);
      expect(a.data?.locked_fields).not.toContain("venue_id");

      const manual = await createEvent(
        input({ title: `Peça escolhida ${TAG}`, venue: `Lume ${TAG}`, venueId: outro }),
        otavio,
      );
      expect(manual.ok).toBe(true);
      if (!manual.ok) return;
      created.push(manual.value.id);
      const m = await service
        .from("event_listings")
        .select("venue_id, locked_fields")
        .eq("id", manual.value.id)
        .single();
      expect(m.data?.venue_id).toBe(outro);
      expect(m.data?.locked_fields).toContain("venue_id");
    });

    it("edição: sem vínculo casa pelo local; escolha explícita grava, trava e audita", async () => {
      const otavio = await actor("otavio");
      const c = await createEvent(
        input({ title: `Peça sem lugar ${TAG}`, venue: "Quintal Desconhecido" }),
        otavio,
      );
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      created.push(c.value.id);
      const row0 = await service
        .from("event_listings")
        .select("venue_id")
        .eq("id", c.value.id)
        .single();
      expect(row0.data?.venue_id).toBeNull();

      const u = await updateEvent(
        c.value.id,
        input({ title: `Peça sem lugar ${TAG}`, venue: `Teatro Lume ${TAG}` }),
        otavio,
      );
      expect(u.ok).toBe(true);
      const row1 = await service
        .from("event_listings")
        .select("venue_id, locked_fields")
        .eq("id", c.value.id)
        .single();
      expect(row1.data?.venue_id).toBe(teatro);
      expect(row1.data?.locked_fields).not.toContain("venue_id");

      const e = await updateEvent(
        c.value.id,
        input({ title: `Peça sem lugar ${TAG}`, venue: `Teatro Lume ${TAG}`, venueId: outro }),
        otavio,
      );
      expect(e.ok && e.value.changed).toEqual(["venue_id"]);
      const row2 = await service
        .from("event_listings")
        .select("venue_id, locked_fields")
        .eq("id", c.value.id)
        .single();
      expect(row2.data?.venue_id).toBe(outro);
      expect(row2.data?.locked_fields).toContain("venue_id");
    });
  });
});
