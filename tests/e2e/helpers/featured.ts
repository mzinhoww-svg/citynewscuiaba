import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { service } from "../studio";
import { contentReady } from "./wait";

/*
 * Apoio dos e2e dos destaques (FD-T2 e FD-T4). As posições são globais (uma manchete só), então os
 * specs que mexem nelas se revezam por um cadeado de arquivo (mkdir é atômico) em vez de brigar
 * pelo mesmo `home.lead`, mesmo rodando em processos diferentes do Playwright.
 */

const LOCK = join(tmpdir(), "citynews-e2e-featured.lock");
const STALE_MS = 10 * 60_000;

/** Espera a vez de usar as posições de destaque; devolve a função que a devolve. */
export async function acquireFeaturedLock(timeoutMs = 240_000): Promise<() => void> {
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK);
      return () => rmSync(LOCK, { recursive: true, force: true });
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > STALE_MS)
          rmSync(LOCK, { recursive: true, force: true });
      } catch {
        /* alguém liberou agora */
      }
      if (Date.now() - started > timeoutMs) throw new Error("cadeado dos destaques não liberou");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export interface FeaturedFixtures {
  articles: string[];
  media: string[];
  topics: string[];
  /** Arquivos enviados ao bucket `media` (capas das matérias de teste). */
  files: string[];
}

export const newFixtures = (): FeaturedFixtures => ({
  articles: [],
  media: [],
  topics: [],
  files: [],
});

let coverBytes: Promise<Buffer> | null = null;
/** JPEG pequeno de verdade: a capa precisa carregar, senão `Photo` mostra o marcador (item 78). */
const coverJpeg = () =>
  (coverBytes ??= sharp({
    create: { width: 64, height: 36, channels: 3, background: { r: 120, g: 110, b: 90 } },
  })
    .jpeg()
    .toBuffer());

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export interface FixtureArticle {
  title: string;
  /** Capa aprovada (padrão: sim). */
  cover?: boolean;
  section?: string;
  /** Há quantas horas foi publicada (padrão 4). */
  hoursAgo?: number;
  confidence?: number;
  urgent?: boolean;
  topicId?: string;
  sponsored?: boolean;
}

/** Matéria publicada de teste, com ou sem capa aprovada (apague com `cleanFixtures`). */
export async function createPublished(
  fx: FeaturedFixtures,
  a: FixtureArticle,
): Promise<{ id: string; slug: string; title: string }> {
  const db = service();
  const id = randomUUID();
  const slug = `fd-e2e-${id.slice(0, 8)}`;
  const at = new Date(Date.now() - (a.hoursAgo ?? 4) * 3_600_000).toISOString();
  const r = await db.from("articles").insert({
    id,
    slug,
    kind: "original",
    section_slug: a.section ?? "cidade",
    title: a.title,
    dek: "Linha fina de teste dos destaques.",
    body: doc("Parágrafo de teste dos destaques."),
    status: "published",
    publish_mode: "human",
    published_at: at,
    updated_at: at,
    confidence: "alta",
    confidence_score: a.confidence ?? 0.9,
    urgent: a.urgent ?? false,
    sponsored: a.sponsored ?? false,
    topic_id: a.topicId ?? null,
  });
  if (r.error) throw r.error;
  fx.articles.push(id);
  if (a.cover !== false) {
    const path = `fd-e2e/${id}.jpg`;
    const up = await db.storage
      .from("media")
      .upload(path, await coverJpeg(), { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    fx.files.push(path);
    const m = await db
      .from("media_assets")
      .insert({
        kind: "original",
        storage_path: path,
        license: "CityNews",
        credit: "CityNews",
        allowed_use: "Livre para o CityNews",
        status: "approved",
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    fx.media.push(m.data.id);
    const l = await db.from("article_media").insert({
      article_id: id,
      media_id: m.data.id,
      rationale: "teste dos destaques",
      chosen_by: "e2e",
      role: "cover",
      alt: `Foto de ${a.title}`,
    });
    if (l.error) throw l.error;
  }
  return { id, slug, title: a.title };
}

export async function createTopic(fx: FeaturedFixtures, title: string): Promise<string> {
  const id = randomUUID();
  const r = await service()
    .from("topics")
    .insert({
      id,
      slug: `fd-e2e-${id.slice(0, 8)}`,
      title,
      summary: `Resumo de ${title}`,
      state: "em_apuracao",
    });
  if (r.error) throw r.error;
  fx.topics.push(id);
  return id;
}

/** Encerra pinos ativos (todas as posições) para o teste partir do automático. */
export async function endAllPins(): Promise<void> {
  await service()
    .from("featured_items")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null);
}

/** Fixa uma matéria numa posição pela função do banco (papel de serviço). */
export async function pinViaDb(
  slot: string,
  articleId: string,
  opts: { section?: string; hours?: number | null } = {},
): Promise<string> {
  const endsAt = opts.hours ? new Date(Date.now() + opts.hours * 3_600_000).toISOString() : null;
  const { data, error } = await service().rpc("featured_pin", {
    p_slot: slot,
    p_section: opts.section ?? null,
    p_article: articleId,
    p_ends_at: endsAt,
    p_note: "e2e",
  });
  if (error) throw error;
  return String(data);
}

export async function cleanFixtures(fx: FeaturedFixtures): Promise<void> {
  const db = service();
  if (fx.articles.length) {
    await db.from("featured_items").delete().in("article_id", fx.articles);
    await db.from("featured_image_requests").delete().in("article_id", fx.articles);
    await db.from("article_media").delete().in("article_id", fx.articles);
    await db
      .from("jobs")
      .delete()
      .in(
        "dedupe_key",
        fx.articles.map((i) => `image:article:${i}`),
      );
    await db.from("articles").delete().in("id", fx.articles);
  }
  if (fx.media.length) await db.from("media_assets").delete().in("id", fx.media);
  if (fx.files.length) await db.storage.from("media").remove(fx.files);
  if (fx.topics.length) await db.from("topics").delete().in("id", fx.topics);
}

/**
 * A home lê com cache de dados de 60 s (tag `home`); uma mudança feita direto no banco só aparece
 * depois. Recarrega até `predicate` passar (a ação do admin invalida a tag e aparece de imediato).
 * Cada leitura espera o esqueleto do streaming sair (`contentReady`): sem isso, um predicado que
 * só conta elementos (`.count()`) vê o `<main>` ainda em "Carregando notícias" e falha sempre.
 */
export async function reloadUntil(
  page: Page,
  url: string,
  predicate: () => Promise<boolean>,
  timeoutMs = 90_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto(url);
        await contentReady(page);
        return predicate();
      },
      { message: `a página ${url} não refletiu a mudança`, timeout: timeoutMs, intervals: [4_000] },
    )
    .toBe(true);
}
