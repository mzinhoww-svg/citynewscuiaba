// @vitest-environment node
// GUIA-T4 · Propostas contra o banco real: catálogo de 30 modelos, proposta de um modelo (lista,
// itens e proposta gravados), modelo em andamento fora da fila e proposta de link com análise.
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createGuideListStore, templateFromRow } from "@/lib/db/guide-list-store";
import { proposeForTemplate } from "@/lib/guide/engine";
import { venueRecord } from "@/lib/guide/testing";
import { createGuideStore } from "@/lib/db/guide-store";
import { mergeVenueLists } from "@/lib/guide/merge";
import { proposeFromLink } from "@/lib/guide/proposals";

const db = createServiceClient();
const lists = createGuideListStore(db);
const venues = createGuideStore(db);
const mark = Date.now().toString(36);
const CATEGORY = "parque"; // categoria do catálogo pouco usada pelo seed
const TEMPLATE = "parques-cuiaba";
const created: string[] = [];

const rec = (n: number, over: Parameters<typeof venueRecord>[0] = {}) =>
  venueRecord({
    name: `Parque Teste ${mark} ${n}`,
    category: CATEGORY,
    address: `Rua do Teste, ${n}`,
    neighborhood: "Porto",
    phone: "+55 65 3000-0000",
    hours: "Mo-Su 06:00-18:00",
    website: `https://parque${n}-${mark}.example`,
    lat: -15.6 - n / 100,
    lng: -56.1,
    rating: 4.9 - n / 10,
    ratingCount: 300,
    ratingSource: "tripadvisor",
    tripadvisorRank: n,
    placeIds: { osm: `node/${mark}${n}`, tripadvisor: String(Date.now() + n) },
    sources: ["osm", "tripadvisor"],
    ...over,
  });

afterAll(async () => {
  const { data: ls } = await db.from("guide_lists").select("id").in("id", created);
  const ids = (ls ?? []).map((l) => l.id);
  if (ids.length) {
    await db.from("guide_proposals").delete().in("list_id", ids);
    await db.from("guide_list_items").delete().in("list_id", ids);
    await db.from("guide_lists").delete().in("id", ids);
  }
  await db.from("venues").delete().like("name", `Parque Teste ${mark}%`);
  await db.from("guide_templates").update({ last_proposed_at: null }).eq("slug", TEMPLATE);
});

describe("catálogo de modelos", () => {
  it("a migration traz 30 modelos ativos, com slug único e títulos de lista", async () => {
    const { data, error } = await db
      .from("guide_templates")
      .select("slug, title, take, min_venues, active");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(30);
    expect(new Set((data ?? []).map((t) => t.slug)).size).toBe((data ?? []).length);
    expect((data ?? []).every((t) => t.active && t.take >= 3 && t.min_venues >= 3)).toBe(true);
    expect((data ?? []).map((t) => t.slug)).toContain("padarias-cuiaba");
  });
});

describe("proposta de um modelo", () => {
  it("monta a lista dos 5 lugares mais bem pontuados e grava lista, itens e proposta", async () => {
    await venues.save({ inserts: [1, 2, 3, 4, 5, 6].map((n) => rec(n)), updates: [] }, new Date());
    const tpl = await db.from("guide_templates").select("*").eq("slug", TEMPLATE).single();
    const out = await proposeForTemplate(
      { store: lists, now: () => new Date() },
      templateFromRow(tpl.data!),
      null,
    );
    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") return;
    created.push(out.listId);
    expect(out.items).toBe(5);
    expect(out.autoPublishable).toBe(true);

    const list = await lists.getList(out.listId);
    expect(list).toMatchObject({ status: "proposal", origin: "template", slug: TEMPLATE });
    expect(list?.items.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    // A melhor nota e o melhor ranking ficam em primeiro.
    expect(list?.items[0]?.venue.name).toBe(`Parque Teste ${mark} 1`);
    expect(list?.items.every((i) => i.venue.sources.length >= 2)).toBe(true);
    expect(list?.criteria.length).toBeGreaterThan(40);

    const prop = await db
      .from("guide_proposals")
      .select("origin, status, template_id")
      .eq("list_id", out.listId)
      .single();
    expect(prop.data).toMatchObject({ origin: "template", status: "open" });
    const t = await db
      .from("guide_templates")
      .select("last_proposed_at")
      .eq("slug", TEMPLATE)
      .single();
    expect(t.data?.last_proposed_at).not.toBeNull();
  });

  it("modelo com lista em andamento sai da fila das próximas propostas", async () => {
    const all = await db.from("guide_templates").select("id, slug, active");
    const wasActive = (all.data ?? []).filter((t) => t.active).map((t) => t.id);
    try {
      // Só o modelo já proposto e um outro ativos: a fila devolve o outro, nunca o em andamento.
      await db
        .from("guide_templates")
        .update({ active: false })
        .not("slug", "in", `(${TEMPLATE},museus-cuiaba)`);
      const next = await lists.nextTemplate(new Date());
      expect(next?.slug).toBe("museus-cuiaba");
    } finally {
      await db.from("guide_templates").update({ active: true }).in("id", wasActive);
    }
  });

  it("slug repetido (lista descartada com o mesmo nome) ganha sufixo de data", async () => {
    const tpl = await db.from("guide_templates").select("*").eq("slug", TEMPLATE).single();
    const first = await lists.createProposal({
      proposal: {
        origin: "template",
        title: tpl.data!.title,
        slug: TEMPLATE,
        category: CATEGORY,
        subcategory: null,
        neighborhood: null,
        criteria: "x".repeat(60),
        take: 3,
        templateSlug: TEMPLATE,
        items: [],
        dataSources: [],
      },
      templateId: tpl.data!.id,
      analysis: {},
    });
    created.push(first.listId);
    const row = await db.from("guide_lists").select("slug").eq("id", first.listId).single();
    expect(row.data?.slug).toMatch(new RegExp(`^${TEMPLATE}-\\d{8}`));
  });
});

describe("proposta por link (venues conferidos)", () => {
  it("lugares novos e existentes se encaixam e a lista sai com ordem e critério do CityNews", async () => {
    const existing = await venues.loadCategory(CATEGORY);
    const incoming = [rec(1, { phone: null }), rec(7), rec(8), rec(9)];
    const merged = mergeVenueLists(existing, incoming);
    expect(merged.updates.length).toBeGreaterThanOrEqual(1);
    await venues.save(
      {
        inserts: merged.inserts,
        updates: merged.updates.map((u) => ({
          id: u.existing.id,
          record: u.record,
          ratingChecked: false,
        })),
      },
      new Date(),
    );
    const after = (await venues.loadCategory(CATEGORY)).filter((v) =>
      v.name.startsWith(`Parque Teste ${mark}`),
    );
    const r = proposeFromLink({
      url: "https://saboresmt.example/melhores-parques",
      extracted: {
        names: after.map((v) => v.name),
        category: CATEGORY,
        criteria: "votacao popular",
        notes: [],
      },
      verifiedNames: after.map((v) => v.name),
      venues: after,
    });
    if (!r.ok) throw new Error("falhou");
    const link = await lists.createProposal({
      proposal: r.proposal,
      templateId: "",
      analysis: r.analysis as unknown as Record<string, unknown>,
      sourceUrl: "https://saboresmt.example/melhores-parques",
      createdBy: null,
    });
    created.push(link.listId);
    const list = await lists.getList(link.listId);
    expect(list?.origin).toBe("link");
    expect(list?.title).toMatch(/^Os \d+ melhores parques de Cuiabá$/);
    const prop = await db
      .from("guide_proposals")
      .select("source_url, analysis")
      .eq("list_id", link.listId)
      .single();
    expect(prop.data?.source_url).toBe("https://saboresmt.example/melhores-parques");
    expect((prop.data?.analysis as { sourceHost?: string }).sourceHost).toBe("saboresmt.example");
  });
});
