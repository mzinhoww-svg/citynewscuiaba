import type { Database } from "@/lib/db/types";

/** 1 Oficial, 2 Portal local, 3 Temático/Regional, 4 Nacional. */
export type SourceLayer = 1 | 2 | 3 | 4;

export type SourceStatus = Database["public"]["Enums"]["source_status"];
export type ImagePolicy = Database["public"]["Enums"]["image_policy"];
export type RepublishPolicy = Database["public"]["Enums"]["republish_policy"];
export type Reliability = Database["public"]["Enums"]["source_reliability"];

export type StatusReason =
  | "pending_activation"
  | "manual"
  | "auto_failures"
  | "robots"
  | "opt_out"
  | "legal"
  | "quality"
  | "other";

export type Locality = "cuiaba" | "varzea-grande" | "mt" | "nacional";

/** Campos editáveis da fonte (spec §7.2). `priority`: 1 Alta, 2 Normal, 3 Baixa. */
export interface SourceConfig {
  name: string;
  displayName: string | null;
  ownerId: string | null;
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
  termsMinIntervalMinutes: number | null;
  /** `null` = segue o padrão global. */
  frequencyMinutes: number | null;
  rateLimitPerHour: number;
  /** 1 a 5. */
  editorialScore: number;
  priority: 1 | 2 | 3;
}

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
