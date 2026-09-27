/**
 * Portas do pipeline: o domínio conversa com fila, banco e rede só por estas interfaces.
 * Implementações reais em `queue.ts` e `src/lib/db/pipeline-store.ts`; falsas em `testing/`.
 */
import type { Result } from "@/lib/result";
import type { ImagePolicy } from "@/lib/media/types";
import type { RuleSet } from "@/lib/rules";
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
  /** `started_at` do run mais recente (watchdog), ou `null` sem nenhum. */
  lastStartedAt(): Promise<string | null>;
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
  /** Versão das regras usada (decisões de publicação). */
  rulesVersion?: number | null;
  /** Rota recomendada pela regra (`publish`, `review`…). */
  recommended?: string | null;
  /** Decisão humana que desfaz ou confirma a automática (ex.: `unpublish`). */
  humanDecision?: string | null;
  humanId?: string | null;
}

export interface ItemPatch {
  sectionSlug?: string;
  /** Etiquetas do `classify` (temas sensíveis, imagem gerada, regras). */
  tags?: string[];
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

/** Chaves de `feature_flags` lidas pelo pipeline. */
export type FlagKey = "auto_publish" | "read_only" | "ai_enabled" | "image_reproduction_enabled";

/**
 * `feature_flags`. Falha fechada: flag ausente ou erro de leitura = desligada (nada publica
 * sozinho, nenhuma imagem de terceiros é reproduzida).
 */
export interface Flags {
  isEnabled(key: FlagKey): Promise<boolean>;
}

/** Item do assunto de uma matéria, com a fonte e a política de imagem dela. */
export interface MediaSourceItem {
  itemId: string;
  title: string;
  imageUrl: string | null;
  /** URL canônica da matéria original (link do crédito). */
  pageUrl: string;
  author: string | null;
  source: {
    id: string;
    slug: string;
    name: string;
    imagePolicy: ImagePolicy;
    /** `sources.agreement_until` (data ISO) ou `null`. */
    agreementUntil: string | null;
    rateLimitPerHour: number;
  };
}

/** Matéria como a etapa de imagem a enxerga. */
export interface MediaContext {
  articleId: string;
  topicId: string | null;
  title: string;
  sectionSlug: string;
  /** `sections.autonomy_category`. */
  category: string;
  sensitive: boolean;
  tags: string[];
  /** A matéria já tem imagem escolhida (idempotência). */
  hasMedia: boolean;
  /** Itens do assunto: primárias primeiro, depois os mais recentes. */
  items: MediaSourceItem[];
}

export interface MediaAssetRecord {
  id: string;
  kind: "original" | "reproduction" | "licensed" | "illustrative" | "ai_generated";
  storagePath: string;
  originUrl: string | null;
  status: "pending" | "approved" | "blocked";
  width: number | null;
  height: number | null;
  credit: string | null;
  sourceId: string | null;
  tags: string[];
}

/** Cópia de imagem de terceiro, com proveniência (A-010). */
export interface NewMediaAsset {
  kind: "original" | "reproduction";
  storagePath: string;
  originUrl: string;
  pageUrl: string;
  sourceId: string;
  sourceName: string;
  author: string | null;
  license: string;
  /** Autor da foto (crédito); o rótulo exibe "REPRODUÇÃO · Fonte · Autor". */
  credit: string | null;
  allowedUse: string;
  width: number;
  height: number;
  /** dHash sem sinal. */
  phash: bigint;
  sha256: string;
  contentType: string;
  risk: "baixo" | "medio" | "alto";
  provenance: Record<string, unknown>;
}

/** Acesso a banco da etapa de imagem (13 e 14) e da remoção de reproduções. */
export interface MediaRepo extends Pick<IngestRepo, "hitRateLimit"> {
  mediaContext(articleId: string): Promise<MediaContext | null>;
  /** Asset com a mesma URL de origem, de qualquer status (bloqueado = removido a pedido). */
  assetByOrigin(originUrl: string): Promise<MediaAssetRecord | null>;
  /** Distâncias do hash perceptual até assets não bloqueados de outras origens (≤ `maxDistance`). */
  phashNeighbors(phash: bigint, maxDistance: number, excludeOrigin: string): Promise<number[]>;
  /** Acervo ilustrativo aprovado, com alguma das etiquetas. */
  archiveCandidates(tags: string[], limit: number): Promise<MediaAssetRecord[]>;
  insertAsset(a: NewMediaAsset): Promise<string>;
  linkArticleMedia(
    articleId: string,
    mediaId: string,
    rationale: string,
    chosenBy: string,
  ): Promise<void>;
  recordDecision(d: DecisionRecord): Promise<void>;
  asset(id: string): Promise<MediaAssetRecord | null>;
  /** Reproduções ativas (não bloqueadas) de uma fonte. */
  reproductionsOfSource(sourceId: string): Promise<MediaAssetRecord[]>;
  /** Bloqueia o asset (sai do portal) e devolve as matérias que o usavam. */
  blockAsset(id: string, reason: string, at: Date): Promise<{ articleIds: string[] }>;
  audit(entry: {
    actor: string;
    action: string;
    objectRef: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}

/** Invalida o cache das páginas (`revalidateTag`, architecture §8). */
export type Revalidate = (tags: string[]) => Promise<void>;

export type ArticleStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "updated"
  | "archived"
  | "unpublished";
export type ConfidenceLevel = "alta" | "média" | "baixa";

/** Item do assunto como a redação o enxerga. */
export interface DraftItem extends TopicItem {
  sourceName: string;
  canonicalUrl: string;
  tags: string[];
  sensitive: boolean;
}

/** Assunto pronto para as etapas 11 e 12 (resumo, título e linha fina). */
export interface DraftContext {
  topic: {
    id: string;
    slug: string;
    title: string;
    sectionSlug: string | null;
    confidence: ConfidenceLevel;
    confidenceScore: number;
  };
  items: DraftItem[];
  /** Saída da última verificação (`decisions`, etapa verify). */
  verify: { roles?: { id: string; role: string }[]; centralConflict?: boolean } | null;
  /** Matéria do pipeline para o assunto, se já existe. */
  article: {
    id: string;
    status: ArticleStatus;
    publishMode: "human" | "auto" | null;
    humanEdited: boolean;
    version: number;
  } | null;
}

export interface DraftInput {
  topicId: string;
  slug: string;
  sectionSlug: string;
  title: string;
  dek: string;
  /** Documento do editor: doc → paragraph (com `attrs.citations`) → text. */
  body: Record<string, unknown>;
  aiSummary: string[] | null;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  status: "draft" | "in_review";
  aiFallback: boolean;
  reviewReason: string | null;
  sources: { itemId: string; role: "primary" | "secondary" | "context" }[];
}

/** Matéria como as etapas de regra, publicação e índice a enxergam. */
export interface DecisionContext {
  articleId: string;
  slug: string;
  topicId: string | null;
  status: ArticleStatus;
  publishMode: "human" | "auto" | null;
  sectionSlug: string;
  /** `sections.autonomy_category`. */
  category: string;
  title: string;
  urgent: boolean;
  aiFallback: boolean;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  /** Número da última versão (revisão da matéria). */
  version: number;
  humanEdited: boolean;
  independentSources: number;
  primarySources: number;
  tags: string[];
  sensitive: boolean;
  centralConflict: boolean;
  imageApproved: boolean;
}

export interface StatusPatch {
  status: ArticleStatus;
  publishMode?: "auto" | null;
  publishedAt?: string;
  rulesVersion?: number | null;
  reviewReason?: string | null;
}

export type NotificationChannel = "control_center" | "oncall_email";

export interface NotificationInput {
  kind: string;
  channel: NotificationChannel;
  severity: "info" | "warn" | "critical";
  objectRef: string;
  dedupeKey: string;
  title: string;
  body: string;
}

/** Acesso a banco das etapas 11 a 20 e da despublicação. */
export interface PublishRepo {
  draftContext(topicId: string): Promise<DraftContext | null>;
  /** Cria ou atualiza a matéria do assunto, as fontes e uma versão `ai`. */
  saveDraft(d: DraftInput): Promise<{ articleId: string; version: number }>;
  decisionContext(articleId: string): Promise<DecisionContext | null>;
  setStatus(articleId: string, patch: StatusPatch): Promise<void>;
  /** Texto indexável da matéria (título, linha fina e corpo). */
  articleText(articleId: string): Promise<string | null>;
  indexArticle(articleId: string, embedding: number[] | null): Promise<void>;
  findDecision(
    objectRef: string,
    step: StepName,
    inputHash: string,
  ): Promise<DecisionRecord | null>;
  latestDecision(objectRef: string, step: StepName): Promise<DecisionRecord | null>;
  recordDecision(d: DecisionRecord): Promise<void>;
  /** Grava a notificação se não houver outra igual (chave e canal) na janela. */
  notifyOnce(n: NotificationInput, windowSec: number): Promise<boolean>;
  audit(entry: {
    actor: string;
    action: string;
    objectRef: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}

/** Regras ativas no banco (`rules.active`). Erro = nenhuma, várias ou corpo inválido. */
export interface RulesSource {
  activeRules(): Promise<Result<RuleSet, string>>;
}
