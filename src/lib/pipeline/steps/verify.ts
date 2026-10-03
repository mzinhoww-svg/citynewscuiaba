import type { CallAgent } from "@/lib/ai/call-agent";
import { VerifySchema, type VerifyOutput } from "@/lib/ai/schemas/verify";
import type { AiError } from "@/lib/ai/types";
import { computeConfidence, type Confidence } from "@/lib/confidence";
import { normalizePlace } from "@/lib/geo/neighborhoods";
import { err, ok, type Result } from "@/lib/result";
import { isDubious } from "@/lib/rules/dubious";
import { anySourceTrusted } from "@/lib/sources/trusted";
import type { TopicBundle, TopicItem } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import type { UnderstandStepDeps } from "./classify";
import { aiStepError, inputHash } from "./understanding";

export type { TopicBundle, TopicItem } from "../ports";

export type SourceRole = "primary" | "secondary" | "context";
type Conflict = NonNullable<VerifyOutput["conflict"]>;

export interface VerifyResult {
  topicId: string;
  mainFact: string;
  independentSources: number;
  primarySources: number;
  centralConflict: boolean;
  /** O agente marcou o assunto como extremamente duvidoso ou sem atribuição possível. */
  dubious: boolean;
  /** Alguma fonte do assunto é confiável (A6): publica sem espera, sempre citada. */
  sourceTrusted: boolean;
  /** Conflito confirmado pela regra (`null` sem conflito central). */
  conflict: Conflict | null;
  roles: { id: string; role: SourceRole }[];
  hoursSinceUpdate: number;
  confidence: Confidence;
}

const SCALE: Record<string, number> = {
  mil: 1e3,
  milhao: 1e6,
  milhoes: 1e6,
  mi: 1e6,
  bilhao: 1e9,
  bilhoes: 1e9,
  bi: 1e9,
};

/**
 * Números citados no texto, normalizados: "R$ 60 milhões" = 60 000 000, "1.200" = 1 200,
 * "2,1%" = 2,1. Base da confirmação de conflito numérico.
 */
export function extractNumbers(text: string): number[] {
  const t = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const re =
    /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(mil|milhoes|milhao|mi|bilhoes|bilhao|bi)\b)?/g;
  const out: number[] = [];
  for (const m of t.matchAll(re)) {
    const int = Number((m[1] ?? "0").replace(/\./g, ""));
    const frac = m[2] ? Number(`0.${m[2]}`) : 0;
    const scale = m[3] ? (SCALE[m[3]] ?? 1) : 1;
    out.push(Math.round((int + frac) * scale * 1e6) / 1e6);
  }
  return out;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
const itemText = (i: TopicItem) => `${i.title}\n${i.excerpt ?? ""}`;

/**
 * Regra que confirma o conflito apontado pelo agente: ao menos dois itens diferentes do assunto,
 * cada valor presente no texto do item citado e valores divergentes entre si. Número compara pelo
 * valor normalizado; data e local, pelo texto sem acento.
 */
export function confirmConflict(conflict: Conflict, items: readonly TopicItem[]): boolean {
  const byId = new Map(items.map((i) => [i.id, i]));
  const positions = conflict.positions.filter((p) => byId.has(p.id));
  if (positions.length < 2 || new Set(positions.map((p) => p.id)).size < 2) return false;

  if (conflict.kind === "number") {
    const values: number[] = [];
    for (const p of positions) {
      const n = extractNumbers(p.value)[0];
      if (n === undefined) return false;
      if (!extractNumbers(itemText(byId.get(p.id)!)).some((x) => same(x, n))) return false;
      values.push(n);
    }
    return values.some((v) => !same(v, values[0]!));
  }

  const values: string[] = [];
  for (const p of positions) {
    const v = normalizePlace(p.value);
    if (!v || !` ${normalizePlace(itemText(byId.get(p.id)!))} `.includes(` ${v} `)) return false;
    values.push(v);
  }
  return new Set(values).size >= 2;
}

const TASK =
  "Verifique o assunto: fato principal, papel de cada item e conflito central (número, data ou local do fato principal que diverge entre itens), citando o valor exato de cada item. Marque dubious=true só se o conteúdo for extremamente duvidoso (fato que não se sustenta, texto incoerente) e unattributable=true se o fato não puder ser atribuído a nenhuma fonte.";

/**
 * Verificação de um assunto (etapa 10): fontes independentes, primárias (confiabilidade `primary`
 * da fonte, nunca só a palavra do agente) e conflito central apontado pelo agente e confirmado
 * pela regra de extração. A confiança sai de `computeConfidence` (spec §6.3).
 */
export function createVerifyTopic(deps: { callAgent: CallAgent }) {
  return async (
    bundle: TopicBundle,
    now: Date,
    signal?: AbortSignal,
  ): Promise<Result<VerifyResult, AiError>> => {
    const items = bundle.items;
    const system = [
      "Itens do assunto (id: fonte, confiabilidade):",
      ...items.map((i) => `- ${i.id}: ${i.sourceSlug} (${i.reliability})`),
    ].join("\n");
    const r = await deps.callAgent(
      "verify",
      { system, data: items.map((i) => ({ id: i.id, text: itemText(i) })), task: TASK },
      VerifySchema,
      { signal },
    );
    if (!r.ok) return r;

    const agentRoles = new Map(r.value.roles.map((x) => [x.id, x.role]));
    const roles = items.map((i) => ({
      id: i.id,
      role: (i.reliability === "primary"
        ? "primary"
        : agentRoles.get(i.id) === "context"
          ? "context"
          : "secondary") as SourceRole,
    }));
    const independentSources = new Set(items.map((i) => i.sourceId)).size;
    const primarySources = new Set(
      items.filter((i) => i.reliability === "primary").map((i) => i.sourceId),
    ).size;
    const centralConflict = r.value.conflict ? confirmConflict(r.value.conflict, items) : false;

    const times = items
      .map((i) => Date.parse(i.publishedAt ?? ""))
      .filter((t) => Number.isFinite(t));
    const latest = times.length > 0 ? Math.max(...times) : Date.parse(bundle.updatedAt);
    const hoursSinceUpdate = Number.isFinite(latest)
      ? Math.max(0, (now.getTime() - latest) / 3600_000)
      : Number.NaN;

    return ok({
      topicId: bundle.topicId,
      mainFact: r.value.mainFact,
      independentSources,
      primarySources,
      centralConflict,
      dubious: isDubious(r.value),
      sourceTrusted: anySourceTrusted(items),
      conflict: centralConflict ? r.value.conflict : null,
      roles,
      hoursSinceUpdate,
      confidence: computeConfidence({
        independentSources,
        primarySources,
        centralConflict,
        hoursSinceUpdate,
      }),
    });
  };
}

/** Editoria mais frequente entre os itens classificados (desempate: ordem de chegada). */
function majoritySection(items: readonly TopicItem[]): string | null {
  const counts = new Map<string, number>();
  for (const i of items)
    if (i.sectionSlug) counts.set(i.sectionSlug, (counts.get(i.sectionSlug) ?? 0) + 1);
  let best: string | null = null;
  for (const [slug, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = slug;
  return best;
}

/**
 * Etapa 10 no pipeline: verifica o assunto, grava confiança e editoria no assunto e a decisão.
 * Idempotente por (assunto, revisão = conjunto de itens, versão do prompt).
 */
export function createVerifyStep(deps: UnderstandStepDeps): StepHandler {
  const verifyTopic = createVerifyTopic(deps);
  return async (msg, ctx) => {
    const topicId = /^topic:(\S+)$/.exec(msg.itemRef)?.[1];
    if (!topicId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const bundle = await deps.repo.topicBundle(topicId);
    if (!bundle) return err(stepError.notFound(`assunto ${topicId} não encontrado`));
    if (bundle.items.length === 0) return ok([]);

    const version = await deps.promptVersion("verify");
    const revision = bundle.items
      .map((i) => i.id)
      .sort()
      .join(",");
    const hash = inputHash("verify", version, revision);
    const next = [nextMessage(msg, "summarize", msg.itemRef)];
    if (await deps.repo.findDecision(msg.itemRef, "verify", hash)) return ok(next);

    const v = await verifyTopic(bundle, deps.now(), ctx?.signal);
    if (!v.ok) return err(aiStepError(v.error, "verificação", { topicId }));
    await deps.repo.updateTopic(topicId, {
      confidence: v.value.confidence.level,
      confidenceScore: v.value.confidence.score,
      sectionSlug: majoritySection(bundle.items),
    });
    await deps.repo.recordDecision({
      objectRef: msg.itemRef,
      step: "verify",
      agentId: "verify",
      promptVersion: version,
      inputHash: hash,
      output: { ...v.value, hoursSinceUpdate: Math.round(v.value.hoursSinceUpdate * 100) / 100 },
      rationale: v.value.confidence.reasons.join(" "),
    });
    return ok(next);
  };
}
