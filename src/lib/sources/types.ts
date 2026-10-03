/** Tipos puros do domínio de fontes (spec §6.1, §7.2; espelha `sources` de 0011_source_admin.sql). */

/** Camada de relevância (docs/sources-registry.md): 1 = oficial, 4 = agregador/nacional. */
export type SourceLayer = 1 | 2 | 3 | 4;

export type StatusReason =
  | "pending_activation"
  | "manual"
  | "auto_failures"
  | "robots"
  | "opt_out"
  | "legal"
  | "quality"
  | "other";

export type ImagePolicy = "none" | "licensed_only" | "with_agreement" | "reproduction";
export type RepublishPolicy = "link_only" | "summary_2_sentences";
export type Reliability = "low" | "standard" | "verified" | "primary";
export type SourceStatus = "active" | "paused" | "degraded" | "blocked";

/** Estado de ciclo de vida (status.ts): o que `transition`/`afterFetch` leem e escrevem. */
export interface SourceState {
  status: SourceStatus;
  statusReason: StatusReason | null;
  consecutiveFailures: number;
  archivedAt: string | null;
}

export type ConsumptionStrategy =
  "rss" | "atom" | "jsonfeed" | "sitemap_news" | "page_list" | "page_article";

export interface PageSelectors {
  item: string;
  link: string;
  title: string;
  date?: string;
}

export type Locality = "cuiaba" | "varzea-grande" | "mt" | "nacional";

/** Campos editáveis da fonte (§7.2). Campos operacionais do pipeline ficam fora deste tipo. */
export interface SourceConfig {
  name: string;
  displayName: string | null;
  slug: string;
  layer: SourceLayer | null;
  categories: string[];
  locality: Locality;
  reliability: Reliability;
  imagePolicy: ImagePolicy;
  republishPolicy: RepublishPolicy;
  maySoleSource: boolean;
  agreementUntil: string | null;
  agreementNote: string | null;
  termsUrl: string | null;
  strategy: ConsumptionStrategy;
  baseUrl: string;
  feedUrl: string | null;
  pageSelectors: PageSelectors | null;
  frequencyMinutes: number | null;
  rateLimitPerHour: number;
  termsMinIntervalMinutes: number | null;
  editorialScore: number;
  priority: 1 | 2 | 3;
  recPinned: boolean;
  recLocalHighlight: boolean;
  recExcluded: boolean;
  /** Fonte confiável: publica direto, sem espera, sempre citada (AUT-T2). */
  trusted: boolean;
}

export interface SourcePreviewItem {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface SourcePreview {
  finalUrl: string;
  siteName: string | null;
  description: string | null;
  strategy: ConsumptionStrategy;
  feedUrl: string | null;
  items: SourcePreviewItem[];
  droppedForInjection: number;
  termsLinks: string[];
}

/** Uma mudança de campo, usada em auditoria e nos pedidos de aprovação (critical.ts). */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}
