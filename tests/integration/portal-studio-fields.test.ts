// @vitest-environment node
// Gate do P4, achado 6: o portal usa o que o Estúdio grava. Destinos da publicação (home ×
// editoria), texto alternativo da imagem e título/descrição de SEO.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { getArticleBySlug, getHomeData, listSection } from "@/lib/db/queries";

const service = createServiceClient();
const onlySection = randomUUID();
const onlyHome = randomUUID();
let mediaId = "";
const slug = (id: string) => `portal-destino-${id.slice(0, 8)}`;

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, destinations] of [
    [onlySection, ["section"]],
    [onlyHome, ["home"]],
  ] as const) {
    const { error } = await service.from("articles").insert({
      id,
      slug: slug(id),
      kind: "original",
      section_slug: "cidade",
      title: `Matéria de destino ${destinations[0]}`,
      dek: "Linha fina de teste.",
      body: { type: "doc", content: [] },
      status: "published",
      publish_mode: "human",
      published_at: now,
      publish_destinations: [...destinations],
      seo_title: "Título de SEO da matéria",
      seo_description: "Descrição de SEO escrita pela redação.",
    });
    if (error) throw error;
  }
  const m = await service
    .from("media_assets")
    .insert({
      kind: "original",
      storage_path: `original/portal-${randomUUID()}.jpg`,
      license: "CityNews",
      credit: "Foto: Redação",
      allowed_use: "editorial",
      status: "approved",
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  mediaId = m.data.id;
  const link = await service.from("article_media").insert({
    article_id: onlySection,
    media_id: mediaId,
    rationale: "teste",
    chosen_by: "teste",
    alt: "Ponte sobre o rio Cuiabá ao entardecer",
  });
  if (link.error) throw link.error;
});

afterAll(async () => {
  await service.from("article_media").delete().eq("media_id", mediaId);
  await service.from("media_assets").delete().eq("id", mediaId);
  await service.from("articles").delete().in("id", [onlySection, onlyHome]);
});

describe("destinos, texto alternativo e SEO no portal", () => {
  it("home mostra só o que tem destino home", async () => {
    const h = value(await getHomeData());
    const shown = [h.lead, ...h.now, ...h.sectionBlocks.flatMap((b) => b.articles)]
      .filter((a) => a !== null)
      .map((a) => a.id);
    expect(shown).toContain(onlyHome);
    expect(shown).not.toContain(onlySection);
  });

  it("editoria mostra só o que tem destino editoria", async () => {
    const s = value(await listSection("cidade"));
    const shown = s!.articles.map((a) => a.id);
    expect(shown).toContain(onlySection);
    expect(shown).not.toContain(onlyHome);
  });

  it("matéria traz texto alternativo e SEO do Estúdio", async () => {
    const a = value(await getArticleBySlug(slug(onlySection)));
    if (!a || "gone" in a) throw new Error("esperava matéria");
    expect(a.image?.alt).toBe("Ponte sobre o rio Cuiabá ao entardecer");
    expect(a.seoTitle).toBe("Título de SEO da matéria");
    expect(a.seoDescription).toBe("Descrição de SEO escrita pela redação.");
  });
});
