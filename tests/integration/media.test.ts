// @vitest-environment node
// Etapa de imagem com banco real (fixtures de imagem, sem rede). O Storage fica no MediaStore em
// memória: a pilha local sem Docker não tem Supabase Storage (A-017, A-037).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createFlags, createMediaRepo } from "@/lib/db/pipeline-store";
import type { Database } from "@/lib/db/types";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { takedownReproduction } from "@/lib/media/takedown";
import { createMediaStep } from "@/lib/pipeline/steps/media";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const host = `repro-${tag}.example`;
const MARINA = "c1000000-0000-4000-8000-000000000002";
const ids = { source: "", topic: "", article: "", items: [] as string[], media: [] as string[] };

function anon() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function setFlag(enabled: boolean) {
  await db.from("feature_flags").update({ enabled }).eq("key", "image_reproduction_enabled");
}

afterAll(async () => {
  await setFlag(true);
  await db.from("article_media").delete().eq("article_id", ids.article);
  await db.from("decisions").delete().eq("object_ref", `article:${ids.article}`);
  await db.from("articles").delete().eq("id", ids.article);
  if (ids.media.length) await db.from("media_assets").delete().in("id", ids.media);
  await db.from("collected_items").delete().in("id", ids.items);
  await db.from("topics").delete().eq("id", ids.topic);
  await db.from("sources").delete().eq("id", ids.source);
  await db.from("rate_limits").delete().eq("bucket", "crawler").eq("key_hash", `repro-${tag}`);
});

describe("imagem com banco real: política reproduction", () => {
  it("copia com proveniência, liga à matéria, some do portal com a flag desligada e sai a pedido", async () => {
    const src = await db
      .from("sources")
      .insert({
        slug: `repro-${tag}`,
        name: `Jornal Reprodução ${tag}`,
        base_url: `https://${host}`,
        kind: "rss",
        locality: "cuiaba",
        image_policy: "reproduction",
      })
      .select("id")
      .single();
    ids.source = src.data!.id;
    const topic = await db
      .from("topics")
      .insert({ slug: `feira-${tag}`, title: `Feira ${tag}`, section_slug: "cultura" })
      .select("id")
      .single();
    ids.topic = topic.data!.id;
    const item = await db
      .from("collected_items")
      .insert({
        source_id: ids.source,
        canonical_url: `https://${host}/cultura/feira`,
        original_title: `Feira ${tag} de artesanato ocupa a Orla do Porto`,
        author: "Ana Prado",
        image_url: `https://${host}/img/feira.jpg`,
        locality: "cuiaba",
        topic_id: ids.topic,
        tags: ["artesanato"],
      })
      .select("id")
      .single();
    ids.items.push(item.data!.id);
    const article = await db
      .from("articles")
      .insert({
        slug: `feira-${tag}`,
        kind: "normalized",
        topic_id: ids.topic,
        section_slug: "cultura",
        title: `Feira ${tag} de artesanato ocupa a Orla do Porto`,
        dek: "Linha fina de teste",
        body: { type: "doc", content: [] },
        status: "in_review",
        agent_id: "write",
      })
      .select("id")
      .single();
    ids.article = article.data!.id;

    const repo = createMediaRepo(db);
    const ctx = await repo.mediaContext(ids.article);
    expect(ctx).toMatchObject({
      category: "cultura",
      tags: ["artesanato"],
      hasMedia: false,
      items: [
        {
          pageUrl: `https://${host}/cultura/feira`,
          source: { imagePolicy: "reproduction", name: `Jornal Reprodução ${tag}` },
        },
      ],
    });

    const store = createMemoryMediaStore();
    const { http } = createFakeHttp({
      [`https://${host}/img/feira.jpg`]: {
        body: new Uint8Array(
          readFileSync(join(process.cwd(), "tests/fixtures/images/reproducao-1600x900.jpg")),
        ),
        headers: { "content-type": "image/jpeg" },
      },
    });
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
    const msg = {
      runId: `run-${tag}`,
      step: "image" as const,
      itemRef: `article:${ids.article}`,
      attempt: 1,
    };
    expect(await step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });

    const { data: assets } = await db
      .from("media_assets")
      .select(
        "id, kind, status, credit, source_name, page_url, license, risk, provenance, width, phash",
      )
      .eq("source_id", ids.source);
    expect(assets).toHaveLength(1);
    const asset = assets![0]!;
    ids.media.push(asset.id);
    expect(asset).toMatchObject({
      kind: "reproduction",
      status: "approved",
      credit: "Ana Prado",
      source_name: `Jornal Reprodução ${tag}`,
      page_url: `https://${host}/cultura/feira`,
      risk: "medio",
      width: 1600,
      provenance: expect.objectContaining({ policy: "reproduction", unmodified: true }),
    });
    expect(asset.license).toMatch(/REPRODUÇÃO/);
    expect(asset.phash).not.toBeNull();
    const links = await db.from("article_media").select("media_id").eq("article_id", ids.article);
    expect(links.data).toEqual([{ media_id: asset.id }]);

    // Idempotente: rodar de novo não duplica.
    await step(msg);
    expect((await repo.mediaContext(ids.article))?.hasMedia).toBe(true);

    // Portal: reprodução aprovada é pública só com a flag ligada (1 clique desliga).
    const visible = async () =>
      (await anon().from("media_assets").select("id").eq("id", asset.id)).data?.length ?? 0;
    expect(await visible()).toBe(1);
    await setFlag(false);
    expect(await visible()).toBe(0);
    await setFlag(true);

    // Remoção a pedido: bloqueia, audita, e a mesma origem nunca volta.
    const tags: string[] = [];
    const r = await takedownReproduction(
      { repo, store, revalidate: async (t) => void tags.push(...t), now: () => new Date() },
      { sourceId: ids.source },
      MARINA,
      `Pedido do veículo ${tag}`,
    );
    expect(r).toEqual({ ok: true, value: { blocked: 1, articleIds: [ids.article] } });
    expect(tags).toEqual([`article:${ids.article}`]);
    expect(await visible()).toBe(0);
    const audit = await db
      .from("audit_log")
      .select("action, actor")
      .eq("object_ref", `media:${asset.id}`);
    expect(audit.data).toEqual([{ action: "media.takedown", actor: MARINA }]);
    expect((await repo.assetByOrigin(`https://${host}/img/feira.jpg`))?.status).toBe("blocked");
  });
});
