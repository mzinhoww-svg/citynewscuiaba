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
});
