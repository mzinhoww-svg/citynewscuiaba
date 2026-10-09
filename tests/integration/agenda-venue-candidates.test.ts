// @vitest-environment node
// ARD-T3: um só conjunto de candidatos para o vínculo evento → lugar do Guia
// (`agenda_venue_candidates`, migration 0204). Anônimo não chama; editor da Agenda enxerga lugar
// ativo não público; homônimo público + não público é ambíguo na coleta e no Estúdio.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventInput } from "@/lib/agenda/event-form";
import { matchVenue } from "@/lib/agenda/venue-match";
import { createAgendaStore } from "@/lib/db/agenda-store";
import { createEvent } from "@/lib/db/queries/studio-events";
import type { Database } from "@/lib/db/types";
import { clientOf, SEED_USERS, service } from "./studio";

const TAG = `ard-t3c-${Date.now().toString(36)}`;
const CRITERIA =
  "Reunimos teatros fictícios de Cuiabá para testar o conjunto de candidatos da Agenda, com dados públicos.";
const venueIds: string[] = [];
const eventIds: string[] = [];
let list = "";
let publico = "";
let oculto = "";
let soOculto = "";

async function venue(name: string, slug: string) {
  const r = await service
    .from("venues")
    .insert({ slug: `${slug}-${TAG}`, name, category: "teatro" })
    .select("id")
    .single();
  if (r.error) throw r.error;
  venueIds.push(r.data.id);
  return r.data.id;
}

const input = (venueText: string): EventInput => ({
  title: `Peça homônima ${TAG}`,
  startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  endsAt: null,
  venue: venueText,
  neighborhood: null,
  priceCents: 0,
  priceUnknown: false,
  category: "teatro",
  ageRating: "livre",
  accessibility: null,
  sourceUrl: null,
  description: null,
  organizer: null,
});

beforeAll(async () => {
  publico = await venue(`Teatro Gêmeo ${TAG}`, "gemeo-publico");
  oculto = await venue(`Teatro Gêmeo ${TAG}`, "gemeo-oculto");
  soOculto = await venue(`Espaço Escondido Fictício ${TAG}`, "so-oculto");
  const l = await service
    .from("guide_lists")
    .insert({
      slug: `gemeos-${TAG}`,
      title: `Gêmeos ${TAG}`,
      category: "teatro",
      criteria: CRITERIA,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (l.error) throw l.error;
  list = l.data.id;
  const i = await service
    .from("guide_list_items")
    .insert({ list_id: list, venue_id: publico, position: 1 });
  if (i.error) throw i.error;
});

afterAll(async () => {
  if (eventIds.length) {
    await service
      .from("audit_log")
      .delete()
      .in(
        "object_ref",
        eventIds.map((id) => `event:${id}`),
      );
    await service.from("event_listings").delete().in("id", eventIds);
  }
  await service.from("guide_list_items").delete().eq("list_id", list);
  await service.from("guide_lists").delete().eq("id", list);
  await service.from("venues").delete().in("id", venueIds);
});

describe("agenda_venue_candidates", () => {
  it("anônimo não chama", async () => {
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const r = await anon.rpc("agenda_venue_candidates");
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });

  it("quem não edita a Agenda não chama; o editor da Agenda vê lugar ativo não público", async () => {
    const juliana = await clientOf("juliana");
    const denied = await juliana.rpc("agenda_venue_candidates");
    expect(denied.error?.code).toBe("42501");

    const otavio = await clientOf("otavio");
    const r = await otavio.rpc("agenda_venue_candidates");
    expect(r.error).toBeNull();
    const ids = (r.data ?? []).map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining([publico, oculto, soOculto]));
    expect((r.data ?? []).every((v) => v.status === "active")).toBe(true);
  });

  it("homônimo público + não público é ambíguo na coleta e no Estúdio", async () => {
    const candidates = await createAgendaStore(service).activeVenues();
    expect(matchVenue(`Teatro Gêmeo ${TAG}`, candidates)).toBeNull();
    expect(matchVenue(`Espaço Escondido Fictício ${TAG}`, candidates)).toBe(soOculto);

    const actor = {
      db: await clientOf("otavio"),
      userId: SEED_USERS.otavio.id,
      now: new Date(),
    };
    const c = await createEvent(input(`Teatro Gêmeo ${TAG}`), actor);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    eventIds.push(c.value.id);
    const row = await service
      .from("event_listings")
      .select("venue_id")
      .eq("id", c.value.id)
      .single();
    expect(row.data?.venue_id).toBeNull();
  });
});
