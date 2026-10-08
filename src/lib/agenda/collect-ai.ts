/**
 * Caminho `ai_page` da coleta (spec §4 passos 2–3): listagens (`url` e `list_urls`) → links das
 * páginas de evento → cada página lida pelo modelo com o trecho de evidência. Cache por (URL,
 * sha256 do texto saneado), teto de chamadas ao modelo (listagens e páginas) e corte de prazo.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AiError } from "@/lib/ai/types";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import {
  ACCEPT,
  accept,
  fetchDetail,
  pastCut,
  reject,
  timedGet,
  type RobotsGate,
  type RunCtx,
  type SourceReport,
} from "./collect-context";
import { extractEventPage, extractListingLinks, listingText } from "./extract/ai-page";
import { evidenceRecordSchema } from "./extract/evidence";
import {
  REJECT_REASONS,
  type AgendaSource,
  type NormalizedEvent,
  type RejectReason,
} from "./types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const REJECT_SET: ReadonlySet<string> = new Set(REJECT_REASONS);
const isRejectReason = (v: AiError | RejectReason): v is RejectReason => REJECT_SET.has(v);

// O que volta do cache é `unknown` e é conferido antes de usar.
const rawEventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string().nullish(),
  venue: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  neighborhood: z.string().nullish(),
  url: z.string().nullish(),
  priceCents: z.number().nullish(),
  online: z.boolean().optional(),
  category: z.string().nullish(),
});
export const cachedPageSchema = z.union([
  z.object({
    ok: z.literal(true),
    value: z.object({ raw: rawEventSchema, evidence: evidenceRecordSchema }),
  }),
  z.object({ ok: z.literal(false), error: z.enum(REJECT_REASONS) }),
]);
export type CachedPage = z.infer<typeof cachedPageSchema>;
export const cachedListingSchema = z.object({ links: z.array(z.string()).max(30) });

type Step<T> = { ok: true; value: T } | { ok: false; detail: string };

/** Antes de cada chamada ao modelo: corte, prazo duro e teto. */
function aiGate(ctx: RunCtx): string | null {
  if (pastCut(ctx)) return "prazo da execução";
  if (ctx.budget <= 0) return "teto de páginas";
  return null;
}

async function listingLinks(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  listUrl: string,
  body: string,
): Promise<Step<string[]>> {
  const hash = sha256(listingText(body, listUrl));
  const hit = cachedListingSchema.safeParse(await ctx.deps.cache.get(listUrl, hash));
  if (hit.success) return { ok: true, value: hit.data.links };
  const blocked = aiGate(ctx);
  if (blocked) return { ok: false, detail: blocked };
  ctx.budget--;
  report.aiPages++;
  const res = await extractListingLinks(ctx.callAgent, {
    html: body,
    baseUrl: listUrl,
    notes: source.notes,
  });
  if (!res.ok) return { ok: false, detail: `modelo: ${res.error}` };
  if (!ctx.deps.dryRun) await ctx.deps.cache.put(listUrl, hash, { links: res.value });
  return { ok: true, value: res.value };
}

/** Uma página de evento: cache ou modelo. */
async function eventPage(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  url: string,
  body: string,
): Promise<Step<CachedPage>> {
  const hash = sha256(sanitizeExternalText(body).text);
  const hit = cachedPageSchema.safeParse(await ctx.deps.cache.get(url, hash));
  if (hit.success) return { ok: true, value: hit.data };
  const blocked = aiGate(ctx);
  if (blocked) return { ok: false, detail: blocked };
  ctx.budget--;
  report.aiPages++;
  const res = await extractEventPage(ctx.callAgent, { html: body, url, notes: source.notes });
  let page: CachedPage;
  if (res.ok) page = { ok: true, value: res.value };
  else if (isRejectReason(res.error)) page = { ok: false, error: res.error };
  // Saída fora do esquema: recusada agora, sem cache (nova tentativa só no próximo ciclo).
  else if (res.error === "schema")
    return { ok: true, value: { ok: false, error: "extracao_invalida" } };
  else if (res.error === "injection") page = { ok: false, error: "texto_suspeito" };
  else return { ok: false, detail: `modelo: ${res.error}` };
  if (!ctx.deps.dryRun) await ctx.deps.cache.put(url, hash, page);
  return { ok: true, value: page };
}

export type AiPageOutcome =
  | { kind: "ok" }
  /** Teto, prazo ou modelo fora: a fonte fica para a próxima execução. */
  | { kind: "deferred"; detail: string; fetched: boolean }
  /** Nenhuma listagem respondeu. */
  | { kind: "failed"; detail: string };

/** Lê a fonte `ai_page`; aprovados vão para `events` (descartados pelo chamador se adiada). */
export async function collectAiPage(
  source: AgendaSource,
  ctx: RunCtx,
  report: SourceReport,
  robots: RobotsGate,
  events: NormalizedEvent[],
): Promise<AiPageOutcome> {
  const links: string[] = [];
  let fetched = false;
  let fetchError: string | undefined;
  for (const listUrl of [...new Set([source.url, ...source.listUrls])]) {
    const verdict = await robots(listUrl);
    if (verdict.kind === "deadline")
      return { kind: "deferred", detail: "prazo da execução", fetched };
    if (verdict.kind !== "allowed") continue;
    const res = await timedGet(ctx, source, listUrl, ACCEPT.ai_page);
    if (res.kind === "deadline") return { kind: "deferred", detail: "prazo da execução", fetched };
    if (res.kind !== "ok") {
      fetchError ??= fetchDetail(res);
      continue;
    }
    fetched = true;
    const found = await listingLinks(source, ctx, report, listUrl, res.body);
    if (!found.ok) return { kind: "deferred", detail: found.detail, fetched };
    for (const l of found.value) if (!links.includes(l)) links.push(l);
  }
  if (!fetched) return { kind: "failed", detail: fetchError ?? "listagem bloqueada" };

  let unavailable = 0;
  for (const url of links) {
    const verdict = await robots(url);
    if (verdict.kind === "deadline")
      return { kind: "deferred", detail: "prazo da execução", fetched };
    if (verdict.kind !== "allowed") continue;
    const res = await timedGet(ctx, source, url, ACCEPT.ai_page);
    if (res.kind === "deadline") return { kind: "deferred", detail: "prazo da execução", fetched };
    if (res.kind !== "ok") {
      unavailable++;
      continue;
    }
    const step = await eventPage(source, ctx, report, url, res.body);
    if (!step.ok) return { kind: "deferred", detail: step.detail, fetched };
    report.found++;
    if (!step.value.ok) reject(report, [step.value.error], url);
    else accept(step.value.value.raw, source, ctx, report, events, step.value.value.evidence);
  }
  if (unavailable > 0) report.detail = `${unavailable} página(s) de evento indisponível(is)`;
  return { kind: "ok" };
}
