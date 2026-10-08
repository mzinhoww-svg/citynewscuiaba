/**
 * Ativação em lote das fontes pausadas (decisão R43). Lógica pura usada por
 * `scripts/ops/activate-sources.mjs`: validação do arquivo de configuração, veredito do teste de
 * extração e montagem do patch aceito por `source_admin_update` (0031/0032). Nada aqui toca rede
 * ou banco.
 */
import "server-only";
import { z } from "zod";
import { BLOCK_REASONS, type BlockReason } from "./activation-constants";
import { effectiveFrequency } from "./frequency";
import { consumptionSchema } from "./schema";
import type { ConsumptionStrategy } from "./types";

export { BLOCK_REASONS, type BlockReason } from "./activation-constants";

const expectSchema = z.object({
  /** Itens válidos exigidos no teste de extração. */
  minItems: z.number().int().min(1).max(50).default(3),
  /** Data obrigatória e plausível; `false` só com justificativa em `note` da fonte. */
  requireDate: z.boolean().default(true),
  /** Idade máxima da data mais recente exigida, em dias. */
  maxAgeDays: z.number().int().min(1).max(365).default(30),
});

const blockedSchema = z.object({
  reason: z.enum(BLOCK_REASONS),
  /** Motivo exato, em pt-BR, gravado em `last_error` e no relatório. */
  detail: z.string().min(10),
});

export const activationEntrySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    /** Como a fonte é coletada. Fonte sem configuração (`blocked`) não tem. */
    strategy: z
      .enum(["rss", "atom", "jsonfeed", "sitemap_news", "page_list", "page_article"])
      .optional(),
    /** Feed, sitemap ou página de listagem (`page_list`). */
    feedUrl: z.string().url().optional(),
    pageSelectors: consumptionSchema.shape.pageSelectors.optional(),
    termsUrl: z.string().url().optional(),
    robotsSummary: z.string().min(1),
    /** Marcas: o `robots.txt` bloqueia robôs de IA nominalmente (CityNewsBot não é citado). */
    aiBotsBlockedByRobots: z.boolean().default(false),
    frequencyMinutes: z.number().int().nullable().default(null),
    rateLimitPerHour: z.number().int().min(1).max(600).default(30),
    termsMinIntervalMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    expect: expectSchema.default({ minItems: 3, requireDate: true, maxAgeDays: 30 }),
    /** Observação livre (também vai para o relatório). */
    note: z.string().optional(),
    blocked: blockedSchema.optional(),
  })
  .superRefine((e, ctx) => {
    if (e.blocked) return;
    if (!e.strategy || !e.feedUrl) {
      ctx.addIssue({ code: "custom", message: `${e.slug}: sem strategy/feedUrl e sem blocked` });
    }
    if (e.strategy === "page_list" && !e.pageSelectors) {
      ctx.addIssue({ code: "custom", message: `${e.slug}: page_list exige pageSelectors` });
    }
    if (!e.termsUrl) {
      ctx.addIssue({ code: "custom", message: `${e.slug}: termsUrl é obrigatório para ativar` });
    }
    if (!e.expect.requireDate && !e.note) {
      ctx.addIssue({
        code: "custom",
        message: `${e.slug}: requireDate=false exige note justificando`,
      });
    }
  });

export const activationFileSchema = z.object({
  version: z.literal(1),
  decision: z.string().min(1),
  /** Data (AAAA-MM-DD) em que a revisão dos termos foi delegada pelo dono. */
  termsDelegatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(activationEntrySchema).min(1),
});

export type ActivationEntry = z.infer<typeof activationEntrySchema>;
export type ActivationFile = z.infer<typeof activationFileSchema>;

/** Valida e confere slugs únicos. */
export function parseActivationFile(raw: unknown): ActivationFile {
  const file = activationFileSchema.parse(raw);
  const seen = new Set<string>();
  for (const s of file.sources) {
    if (seen.has(s.slug)) throw new Error(`slug repetido: ${s.slug}`);
    seen.add(s.slug);
  }
  return file;
}

export type SourceKindDb = "rss" | "sitemap" | "api" | "page";

export function kindFor(strategy: ConsumptionStrategy): SourceKindDb {
  switch (strategy) {
    case "rss":
    case "atom":
      return "rss";
    case "jsonfeed":
      return "api";
    case "sitemap_news":
      return "sitemap";
    case "page_list":
    case "page_article":
      return "page";
  }
}

export interface ExtractedItem {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface ExtractionVerdict {
  ok: boolean;
  total: number;
  valid: number;
  /** Frase pt-BR com o motivo exato quando `ok` é falso. */
  reason: string | null;
}

const DAY_MS = 86_400_000;
const FUTURE_TOLERANCE_MS = 2 * DAY_MS;

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

/**
 * Passa quando há pelo menos `minItems` itens com título, link http(s) e (se `requireDate`) data
 * plausível: no máximo 2 dias no futuro e, para o mais recente, no máximo `maxAgeDays` de idade.
 * Data fora disso (feed com ano errado, por exemplo) conta como ausente.
 */
export function evaluateExtraction(
  items: readonly ExtractedItem[],
  expect: ActivationEntry["expect"],
  now: Date,
): ExtractionVerdict {
  const total = items.length;
  const basic = items.filter((i) => i.title.trim().length > 0 && isHttpUrl(i.url));
  if (basic.length < expect.minItems) {
    return {
      ok: false,
      total,
      valid: basic.length,
      reason: `extração devolveu ${basic.length} item(ns) com título e link (mínimo ${expect.minItems})`,
    };
  }
  if (!expect.requireDate) return { ok: true, total, valid: basic.length, reason: null };

  const dated = basic.filter((i) => {
    if (!i.publishedAt) return false;
    const t = Date.parse(i.publishedAt);
    return Number.isFinite(t) && t <= now.getTime() + FUTURE_TOLERANCE_MS;
  });
  if (dated.length < expect.minItems) {
    const none = basic.filter((i) => i.publishedAt).length === 0;
    return {
      ok: false,
      total,
      valid: dated.length,
      reason: none
        ? `${basic.length} itens extraídos, mas nenhum com data`
        : `só ${dated.length} item(ns) com data plausível (mínimo ${expect.minItems}); as demais estão no futuro ou inválidas`,
    };
  }
  const newest = Math.max(...dated.map((i) => Date.parse(i.publishedAt!)));
  if (now.getTime() - newest > expect.maxAgeDays * DAY_MS) {
    return {
      ok: false,
      total,
      valid: dated.length,
      reason: `item mais recente com data de ${new Date(newest).toISOString().slice(0, 10)}, mais de ${expect.maxAgeDays} dias atrás (fonte parada ou data errada)`,
    };
  }
  return { ok: true, total, valid: dated.length, reason: null };
}

export interface SourcePatch {
  kind: SourceKindDb;
  feed_url: string;
  consumption: z.infer<typeof consumptionSchema>;
  terms_url: string;
  terms_reviewed_at: string;
  agreement_note: string;
  frequency_minutes: number | null;
  rate_limit_per_hour: number;
  terms_min_interval_minutes: number | null;
}

/** Frase gravada em `agreement_note`, no mesmo molde da ativação do Olhar Direto. */
export function agreementNote(
  entry: ActivationEntry,
  file: Pick<ActivationFile, "decision" | "termsDelegatedOn">,
  crawlDelaySec: number | null,
): string {
  const [y, m, d] = file.termsDelegatedOn.split("-");
  const parts = [
    `Termos: revisão delegada pelo dono em ${d}/${m}/${y} (${file.decision}).`,
    `robots.txt: ${entry.robotsSummary}${crawlDelaySec != null ? ` Crawl-delay ${crawlDelaySec}s respeitado.` : ""}`,
    `Coleta ${entry.strategy}${entry.feedUrl ? ` em ${entry.feedUrl}` : ""}, só título, data e link; exibir sempre a fonte.`,
  ];
  if (entry.aiBotsBlockedByRobots) {
    parts.push(
      "Atenção: o robots.txt bloqueia robôs de IA nominalmente; CityNewsBot não é citado.",
    );
  }
  if (entry.note) parts.push(entry.note);
  return parts.join(" ");
}

/**
 * Patch (snake_case) para `source_admin_update`. A frequência efetiva respeita `Crawl-delay` e o
 * intervalo mínimo dos termos (grade de `effectiveFrequency`); nunca cai abaixo do pedido.
 */
export function buildPatch(
  entry: ActivationEntry,
  file: Pick<ActivationFile, "decision" | "termsDelegatedOn">,
  crawlDelaySec: number | null,
  now: Date,
): SourcePatch {
  if (!entry.strategy || !entry.feedUrl || !entry.termsUrl) {
    throw new Error(`${entry.slug}: sem configuração de coleta`);
  }
  const freq = effectiveFrequency(entry.frequencyMinutes, 30, {
    crawlDelaySec,
    termsMinIntervalMinutes: entry.termsMinIntervalMinutes,
  });
  const consumption: SourcePatch["consumption"] = {
    strategy: entry.strategy,
    feedUrl: entry.feedUrl,
    enrich: false,
    ...(entry.strategy === "page_list" ? { pageSelectors: entry.pageSelectors } : {}),
    ...(crawlDelaySec != null ? { robots: { crawlDelaySec: Math.ceil(crawlDelaySec) } } : {}),
  };
  consumptionSchema.parse(consumption);
  return {
    kind: kindFor(entry.strategy),
    feed_url: entry.feedUrl,
    consumption,
    terms_url: entry.termsUrl,
    terms_reviewed_at: now.toISOString(),
    agreement_note: agreementNote(entry, file, crawlDelaySec),
    frequency_minutes: freq.minutes,
    rate_limit_per_hour: entry.rateLimitPerHour,
    terms_min_interval_minutes: entry.termsMinIntervalMinutes,
  };
}

/** Campos que, se iguais ao que já está no banco, tornam a reexecução um no-op (idempotência). */
const COMPARED = [
  "kind",
  "feed_url",
  "consumption",
  "terms_url",
  "frequency_minutes",
  "rate_limit_per_hour",
  "terms_min_interval_minutes",
] as const;

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Subconjunto do patch que difere da linha atual (vazio = nada a gravar). `terms_reviewed_at` e a nota só entram junto com uma mudança. */
export function diffPatch(
  patch: SourcePatch,
  row: Partial<Record<(typeof COMPARED)[number], unknown>>,
): Partial<SourcePatch> {
  const changed = COMPARED.filter((k) => stable(patch[k]) !== stable(row[k]));
  if (changed.length === 0) return {};
  const out: Record<string, unknown> = {};
  for (const k of changed) out[k] = patch[k];
  out.terms_reviewed_at = patch.terms_reviewed_at;
  out.agreement_note = patch.agreement_note;
  return out as Partial<SourcePatch>;
}

export type Outcome =
  | { action: "activate"; patch: SourcePatch }
  | { action: "keep_paused"; statusReason: BlockReason; lastError: string };

/** Decide o destino da fonte a partir do teste de extração (ou do impedimento já conhecido). */
export function decideOutcome(
  entry: ActivationEntry,
  file: Pick<ActivationFile, "decision" | "termsDelegatedOn">,
  check: {
    robotsAllowed: boolean;
    crawlDelaySec: number | null;
    verdict: ExtractionVerdict | null;
    fetchError: string | null;
  },
  now: Date,
): Outcome {
  if (entry.blocked) {
    return {
      action: "keep_paused",
      statusReason: entry.blocked.reason,
      lastError: entry.blocked.detail,
    };
  }
  if (!check.robotsAllowed) {
    return {
      action: "keep_paused",
      statusReason: "robots",
      lastError: `robots.txt não permite a coleta de ${entry.feedUrl} para o CityNewsBot`,
    };
  }
  if (check.fetchError) {
    return { action: "keep_paused", statusReason: "other", lastError: check.fetchError };
  }
  if (!check.verdict || !check.verdict.ok) {
    return {
      action: "keep_paused",
      statusReason: "quality",
      lastError: `teste de extração falhou: ${check.verdict?.reason ?? "sem resultado"}`,
    };
  }
  return { action: "activate", patch: buildPatch(entry, file, check.crawlDelaySec, now) };
}
