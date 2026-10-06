// @vitest-environment node
// GUIA-T2 · O passo venue_sync contra o banco real: grava lugares com slug único, não duplica numa
// segunda rodada, guarda a conferência da nota e conta a cota diária do TripAdvisor.
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createGuideStore } from "@/lib/db/guide-store";
import { venueRecord } from "@/lib/guide/testing";
import { err, ok } from "@/lib/result";
import { runVenueSync } from "@/lib/pipeline/steps/venue-sync";

const db = createServiceClient();
const store = createGuideStore(db);
const mark = Date.now().toString(36);
const TA_ID = String(Date.now());
const CATEGORY = "museu"; // categoria do catálogo pouco usada pelo seed

const osm = (n: number) =>
  venueRecord({
    name: `Museu Teste ${mark} ${n}`,
    category: CATEGORY,
    neighborhood: n === 1 ? "Centro Sul" : null,
    lat: -15.6 - n / 50,
    lng: -56.1,
    website: null,
    placeIds: { osm: `node/${mark}${n}` },
  });

afterAll(async () => {
  const { data } = await db.from("venues").select("id").like("name", `Museu Teste ${mark}%`);
  const ids = (data ?? []).map((v) => v.id);
  if (ids.length) await db.from("venues").delete().in("id", ids);
  await db.from("guide_runs").delete().eq("kind", "venue_sync").like("report->>marker", `${mark}`);
});

function depsFor(ta: boolean) {
  let made = 0;
  const now = new Date("2026-10-03T15:00:00Z");
  return {
    osm: {
      source: "osm" as const,
      search: async () => ok([osm(1), osm(2)]),
      details: async () => ok(null),
    },
    tripadvisor: ta
      ? {
          source: "tripadvisor" as const,
          search: async () => {
            made += 1;
            return ok([
              venueRecord({
                name: `Museu Teste ${mark} 1`,
                category: CATEGORY,
                lat: -15.62,
                lng: -56.1,
                placeIds: { tripadvisor: TA_ID },
                sources: ["tripadvisor" as const],
              }),
            ]);
          },
          details: async () => {
            made += 1;
            return ok(
              venueRecord({
                name: `Museu Teste ${mark} 1`,
                category: CATEGORY,
                lat: -15.62,
                lng: -56.1,
                rating: 4.4,
                ratingCount: 120,
                ratingSource: "tripadvisor" as const,
                tripadvisorRank: 3,
                placeIds: { tripadvisor: TA_ID },
                sources: ["tripadvisor" as const],
              }),
            );
          },
        }
      : null,
    site: async () => err("http" as const),
    store,
    now: () => now,
    taCallsLeft: async () => 50,
    taCallsMade: () => made,
    google: null,
    googleCallsLeft: async () => 0,
    googleCallsMade: () => 0,
  };
}

describe("venue_sync com banco", () => {
  it("grava lugares com slug único, nota conferida e fontes", async () => {
    const r = await runVenueSync(depsFor(true), {
      categories: [{ category: CATEGORY }],
      area: "Cuiabá",
    });
    expect(r.categories[0]).toMatchObject({ osm: 2, tripadvisor: 1, inserted: 2 });
    const { data } = await db
      .from("venues")
      .select("*")
      .like("name", `Museu Teste ${mark}%`)
      .order("name");
    expect(data).toHaveLength(2);
    const [one, two] = data!;
    expect(one!.slug).toMatch(/^museu-teste-.*-centro-sul$/);
    expect(two!.slug).toMatch(/-cuiaba$/);
    expect(one!.slug).not.toBe(two!.slug);
    expect(one!.rating).toBe(4.4);
    expect(one!.rating_source).toBe("tripadvisor");
    expect(one!.tripadvisor_rank).toBe(3);
    expect(one!.rating_updated_at).not.toBeNull();
    expect(one!.data_sources.sort()).toEqual(["osm", "tripadvisor"]);
    expect(two!.rating_updated_at).toBeNull();
    expect(two!.data_sources).toEqual(["osm"]);
  });

  it("segunda rodada atualiza em vez de duplicar", async () => {
    const r = await runVenueSync(depsFor(false), {
      categories: [{ category: CATEGORY }],
      area: "Cuiabá",
    });
    expect(r.providers.tripadvisor).toBe("no_key");
    expect(r.categories[0]!.inserted).toBe(0);
    const { data } = await db.from("venues").select("id").like("name", `Museu Teste ${mark}%`);
    expect(data).toHaveLength(2);
  });

  it("lugares com nota vencida são listados, os recentes não", async () => {
    const before = new Date("2026-09-03T15:00:00Z");
    const stale = await store.staleRatings(before, 100);
    expect(stale.some((v) => v.name.startsWith(`Museu Teste ${mark}`))).toBe(false);
    const later = new Date("2026-12-01T00:00:00Z");
    const stale2 = await store.staleRatings(later, 1000);
    expect(stale2.some((v) => v.name === `Museu Teste ${mark} 1`)).toBe(true);
  });

  it("conta a cota diária do TripAdvisor a partir dos relatórios do dia", async () => {
    const now = new Date();
    const before = await store.taCallsToday(now);
    const id = await store.startRun("venue_sync", "manual", now);
    await store.finishRun(id, { taCalls: 7, marker: mark });
    expect(await store.taCallsToday(now)).toBe(before + 7);
    expect((await store.lastRunStartedAt("venue_sync"))?.getTime()).toBeGreaterThan(
      now.getTime() - 1000,
    );
  });

  it("aceita google em data_sources e guarda o link do Maps e a data da coleta", async () => {
    const at = new Date("2026-10-06T12:00:00Z");
    await store.save(
      {
        inserts: [
          venueRecord({
            name: `Museu Teste ${mark} G`,
            category: CATEGORY,
            lat: -15.9,
            lng: -56.3,
            rating: 4.7,
            ratingCount: 321,
            ratingSource: "google",
            googleMapsUrl: "https://maps.google.com/?cid=123",
            placeIds: { google: `ChIJ-${mark}` },
            sources: ["google"],
          }),
        ],
        updates: [],
      },
      at,
    );
    const { data } = await db
      .from("venues")
      .select("*")
      .eq("name", `Museu Teste ${mark} G`)
      .single();
    expect(data!.data_sources).toEqual(["google"]);
    expect(data!.google_maps_url).toBe("https://maps.google.com/?cid=123");
    expect(new Date(data!.google_fetched_at!).toISOString()).toBe(at.toISOString());
    const loaded = await store.loadCategory(CATEGORY);
    const g = loaded.find((v) => v.name === `Museu Teste ${mark} G`)!;
    expect(g.placeIds.google).toBe(`ChIJ-${mark}`);
    expect(g.googleMapsUrl).toBe("https://maps.google.com/?cid=123");
    expect(g.googleFetchedAt).not.toBeNull();
  });

  it("expireGoogle apaga nota e link vencidos, e o contato só quando o Google é a única fonte", async () => {
    const old = new Date("2026-08-01T12:00:00Z");
    const recent = new Date("2026-09-25T12:00:00Z");
    const base = (n: string, sources: ("google" | "osm" | "site")[], lat: number) =>
      venueRecord({
        name: `Museu Teste ${mark} E${n}`,
        category: CATEGORY,
        lat,
        lng: -56.4,
        phone: "+55 65 3000-1111",
        rating: 4.2,
        ratingCount: 40,
        ratingSource: "google",
        googleMapsUrl: "https://maps.google.com/?cid=9",
        placeIds: { google: `ChIJ-${mark}-${n}` },
        sources,
      });
    await store.save({ inserts: [base("A", ["google"], -16.1)], updates: [] }, old);
    await store.save({ inserts: [base("B", ["google", "osm"], -16.2)], updates: [] }, old);
    await store.save({ inserts: [base("C", ["google"], -16.3)], updates: [] }, recent);
    // Google + site lido a partir do link do Google: o contato veio do Google e também expira.
    await store.save({ inserts: [base("D", ["google", "site"], -16.4)], updates: [] }, old);
    const n = await store.expireGoogle(new Date("2026-09-06T12:00:00Z"));
    expect(n).toBe(3);
    const { data } = await db
      .from("venues")
      .select("name, rating, rating_source, phone, google_maps_url, data_sources")
      .like("name", `Museu Teste ${mark} E%`)
      .order("name");
    const [a, b, c] = data!;
    expect(a).toMatchObject({
      rating: null,
      rating_source: null,
      phone: null,
      google_maps_url: null,
      data_sources: [],
    });
    expect(b).toMatchObject({
      rating: null,
      phone: "+55 65 3000-1111",
      google_maps_url: null,
      data_sources: ["osm"],
    });
    expect(c).toMatchObject({ rating: 4.2, rating_source: "google", data_sources: ["google"] });
    expect(data![3]).toMatchObject({ phone: null, google_maps_url: null, data_sources: [] });
    const stale = await store.staleGoogle(new Date("2026-09-30T00:00:00Z"), 100);
    expect(stale.some((v) => v.name === `Museu Teste ${mark} EC`)).toBe(true);
  });

  it("conta a cota diária do Google a partir dos relatórios do dia", async () => {
    const now = new Date();
    const before = await store.googleCallsToday(now);
    const id = await store.startRun("venue_sync", "manual", now);
    await store.finishRun(id, { googleCalls: 5, marker: mark });
    expect(await store.googleCallsToday(now)).toBe(before + 5);
  });
});
