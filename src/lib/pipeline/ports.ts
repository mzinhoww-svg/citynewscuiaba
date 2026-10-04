/**
 * Portas do pipeline: o domínio conversa com fila, banco e rede só por estas interfaces.
 * Implementações reais em `queue.ts` e `src/lib/db/pipeline-store.ts`; falsas em `testing/`.
 */
import type { Result } from "@/lib/result";
import type { ImagePolicy } from "@/lib/media/types";
import type { RuleSet } from "@/lib/rules";
import type { StatusReason } from "@/lib/sources/types";
import type { ArticleCheck, ChecklistPatch, ShortReason } from "./steps/auto-checklist";
import type { JobStep, PipelineMessage, QueueName, RawEntry, StepName } from "./types";

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
  /**
   * `false` quando a mesma chave já está na fila. A chave padrão é `(etapa, item)` (`dedupeKey`);
   * `opts.dedupeKey` troca a chave (run manual de "Coletar agora", D-F21).
   */
  enqueue(
    queue: QueueName,
    msg: PipelineMessage,
    opts?: { delaySec?: number; dedupeKey?: string },
  ): Promise<boolean>;
  readBatch(queue: QueueName, n: number, vtSec: number): Promise<QueuedMessage[]>;
  ack(queue: QueueName, msgId: number): Promise<void>;
  /** Reagenda para nova tentativa depois de `delaySec`. */
  fail(queue: QueueName, msgId: number, error: string, delaySec: number): Promise<void>;
  /** Devolve uma mensagem lida e não processada; não conta como tentativa. */
  release(queue: QueueName, msgId: number): Promise<void>;
  quarantine(queue: QueueName, item: Pick<QueuedMessage, "msgId">, error: string): Promise<void>;
  /**
   * Move para a quarentena mensagens com `read_ct >= maxReads` que voltaram a ficar visíveis e as
   * devolve (`msg = null` se a mensagem guardada for inválida).
   */
  moveExhausted(queue: QueueName, maxReads: number): Promise<ExhaustedMessage[]>;
  pending(
    queue: QueueName,
    filter?: { runId?: string; steps?: readonly JobStep[]; itemRef?: string },
  ): Promise<number>;
}

export interface ExhaustedMessage {
  msg: PipelineMessage | null;
  error: string;
}

export type EventLevel = "info" | "warn" | "error" | "security";

export interface PipelineEvent {
  runId: string | null;
  step: JobStep;
  itemRef: string | null;
  level: EventLevel;
  message: string;
  details?: Record<string, unknown>;
}

/** Etapa 18 (registrar): `pipeline_events`, append-only. */
export interface EventSink {
  record(events: PipelineEvent[]): Promise<void>;
}

/** Fonte coletável (`active` ou `degraded`, não arquivada) como os ticks a enxergam. */
export interface DueSource {
  id: string;
  slug: string;
  status: SourceStatus;
  /** 1 Alta, 2 Normal, 3 Baixa (D-F8). */
  priority: number;
  /** Score editorial 1–5 (D-F7): desempate da ordem de coleta (D-F9). */
  editorialScore: number;
  /** `null` = padrão global (`app_settings`, D-F14). */
  frequencyMinutes: number | null;
  /** `consumption.robots.crawlDelaySec` (eleva a frequência efetiva, §7.8). */
  crawlDelaySec: number | null;
  termsMinIntervalMinutes: number | null;
  rateLimitPerHour: number;
  lastFetchedAt: string | null;
}

export type RunTrigger = "cron" | "fast" | "manual";

export interface StartedRun {
  runId: string;
  created: boolean;
  fetchEnqueued: boolean;
}

export interface RunStore {
  /** Run `cron` da janela de 30 min: a segunda chamada na mesma janela devolve o existente. */
  startRun(windowStart: Date): Promise<StartedRun>;
  /** Run `fast` da janela de 10 min (via rápida, §7.8); mesmo contrato de `startRun`. */
  startFastRun(windowStart: Date): Promise<StartedRun>;
  /** Run `manual` ("Coletar agora", D-F21): sempre novo, nunca reaproveita a janela. */
  startManualRun(sourceId: string): Promise<{ runId: string }>;
  /**
   * Grava `stats.fetch_enqueued` (e detalhes, como `skipped` do tick rápido) mesclando nas
   * estatísticas existentes, numa só instrução e só se ainda não estiver marcado: `false` = outro
   * tick concorrente já marcou (nada é sobrescrito).
   */
  markFetchEnqueued(
    runId: string,
    count: number,
    extra?: Record<string, unknown>,
  ): Promise<boolean>;
  /** Run `cron` anterior ainda aberto (status `running`), se houver. */
  previousOpenRun(windowStart: Date): Promise<string | null>;
  /**
   * Fontes `active` e `degraded`, sem arquivadas, na ordem de coleta: `priority` asc,
   * `editorial_score` desc, `slug` (D-F9).
   */
  activeSources(): Promise<DueSource[]>;
  /** `app_settings.sources.default_frequency_minutes` (padrão 30). */
  defaultFrequency(): Promise<number>;
  /** `app_settings.sources.fast_lane_max` (padrão 10). */
  fastLaneMax(): Promise<number>;
  /** `started_at` do run `cron` mais recente (watchdog), ou `null` sem nenhum. */
  lastStartedAt(): Promise<string | null>;
  /** `started_at` do run `fast` mais recente, ou `null` sem nenhum. */
  lastFastStartedAt(): Promise<string | null>;
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
  /** `sources.status_reason` (pausa automática = `auto_failures`, D-F18). */
  statusReason: StatusReason | null;
  consecutiveFailures: number;
  rateLimitPerHour: number;
  locality: string;
  etag: string | null;
  lastModified: string | null;
  /** `sources.consumption` como veio do banco (validado por `consumptionSchema` na leitura). */
  consumption: unknown;
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

/** Estado de ciclo de vida gravado pelo `fetch` (`afterFetch`, D-F18). */
export interface SourceStatePatch {
  status?: SourceStatus;
  statusReason?: StatusReason | null;
  consecutiveFailures?: number;
}

/**
 * Linha de `source_health_daily` (`record_source_fetch`): `ok`, `not_modified` e `failed` contam
 * uma coleta; `items` só soma itens novos (etapa normalize).
 */
export type SourceFetchRecord = "ok" | "not_modified" | "failed" | "items";

export type DocumentFormat = "rss" | "atom" | "rdf" | "sitemap" | "jsonfeed" | "html";

/** Documento baixado por `fetch` (um por fonte e run). */
export interface RawPayload {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
  sourceKind: SourceKind;
  /**
   * Validadores da coleta condicional. Só vão para a fonte depois do `validate` (ou seja, depois
   * que o bruto e a mensagem seguinte existem): uma queda no meio não troca a próxima tentativa
   * por um 304 sem item.
   */
  etag?: string | null;
  lastModified?: string | null;
  /**
   * `true` quando o `fetch` leu só o prefixo do documento (`prefixBytes`, sitemap anual): o corpo
   * termina no meio de uma `<url>` e é reparado por `repairTruncatedSitemap` antes de validar.
   */
  truncated?: boolean;
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

/** Item coletado como o `enrich` o lê (só o necessário para decidir e aplicar o enriquecimento). */
export interface EnrichableItem {
  id: string;
  sourceId: string;
  canonicalUrl: string;
  originalTitle: string;
  excerpt: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
}

/** Campos que o `enrich` pode corrigir em `collected_items`; o que não vier não é tocado. */
export interface EnrichmentPatch {
  originalTitle?: string;
  excerpt?: string;
  publishedAt?: string;
  imageUrl?: string;
}

/** Acesso a banco das etapas de Coleta (fetch, validate, extract, normalize, enrich). */
export interface IngestRepo {
  sourceBySlug(slug: string): Promise<SourceRecord | null>;
  sourceById(id: string): Promise<SourceRecord | null>;
  updateSource(id: string, patch: SourcePatch): Promise<void>;
  /** Conta uma requisição na janela de 1 h; `false` quando passou do limite. */
  hitRateLimit(bucket: string, limit: number): Promise<boolean>;
  /** `ingest_runs.trigger` do run (`null` se o run não existe). */
  runTrigger(runId: string): Promise<RunTrigger | null>;
  /**
   * `claim_source_fetch` (D-F29): `true` se nenhuma coleta da fonte começou desde `since` (início
   * da janela de 10 min), ou se a última foi deste mesmo run (nova tentativa).
   */
  claimFetch(sourceId: string, runId: string, since: Date): Promise<boolean>;
  /**
   * Resultado final de uma coleta (`ok`, `not_modified`, `failed`) na saúde diária, uma vez por
   * (fonte, run) (`record_source_fetch_once`): `false` = já contado neste run, e o chamador não
   * aplica `afterFetch` de novo.
   */
  recordFetchOnce(
    sourceId: string,
    runId: string,
    outcome: Exclude<SourceFetchRecord, "items">,
    latencyMs: number | null,
    error: string | null,
  ): Promise<boolean>;
  /** `record_source_fetch`: soma na saúde diária sem dedupe (itens novos do normalize). */
  recordFetch(
    sourceId: string,
    outcome: SourceFetchRecord,
    latencyMs: number | null,
    itemsNew: number,
    error: string | null,
  ): Promise<void>;
  /**
   * Grava o estado de ciclo de vida só se a fonte ainda estiver `active`/`degraded` e não
   * arquivada: uma pausa humana no meio da coleta nunca é desfeita pelo pipeline.
   */
  applySourceState(id: string, patch: SourceStatePatch): Promise<void>;
  /** Notificação do Control Center com dedupe (`notify_once`). */
  notifyOnce(n: NotificationInput, windowSec: number): Promise<boolean>;
  /** Idempotente por `(run, fonte)`: repetir devolve o mesmo id. */
  insertRawItem(raw: { runId: string; sourceId: string; payload: RawPayload }): Promise<string>;
  rawItem(id: string): Promise<RawItemRecord | null>;
  updateRawItem(
    id: string,
    patch: { state: RawState; entries?: RawEntry[]; error?: string },
  ): Promise<void>;
  /**
   * Idempotente por `canonical_url`: `created = false` quando o item já existia. `pending` = o item
   * ainda não avançou (sem classificação, não duplicado, fora da quarentena): a etapa devolve a
   * próxima mensagem de novo e o dedupe da fila evita repetição.
   */
  insertCollectedItem(
    item: CollectedInsert,
  ): Promise<{ id: string; created: boolean; pending: boolean }>;
  /** Item coletado para o `enrich` (`null` se sumiu). */
  collectedForEnrich(id: string): Promise<EnrichableItem | null>;
  /** Aplica o enriquecimento (só os campos presentes); idempotente. */
  applyEnrichment(id: string, patch: EnrichmentPatch): Promise<void>;
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
export type Embed = (
  text: string,
  opts?: { signal?: AbortSignal },
) => Promise<Result<number[], string>>;

export type SourceReliability = "primary" | "verified" | "standard" | "low";
export type RepublishPolicy = "link_only" | "summary_2_sentences";

/** Item como as etapas classify e locate o enxergam. */
export interface UnderstandItem {
  id: string;
  sourceId: string;
  sourceSlug: string;
  reliability: SourceReliability;
  /** Localidade padrão da fonte (`sources.locality`). */
  sourceLocality: string;
  /** Política de republicação da fonte: resumo próprio só com `summary_2_sentences`. */
  republishPolicy: RepublishPolicy;
  title: string;
  /** Texto da fonte (nunca público): só entrada do pipeline e da IA. */
  excerpt: string | null;
  /** Resumo próprio do CityNews (até 2 frases), o único texto público do agregado. */
  summary: string | null;
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
  /** `sources.trusted`; ausente (dado antigo) vale o padrão por confiabilidade. */
  trusted?: boolean;
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
  /** `review`: decisão do revisor automático (fora das 20 etapas, AUT-T6). */
  step: StepName | "review";
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
  /** Grava o resumo próprio do agregado (`collected_items.summary`). */
  saveItemSummary(id: string, summary: string): Promise<void>;
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
    /** `sources.base_url`: a imagem só é baixada desse domínio (ou subdomínio). */
    baseUrl: string;
    imagePolicy: ImagePolicy;
    /** `sources.agreement_until` (data ISO) ou `null`. */
    agreementUntil: string | null;
    rateLimitPerHour: number;
  };
}

/** Imagem já ligada à matéria (capa ou imagem do texto). */
export interface MediaSlot {
  mediaId: string;
  sourceId: string | null;
  originUrl: string | null;
  kind: MediaAssetRecord["kind"];
  status: MediaAssetRecord["status"];
  /** dHash da imagem, quando conhecido (compara com a candidata do outro papel). */
  phash: bigint | null;
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
  /** Capa atual (`article_media.role = 'cover'`), mesmo se removida a pedido (status `blocked`). */
  cover: MediaSlot | null;
  /** Imagem do texto atual (`role = 'inline'`). */
  inline: MediaSlot | null;
  /** Parágrafos do corpo (documento doc → paragraph); define a posição da imagem do texto. */
  bodyParagraphs: number;
  /** Alguma imagem foi escolhida por pessoa (`chosen_by` fora de `pipeline*`): nunca é trocada. */
  humanMedia: boolean;
  /** A matéria tem versão de pessoa: o reprocesso de imagem não toca nela. */
  humanEdited: boolean;
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
  /**
   * Liga o ativo à matéria como capa ou imagem do texto (`position` = parágrafo depois do qual
   * entra, só no papel `inline`). Idempotente: o mesmo par ou o mesmo papel já ocupado não muda.
   */
  linkArticleMedia(
    articleId: string,
    mediaId: string,
    rationale: string,
    chosenBy: string,
    slot?: { role: "cover" | "inline"; position?: number },
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
  /** O agente `verify` marcou o assunto como extremamente duvidoso. */
  dubious: boolean;
  /** Alguma fonte do assunto é confiável (`sources.trusted`). */
  sourceTrusted: boolean;
  /** Bairros do dicionário citados nos itens do assunto. */
  neighborhoods: string[];
  /** Municípios apontados pelo localizador nos itens (`collected_items.locality`). */
  municipalities: string[];
  /** Localidades cadastradas das fontes do assunto. */
  sourceLocalities: string[];
  /** Comoção nacional marcada na matéria (`articles.national_commotion`). */
  nationalCommotion: boolean;
}

export interface StatusPatch {
  status: ArticleStatus;
  /** Matéria curta publicada porque as fontes não trazem conteúdo (R41). */
  shortReason?: ShortReason | null;
  /** Escopo da notícia (A15), gravado pela etapa de regras. */
  newsScope?: "cuiaba" | "mt" | "national";
  nationalCommotion?: boolean;
  /** Rebaixa (false) ou marca (true) a matéria como urgente. */
  urgent?: boolean;
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
  /** Matéria como o checklist e o portão de completude a enxergam (AUT-T4). */
  checkInput(articleId: string): Promise<ArticleCheck | null>;
  /** Grava o que o checklist automático consertou (SEO, taxonomia, texto alternativo da capa). */
  applyChecklist(articleId: string, patch: ChecklistPatch): Promise<void>;
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
