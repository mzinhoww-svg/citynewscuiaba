// @vitest-environment node
// ARD-T4: destaque da Agenda (`featured_until`, auditado `event.feature`), organização travada no
// Estúdio e a imagem do evento pelo Media Registry na leitura pública (anon).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventInput } from "@/lib/agenda/event-form";
import { featuredUntilOf } from "@/lib/agenda/feature";
import { getEvent, listFeaturedEvents } from "@/lib/db/queries/events";
import {
  createEvent,
  listStudioEvents,
  setEventFeatured,
  updateEvent,
} from "@/lib/db/queries/studio-events";
import type { Database } from "@/lib/db/types";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const TAG = `ard-t4-${Date.now().toString(36)}`;
const START = new Date(Date.now() + 6 * 86_400_000).toISOString();
const created: string[] = [];
const assets: string[] = [];
let eventId = "";
let slug = "";

const value = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: `Forró da Praça ${TAG}`,
  startsAt: START,
  endsAt: null,
  venue: `Praça ${TAG}`,
  neighborhood: null,
  priceCents: 0,
  priceUnknown: false,
  category: "musica",
  ageRating: "livre",
  accessibility: null,
  sourceUrl: "https://forro.example/praca",
  description: null,
  organizer: null,
  ...over,
});

async function actor(user: keyof typeof SEED_USERS) {
  return { db: await clientOf(user), userId: SEED_USERS[user].id, now: new Date() };
}

beforeAll(async () => {
  const c = value(await createEvent(input(), await actor("otavio")));
  eventId = c.id;
  slug = c.slug;
  created.push(c.id);
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
  if (assets.length) await service.from("media_assets").delete().in("id", assets);
});

describe("destaque do evento (B5)", () => {
  it("editor da Agenda destaca até uma data: grava, audita e aparece na faixa pública", async () => {
    const until = value(
      featuredUntilOf(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)),
    );
    const r = value(await setEventFeatured(eventId, until, await actor("otavio")));
    expect(r.changed).toBe(true);
    const row = await service
      .from("event_listings")
      .select("featured_until")
      .eq("id", eventId)
      .single();
    expect(Date.parse(row.data!.featured_until!)).toBe(Date.parse(until));

    const audit = await service
      .from("audit_log")
      .select("action, details, actor")
      .eq("object_ref", `event:${eventId}`)
      .eq("action", "event.feature");
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]).toMatchObject({
      actor: SEED_USERS.otavio.id,
      details: { featured_until: until, from: null },
    });

    const pub = value(await listFeaturedEvents());
    const mine = pub.find((e) => e.id === eventId);
    expect(mine?.featured).toBe(true);
    expect(value(await getEvent(slug))?.featured).toBe(true);

    const list = await asUser("otavio", () =>
      listStudioEvents({
        q: TAG,
        from: null,
        to: null,
        source: null,
        origin: null,
        situacao: null,
        page: 1,
      }),
    );
    expect(list.rows[0]?.featuredUntil).not.toBeNull();

    // Repetir a mesma data não grava nem audita de novo.
    expect(value(await setEventFeatured(eventId, until, await actor("otavio"))).changed).toBe(
      false,
    );
  });

  it("quem não tem a editoria Agenda é barrado pela RLS e nada muda", async () => {
    const before = await service
      .from("event_listings")
      .select("featured_until")
      .eq("id", eventId)
      .single();
    const r = await setEventFeatured(eventId, null, await actor("juliana"));
    expect(r).toEqual({ ok: false, error: "forbidden" });
    const after = await service
      .from("event_listings")
      .select("featured_until")
      .eq("id", eventId)
      .single();
    expect(after.data?.featured_until).toBe(before.data?.featured_until);
  });

  it("Tirar destaque limpa a data, audita e o evento sai da faixa", async () => {
    const r = value(await setEventFeatured(eventId, null, await actor("otavio")));
    expect(r.changed).toBe(true);
    const row = await service
      .from("event_listings")
      .select("featured_until")
      .eq("id", eventId)
      .single();
    expect(row.data?.featured_until).toBeNull();
    const audit = await service
      .from("audit_log")
      .select("details")
      .eq("object_ref", `event:${eventId}`)
      .eq("action", "event.feature")
      .order("id", { ascending: true });
    expect(audit.data).toHaveLength(2);
    expect(audit.data?.[1]?.details).toMatchObject({ featured_until: null });
    expect(value(await listFeaturedEvents()).some((e) => e.id === eventId)).toBe(false);
  });

  it("destaque vencido não aparece", async () => {
    await service
      .from("event_listings")
      .update({ featured_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", eventId);
    expect(value(await listFeaturedEvents()).some((e) => e.id === eventId)).toBe(false);
    await service.from("event_listings").update({ featured_until: null }).eq("id", eventId);
  });
});

describe("organização e local do Guia no Estúdio", () => {
  it("organizador e faixa editados ficam travados e saem na leitura pública", async () => {
    const u = value(
      await updateEvent(
        eventId,
        input({ organizer: `Coletivo ${TAG}`, ageRating: "12" }),
        await actor("otavio"),
      ),
    );
    expect(u.changed).toEqual(["age_rating", "organizer"]);
    const row = await service
      .from("event_listings")
      .select("organizer, age_rating, locked_fields")
      .eq("id", eventId)
      .single();
    expect(row.data).toMatchObject({ organizer: `Coletivo ${TAG}`, age_rating: "12" });
    expect(row.data?.locked_fields).toEqual(expect.arrayContaining(["organizer", "age_rating"]));
    expect(value(await getEvent(slug))).toMatchObject({
      organizer: `Coletivo ${TAG}`,
      ageRating: "12",
    });
  });

  it("seletor Nenhum grava sem vínculo e trava venue_id", async () => {
    value(await updateEvent(eventId, input({ venueId: null }), await actor("otavio")));
    const row = await service
      .from("event_listings")
      .select("venue_id, locked_fields")
      .eq("id", eventId)
      .single();
    expect(row.data?.venue_id).toBeNull();
    expect(row.data?.locked_fields).toContain("venue_id");
  });
});

describe("imagem do evento pelo Media Registry (anon)", () => {
  let mediaId = "";

  beforeAll(async () => {
    const m = await service
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: `reproducao/${TAG}.jpg`,
        origin_url: `https://forro.example/${TAG}.jpg`,
        page_url: "https://forro.example/praca",
        source_name: "Forró da Praça (fictícia)",
        license: "reproducao",
        allowed_use: "event",
        credit: "Foto: reprodução web · Forró da Praça (fictícia)",
        status: "approved",
        width: 1200,
        height: 800,
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    mediaId = m.data.id;
    assets.push(mediaId);
    await service.from("event_listings").update({ media_id: mediaId }).eq("id", eventId);
  });

  it("ativo aprovado: imagem com variantes, crédito da fonte e Ver original", async () => {
    const e = value(await getEvent(slug));
    expect(e?.image).toMatchObject({
      src480: `/api/media/${mediaId}?w=480`,
      src960: `/api/media/${mediaId}?w=960`,
      kind: "reproduction",
      credit: "Forró da Praça (fictícia)",
      originUrl: "https://forro.example/praca",
    });
  });

  it("vencido, retirado ou bloqueado: sem imagem", async () => {
    const cases: Database["public"]["Tables"]["media_assets"]["Update"][] = [
      { license_until: "2026-01-01" },
      { removed_at: new Date().toISOString() },
      { status: "blocked" },
    ];
    for (const patch of cases) {
      await service.from("media_assets").update(patch).eq("id", mediaId);
      // `getEvent` é memorizado por requisição (React `cache`); fora de requisição, lê de novo.
      expect(value(await getEvent(slug))?.image, JSON.stringify(patch)).toBeNull();
      await service
        .from("media_assets")
        .update({ license_until: null, removed_at: null, status: "approved" })
        .eq("id", mediaId);
    }
  });
});
