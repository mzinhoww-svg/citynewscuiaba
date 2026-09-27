/**
 * Portas do pipeline: o domínio conversa com fila, banco e rede só por estas interfaces.
 * Implementações reais em `queue.ts` e `src/lib/db/pipeline-store.ts`; falsas em `testing/`.
 */
import type { Result } from "@/lib/result";
import type { PipelineMessage, QueueName, RawEntry, StepName } from "./types";

export interface QueuedMessage {
  msgId: number;
  /** Quantas vezes a mensagem foi lida, contando esta leitura. */
  readCt: number;
  msg: PipelineMessage;
}

/**
 * Fila do pipeline (ADR-004 com o contorno de docs/AUTONOMY.md §4): tabela `jobs` com
 * `for update skip locked`, visibilidade e contagem de leituras, igual ao pgmq.
 */
export interface Queue {
  /** `false` quando a mesma etapa do mesmo item já está na fila. */
  enqueue(queue: QueueName, msg: PipelineMessage, opts?: { delaySec?: number }): Promise<boolean>;
  readBatch(queue: QueueName, n: number, vtSec: number): Promise<QueuedMessage[]>;
  ack(queue: QueueName, msgId: number): Promise<void>;
  /** Reagenda para nova tentativa depois de `delaySec`. */
  fail(queue: QueueName, msgId: number, error: string, delaySec: number): Promise<void>;
  /** Devolve uma mensagem lida e não processada; não conta como tentativa. */
  release(queue: QueueName, msgId: number): Promise<void>;
  quarantine(queue: QueueName, item: Pick<QueuedMessage, "msgId">, error: string): Promise<void>;
  /** Move para a quarentena mensagens com `read_ct >= maxReads` que voltaram a ficar visíveis. */
  moveExhausted(queue: QueueName, maxReads: number): Promise<number>;
  pending(
    queue: QueueName,
    filter?: { runId?: string; steps?: readonly StepName[] },
  ): Promise<number>;
}

export type EventLevel = "info" | "warn" | "error" | "security";

export interface PipelineEvent {
  runId: string | null;
  step: StepName;
  itemRef: string | null;
  level: EventLevel;
  message: string;
  details?: Record<string, unknown>;
}

/** Etapa 18 (registrar): `pipeline_events`, append-only. */
export interface EventSink {
  record(events: PipelineEvent[]): Promise<void>;
}

export interface DueSource {
  slug: string;
  frequencyMinutes: number;
  lastFetchedAt: string | null;
}

export interface RunStore {
  /** Um run por janela: a segunda chamada na mesma janela devolve o run existente. */
  startRun(windowStart: Date): Promise<{ runId: string; created: boolean; fetchEnqueued: boolean }>;
  markFetchEnqueued(runId: string, count: number): Promise<void>;
  /** Run anterior ainda aberto (status `running`), se houver. */
  previousOpenRun(windowStart: Date): Promise<string | null>;
  activeSources(): Promise<DueSource[]>;
}

/** Subconjunto de `fetch` usado pelo coletor (injetável: testes nunca acessam a rede). */
export type HttpFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal; redirect?: RequestRedirect },
) => Promise<Response>;

export type SourceKind = "rss" | "sitemap" | "api" | "page" | "newsletter" | "social" | "events";
export type SourceStatus = "active" | "paused" | "degraded" | "blocked";

export interface SourceRecord {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  kind: SourceKind;
  feedUrl: string | null;
  status: SourceStatus;
  rateLimitPerHour: number;
  locality: string;
  etag: string | null;
  lastModified: string | null;
}

export interface SourcePatch {
  feedUrl?: string;
  kind?: SourceKind;
  status?: SourceStatus;
  lastError?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  lastFetchedAt?: string;
}

export type DocumentFormat = "rss" | "atom" | "rdf" | "sitemap" | "jsonfeed" | "html";

/** Documento baixado por `fetch` (um por fonte e run). */
export interface RawPayload {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
  sourceKind: SourceKind;
}

export type RawState = "new" | "valid" | "quarantine" | "extracted";

export interface RawItemRecord {
  id: string;
  runId: string;
  sourceId: string;
  state: RawState;
  payload: RawPayload;
  entries: RawEntry[] | null;
}

export interface CollectedInsert {
  rawId: string;
  sourceId: string;
  canonicalUrl: string;
  originalTitle: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  locality: string;
}

/** Acesso a banco das etapas de Coleta (fetch, validate, extract, normalize). */
export interface IngestRepo {
  sourceBySlug(slug: string): Promise<SourceRecord | null>;
  sourceById(id: string): Promise<SourceRecord | null>;
  updateSource(id: string, patch: SourcePatch): Promise<void>;
  /** Conta uma requisição na janela de 1 h; `false` quando passou do limite. */
  hitRateLimit(bucket: string, limit: number): Promise<boolean>;
  /** Idempotente por `(run, fonte)`: repetir devolve o mesmo id. */
  insertRawItem(raw: { runId: string; sourceId: string; payload: RawPayload }): Promise<string>;
  rawItem(id: string): Promise<RawItemRecord | null>;
  updateRawItem(
    id: string,
    patch: { state: RawState; entries?: RawEntry[]; error?: string },
  ): Promise<void>;
  /** Idempotente por `canonical_url`: `created = false` quando o item já existia. */
  insertCollectedItem(item: CollectedInsert): Promise<{ id: string; created: boolean }>;
}

/** Item coletado como as etapas de Entendimento (dedupe em diante) o enxergam. */
export interface CollectedItemRecord {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  /** Simhash de 64 bits sem sinal; `null` antes do dedupe. */
  simhash: bigint | null;
  embedding: number[] | null;
  duplicateOf: string | null;
  topicId: string | null;
}

export interface DedupeCandidate {
  id: string;
  simhash: bigint;
  /** Cosseno com o item; `null` quando o candidato não tem embedding. */
  cosine: number | null;
  topicId: string | null;
}

export interface TopicCandidate {
  topicId: string;
  centroid: number[];
  updatedAt: string;
}

/** Acesso a banco das etapas dedupe e cluster. */
export interface ClusterRepo {
  collectedItem(id: string): Promise<CollectedItemRecord | null>;
  saveFingerprint(id: string, f: { simhash: bigint; embedding: number[] }): Promise<void>;
  /**
   * Itens anteriores ao item (ordem `created_at, id`), não duplicados, criados desde `since`, com
   * simhash a distância ≤ `maxHamming` ou cosseno ≥ `minCosine`. O primeiro a chegar é o original.
   */
  dedupeCandidates(
    id: string,
    q: { simhash: bigint; since: Date; maxHamming: number; minCosine: number; limit: number },
  ): Promise<DedupeCandidate[]>;
  markDuplicate(id: string, originalId: string): Promise<void>;
  /** Assuntos atualizados desde `since`, os mais próximos do embedding do item primeiro. */
  topicCandidates(id: string, q: { since: Date; limit: number }): Promise<TopicCandidate[]>;
  /** Liga o item ao assunto, recalcula o centróide (média) e atualiza `updated_at`. */
  attachToTopic(id: string, topicId: string, now: Date): Promise<void>;
  /** Cria assunto com o item como semente (centróide = embedding do item); devolve o id. */
  createTopic(id: string, t: { slug: string; title: string }, now: Date): Promise<string>;
}

/** Embedding de um texto (produção: OpenRouter `/embeddings`; teste: provedor falso). */
export type Embed = (text: string) => Promise<Result<number[], string>>;

export type SourceReliability = "primary" | "verified" | "standard" | "low";

/** Item como as etapas classify e locate o enxergam. */
export interface UnderstandItem {
  id: string;
  sourceId: string;
  sourceSlug: string;
  reliability: SourceReliability;
  /** Localidade padrão da fonte (`sources.locality`). */
  sourceLocality: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  topicId: string | null;
  duplicateOf: string | null;
  quarantined: boolean;
}

/** Item de um assunto para a verificação (sem duplicados nem itens em quarentena). */
export interface TopicItem {
  id: string;
  sourceId: string;
  sourceSlug: string;
  reliability: SourceReliability;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  sectionSlug?: string | null;
}

export interface TopicBundle {
  topicId: string;
  updatedAt: string;
  items: TopicItem[];
}

/** Registro de decisão automática (`decisions`), com a versão do prompt e o hash da entrada. */
export interface DecisionRecord {
  objectRef: string;
  step: StepName;
  agentId: string | null;
  promptVersion: number | null;
  inputHash: string;
  output: Record<string, unknown>;
  rationale: string | null;
}

export interface ItemPatch {
  sectionSlug?: string;
  relevance?: number;
  sensitive?: boolean;
  locality?: string;
  neighborhood?: string | null;
}

export interface TopicPatch {
  confidence: "alta" | "média" | "baixa";
  confidenceScore: number;
  /** Só preenche a editoria quando o assunto ainda não tem uma. */
  sectionSlug?: string | null;
}

/** Acesso a banco das etapas classify, locate e verify. */
export interface UnderstandRepo {
  understandItem(id: string): Promise<UnderstandItem | null>;
  updateItem(id: string, patch: ItemPatch): Promise<void>;
  /** Tira o item do fluxo: assuntos e etapas seguintes o ignoram. */
  quarantineItem(id: string, reason: string): Promise<void>;
  /** Última decisão da etapa para o objeto com o mesmo hash de entrada (idempotência). */
  findDecision(
    objectRef: string,
    step: StepName,
    inputHash: string,
  ): Promise<DecisionRecord | null>;
  recordDecision(d: DecisionRecord): Promise<void>;
  topicBundle(topicId: string): Promise<TopicBundle | null>;
  updateTopic(topicId: string, patch: TopicPatch): Promise<void>;
}
