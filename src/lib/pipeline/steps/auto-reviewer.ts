import { REVIEW_TEXT, RULE_RATIONALE } from "@/content/pt-BR/rules";
import type { CallAgent } from "@/lib/ai/call-agent";
import { ReviewSchema, type ReviewVerdict } from "@/lib/ai/schemas/review";
import { err, ok, type Result } from "@/lib/result";
import { check as checkBreaker, type BreakerStore } from "../breaker";
import type { DecisionContext, Flags, PublishRepo, Queue, Revalidate } from "../ports";
import { articleTags } from "./publish";
import { classifyRisk, type Risk } from "@/lib/rules/risk";
import { autoChecklist, endsCleanly, isComplete, type ShortReason } from "./auto-checklist";
import { candidateOf } from "./decide";
import { inputHash } from "./understanding";

/*
 * Revisor automático (AUT-T6, A11 e A12; R32). Matéria em revisão que passou do prazo (`due_at`:
 * urgente 10 min, demais 30 min) é lida por um agente que decide `publish`, `hold` ou `archive`
 * com justificativa gravada em `decisions`. À noite (20h às 6h em America/Cuiabá) é o padrão; de
 * dia a administração liga ou desliga nos Interruptores. Nunca decide correção, direito de
 * resposta, denúncia nem mudança de regra, e nunca arquiva por "expirou".
 */

export type ReviewerMode = "off" | "night" | "always";
export const REVIEWER_MODES = ["off", "night", "always"] as const;
export const DEFAULT_REVIEWER_MODE: ReviewerMode = "night";

export const isReviewerMode = (v: unknown): v is ReviewerMode =>
  typeof v === "string" && (REVIEWER_MODES as readonly string[]).includes(v);

/** Janela noturna: de 20h (inclusive) às 6h (exclusive), horário de Cuiabá (UTC−4 o ano todo). */
export const NIGHT_START_HOUR = 20;
export const NIGHT_END_HOUR = 6;

/** Hora cheia (0 a 23) em Cuiabá. */
export function cuiabaHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Cuiaba",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}

/** O revisor decide agora? `off` nunca; `always` sempre; `night` das 20h às 6h em Cuiabá. */
export function isReviewerActive(mode: ReviewerMode, now: Date): boolean {
  if (mode === "off") return false;
  if (mode === "always") return true;
  const h = cuiabaHour(now);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** Prazo da fila (A11): urgente 10 min, demais 30 min. Espelha o gatilho `articles_review_due`. */
export const REVIEW_DUE_MINUTES = { urgent: 10, normal: 30 } as const;
export function reviewDueAt(from: Date, urgent: boolean): Date {
  const min = urgent ? REVIEW_DUE_MINUTES.urgent : REVIEW_DUE_MINUTES.normal;
  return new Date(from.getTime() + min * 60_000);
}
export const isOverdue = (dueAt: string | null, now: Date): boolean =>
  dueAt !== null && Date.parse(dueAt) <= now.getTime();

/** Matéria em revisão como o revisor a enxerga. */
export interface ReviewItem {
  ctx: DecisionContext;
  /** Título, linha fina e corpo (texto externo: vai ao modelo como dado). */
  text: string;
  reviewReason: string | null;
  dueAt: string | null;
  /** Veio do pipeline (agente), não de uma pessoa. */
  fromPipeline: boolean;
  /** Denúncia aberta, direito de resposta, correção aberta ou item escalado por denúncias. */
  openReports: number;
  openCorrections: number;
  openEscalations: number;
  sourceNames: string[];
}

/**
 * Fora do alcance do revisor: correção, direito de resposta, denúncia (e a escalada por
 * denúncias), edição de pessoa, matéria que não veio do pipeline e risco crítico (nível 4, D-05),
 * que hoje é o rascunho sem IA: lista de trechos das fontes, cuja publicação republicaria texto de
 * terceiros (regra 4 de CLAUDE.md §5). Mesmo critério de `review_due_articles` (0151).
 */
export function isReviewable(i: ReviewItem): boolean {
  return (
    i.ctx.status === "in_review" &&
    i.fromPipeline &&
    !i.ctx.aiFallback &&
    riskOf(i).level < 4 &&
    !i.ctx.humanEdited &&
    i.openReports === 0 &&
    i.openCorrections === 0 &&
    i.openEscalations === 0
  );
}

export type ReviewError =
  { kind: "budget" } | { kind: "provider"; why: string } | { kind: "disabled" };

export interface ReviewVerdictOut {
  verdict: ReviewVerdict;
  reason: string;
  /** O revisor não decidiu de fato (resposta inválida, injeção, arquivar por prazo): vira `hold`. */
  degraded: boolean;
}

/** Nível de risco da matéria pela mesma regra da etapa de regras (D-05). */
export const riskOf = (i: Pick<ReviewItem, "ctx">): Risk =>
  classifyRisk(candidateOf(i.ctx), { aiFallback: i.ctx.aiFallback });

const RISK_NAME: Record<Risk["level"], string> = {
  1: "baixo",
  2: "moderado",
  3: "alto",
  4: "crítico",
};

/** Arquivar por prazo ("expirou", "venceu") nunca vale: o prazo só passa a matéria ao revisor. */
const EXPIRY = /\b(expir\w*|venc\w*|prazo|tempo\s+(?:esgotado|decorrido)|demor\w*|antig[ao])\b/i;

/** Texto de apoio do pedido (confiável, fixo): motivo da revisão, editoria, fontes. */
function systemOf(i: ReviewItem): string {
  const c = i.ctx;
  return [
    `Editoria: ${c.sectionSlug} (${c.category}). Confiança ${c.confidence} (${c.confidenceScore}).`,
    `Fontes independentes: ${c.independentSources}; primárias: ${c.primarySources}; fonte confiável: ${c.sourceTrusted ? "sim" : "não"}.`,
    `Urgente: ${c.urgent ? "sim" : "não"}; tema sensível: ${c.sensitive ? "sim" : "não"}.`,
    `Fontes divergentes confirmadas: ${c.centralConflict ? "sim" : "não"}.`,
    `Conteúdo marcado como duvidoso: ${c.dubious ? "sim" : "não"}.`,
    (() => {
      const r = riskOf(i);
      return `Nível de risco: ${r.level} (${RISK_NAME[r.level]})${r.reasons.length ? `; motivos: ${r.reasons.join(", ")}` : ""}.`;
    })(),
    `Fontes citadas: ${i.sourceNames.length > 0 ? i.sourceNames.join(", ") : "nenhuma"}.`,
    `Motivo pelo qual a matéria ficou em revisão: ${i.reviewReason ?? "não informado"}.`,
  ].join("\n");
}

const TASK = [
  "Decida publish, hold ou archive para a matéria em revisão e justifique em uma ou duas frases pelo conteúdo. Nunca arquive por prazo vencido.",
  "Privilegie publicar notícia relevante cujo núcleo factual está sustentado pelas fontes citadas.",
  "Nível 2: publique se as versões divergentes e os dados preliminares estão atribuídos às fontes.",
  "Nível 3: publique só se o texto relata apenas o que as fontes sustentam, atribui cada versão e não faz afirmação categórica contra pessoa ou empresa; senão, hold.",
].join("\n");

/**
 * Pede o veredito ao agente. Saída validada por zod; o texto da matéria vai como dado externo.
 * Resposta inválida ou injeção viram `hold`; orçamento esgotado e indisponibilidade voltam como
 * erro (a matéria fica na fila humana, sem decisão).
 */
export async function autoReview(
  item: ReviewItem,
  deps: { callAgent: CallAgent; signal?: AbortSignal },
): Promise<Result<ReviewVerdictOut, ReviewError>> {
  const r = await deps.callAgent(
    "reviewer",
    {
      system: systemOf(item),
      data: [{ id: `article:${item.ctx.articleId}`, text: item.text }],
      task: TASK,
    },
    ReviewSchema,
    { signal: deps.signal },
  );
  if (!r.ok) {
    if (r.error === "budget_exceeded") return err({ kind: "budget" });
    if (r.error === "disabled") return err({ kind: "disabled" });
    if (r.error === "schema" || r.error === "injection")
      return ok({ verdict: "hold", reason: REVIEW_TEXT.invalidAnswer(), degraded: true });
    return err({ kind: "provider", why: r.error });
  }
  const { verdict, reason } = r.value;
  if (verdict === "archive" && EXPIRY.test(reason))
    return ok({ verdict: "hold", reason: REVIEW_TEXT.neverArchiveByExpiry(), degraded: true });
  return ok({ verdict, reason, degraded: false });
}

/* ------------------------------------------------------------------------------------------ */
/* Passada do cron                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** Banco do revisor (service role), além do `PublishRepo` das etapas de publicação. */
export interface ReviewRepo extends Pick<
  PublishRepo,
  | "decisionContext"
  | "setStatus"
  | "checkInput"
  | "applyChecklist"
  | "articleText"
  | "latestDecision"
  | "recordDecision"
  | "audit"
> {
  /** Modo do revisor (`ai_reviewer_settings`); falha fechada = `off`. */
  mode(): Promise<ReviewerMode>;
  /** Matérias em revisão vencidas que o revisor pode decidir (`review_due_articles`). */
  dueArticles(now: Date, limit: number): Promise<string[]>;
  reviewMeta(articleId: string): Promise<Omit<ReviewItem, "ctx" | "text"> | null>;
}

export interface ReviewTickDeps {
  repo: ReviewRepo;
  flags: Flags;
  callAgent: CallAgent;
  /** Versão do prompt em produção do agente `reviewer` (vai na decisão). */
  promptVersion: () => Promise<number | null>;
  queue: Pick<Queue, "enqueue">;
  revalidate: Revalidate;
  breaker?: BreakerStore;
  now: () => Date;
  /** Quantas matérias por passada (a cada 5 min). */
  batch?: number;
}

export type ReviewTickResult =
  | { status: "inactive"; mode: ReviewerMode }
  | { status: "paused"; reason: "auto_publish_off" | "read_only" }
  | {
      status: "ran" | "budget";
      mode: ReviewerMode;
      published: number;
      held: number;
      archived: number;
      skipped: number;
    };

export const REVIEW_BATCH = 8;
/** Falhas seguidas do provedor que encerram a passada (o disjuntor de IA vê o resto). */
const MAX_PROVIDER_FAILURES = 3;

export async function runReviewTick(deps: ReviewTickDeps): Promise<ReviewTickResult> {
  const now = deps.now();
  const mode = await deps.repo.mode();
  if (!isReviewerActive(mode, now)) return { status: "inactive", mode };
  // Com a publicação automática desligada (contingência, disjuntor) ou em modo leitura, nada muda
  // sozinho: nem publicar, nem arquivar.
  if (!(await deps.flags.isEnabled("auto_publish")))
    return { status: "paused", reason: "auto_publish_off" };
  if (await deps.flags.isEnabled("read_only")) return { status: "paused", reason: "read_only" };

  const out = { published: 0, held: 0, archived: 0, skipped: 0 };
  const ids = await deps.repo.dueArticles(now, deps.batch ?? REVIEW_BATCH);
  const version = await deps.promptVersion();
  let failures = 0;
  let status: "ran" | "budget" = "ran";

  for (const id of ids) {
    const ctx = await deps.repo.decisionContext(id);
    const meta = await deps.repo.reviewMeta(id);
    const text = await deps.repo.articleText(id);
    if (!ctx || !meta || text === null) {
      out.skipped++;
      continue;
    }
    const item: ReviewItem = { ...meta, ctx, text };
    if (!isReviewable(item)) {
      out.skipped++;
      continue;
    }
    const v = await autoReview(item, { callAgent: deps.callAgent });
    if (!v.ok) {
      if (v.error.kind === "budget" || v.error.kind === "disabled") {
        status = "budget";
        break;
      }
      if (++failures >= MAX_PROVIDER_FAILURES) break;
      out.skipped++;
      continue;
    }
    failures = 0;
    const applied = await applyVerdict(deps, item, v.value, version, mode);
    if (applied === "stop") break;
    out[applied === "published" ? "published" : applied === "archived" ? "archived" : "held"]++;
  }
  return { status, mode, ...out };
}

type Applied = "published" | "held" | "archived" | "stop";

async function applyVerdict(
  deps: ReviewTickDeps,
  item: ReviewItem,
  v: ReviewVerdictOut,
  promptVersion: number | null,
  mode: ReviewerMode,
): Promise<Applied> {
  const { ctx } = item;
  const ref = `article:${ctx.articleId}`;
  const base = {
    reviewer: true,
    mode,
    verdict: v.verdict,
    degraded: v.degraded,
    reviewReason: item.reviewReason,
    dueAt: item.dueAt,
    version: ctx.version,
  };
  const record = (output: Record<string, unknown>, rationale: string, hashPart: string) =>
    deps.repo.recordDecision({
      objectRef: ref,
      step: "review",
      agentId: v.degraded ? null : "reviewer",
      promptVersion,
      inputHash: inputHash("review", ctx.version, hashPart),
      output: { ...base, ...output },
      rationale,
      recommended: typeof output.verdict === "string" ? output.verdict : v.verdict,
    });

  // Manter: o motivo do revisor vai para o motivo da revisão (a pessoa o lê na fila) e só depois
  // a decisão, para a matéria não voltar ao revisor antes de mudar.
  const hold = async (why: string, extra: Record<string, unknown> = {}): Promise<Applied> => {
    await deps.repo.setStatus(ctx.articleId, {
      status: "in_review",
      reviewReason: REVIEW_TEXT.heldPrefix(why),
    });
    await record({ ...extra, verdict: "hold", published: false }, why, "hold");
    return "held";
  };

  if (v.verdict === "hold") return hold(v.reason);

  if (v.verdict === "archive") {
    await record({ published: false }, v.reason, "archive");
    await deps.repo.setStatus(ctx.articleId, {
      status: "archived",
      reviewReason: REVIEW_TEXT.archivedPrefix(v.reason),
    });
    return "archived";
  }

  // publish: os mesmos portões do passo de publicação (disjuntor, checklist, texto cortado).
  if (deps.breaker) {
    const snap = await deps.breaker.counts(deps.now());
    const b = checkBreaker(deps.now(), snap.counts, snap.limits);
    if (b.open && b.reason) {
      const detail = { counts: snap.counts, limits: snap.limits };
      const first = await deps.breaker.trip(b.reason, detail);
      if (first)
        await deps.repo.audit({
          actor: "sistema",
          action: "breaker.trip",
          objectRef: ref,
          details: { reason: b.reason, ...detail },
        });
      return "stop";
    }
  }
  const input = await deps.repo.checkInput(ctx.articleId);
  if (!input) return "stop";
  const checklist = autoChecklist(input, { tags: ctx.tags, neighborhoods: ctx.neighborhoods });
  if (checklist.blockers.includes("no_title"))
    return hold(RULE_RATIONALE.noTitle(), { blockers: checklist.blockers });
  if (checklist.blockers.includes("no_source"))
    return hold(RULE_RATIONALE.noSource(), { blockers: checklist.blockers });
  const completeness = isComplete(input);
  if (completeness.missing.includes("body") && !endsCleanly(input.body))
    return hold(RULE_RATIONALE.truncatedBody(), { missing: completeness.missing });
  if (Object.keys(checklist.patch).length > 0)
    await deps.repo.applyChecklist(ctx.articleId, checklist.patch);

  // Corpo curto passa pelo revisor (A16): publica com o motivo registrado. Capa que não veio
  // vira cartão tipográfico (o prazo da fila já passou).
  const shortReason: ShortReason | null = completeness.missing.includes("body")
    ? "insufficient_source"
    : input.shortReason;
  const coverFallback = completeness.missing.includes("cover");
  const last = await deps.repo.latestDecision(ref, "rules");
  const publishedAt = deps.now().toISOString();
  if (coverFallback)
    await deps.repo.recordDecision({
      objectRef: ref,
      step: "image",
      agentId: null,
      promptVersion: null,
      inputHash: inputHash("image-fallback", ctx.version),
      output: { kind: "typographic", mediaId: null, fallback: "review_timeout" },
      rationale: "Capa não chegou: cartão tipográfico da editoria na publicação pelo revisor.",
      recommended: null,
    });
  await deps.repo.recordDecision({
    objectRef: ref,
    step: "review",
    agentId: "reviewer",
    promptVersion,
    rulesVersion: last?.rulesVersion ?? null,
    inputHash: inputHash("review", ctx.version, "publish"),
    output: {
      ...base,
      published: true,
      publishMode: "auto",
      publishedAt,
      shortReason,
      checklistFixed: checklist.fixed,
      coverFallback,
    },
    rationale: v.reason,
    recommended: "publish",
  });
  await deps.repo.setStatus(ctx.articleId, {
    status: "published",
    publishMode: "auto",
    publishedAt,
    rulesVersion: last?.rulesVersion ?? null,
    reviewReason: null,
    ...(shortReason !== input.shortReason ? { shortReason } : {}),
  });
  await deps.revalidate(articleTags(ctx));
  const next = { runId: "review", attempt: 1 } as const;
  await deps.queue.enqueue("pipeline", { ...next, step: "index", itemRef: ref });
  await deps.queue.enqueue("pipeline", {
    ...next,
    step: "notify",
    itemRef: `${ref}#auto_published`,
  });
  return "published";
}
