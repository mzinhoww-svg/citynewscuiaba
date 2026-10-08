// @vitest-environment node
// A-214 · Texto de abertura das listas no banco real: grava o texto do Guia, preserva o do editor
// e só reescreve quando os lugares mudam.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createGuideArticleStore } from "@/lib/db/guide-article-store";
import { fallbackArticle } from "@/lib/guide/article";
import { writeDueArticles } from "@/lib/guide/write-step";

const db = createServiceClient();
const store = createGuideArticleStore(db);
const mark = Date.now().toString(36);
const venueIds: string[] = [];
const listIds: string[] = [];

async function mkList(slug: string, over: Record<string, unknown> = {}) {
  const l = await db
    .from("guide_lists")
    .insert({
      slug,
      title: `As 3 melhores padarias ${slug}`,
      category: "padaria",
      criteria: "Critério de teste com texto suficiente para a regra de publicação do Guia.",
      status: "published",
      origin: "manual",
      published_at: new Date().toISOString(),
      refreshed_at: new Date().toISOString(),
      ...over,
    })
    .select("id")
    .single();
  expect(l.error).toBeNull();
  listIds.push(l.data!.id);
  const items = await db.from("guide_list_items").insert(
    venueIds.map((venue_id, i) => ({
      list_id: l.data!.id,
      venue_id,
      position: i + 1,
      score: 90 - i,
      score_breakdown: {},
      editor_note: i === 0 ? "Comentário do editor." : null,
    })),
  );
  expect(items.error).toBeNull();
  return l.data!.id;
}

beforeAll(async () => {
  for (let n = 1; n <= 3; n += 1) {
    const v = await db
      .from("venues")
      .insert({
        slug: `padaria-artigo-${mark}-${n}`,
        name: `Padaria Artigo ${mark} ${n}`,
        category: "padaria",
        neighborhood: "Centro Norte",
        rating: 4.9 - n / 10,
        rating_count: 500 * n,
        rating_source: "google",
        place_ids: { osm: `node/art${mark}${n}` },
        data_sources: ["osm", "google"],
      })
      .select("id")
      .single();
    expect(v.error).toBeNull();
    venueIds.push(v.data!.id);
  }
});

afterAll(async () => {
  await db.from("guide_list_items").delete().in("list_id", listIds);
  await db.from("guide_lists").delete().in("id", listIds);
  await db.from("venues").delete().in("id", venueIds);
});

describe("texto das listas (A-214)", () => {
  it("grava o texto do Guia, os comentários sem dono e não reescreve sem mudança", async () => {
    const auto = await mkList(`padarias-artigo-${mark}`);
    const owned = await mkList(`padarias-editor-${mark}`, {
      intro: "Texto do editor.",
      intro_auto: false,
    });
    const deps = {
      ...store,
      write: async (input: Parameters<typeof fallbackArticle>[0]) => ({
        ...fallbackArticle(input),
        notes: Object.fromEntries(
          input.venues.map((v) => [v.id, `Comentário do Guia ${v.position}.`]),
        ),
        problems: [],
      }),
      revalidate: async () => {},
    };
    const first = await writeDueArticles(deps, 50);
    expect(first.map((o) => o.slug)).toContain(`padarias-artigo-${mark}`);
    expect(first.map((o) => o.slug)).not.toContain(`padarias-editor-${mark}`);

    const { data: l } = await db
      .from("guide_lists")
      .select("intro, intro_auto, article_signature")
      .eq("id", auto)
      .single();
    expect(l!.intro).toContain(`Padaria Artigo ${mark} 1`);
    expect(l!.intro_auto).toBe(true);
    expect(l!.article_signature).toBe(venueIds.join(","));

    const { data: items } = await db
      .from("guide_list_items")
      .select("venue_id, editor_note, note_auto")
      .eq("list_id", auto)
      .order("position");
    expect(items!.map((i) => [i.editor_note, i.note_auto])).toEqual([
      ["Comentário do editor.", false],
      ["Comentário do Guia 2.", true],
      ["Comentário do Guia 3.", true],
    ]);

    const { data: o } = await db.from("guide_lists").select("intro").eq("id", owned).single();
    expect(o!.intro).toBe("Texto do editor.");

    const again = await writeDueArticles(deps, 50);
    expect(again.map((x) => x.slug)).not.toContain(`padarias-artigo-${mark}`);
  });
});
