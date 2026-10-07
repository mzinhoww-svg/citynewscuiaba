// @vitest-environment node
// UX-W5-T2 (item 80): a home lê o banco em no máximo 2 rodadas sequenciais por renderização.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { getHomeData } from "@/lib/db/queries";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const created = { articles: [] as string[], media: [] as string[], pins: [] as string[] };

/**
 * Atraso fixo por requisição: cada "rodada" sequencial começa ~DELAY depois da anterior, então a
 * rodada de uma requisição é `1 + floor((início − t0) / DELAY)`. A latência real do banco local
 * fica bem abaixo de DELAY; requisições paralelas caem na mesma rodada.
 */
const DELAY = 400;

/** Pedido de imagem para matéria sem capa: escrita de melhor esforço, fora da leitura da página. */
const WRITES = /\/rpc\/featured_request_images/;

function instrument() {
  const real = globalThis.fetch;
  const calls: { url: string; round: number }[] = [];
  let t0: number | null = null;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const now = performance.now();
    t0 ??= now;
    if (!WRITES.test(url)) calls.push({ url, round: 1 + Math.floor((now - t0) / DELAY) });
    await new Promise((r) => setTimeout(r, DELAY));
    return real(input, init);
  });
  return { calls, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function oldArticleWithCover(): Promise<string> {
  const id = randomUUID();
  const r = await db.from("articles").insert({
    id,
    slug: `w5t2-${tag}-antiga`,
    kind: "original",
    section_slug: "cidade",
    title: `Matéria antiga fixada ${tag}`,
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: "published",
    // Fora das 60 mais recentes: a home só a conhece pelo pino.
    published_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
    publish_destinations: ["section"],
  });
  if (r.error) throw r.error;
  created.articles.push(id);
  const m = await db
    .from("media_assets")
    .insert({
      kind: "original",
      storage_path: `w5t2/${tag}.jpg`,
      license: "própria",
      allowed_use: "editorial",
      status: "approved",
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  created.media.push(m.data.id);
  const l = await db.from("article_media").insert({
    article_id: id,
    media_id: m.data.id,
    rationale: "teste",
    chosen_by: "test",
    role: "cover",
  });
  if (l.error) throw l.error;
  return id;
}

let pinned = "";

beforeAll(async () => {
  pinned = await oldArticleWithCover();
  const p = await db
    .from("featured_items")
    .insert({
      slot_key: "home.destaques",
      article_id: pinned,
      position: 0,
      starts_at: new Date(Date.now() - 3_600_000).toISOString(),
      kind: "manual",
    })
    .select("id")
    .single();
  if (p.error) throw p.error;
  created.pins.push(p.data.id);
});

afterAll(async () => {
  await db.from("featured_items").delete().in("id", created.pins);
  await db.from("featured_image_requests").delete().in("article_id", created.articles);
  await db.from("article_media").delete().in("article_id", created.articles);
  await db.from("media_assets").delete().in("id", created.media);
  await db.from("articles").delete().in("id", created.articles);
});

describe("home sem cascata (UX-W5-T2, item 80)", () => {
  it("lê o banco em no máximo 2 rodadas sequenciais", async () => {
    const { calls } = instrument();
    const r = await getHomeData();
    expect(r.ok).toBe(true);
    const rounds = Math.max(...calls.map((c) => c.round));
    const late = calls.filter((c) => c.round > 2).map((c) => c.url);
    expect(late, `requisições depois da 2ª rodada:\n${late.join("\n")}`).toEqual([]);
    expect(rounds).toBeLessThanOrEqual(2);
  }, 30_000);

  it("pino de matéria fora da lista recente continua ocupando o destaque", async () => {
    const r = await getHomeData();
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const h = r.value;
    expect(h.highlights.map((a) => a.id)).toContain(pinned);
    // Exclusões resolvidas em memória: nada se repete entre urgente, manchete e destaques.
    const top = [h.urgent?.id, h.lead?.id, ...h.highlights.map((a) => a.id)].filter(Boolean);
    expect(new Set(top).size).toBe(top.length);
    // A matéria fixada não vira automática na lista "Agora" (não é da lista recente da home).
    expect(h.now.map((a) => a.id)).not.toContain(pinned);
  }, 30_000);
});
