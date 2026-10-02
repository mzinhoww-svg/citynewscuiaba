// @vitest-environment node
// UI-T16: capa e imagem no texto com banco real (papéis, posição, índices únicos, remoção de um
// ativo sem derrubar o outro). Storage em memória (A-017); imagens fictícias de tests/fixtures.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createImageReprocessRepo } from "@/lib/db/control-store";
import { createFlags, createMediaRepo } from "@/lib/db/pipeline-store";
import type { Database } from "@/lib/db/types";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { takedownReproduction } from "@/lib/media/takedown";
import { createMediaStep } from "@/lib/pipeline/steps/media";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const MARINA = "c1000000-0000-4000-8000-000000000002";
const hosts = [`um-${tag}.example`, `dois-${tag}.example`];
const FILES = ["reproducao-1600x900.jpg", "reproducao-b-1500x1000.jpg"];
const ids = {
  sources: [] as string[],
  topic: "",
  article: "",
  items: [] as string[],
  media: [] as string[],
};

const anon = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const jpg = (n: string) => ({
  body: new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", n))),
  headers: { "content-type": "image/jpeg" },
});

async function links() {
  const { data, error } = await db
    .from("article_media")
    .select("media_id, role, position, chosen_by")
    .eq("article_id", ids.article)
    .order("role");
  if (error) throw error;
  return data ?? [];
}

beforeAll(async () => {
  await db.from("feature_flags").update({ enabled: true }).eq("key", "image_reproduction_enabled");
  const topic = await db
    .from("topics")
    .insert({ slug: `papeis-${tag}`, title: `Papéis ${tag}`, section_slug: "cultura" })
    .select("id")
    .single();
  ids.topic = topic.data!.id;
  for (const [i, host] of hosts.entries()) {
    const src = await db
      .from("sources")
      .insert({
        slug: `papeis-${i}-${tag}`,
        name: `Jornal ${i} ${tag}`,
        base_url: `https://${host}`,
        kind: "rss",
        locality: "cuiaba",
        image_policy: "reproduction",
      })
      .select("id")
      .single();
    ids.sources.push(src.data!.id);
    const item = await db
      .from("collected_items")
      .insert({
        source_id: src.data!.id,
        canonical_url: `https://${host}/cultura/feira`,
        original_title: `Feira ${tag} ocupa a Orla ${i}`,
        author: i === 0 ? "Ana Prado" : null,
        image_url: `https://${host}/img/feira.jpg`,
        locality: "cuiaba",
        topic_id: ids.topic,
        tags: ["artesanato"],
      })
      .select("id")
      .single();
    ids.items.push(item.data!.id);
  }
  const article = await db
    .from("articles")
    .insert({
      slug: `papeis-${tag}`,
      kind: "normalized",
      topic_id: ids.topic,
      section_slug: "cultura",
      title: `Feira ${tag} ocupa a Orla`,
      dek: "Linha fina de teste",
      body: { type: "doc", content: [para("Um."), para("Dois."), para("Três."), para("Quatro.")] },
      status: "published",
      publish_mode: "human",
      published_at: new Date().toISOString(),
      agent_id: "write",
    })
    .select("id")
    .single();
  ids.article = article.data!.id;
});

afterAll(async () => {
  await db.from("article_media").delete().eq("article_id", ids.article);
  await db.from("decisions").delete().eq("object_ref", `article:${ids.article}`);
  await db.from("articles").delete().eq("id", ids.article);
  if (ids.media.length) await db.from("media_assets").delete().in("id", ids.media);
  await db.from("collected_items").delete().in("id", ids.items);
  await db.from("topics").delete().eq("id", ids.topic);
  await db.from("sources").delete().in("id", ids.sources);
  for (const [i] of hosts.entries())
    await db
      .from("rate_limits")
      .delete()
      .eq("bucket", "crawler")
      .eq("key_hash", `papeis-${i}-${tag}`);
});

describe("papéis das imagens da matéria (banco real)", () => {
  const repo = createMediaRepo(db);
  const store = createMemoryMediaStore();
  const { http } = createFakeHttp(
    Object.fromEntries(
      hosts.flatMap((h, i) => [
        [`https://${h}/robots.txt`, { status: 404 }],
        [`https://${h}/img/feira.jpg`, jpg(FILES[i]!)],
      ]),
    ),
  );
  const step = createMediaStep({
    repo,
    store,
    flags: createFlags(db),
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
    now: () => new Date(),
    analyze: analyzeImage,
  });
  const msg = () => ({
    runId: `run-${tag}`,
    step: "image" as const,
    itemRef: `article:${ids.article}`,
    attempt: 1,
  });

  it("matéria publicada sem imagem entra no reprocesso; o passo grava capa e imagem do texto", async () => {
    const needing = await createImageReprocessRepo(db).articlesNeedingImages(500);
    expect(needing).toContain(ids.article);

    const before = await repo.mediaContext(ids.article);
    expect(before).toMatchObject({ hasMedia: false, cover: null, inline: null, bodyParagraphs: 4 });
    expect((await step(msg())).ok).toBe(true);

    const rows = await links();
    expect(rows.map((r) => [r.role, r.position, r.chosen_by])).toEqual([
      ["cover", null, "pipeline:image"],
      ["inline", 3, "pipeline:image"],
    ]);
    ids.media.push(...rows.map((r) => r.media_id));
    const { data: assets } = await db
      .from("media_assets")
      .select("id, source_id")
      .in("id", ids.media);
    expect(new Set(assets!.map((a) => a.source_id)).size).toBe(2);

    const ctx = await repo.mediaContext(ids.article);
    expect(ctx).toMatchObject({ hasMedia: true, humanMedia: false, humanEdited: false });
    expect(ctx!.cover?.mediaId).toBe(rows.find((r) => r.role === "cover")!.media_id);
    expect(ctx!.inline?.kind).toBe("reproduction");
    expect(typeof ctx!.cover?.phash).toBe("bigint");

    // Já tem as duas: sai da lista do reprocesso e rodar de novo não muda nada.
    expect(await createImageReprocessRepo(db).articlesNeedingImages(500)).not.toContain(
      ids.article,
    );
    await step(msg());
    expect(await links()).toEqual(rows);
  });

  it("o leitor anônimo lê papel e posição das duas imagens da matéria publicada", async () => {
    const { data, error } = await anon()
      .from("article_media")
      .select("role, position, media_assets(status)")
      .eq("article_id", ids.article)
      .order("role");
    expect(error).toBeNull();
    expect(data?.map((r) => [r.role, r.position])).toEqual([
      ["cover", null],
      ["inline", 3],
    ]);
  });

  it("no máximo uma capa e uma imagem no texto por matéria; posição só na imagem do texto", async () => {
    const [cover, inline] = await links();
    const extra = await db
      .from("media_assets")
      .insert({
        kind: "licensed",
        storage_path: `teste/${tag}.jpg`,
        license: "teste",
        credit: "teste",
        allowed_use: "teste",
        status: "approved",
      })
      .select("id")
      .single();
    ids.media.push(extra.data!.id);
    const add = (role: string, position: number | null) =>
      db.from("article_media").insert({
        article_id: ids.article,
        media_id: extra.data!.id,
        rationale: "teste",
        chosen_by: "teste",
        role,
        position,
      });
    expect((await add("cover", null)).error?.code).toBe("23505");
    expect((await add("inline", 2)).error?.code).toBe("23505");
    expect((await add("cover", 2)).error?.code).toBe("23514");
    expect((await add("inline", null)).error?.code).toBe("23514");
    expect((await add("galeria", null)).error?.code).toBe("23514");
    expect(cover!.role).toBe("cover");
    expect(inline!.role).toBe("inline");
    // linkArticleMedia não troca o papel já ocupado.
    await repo.linkArticleMedia(ids.article, extra.data!.id, "x", "pipeline:image", {
      role: "cover",
    });
    expect((await links()).map((r) => r.media_id)).not.toContain(extra.data!.id);
  });

  it("remoção a pedido de uma das duas não derruba a outra", async () => {
    const rows = await links();
    const inline = rows.find((r) => r.role === "inline")!;
    const cover = rows.find((r) => r.role === "cover")!;
    const r = await takedownReproduction(
      { repo, store, revalidate: async () => {}, now: () => new Date() },
      { mediaId: inline.media_id },
      MARINA,
      "Pedido do veículo (teste)",
    );
    expect(r).toEqual({ ok: true, value: { blocked: 1, articleIds: [ids.article] } });
    const { data } = await db
      .from("media_assets")
      .select("id, status")
      .in("id", [cover.media_id, inline.media_id]);
    const status = Object.fromEntries(data!.map((a) => [a.id, a.status]));
    expect(status[inline.media_id]).toBe("blocked");
    expect(status[cover.media_id]).toBe("approved");
    expect((await links()).map((l) => l.role)).toEqual(["cover", "inline"]);
    // A origem removida nunca volta: o reprocesso não recria a imagem do texto.
    const ctx = await repo.mediaContext(ids.article);
    expect(ctx!.inline?.status).toBe("blocked");
  });

  it("escolha de pessoa trava o reprocesso", async () => {
    await db
      .from("article_media")
      .update({ chosen_by: MARINA })
      .eq("article_id", ids.article)
      .eq("role", "cover");
    const ctx = await repo.mediaContext(ids.article);
    expect(ctx!.humanMedia).toBe(true);
    expect(await createImageReprocessRepo(db).articlesNeedingImages(500)).not.toContain(
      ids.article,
    );
    const before = await links();
    await step(msg());
    expect(await links()).toEqual(before);
  });
});
