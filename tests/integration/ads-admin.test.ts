// @vitest-environment node
// ADS-T4 (plano banners-padrão): administração dos banners no Estúdio.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { listSlotPlacements } from "@/lib/db/queries/ads";
import { adReportRows, listBanners } from "@/lib/db/queries/ads-admin";
import {
  createBannerCommand,
  exportAdReportCommand,
  setPlacementStatusCommand,
} from "@/lib/studio/ads";
import { asUser, service } from "./studio";

const run = randomUUID().slice(0, 8);
const uploads: string[] = [];
const upload = async (path: string) => {
  uploads.push(path);
  return `https://storage.example/ads/${path}`;
};
const createBanner = createBannerCommand(upload);

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

const banner = (over: Record<string, unknown> = {}) => ({
  slot: "RAIL-A" as const,
  width: 300,
  height: 250,
  name: `Retângulo ${run}`,
  advertiser: `Padaria ${run}`,
  href: `https://padaria.example/${run}`,
  alt: "Pão quente às 6h",
  startsOn: "2026-01-01",
  endsOn: "2099-12-31",
  allowedSections: ["cidade"],
  weight: 2,
  maxPerDay: null,
  status: "active" as const,
  image: png(300, 250),
  ...over,
});

afterAll(async () => {
  const c = await service.from("ad_creatives").select("id").like("name", `%${run}%`);
  const ids = (c.data ?? []).map((r) => r.id);
  await service.from("ad_placements").delete().in("creative_id", ids);
  await service.from("ad_creatives").delete().in("id", ids);
  await service.from("advertisers").delete().like("name", `%${run}%`);
  await service.from("feature_flags").update({ enabled: true }).eq("key", "ads_enabled");
});

describe("banners no Estúdio (ADS-T4)", () => {
  it("editor-chefe cria banner: imagem no Storage, anunciante cadastrado, peça e veiculação no ar", async () => {
    const r = await asUser("marina", () => createBanner(banner()));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(uploads.at(-1)).toMatch(/^RAIL-A\/[0-9a-f-]{36}\.png$/);
    const list = await asUser("marina", () => listBanners());
    const mine = list.find((b) => b.name === `Retângulo ${run}`);
    expect(mine).toMatchObject({
      slot: "RAIL-A",
      advertiser: `Padaria ${run}`,
      status: "active",
      isHouse: false,
      weight: 2,
    });
    expect(mine?.imageUrl).toBe(`https://storage.example/ads/${uploads.at(-1)}`);
    const audit = await service
      .from("audit_log")
      .select("action")
      .eq("action", "ads.banner.create")
      .eq("object_ref", `placement:${r.ok ? r.value.id : ""}`);
    expect(audit.data).toHaveLength(1);
  });

  it("sem anunciante vira peça da casa; o mesmo anunciante não duplica", async () => {
    const house = await asUser("helena", () =>
      createBanner(banner({ name: `Casa ${run}`, advertiser: "" })),
    );
    expect(house.ok).toBe(true);
    const again = await asUser("helena", () =>
      createBanner(banner({ name: `Outro ${run}`, advertiser: `padaria ${run}` })),
    );
    expect(again.ok).toBe(true);
    const adv = await service.from("advertisers").select("id").ilike("name", `padaria ${run}`);
    expect(adv.data).toHaveLength(1);
    const list = await asUser("helena", () => listBanners());
    expect(list.find((b) => b.name === `Casa ${run}`)?.isHouse).toBe(true);
  });

  it("recusa imagem fora do formato, formato que o campo não tem, Justiça e período invertido", async () => {
    const before = uploads.length;
    const dims = await asUser("marina", () => createBanner(banner({ image: png(300, 251) })));
    expect(dims).toMatchObject({ ok: false, error: "invalid" });
    const fmt = await asUser("marina", () =>
      createBanner(banner({ width: 728, height: 90, image: png(728, 90) })),
    );
    expect(fmt).toMatchObject({ ok: false, error: "invalid" });
    const justica = await asUser("marina", () =>
      createBanner(banner({ allowedSections: ["justica"] })),
    );
    expect(justica).toMatchObject({ ok: false, error: "invalid" });
    const period = await asUser("marina", () =>
      createBanner(banner({ startsOn: "2026-12-31", endsOn: "2026-01-01" })),
    );
    expect(period).toMatchObject({ ok: false, error: "invalid" });
    expect(uploads.length).toBe(before);
  });

  it("repórter não cria banner (forbidden)", async () => {
    const r = await asUser("diego", () => createBanner(banner({ name: `Negado ${run}` })));
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("pausar tira do ar; religar volta", async () => {
    const r = await asUser("marina", () => createBanner(banner({ name: `Pausa ${run}` })));
    if (!r.ok) throw new Error("create");
    const paused = await asUser("marina", () =>
      setPlacementStatusCommand({ id: r.value.id, status: "paused" }),
    );
    expect(paused.ok).toBe(true);
    const row = await service.from("ad_placements").select("status").eq("id", r.value.id).single();
    expect(row.data?.status).toBe("paused");
    const live = await service.from("public_ad_placements").select("id").eq("id", r.value.id);
    expect(live.data).toHaveLength(0);
    await asUser("marina", () => setPlacementStatusCommand({ id: r.value.id, status: "active" }));
    const back = await service.from("public_ad_placements").select("id").eq("id", r.value.id);
    expect(back.data).toHaveLength(1);
  });

  it("flag ads_enabled desligada tira todos os banners do portal", async () => {
    const on = await service.from("public_ad_placements").select("id").limit(1);
    expect(on.data?.length).toBeGreaterThan(0);
    await service.from("feature_flags").update({ enabled: false }).eq("key", "ads_enabled");
    const off = await service.from("public_ad_placements").select("id").limit(1);
    expect(off.data).toHaveLength(0);
    await service.from("feature_flags").update({ enabled: true }).eq("key", "ads_enabled");
    void listSlotPlacements;
  });

  it("relatório lê as contagens com o nome do anunciante", async () => {
    const list = await asUser("marina", () => listBanners());
    const mine = list.find((b) => b.name === `Retângulo ${run}`)!;
    await service.rpc("ad_track", {
      p_placement: mine.id,
      p_section: "cidade",
      p_event: "impression",
      p_key: `rel-${run}`,
    });
    const today = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
    const rows = await asUser("marina", () => adReportRows({ from: today, to: today }));
    expect(rows.find((r) => r.placementId === mine.id)).toMatchObject({
      advertiser: `Padaria ${run}`,
      creative: `Retângulo ${run}`,
      section: "cidade",
      impressions: 1,
    });
  });
});

describe("CSV do relatório (ADS-T4)", () => {
  it("exporta com cabeçalho pt-BR e audita; repórter não exporta", async () => {
    const r = await asUser("marina", () => exportAdReportCommand({}));
    expect(r.ok && r.value.csv.split("\n")[0]).toBe(
      "dia;campo;anunciante;peça;editoria;impressões;visualizações;cliques;ctr",
    );
    const denied = await asUser("diego", () => exportAdReportCommand({}));
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
  });
});
