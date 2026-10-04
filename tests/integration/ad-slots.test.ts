// @vitest-environment node
// ADS-T1 (plano banners-padrão): campos, peças, veiculações, contagem e rotas.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultAdApiDeps, handleAdClick, handleAdTrack } from "@/lib/ads/api";
import { listSlotPlacements } from "@/lib/db/queries/ads";
import type { Database } from "@/lib/db/types";
import { clientOf, service } from "./studio";

const run = randomUUID().slice(0, 8);
const today = new Date().toISOString().slice(0, 10);
const anon = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const display = (over: Record<string, unknown> = {}) => ({
  kind: "display",
  slot: "TOP",
  width: 970,
  height: 250,
  imageUrl: "https://img.example/top.png",
  alt: "Pão quente às 6h",
  href: `https://padaria.example/${run}`,
  weight: 1,
  ...over,
});
let creativeId = "";
let placementId = "";

beforeAll(async () => {
  const c = await service
    .from("ad_creatives")
    .insert({ slot: "TOP", name: `Topo ${run}`, creative: display(), status: "active" })
    .select("id")
    .single();
  if (c.error) throw c.error;
  creativeId = c.data.id;
  const p = await service
    .from("ad_placements")
    .insert({
      creative_id: creativeId,
      slot: "TOP",
      starts_on: "2026-01-01",
      ends_on: "2099-12-31",
      allowed_sections: ["cidade"],
      status: "active",
    })
    .select("id")
    .single();
  if (p.error) throw p.error;
  placementId = p.data.id;
  void today;
});

afterAll(async () => {
  await service.from("ad_placements").delete().eq("creative_id", creativeId);
  await service.from("ad_creatives").delete().like("name", `%${run}%`);
});

describe("campos de banner (ADS-T1)", () => {
  it("os 8 campos do padrão B existem", async () => {
    const { data } = await service.from("ad_slots").select("code");
    expect(data?.map((r) => r.code).sort()).toEqual(
      ["ART-1", "ART-2", "HUB", "MID", "RAIL-A", "RAIL-B", "STICKY", "TOP"].sort(),
    );
  });

  it("o leitor lê só a view pública; tabelas ficam para admin e editor-chefe", async () => {
    const view = await anon.from("public_ad_placements").select("id").eq("id", placementId);
    expect(view.data?.map((r) => r.id)).toEqual([placementId]);
    expect((await anon.from("ad_creatives").select("id").limit(1)).data ?? []).toEqual([]);
    expect((await anon.from("ad_stats").select("day").limit(1)).data ?? []).toEqual([]);
    const helena = await clientOf("helena");
    expect((await helena.from("ad_creatives").select("id").eq("id", creativeId)).data?.length).toBe(
      1,
    );
    const track = await anon.rpc("ad_track", {
      p_placement: placementId,
      p_section: "",
      p_event: "impression",
      p_key: `anon-${run}`,
    });
    expect(track.error).not.toBeNull();
  });

  it("recusa veiculação em Política, peça de outro campo e peça de imagem sem https ou alt", async () => {
    const pol = await service.from("ad_placements").insert({
      creative_id: creativeId,
      slot: "TOP",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      allowed_sections: ["politica"],
    });
    expect(pol.error?.message).toMatch(/anúncio/);
    const other = await service.from("ad_placements").insert({
      creative_id: creativeId,
      slot: "MID",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
    });
    expect(other.error?.message).toMatch(/campo/);
    for (const bad of [display({ href: "http://x.example" }), display({ alt: "" })]) {
      const r = await service
        .from("ad_creatives")
        .insert({ slot: "TOP", name: `Ruim ${run}`, creative: bad });
      expect(r.error).not.toBeNull();
    }
  });

  it("o portal lista a veiculação do campo com a peça validada", async () => {
    const r = await listSlotPlacements("TOP");
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const mine = r.value.find((p) => p.id === placementId);
    expect(mine?.creative.href).toBe(`https://padaria.example/${run}`);
    expect(mine?.allowedSections).toEqual(["cidade"]);
    expect(mine?.isHouse).toBe(true);
  });

  it("conta impressão, visualização e clique uma vez por janela, e redireciona o clique", async () => {
    const deps = defaultAdApiDeps();
    const headers = {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0",
      "x-forwarded-for": `10.0.${run.length}.7`,
    };
    const post = (event: string) =>
      new Request("http://localhost/api/ads/view", {
        method: "POST",
        headers,
        body: JSON.stringify({ placement: placementId, section: "cidade", event }),
      });
    expect((await handleAdTrack(post("impression"), deps)).status).toBe(204);
    expect((await handleAdTrack(post("impression"), deps)).status).toBe(204);
    expect((await handleAdTrack(post("view"), deps)).status).toBe(204);
    const click = await handleAdClick(
      new Request(`http://localhost/api/ads/click/${placementId}?s=cidade`, { headers }),
      placementId,
      deps,
    );
    expect(click.status).toBe(302);
    expect(click.headers.get("location")).toBe(`https://padaria.example/${run}`);

    const { data } = await service
      .from("ad_stats")
      .select("impressions, views, clicks")
      .eq("placement_id", placementId)
      .eq("section_slug", "cidade")
      .single();
    expect(data).toEqual({ impressions: 1, views: 1, clicks: 1 });
  });
});
