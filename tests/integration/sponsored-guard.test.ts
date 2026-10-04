// @vitest-environment node
// MS-T1 (docs/media-slots.md §5.6): flag do patrocinado nativo, trava de editoria em
// `articles.sponsored` e matéria patrocinada fora da lista da editoria e do assunto.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getHomeData, getTopicBySlug, listSection } from "@/lib/db/queries";
import type { Json } from "@/lib/db/types";
import { service } from "./studio";

const run = randomUUID().slice(0, 8);
const doc = (t: string): NonNullable<Json> => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
const base = (key: string, over: Record<string, unknown> = {}) => ({
  slug: `patrocinado-${run}-${key}`,
  kind: "original" as const,
  section_slug: "cidade",
  title: `Patrocinado ${key} ${run}`,
  dek: "Linha fina do anunciante.",
  body: doc("Texto pago por um anunciante fictício."),
  status: "published" as const,
  publish_mode: "human" as const,
  published_at: new Date().toISOString(),
  sponsored: true,
  ...over,
});

afterAll(async () => {
  await service.from("articles").delete().like("slug", `patrocinado-${run}-%`);
  await service.from("sponsored_campaigns").delete().eq("advertiser", `Anunciante Fictício ${run}`);
  await service
    .from("feature_flags")
    .update({ enabled: false })
    .eq("key", "sponsored_native_enabled");
});

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("patrocinado nativo travado (MS-T1)", () => {
  it("a flag sponsored_native_enabled existe e nasce desligada", async () => {
    const { data } = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "sponsored_native_enabled")
      .single();
    expect(data?.enabled).toBe(false);
  });

  it("recusa matéria patrocinada em Política (e subeditoria) ou urgente", async () => {
    const pol = await service.from("articles").insert(base("pol", { section_slug: "politica" }));
    expect(pol.error?.message).toMatch(/patrocinad/);
    const urg = await service.from("articles").insert(base("urg", { urgent: true }));
    expect(urg.error?.message).toMatch(/patrocinad/);

    const sub = `politica-ms-${run}`;
    await service
      .from("sections")
      .insert({ slug: sub, name: "Sub", parent_slug: "politica", autonomy_category: "politica" });
    try {
      const r = await service.from("articles").insert(base("sub", { section_slug: sub }));
      expect(r.error?.message).toMatch(/patrocinad/);
    } finally {
      await service.from("sections").delete().eq("slug", sub);
    }
  });

  it("recusa mover matéria patrocinada para Política e marcar patrocinada uma de Saúde", async () => {
    const ok = await service.from("articles").insert(base("mov")).select("id").single();
    expect(ok.error).toBeNull();
    const moved = await service
      .from("articles")
      .update({ section_slug: "politica" })
      .eq("id", ok.data!.id);
    expect(moved.error?.message).toMatch(/patrocinad/);

    const saude = await service
      .from("articles")
      .insert(base("sau", { section_slug: "saude", sponsored: false }))
      .select("id")
      .single();
    expect(saude.error).toBeNull();
    const marked = await service
      .from("articles")
      .update({ sponsored: true })
      .eq("id", saude.data!.id);
    expect(marked.error?.message).toMatch(/patrocinad/);
  });

  it("campanha não aceita Justiça", async () => {
    const r = await service.from("sponsored_campaigns").insert({
      advertiser: `Anunciante Fictício ${run}`,
      starts_on: "2026-10-01",
      ends_on: "2026-10-31",
      allowed_sections: ["justica"],
      creative: { title: "x", href: "https://exemplo.com" },
    });
    expect(r.error).not.toBeNull();
  });

  it("lista da editoria e linha do tempo do assunto não mostram matéria patrocinada", async () => {
    const topic = await service
      .from("topics")
      .select("id, slug")
      .eq("slug", "plano-de-onibus-cpa-centro")
      .single();
    expect(topic.error).toBeNull();
    const ins = await service
      .from("articles")
      .insert(base("list", { topic_id: topic.data!.id }))
      .select("id")
      .single();
    expect(ins.error).toBeNull();

    const page = value(await listSection("cidade", {}, 1));
    expect(page?.articles.some((a) => a.id === ins.data!.id)).toBe(false);
    const t = value(await getTopicBySlug("plano-de-onibus-cpa-centro"));
    expect(t?.articles.some((a) => a.id === ins.data!.id)).toBe(false);
    expect(t?.timeline.some((e) => e.title === `Patrocinado list ${run}`)).toBe(false);
  });

  it("home só mostra a matéria patrocinada com a flag ligada", async () => {
    const ins = await service.from("articles").insert(base("home")).select("id").single();
    expect(ins.error).toBeNull();
    const off = value(await getHomeData());
    expect(off.sponsored).toBeNull();

    await service
      .from("feature_flags")
      .update({ enabled: true })
      .eq("key", "sponsored_native_enabled");
    const on = value(await getHomeData());
    expect(on.sponsored?.id).toBe(ins.data!.id);
    expect(on.mostRead.some((a) => a.id === ins.data!.id)).toBe(false);
  });
});
