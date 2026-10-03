import { err, ok, type Result } from "@/lib/result";
import type { Queue } from "./ports";
import { queueFor, type PipelineMessage, type StepName } from "./types";

/**
 * Reprocessamento (architecture §4: "reenfileirar a partir de uma etapa com
 * `keepHumanDecisions`"). O Control Center escolhe o escopo (ciclo, itens ou fonte) e a etapa;
 * cada objeto do escopo vira uma mensagem da fila no formato de referência daquela etapa.
 *
 * Decisão humana (edição, aprovação, recusa ou despublicação registrada em `decisions`) nunca é
 * apagada nem alterada. Com `keepHumanDecisions` (padrão da tela), o objeto que já tem decisão
 * humana fica de fora: a automação não volta a decidir sobre ele.
 */

/** Tipo de referência que cada etapa recebe na fila (`itemRef`). */
export type RefLevel = "source" | "raw" | "item" | "topic" | "article";

const LEVEL: Partial<Record<StepName, RefLevel>> = {
  fetch: "source",
  validate: "raw",
  extract: "raw",
  dedupe: "item",
  cluster: "item",
  classify: "item",
  locate: "item",
  verify: "topic",
  summarize: "topic",
  image: "article",
  rules: "article",
  index: "article",
};

/**
 * Etapas oferecidas no reprocessamento. Ficam de fora: `tick` (use "Executar agora"),
 * `normalize` (depende da posição do item no documento; reprocesse a partir de `extract`),
 * `publish` (só a regra decide publicar: reprocesse a partir de `rules`), `notify` e as etapas
 * que rodam dentro de outras (12, 14, 16, 18; A-040).
 */
export const REPROCESS_STEPS = Object.keys(LEVEL) as StepName[];

export function stepLevel(step: StepName): RefLevel | null {
  return LEVEL[step] ?? null;
}

export interface ReprocessScope {
  runId?: string;
  itemIds?: string[];
  sourceId?: string;
}

export interface ReprocessInput {
  scope: ReprocessScope;
  fromStep: StepName;
  keepHumanDecisions: boolean;
}

export interface ReprocessOutcome {
  /** Objetos do escopo na etapa escolhida. */
  targets: number;
  enqueued: number;
  /** Com decisão humana, mantidos fora (só com `keepHumanDecisions`). */
  skippedHuman: number;
  /** A mesma etapa do mesmo objeto já estava na fila (dedupe). */
  alreadyQueued: number;
}

export interface QuarantinedMessage {
  id: number;
  message: PipelineMessage;
}

/** Máximo de objetos por pedido de reprocessamento. */
export const MAX_REPROCESS_TARGETS = 500;

export interface ReprocessRepo {
  /** Referências (`item:<id>`, `topic:<id>`…) do escopo no nível pedido, sem repetição. */
  refsFor(scope: ReprocessScope, level: RefLevel, limit: number): Promise<string[]>;
  /** Quais referências já têm decisão humana (a própria ou a da matéria do assunto). */
  humanDecided(refs: string[]): Promise<Set<string>>;
  /** Mensagens em quarentena ainda abertas. */
  quarantined(ids: number[]): Promise<QuarantinedMessage[]>;
  /** Marca como resolvidas as que ainda estão abertas; devolve quantas. */
  resolveQuarantine(ids: number[]): Promise<number>;
}

export interface ReprocessDeps {
  queue: Queue;
  repo: ReprocessRepo;
  now: () => Date;
}

/** Run das mensagens reprocessadas sem ciclo de origem: `reprocess-AAAAMMDDhhmmss` (UTC). */
export function reprocessRunRef(at: Date): string {
  return `reprocess-${at.toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
}

function hasScope(s: ReprocessScope): boolean {
  return Boolean(s.runId) || Boolean(s.sourceId) || (s.itemIds?.length ?? 0) > 0;
}

async function enqueueAll(
  deps: ReprocessDeps,
  messages: PipelineMessage[],
  keepHumanDecisions: boolean,
): Promise<ReprocessOutcome> {
  const human = keepHumanDecisions
    ? await deps.repo.humanDecided(messages.map((m) => m.itemRef))
    : new Set<string>();
  const outcome: ReprocessOutcome = {
    targets: messages.length,
    enqueued: 0,
    skippedHuman: 0,
    alreadyQueued: 0,
  };
  for (const msg of messages) {
    if (human.has(msg.itemRef)) {
      outcome.skippedHuman++;
      continue;
    }
    if (await deps.queue.enqueue(queueFor(msg.step), msg)) outcome.enqueued++;
    else outcome.alreadyQueued++;
  }
  return outcome;
}

export async function reprocess(
  deps: ReprocessDeps,
  input: ReprocessInput,
): Promise<Result<ReprocessOutcome, "invalid">> {
  const level = stepLevel(input.fromStep);
  if (!level || !hasScope(input.scope)) return err("invalid");
  const refs = await deps.repo.refsFor(input.scope, level, MAX_REPROCESS_TARGETS);
  const runId = input.scope.runId ?? reprocessRunRef(deps.now());
  const messages = [...new Set(refs)].map((itemRef): PipelineMessage => ({
    runId,
    step: input.fromStep,
    itemRef,
    attempt: 1,
  }));
  return ok(await enqueueAll(deps, messages, input.keepHumanDecisions));
}

/**
 * Falhas (O06): devolve à fila as mensagens da quarentena a partir da etapa que falhou, com a
 * tentativa zerada, e marca as devolvidas (ou já na fila) como resolvidas.
 */
export async function retryQuarantined(
  deps: ReprocessDeps,
  input: { ids: number[]; keepHumanDecisions: boolean },
): Promise<Result<ReprocessOutcome, "invalid">> {
  if (input.ids.length === 0) return err("invalid");
  const rows = await deps.repo.quarantined(input.ids.slice(0, MAX_REPROCESS_TARGETS));
  const byRef = new Map<string, number[]>();
  const messages: PipelineMessage[] = [];
  for (const r of rows) {
    const key = `${r.message.step}|${r.message.itemRef}`;
    const ids = byRef.get(key);
    if (ids) {
      ids.push(r.id);
      continue;
    }
    byRef.set(key, [r.id]);
    messages.push({ ...r.message, attempt: 1 });
  }
  const human = input.keepHumanDecisions
    ? await deps.repo.humanDecided(messages.map((m) => m.itemRef))
    : new Set<string>();
  const outcome: ReprocessOutcome = {
    targets: messages.length,
    enqueued: 0,
    skippedHuman: 0,
    alreadyQueued: 0,
  };
  const resolved: number[] = [];
  for (const msg of messages) {
    if (human.has(msg.itemRef)) {
      outcome.skippedHuman++;
      continue;
    }
    if (await deps.queue.enqueue(queueFor(msg.step), msg)) outcome.enqueued++;
    else outcome.alreadyQueued++;
    resolved.push(...(byRef.get(`${msg.step}|${msg.itemRef}`) ?? []));
  }
  if (resolved.length > 0) await deps.repo.resolveQuarantine(resolved);
  return ok(outcome);
}

/** Cursor do reprocesso de imagens: `published_at` e id da última matéria do lote. */
export interface ImageReprocessCursor {
  publishedAt: string;
  id: string;
}

/** Banco do reprocesso de imagens (UI-T16). */
export interface ImageReprocessRepo {
  /**
   * Matérias publicadas que ainda podem ganhar capa ou imagem do texto, das mais recentes às mais
   * antigas, depois de `after`. Ficam de fora: escolha ou edição de pessoa, ativo removido a pedido,
   * capa que não é de fonte, imagem do texto já gravada e assunto sem fontes de imagem suficientes.
   * `next` é o cursor do lote seguinte (`null` = acabou).
   */
  articlesNeedingImages(
    limit: number,
    after?: ImageReprocessCursor | null,
  ): Promise<{ ids: string[]; next: ImageReprocessCursor | null }>;
}

export interface ImageReprocessOutcome {
  targets: number;
  enqueued: number;
  alreadyQueued: number;
  next: ImageReprocessCursor | null;
}

/**
 * Depois da implantação da capa e da imagem no texto (spec 2026-10-02 §4.10): reenfileira o passo
 * `image` das matérias publicadas que só têm capa ou não têm imagem. O passo é idempotente e não
 * toca em escolha de pessoa nem em matéria editada por pessoa; a matéria publicada não volta a
 * passar pelas regras de publicação (a etapa `rules` ignora quem já saiu de rascunho). Chame de
 * novo com `after: next` até `next` vir `null`.
 */
export async function reprocessImages(
  deps: { queue: Queue; repo: ImageReprocessRepo; now: () => Date },
  input: { limit: number; after?: ImageReprocessCursor | null },
): Promise<ImageReprocessOutcome> {
  const limit = Math.min(Math.floor(input.limit), MAX_REPROCESS_TARGETS);
  const empty: ImageReprocessOutcome = { targets: 0, enqueued: 0, alreadyQueued: 0, next: null };
  if (!Number.isFinite(limit) || limit < 1) return empty;
  const page = await deps.repo.articlesNeedingImages(limit, input.after ?? null);
  const ids = [...new Set(page.ids)].slice(0, limit);
  const runId = reprocessRunRef(deps.now());
  const outcome = { ...empty, targets: ids.length, next: page.next };
  for (const id of ids) {
    const msg: PipelineMessage = { runId, step: "image", itemRef: `article:${id}`, attempt: 1 };
    if (await deps.queue.enqueue(queueFor("image"), msg)) outcome.enqueued++;
    else outcome.alreadyQueued++;
  }
  return outcome;
}
