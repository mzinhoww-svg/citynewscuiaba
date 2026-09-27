// @vitest-environment node
// Ciclo de ponta a ponta com banco real (docs/testing.md §2 item 10): tick com 3 fontes de fixture →
// coleta → assunto agrupado → verificação → redação → imagem → regras → publicação → índice →
// notificação. IA falsa (A-018), HTTP falso (fixtures, sem rede), Storage em memória (A-017).
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pipelineTrash, purgePipeline, rememberSources } from "./cleanup";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { hashEmbedding } from "@/lib/ai/hash-embedding";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createServiceClient } from "@/lib/db/client";
import {
  createClusterRepo,
  createEventSink,
  createFlags,
  createIngestRepo,
  createMediaRepo,
  createPublishRepo,
  createRulesSource,
  createRunStore,
  createUnderstandRepo,
} from "@/lib/db/pipeline-store";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { drain } from "@/lib/pipeline/drain";
import type { Flags, RulesSource, RunStore } from "@/lib/pipeline/ports";
import { createQueue } from "@/lib/pipeline/queue";
import { createRunStep } from "@/lib/pipeline/run-step";
import { hamming, simhash64 } from "@/lib/pipeline/simhash";
import {
  createClusterHandlers,
  createIngestHandlers,
  createMediaHandlers,
  createPublishHandlers,
  createUnderstandHandlers,
  extractFromFeed,
  extractFromJsonFeed,
} from "@/lib/pipeline/steps";
import { createFakeHttp, type FakeRoute, fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { runTick } from "@/lib/pipeline/tick";
import { unpublishAuto } from "@/lib/pipeline/unpublish";
import { cosine } from "@/lib/pipeline/vector";
import { ok } from "@/lib/result";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

const db = createServiceClient();
const SLUGS = ["agencia-mt", "mt-agora", "folha-do-cerrado"] as const;
const FEEDS: Record<(typeof SLUGS)[number], { url: string; file: string; type: string }> = {
  "agencia-mt": {
    url: "https://agenciamt.example/api/noticias",
    file: "agencia-mt.json",
    type: "application/feed+json",
  },
  "mt-agora": {
    url: "https://mtagora.example/sitemap-news.xml",
    file: "mt-agora.xml",
    type: "application/xml",
  },
  "folha-do-cerrado": {
    url: "https://folhadocerrado.example/feed",
    file: "folha-do-cerrado.xml",
    type: "application/rss+xml",
  },
};
const OTAVIO = {
  id: "c1000000-0000-4000-8000-000000000003",
  roles: [{ role: "editor" as const, sections: ["cidade", "servicos", "clima", "agenda"] }],
};
const created = {
  topics: new Set<string>(),
  articles: new Set<string>(),
  namespaces: [] as string[],
};
const trash = pipelineTrash();
trash.rateLimits.push(...SLUGS.map((slug) => ({ bucket: "crawler", keyHash: slug })));

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rfc822 = (d: Date) =>
  `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00 +0000`;

function render(cycle: 1 | 2, slug: string, tag: string, ref: string): string {
  const published = new Date(Date.now() - 60 * 60_000);
  return readFileSync(
    join(
      process.cwd(),
      "tests/fixtures/feeds/pipeline",
      `ciclo${cycle}-${FEEDS[slug as (typeof SLUGS)[number]].file}`,
    ),
    "utf8",
  )
    .replaceAll("{{TAG}}", tag)
    .replaceAll("{{SLUG}}", ref)
    .replaceAll("{{ISO}}", published.toISOString())
    .replaceAll("{{RFC822}}", rfc822(published));
}

type Entry = { title: string; excerpt: string | null };
const entries = (cycle: 1 | 2, tag: string): Record<string, Entry[]> => ({
  "agencia-mt": extractFromJsonFeed(render(cycle, "agencia-mt", tag, "x")),
  "mt-agora": extractFromFeed(render(cycle, "mt-agora", tag, "x")),
  "folha-do-cerrado": extractFromFeed(render(cycle, "folha-do-cerrado", tag, "x")),
});
const vec = (e: Entry) => hashEmbedding(e.excerpt ? `${e.title}\n${e.excerpt}` : e.title, 1536);
const inBand = (c: number) => c >= 0.84 && c <= 0.89;

/**
 * Marcador aleatório de 10 palavras por ciclo: isola o teste dos itens de outras execuções (o
 * banco não é recriado entre suítes). É sorteado até que os itens do mesmo assunto fiquem no
 * intervalo de agrupamento (cosseno 0,84–0,89 contra o centróide) e fora do de duplicata
 * (simhash do título a mais de 5 bits), para o resultado não depender da sorte.
 */
function pickTag(cycle: 1 | 2): string {
  for (let i = 0; i < 500; i++) {
    const tag = Array.from({ length: 10 }, () => `x${randomInt(0, 36 ** 3).toString(36)}`).join(
      " ",
    );
    const e = entries(cycle, tag);
    const group =
      cycle === 1
        ? [e["agencia-mt"]![0]!, e["mt-agora"]![0]!, e["folha-do-cerrado"]![0]!]
        : [e["mt-agora"]![0]!, e["folha-do-cerrado"]![0]!];
    const v = group.map(vec);
    const titlesApart = group.every((a, x) =>
      group.every((b, y) => x >= y || hamming(simhash64(a.title), simhash64(b.title)) > 5),
    );
    const pairsBelowDup = v.every((a, x) => v.every((b, y) => x >= y || cosine(a, b) < 0.89));
    let centroid = v[0]!;
    let joins = true;
    for (let k = 1; k < v.length; k++) {
      joins &&= inBand(cosine(v[k]!, centroid));
      centroid = centroid.map((c, j) => (c * k + v[k]![j]!) / (k + 1));
    }
    if (titlesApart && pairsBelowDup && joins) return tag;
  }
  throw new Error("nenhum marcador atendeu às faixas de agrupamento");
}

async function uniqueImage(seed: number): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <rect width="100%" height="100%" fill="hsl(${seed % 360},55%,60%)"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${((seed >> i) % 13) * 110}" y="${i * 140}" width="${200 + ((seed >> (i + 3)) % 7) * 90}" height="120" fill="hsl(${(seed * (i + 7)) % 360},60%,${20 + i * 10}%)"/>`).join("")}
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function runCycle(opts: {
  cycle: 1 | 2;
  rules: RulesSource;
  flags: Flags;
  revalidated: string[];
}) {
  const tag = pickTag(opts.cycle);
  const ref = randomUUID().slice(0, 8);
  const namespace = `e2e-${ref}`;
  created.namespaces.push(namespace);
  const routes: Record<string, FakeRoute> = {
    "https://agenciamt.example/robots.txt": { status: 404 },
    "https://mtagora.example/robots.txt": { status: 404 },
    "https://folhadocerrado.example/robots.txt": { status: 404 },
    [`https://mtagora.example/img/ciclovia-${ref}.png`]: {
      body: await uniqueImage(randomInt(1, 2 ** 30)),
      headers: { "content-type": "image/png" },
    },
  };
  for (const slug of SLUGS)
    routes[FEEDS[slug].url] = {
      body: render(opts.cycle, slug, tag, ref),
      headers: { "content-type": FEEDS[slug].type },
    };
  const { http } = createFakeHttp(routes);

  const store = createMemoryAiStore();
  const fake = createFakeProvider();
  const now = () => new Date();
  const callAgent = createCallAgent({ store, provider: fake, now });
  const promptVersion = async (id: string) => (await store.agent(id))?.prompt?.version ?? null;
  const embed = async (t: string) => ok(hashEmbedding(t, 1536));
  const handlers = {
    ...createIngestHandlers({
      repo: createIngestRepo(db),
      http,
      resolve: fakeResolve(),
      userAgent: "CityNewsBot/1.0",
      now,
    }),
    ...createClusterHandlers({ repo: createClusterRepo(db), embed, now }),
    ...createUnderstandHandlers({ repo: createUnderstandRepo(db), callAgent, promptVersion, now }),
    ...createMediaHandlers({
      repo: createMediaRepo(db),
      store: createMemoryMediaStore(),
      flags: opts.flags,
      http,
      resolve: fakeResolve(),
      userAgent: "CityNewsBot/1.0",
      now,
      analyze: analyzeImage,
    }),
    ...createPublishHandlers({
      repo: createPublishRepo(db),
      rules: opts.rules,
      flags: opts.flags,
      callAgent,
      promptVersion,
      embed,
      revalidate: async (tags) => void opts.revalidated.push(...tags),
      now,
    }),
  };

  // Tick: janela própria (ano 2001) e só as 3 fontes de fixture.
  const base = createRunStore(db);
  const runs: RunStore = {
    ...base,
    previousOpenRun: async () => null,
    activeSources: async () =>
      SLUGS.map((slug) => ({ slug, frequencyMinutes: 30, lastFetchedAt: null })),
  };
  const queue = createQueue(db, { namespace });
  const window = new Date(Date.UTC(2001, 0, 1) + randomInt(1, 2_000_000) * 30 * 60_000);
  const tick = await runTick({ queue, runs, now: () => window });
  expect(tick).toMatchObject({ status: "started", enqueued: 3 });
  trash.runIds.add(tick.runId);

  let result = { remaining: 1, retried: 0, quarantined: 0 };
  let quarantined = 0;
  for (let i = 0; i < 8 && result.remaining > 0; i++) {
    result = await drain({
      queue,
      runStep: createRunStep(handlers),
      events: createEventSink(db),
      now: () => Date.now(),
      budgetMs: 120_000,
    });
    quarantined += result.quarantined;
    expect(result.retried).toBe(0);
  }
  expect(result.remaining).toBe(0);
  return { tick, tag, ref, namespace, quarantined };
}

async function articleFor(canonicalUrl: string) {
  const { data: item } = await db
    .from("collected_items")
    .select("id, topic_id")
    .eq("canonical_url", canonicalUrl)
    .single();
  expect(item?.topic_id).toBeTruthy();
  created.topics.add(item!.topic_id!);
  const { data: article } = await db
    .from("articles")
    .select(
      "id, status, publish_mode, section_slug, rules_version, review_reason, tsv, embedding, published_at, topic_id",
    )
    .eq("topic_id", item!.topic_id!)
    .eq("agent_id", "write")
    .single();
  expect(article).toBeTruthy();
  created.articles.add(article!.id);
  return { item: item!, article: article! };
}

beforeAll(() => rememberSources(db, trash, SLUGS));

afterAll(async () => {
  const articles = [...created.articles];
  const topics = [...created.topics];
  if (articles.length) {
    const { data: media } = await db
      .from("article_media")
      .select("media_id")
      .in("article_id", articles);
    await db.from("article_media").delete().in("article_id", articles);
    const mediaIds = (media ?? []).map((m) => m.media_id);
    if (mediaIds.length) await db.from("media_assets").delete().in("id", mediaIds);
    await db
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        articles.map((a) => `article:${a}`),
      );
    await db
      .from("notifications")
      .delete()
      .in(
        "object_ref",
        articles.map((a) => `article:${a}`),
      );
    await db.from("article_sources").delete().in("article_id", articles);
    await db.from("article_versions").delete().in("article_id", articles);
    await db.from("articles").delete().in("id", articles);
  }
  if (topics.length) {
    await db
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        topics.map((t) => `topic:${t}`),
      );
    const { data: items } = await db.from("collected_items").select("id").in("topic_id", topics);
    const ids = (items ?? []).map((i) => i.id);
    if (ids.length)
      await db
        .from("decisions")
        .delete()
        .in(
          "object_ref",
          ids.map((i) => `item:${i}`),
        );
    await db.from("collected_items").update({ duplicate_of: null }).in("topic_id", topics);
    await db.from("collected_items").delete().in("topic_id", topics);
    await db.from("topics").delete().in("id", topics);
  }
  for (const ns of created.namespaces) trash.namespaces.add(ns);
  await purgePipeline(db, trash);
});

describe("pipeline de ponta a ponta (tick → publicação)", () => {
  it("regras do banco (forceReview): assunto agrupado, Cidade em revisão, injeção em quarentena", async () => {
    const revalidated: string[] = [];
    const { ref, namespace, quarantined } = await runCycle({
      cycle: 1,
      rules: createRulesSource(db),
      flags: createFlags(db),
      revalidated,
    });

    // Assunto agrupado: as 3 fontes caíram no mesmo assunto.
    const urls = [
      `https://agenciamt.example/noticias/ciclovia-mae-bonifacia-cpa-${ref}`,
      `https://mtagora.example/cidade/ciclovia-parque-mae-bonifacia-${ref}`,
      `https://folhadocerrado.example/cidade/ciclovia-mae-bonifacia-cpa-${ref}`,
    ];
    const { data: items } = await db
      .from("collected_items")
      .select("topic_id, duplicate_of, section_slug")
      .in("canonical_url", urls);
    expect(items).toHaveLength(3);
    expect(new Set(items!.map((i) => i.topic_id)).size).toBe(1);
    expect(items!.every((i) => i.duplicate_of === null && i.section_slug === "cidade")).toBe(true);

    // Matéria de Cidade em revisão pelo forceReview das regras v1 ativas no banco.
    const { article } = await articleFor(urls[0]!);
    expect(article).toMatchObject({
      status: "in_review",
      publish_mode: null,
      section_slug: "cidade",
      rules_version: 1,
    });
    expect(article.review_reason).toMatch(/Revisão obrigatória ligada nas regras v1/);
    const { data: decisions } = await db
      .from("decisions")
      .select("step, rules_version, recommended, output, rationale")
      .eq("object_ref", `article:${article.id}`)
      .order("created_at");
    expect(decisions!.map((d) => d.step)).toEqual(["image", "rules"]);
    expect(decisions![1]).toMatchObject({
      rules_version: 1,
      recommended: "review",
      output: expect.objectContaining({ rule: "force_review", route: "review" }),
    });
    // Imagem da MT Agora (acordo vigente) copiada como FOTO ORIGINAL com crédito.
    expect(decisions![0]!.output).toMatchObject({ kind: "original" });
    const { count: sources } = await db
      .from("article_sources")
      .select("*", { count: "exact", head: true })
      .eq("article_id", article.id);
    expect(sources).toBe(3);

    // Nada foi publicado sozinho; a fila de revisão foi avisada no Control Center.
    const { data: notes } = await db
      .from("notifications")
      .select("kind, channel")
      .eq("object_ref", `article:${article.id}`);
    expect(notes!.length).toBeLessThanOrEqual(1);
    expect(revalidated).toEqual([]);

    // Item com instrução injetada: quarentena com alerta de segurança, nunca vira item.
    expect(quarantined).toBe(1);
    const { data: q } = await db
      .from("pipeline_quarantine")
      .select("error")
      .eq("queue", `${namespace}:pipeline`);
    expect(q).toHaveLength(1);
    expect(q![0]!.error).toMatch(/^injection:/);
    const { data: injected } = await db
      .from("collected_items")
      .select("id")
      .eq("canonical_url", `https://folhadocerrado.example/cidade/nota-${ref}`);
    expect(injected).toEqual([]);
  });

  it("forceReview=false e auto_publish: Serviços publica sozinho, indexa, e desfaz em um clique", async () => {
    const revalidated: string[] = [];
    const flags: Flags = {
      isEnabled: async (k) => k === "auto_publish" || k === "image_reproduction_enabled",
    };
    const { ref } = await runCycle({
      cycle: 2,
      rules: { activeRules: async () => ok({ ...DEFAULT_RULES, version: 2, forceReview: false }) },
      flags,
      revalidated,
    });

    const { article } = await articleFor(
      `https://mtagora.example/servicos/mutirao-300-vagas-${ref}`,
    );
    expect(article).toMatchObject({
      status: "published",
      publish_mode: "auto",
      section_slug: "servicos",
      rules_version: 2,
    });
    expect(article.published_at).not.toBeNull();
    expect(article.tsv).toBeTruthy();
    expect(article.embedding).toBeTruthy();
    expect(revalidated).toEqual(
      expect.arrayContaining([`article:${article.id}`, "section:servicos"]),
    );

    // Toda publicação automática grava regra, justificativa e confiança.
    const { data: pub } = await db
      .from("decisions")
      .select("rules_version, rationale, output")
      .eq("object_ref", `article:${article.id}`)
      .eq("step", "publish")
      .single();
    expect(pub).toMatchObject({
      rules_version: 2,
      rationale: expect.stringMatching(/modo automático/),
      output: expect.objectContaining({
        published: true,
        rule: "mode",
        confidence: expect.objectContaining({ score: expect.any(Number) }),
      }),
    });
    const { data: note } = await db
      .from("notifications")
      .select("kind, channel")
      .eq("object_ref", `article:${article.id}`);
    expect(note).toEqual([{ kind: "auto_published", channel: "control_center" }]);

    // Busca: sem acento encontra com acento (FTS com unaccent, título + corpo).
    const { data: hits } = await db
      .from("articles")
      .select("id")
      .eq("id", article.id)
      .textSearch("tsv", "mutirao & vagas", { config: "portuguese" });
    expect(hits).toEqual([{ id: article.id }]);

    // Desfazer em um clique.
    const r = await unpublishAuto(
      {
        repo: createPublishRepo(db),
        revalidate: async (t) => void revalidated.push(...t),
        now: () => new Date(),
      },
      article.id,
      OTAVIO,
      "Endereço do mutirão mudou",
    );
    expect(r.ok).toBe(true);
    const { data: after } = await db
      .from("articles")
      .select("status")
      .eq("id", article.id)
      .single();
    expect(after?.status).toBe("unpublished");
    const { data: human } = await db
      .from("decisions")
      .select("human_decision, human_id, rationale")
      .eq("object_ref", `article:${article.id}`)
      .eq("human_decision", "unpublish")
      .single();
    expect(human).toEqual({
      human_decision: "unpublish",
      human_id: OTAVIO.id,
      rationale: "Endereço do mutirão mudou",
    });
  });
});
