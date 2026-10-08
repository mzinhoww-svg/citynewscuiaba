// @vitest-environment node
// B-022: patrocínio nativo ligado à lista da editoria, atrás de `sponsored_native_enabled`.
// Desligado: lista idêntica, view vazia, clique volta para a home. Ligado: 1 card a cada 6, com
// "Patrocinado", link pela rota de clique e contagem em `sponsored_campaigns`; nunca em Política.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultAdApiDeps, handleAdClick, handleAdTrack } from "@/lib/ads/api";
import { SLOT_EVERY } from "@/lib/ads/rules";
import { listSection } from "@/lib/db/queries";
import type { Database, Json } from "@/lib/db/types";
import { service } from "./studio";

const run = randomUUID().slice(0, 8);
const anon = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const advertiser = `Anunciante Nativo ${run}`;
const href = `https://padaria.example/${run}`;
const doc = (t: string): NonNullable<Json> => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
let campaignId = "";

const setFlag = (enabled: boolean) =>
  service.from("feature_flags").update({ enabled }).eq("key", "sponsored_native_enabled");

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

beforeAll(async () => {
  // Matérias suficientes na editoria para haver posição depois do 6º card.
  const now = Date.now();
  const arts = Array.from({ length: 10 }, (_, i) => ({
    slug: `nativo-${run}-${i}`,
    kind: "original" as const,
    section_slug: "cidade",
    title: `Matéria nativa ${i} ${run}`,
    dek: "Linha fina.",
    body: doc("Texto da matéria de teste."),
    status: "published" as const,
    publish_mode: "human" as const,
    published_at: new Date(now - i * 60_000).toISOString(),
  }));
  const ins = await service.from("articles").insert(arts);
  if (ins.error) throw ins.error;
  const today = new Date();
  const c = await service
    .from("sponsored_campaigns")
    .insert({
      advertiser,
      starts_on: new Date(today.getTime() - 86_400_000 * 2).toISOString().slice(0, 10),
      ends_on: new Date(today.getTime() + 86_400_000 * 2).toISOString().slice(0, 10),
      allowed_sections: ["cidade"],
      status: "active",
      creative: { kind: "native", title: `Pão quente às 6h ${run}`, href },
    })
    .select("id")
    .single();
  if (c.error) throw c.error;
  campaignId = c.data.id;
});

afterAll(async () => {
  await setFlag(false);
  await service.from("sponsored_campaigns").delete().eq("advertiser", advertiser);
  await service.from("articles").delete().like("slug", `nativo-${run}-%`);
});

const headers = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0",
  "x-forwarded-for": `10.9.${run.length}.3`,
};
const click = () =>
  handleAdClick(
    new Request(`http://localhost/api/ads/click/${campaignId}?s=cidade`, { headers }),
    campaignId,
    defaultAdApiDeps(),
  );

describe("patrocínio nativo na editoria (B-022)", () => {
  it("interruptor desligado: lista idêntica, view vazia e clique volta para a home", async () => {
    await setFlag(false);
    const page = value(await listSection("cidade", {}, 1));
    expect(page).not.toBeNull();
    const expected = page!.featured ? [page!.featured, ...page!.articles] : page!.articles;
    expect(page!.feed).toEqual(expected.map((article) => ({ kind: "article", article })));
    const view = await anon.from("public_sponsored_campaigns").select("id").eq("id", campaignId);
    expect(view.data ?? []).toEqual([]);
    const r = await click();
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("http://localhost/");
  });

  it("ligado: 1 card a cada 6, com Patrocinado e link pela rota de clique", async () => {
    await setFlag(true);
    const page = value(await listSection("cidade", {}, 1));
    const feed = page!.feed;
    const ads = feed.flatMap((x, i) => (x.kind === "sponsored" ? [{ i, ad: x.ad }] : []));
    expect(ads).toHaveLength(1);
    expect(feed[0]?.kind).toBe("article");
    expect(ads[0]!.i).toBeGreaterThanOrEqual(SLOT_EVERY);
    expect(ads[0]!.ad).toMatchObject({
      campaignId,
      advertiser,
      label: "Patrocinado",
      title: `Pão quente às 6h ${run}`,
      href: `/api/ads/click/${campaignId}?s=cidade`,
    });
    // Nenhuma matéria some por causa do patrocinado.
    expect(feed.filter((x) => x.kind === "article")).toHaveLength(
      page!.articles.length + (page!.featured ? 1 : 0),
    );
  });

  it("nunca em Política, mesmo com o interruptor ligado", async () => {
    await setFlag(true);
    const pol = await service.from("sponsored_campaigns").insert({
      advertiser,
      starts_on: "2026-01-01",
      ends_on: "2099-12-31",
      allowed_sections: ["politica"],
      status: "active",
      creative: { kind: "native", title: "x", href },
    });
    expect(pol.error).not.toBeNull();
    const page = value(await listSection("politica", { period: "all" }, 1));
    expect(page?.feed.some((x) => x.kind === "sponsored")).toBe(false);
  });

  it("conta impressão, visualização e clique na campanha e redireciona para o anunciante", async () => {
    await setFlag(true);
    const deps = defaultAdApiDeps();
    const post = (event: string) =>
      new Request("http://localhost/api/ads/view", {
        method: "POST",
        headers,
        body: JSON.stringify({ placement: campaignId, section: "cidade", event }),
      });
    expect((await handleAdTrack(post("impression"), deps)).status).toBe(204);
    expect((await handleAdTrack(post("impression"), deps)).status).toBe(204);
    expect((await handleAdTrack(post("view"), deps)).status).toBe(204);
    const r = await click();
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(href);
    const { data } = await service
      .from("sponsored_campaigns")
      .select("deliveries, views, clicks")
      .eq("id", campaignId)
      .single();
    expect(data).toEqual({ deliveries: 1, views: 1, clicks: 1 });
  });

  it("o anônimo não lê a tabela de campanhas nem chama a contagem", async () => {
    expect((await anon.from("sponsored_campaigns").select("id").limit(1)).data ?? []).toEqual([]);
    const t = await anon.rpc("ad_track", {
      p_placement: campaignId,
      p_section: "",
      p_event: "click",
      p_key: `anon-${run}`,
    });
    expect(t.error).not.toBeNull();
  });
});
