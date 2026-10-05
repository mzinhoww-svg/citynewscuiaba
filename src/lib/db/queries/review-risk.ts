import "server-only";
import type { DbClient } from "@/lib/db/client";
import { WORDS_PER_LINE, type RiskItem } from "@/lib/review/bulk-risk";

/** Matéria da seleção com os fatos de risco e o necessário para checar o escopo. */
export interface ReviewRiskRow extends RiskItem {
  status: string;
  /**
   * Rascunho sem IA ainda com o texto das fontes (`studio_fallback_pending`) ou com o título
   * provisório do assunto: não é matéria, nunca vai ao ar.
   */
  unwritten: boolean;
}

/** Título que o assunto tem enquanto ninguém escreveu a matéria (`cluster`, trigger do banco). */
const PROVISIONAL_TITLE = "Assunto em apuração";

const CHUNK = 100;
/** Regras e verificação que marcam o assunto como duvidoso ou com fontes divergentes. */
const DOUBTFUL_RULES = new Set(["conflict", "dubious"]);

/** Palavras do corpo (documento do editor: soma de todos os nós `text`). */
export function wordCountOf(body: unknown): number {
  let words = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    const node = n as { text?: unknown; content?: unknown };
    if (typeof node.text === "string") words += node.text.split(/\s+/).filter(Boolean).length;
    walk(node.content);
  };
  walk(body);
  return words;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fatos de risco das matérias, lidos com a sessão de quem consulta (RLS). A denúncia vem da função
 * `studio_reported_articles` (a tabela só é legível por editor-chefe e moderação). Lê em lotes de
 * 100 ids para não estourar o tamanho da URL.
 */
export async function loadRiskRows(db: DbClient, ids: string[]): Promise<ReviewRiskRow[]> {
  const out: ReviewRiskRow[] = [];
  for (const part of chunks([...new Set(ids)], CHUNK)) {
    const refs = part.map((id) => `article:${id}`);
    const [arts, sources, media, reported, decisions] = await Promise.all([
      db
        .from("articles")
        .select("id, title, section_slug, body, status, confidence, review_reason, ai_fallback")
        .in("id", part),
      db
        .from("article_sources")
        .select("article_id, item:collected_items(canonical_url, source_id)")
        .in("article_id", part),
      db
        .from("article_media")
        .select("article_id, media:media_assets(status)")
        .in("article_id", part),
      db.rpc("studio_reported_articles", { p_ids: part }),
      db
        .from("decisions")
        .select("object_ref, step, output, created_at")
        .in("object_ref", refs)
        .in("step", ["rules", "verify"])
        .order("created_at", { ascending: false }),
    ]);
    for (const r of [arts, sources, media, reported, decisions])
      if (r.error) throw new Error(`riscos: ${r.error.message}`);

    const sourceIds = new Map<string, Set<string>>();
    const citable = new Set<string>();
    for (const s of sources.data ?? []) {
      const item = s.item;
      if (!item) continue;
      const set = sourceIds.get(s.article_id) ?? new Set<string>();
      set.add(item.source_id);
      sourceIds.set(s.article_id, set);
      if (item.canonical_url) citable.add(s.article_id);
    }
    const photo = new Set(
      (media.data ?? []).filter((m) => m.media?.status === "approved").map((m) => m.article_id),
    );
    const reportedSet = new Set((reported.data ?? []) as string[]);
    // Só a decisão mais recente de cada etapa vale (vêm da mais nova para a mais velha).
    const seen = new Set<string>();
    const doubtful = new Set<string>();
    for (const d of decisions.data ?? []) {
      const key = `${d.object_ref}:${d.step}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = (d.output ?? {}) as Record<string, unknown>;
      const id = d.object_ref.slice("article:".length);
      if (d.step === "verify" && o.centralConflict === true) doubtful.add(id);
      if (d.step === "rules" && typeof o.rule === "string" && DOUBTFUL_RULES.has(o.rule))
        doubtful.add(id);
    }

    // A regra de "ainda é texto das fontes" mora no banco (a mesma do checklist e da publicação).
    const pending = new Set<string>();
    await Promise.all(
      (arts.data ?? [])
        .filter((a) => a.ai_fallback)
        .map(async (a) => {
          const r = await db.rpc("studio_fallback_pending", { p_id: a.id });
          // Sem resposta do banco: pendente (falha fechada).
          if (r.error || r.data !== false) pending.add(a.id);
        }),
    );

    for (const a of arts.data ?? []) {
      const words = wordCountOf(a.body);
      out.push({
        id: a.id,
        title: a.title,
        sectionSlug: a.section_slug,
        status: a.status,
        sourceCount: sourceIds.get(a.id)?.size ?? 0,
        hasCitableSource: citable.has(a.id),
        hasApprovedPhoto: photo.has(a.id),
        wordCount: words,
        // O motivo curto vem do motivo da revisão registrado pelo pipeline, quando o texto saiu curto.
        shortReason:
          words < WORDS_PER_LINE * 30 && a.review_reason ? a.review_reason.slice(0, 120) : null,
        doubtful: doubtful.has(a.id),
        confidence: a.confidence,
        reported: reportedSet.has(a.id),
        hasBody: words > 0,
        unwritten: pending.has(a.id) || a.title.startsWith(PROVISIONAL_TITLE),
      });
    }
  }
  return out;
}
