// @vitest-environment node
// ARD-T3: "Próximos eventos aqui" no lugar do Guia — só eventos futuros, no ar (confirmados e não
// retirados, mesma RLS da agenda pública), em ordem de início, até 5; o evento ganha o slug do
// lugar quando o lugar é público.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEvent, upcomingEventsAtVenue } from "@/lib/db/queries/events";
import { service } from "./studio";

const TAG = `ard-t3-${Date.now().toString(36)}`;
const CRITERIA =
  "Reunimos teatros fictícios de Cuiabá para testar os próximos eventos do lugar, com dados públicos.";
const DAY = 86_400_000;
const eventIds: string[] = [];
let venue = "";
let hidden = "";
let list = "";

const value = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

async function insertVenue(slug: string) {
  const r = await service
    .from("venues")
    .insert({ slug: `${slug}-${TAG}`, name: `Teatro ${slug} ${TAG}`, category: "teatro" })
    .select("id")
    .single();
  if (r.error) throw r.error;
  return r.data.id;
}

beforeAll(async () => {
  venue = await insertVenue("aurora");
  hidden = await insertVenue("oculto");
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
  list = l.data.id;
  const item = await service
    .from("guide_list_items")
    .insert({ list_id: list, venue_id: venue, position: 1 });
  if (item.error) throw item.error;

  const now = Date.now();
  const base = {
    category: "teatro",
    origin: "newsroom",
    venue: `Teatro aurora ${TAG}`,
    confirmed_at: new Date().toISOString(),
  };
  const rows = [
    // 6 futuros no ar: só os 5 primeiros aparecem, em ordem de início.
    ...Array.from({ length: 6 }, (_, i) => ({
      ...base,
      slug: `futuro-${i}-${TAG}`,
      title: `Futuro ${i} ${TAG}`,
      starts_at: new Date(now + (6 - i) * DAY).toISOString(),
      venue_id: venue,
    })),
    {
      ...base,
      slug: `retirado-${TAG}`,
      title: `Retirado ${TAG}`,
      starts_at: new Date(now + 0.5 * DAY).toISOString(),
      venue_id: venue,
      withdrawn_at: new Date().toISOString(),
    },
    {
      ...base,
      slug: `passado-${TAG}`,
      title: `Passado ${TAG}`,
      starts_at: new Date(now - 2 * DAY).toISOString(),
      venue_id: venue,
    },
    {
      ...base,
      slug: `sem-confirmacao-${TAG}`,
      title: `Sem confirmação ${TAG}`,
      starts_at: new Date(now + 0.25 * DAY).toISOString(),
      venue_id: venue,
      confirmed_at: null,
    },
    {
      ...base,
      slug: `outro-lugar-${TAG}`,
      title: `Outro lugar ${TAG}`,
      starts_at: new Date(now + 0.1 * DAY).toISOString(),
      venue_id: hidden,
    },
  ];
  const ins = await service.from("event_listings").insert(rows).select("id");
  if (ins.error) throw ins.error;
  eventIds.push(...ins.data.map((r) => r.id));
});

afterAll(async () => {
  await service.from("event_listings").delete().in("id", eventIds);
  await service.from("guide_list_items").delete().eq("list_id", list);
  await service.from("guide_lists").delete().eq("id", list);
  await service.from("venues").delete().in("id", [venue, hidden]);
});

describe("upcomingEventsAtVenue", () => {
  it("até 5 eventos futuros no ar do lugar, por início; sem retirado, passado nem não confirmado", async () => {
    const events = value(await upcomingEventsAtVenue(venue));
    expect(events.map((e) => e.title)).toEqual([5, 4, 3, 2, 1].map((i) => `Futuro ${i} ${TAG}`));
    expect(events.every((e) => e.href.startsWith("/agenda/"))).toBe(true);
    expect(events[0]?.venueSlug).toBe(`aurora-${TAG}`);
  });

  it("limite menor e lugar sem eventos", async () => {
    expect(value(await upcomingEventsAtVenue(venue, 2))).toHaveLength(2);
    expect(value(await upcomingEventsAtVenue("6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b"))).toEqual([]);
  });

  it("lugar fora do Guia público: o evento aparece na agenda sem o slug do lugar", async () => {
    const e = value(await getEvent(`outro-lugar-${TAG}`));
    expect(e?.title).toBe(`Outro lugar ${TAG}`);
    expect(e?.venueSlug).toBeNull();
  });
});
