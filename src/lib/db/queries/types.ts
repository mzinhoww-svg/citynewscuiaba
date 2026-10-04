import type { HomeModule } from "@/lib/admin/home-layout";
import type { ConfidenceLevel } from "@/lib/confidence";
import type { ImageKind, Label } from "@/lib/labels";
import type { ComputedSignals } from "@/lib/ranking";

/**
 * Tipos de leitura do portal público (P1-T1). Os componentes recebem estes dados prontos,
 * sem conhecer o banco. Datas em ISO 8601; a formatação fica em src/lib/format/date.ts.
 */

/** Falha de leitura: sem variáveis do Supabase (portal sem banco) ou banco fora do ar. */
export type QueryError = { kind: "unconfigured" } | { kind: "unavailable"; message: string };

export type LabelSet = { shown: Label[]; hidden: Label[] };

export interface SectionRef {
  slug: string;
  name: string;
}

export interface ArticleImage {
  src: string;
  alt: string;
  kind: ImageKind;
  credit?: string;
  /** Autor da foto, quando a fonte informa (política reproduction). */
  author?: string;
  /** Página da matéria da fonte (`media_assets.page_url`), para "Ver original"; ausente = sem link. */
  originUrl?: string;
}

/** Imagem dentro do texto: entra depois do parágrafo `position` (a partir de 1) do corpo. */
export interface ArticleInlineImage extends ArticleImage {
  position: number;
}

/** Matéria em card (home, editoria, assunto). */
export interface ArticleSummary {
  id: string;
  slug: string;
  href: string;
  kind: "original" | "normalized";
  title: string;
  dek: string;
  section: SectionRef;
  status: "published" | "updated";
  publishMode: "human" | "auto" | null;
  publishedAt: string;
  updatedAt: string;
  labels: LabelSet;
  confidence: { level: ConfidenceLevel; score: number };
  sourceCount: number;
  readMinutes: number;
  aiSummary: string[] | null;
  byline: string;
  reviewer?: string;
  /** Capa. Os cards usam só ela. */
  image?: ArticleImage;
  /** Segunda imagem (outra fonte), dentro do texto da matéria; os cards a ignoram. */
  inlineImage?: ArticleInlineImage;
  topicId: string | null;
  urgent: boolean;
  sponsored: boolean;
  /** Escopo regional (A15); ausente em dado antigo. */
  newsScope?: "cuiaba" | "mt" | "national";
  nationalCommotion?: boolean;
}

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  /** Linha final "Com informações de {fonte}", com os links das fontes. */
  | { type: "credit"; text: string; sources: { name: string; url: string }[] };

export interface ArticleSource {
  name: string;
  sourceSlug: string;
  role: "primary" | "secondary" | "context";
  confirmed: boolean;
  url: string;
  title: string;
  publishedAt: string | null;
}

/** Nota pública de atualização ou correção (UpdateNote, CorrectionNote). */
export interface ArticleNote {
  kind: "update" | "correction";
  note: string;
  at: string;
  version: number;
}

/** Matéria completa (P03). */
export interface ArticleView extends ArticleSummary {
  body: ArticleBlock[];
  sources: ArticleSource[];
  /** Versões publicadas (histórico público). */
  versions: number;
  notes: ArticleNote[];
  agentId: string | null;
  /** Assinatura de pessoa da redação (false = Redação CityNews / agente). */
  authorIsPerson: boolean;
  topic: TopicRef | null;
  /** Mesmo assunto primeiro, depois 2 da editoria. */
  related: ArticleSummary[];
  /** Título e descrição de SEO do Estúdio (metadados da página); `null` usa título e linha fina. */
  seoTitle: string | null;
  seoDescription: string | null;
}

/** Uma versão publicada no histórico público (P04). */
export interface PublicVersion {
  number: number;
  kind: "edit" | "update" | "correction";
  note: string | null;
  at: string;
  title: string;
  dek: string;
  body: ArticleBlock[];
}

export interface ArticleHistory {
  slug: string;
  href: string;
  title: string;
  section: SectionRef;
  versions: PublicVersion[];
}

export type ArticleLookup = ArticleView | { gone: true; reason: string } | null;

/** Item de outro veículo: só título original, data, resumo permitido e link (spec §4). */
export interface AggregatedView {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceSlug: string;
  publishedAt: string | null;
  summary: string | null;
  sectionSlug: string | null;
  topicId: string | null;
  labels: LabelSet;
}

export type TopicState = "em_apuracao" | "confirmado" | "corrigido" | "encerrado";

export interface TopicRef {
  slug: string;
  title: string;
  state: TopicState;
}

export interface TopicView extends TopicRef {
  id: string;
  href: string;
  summary: string | null;
  confidence: { level: ConfidenceLevel; score: number };
  sectionSlug: string | null;
  updatedAt: string;
  articleCount: number;
  sourceCount: number;
  /** Capa aprovada de uma matéria do assunto (home: "Assuntos em destaque" só exibe com foto, R40). */
  cover?: ArticleImage;
}

export interface TimelineEntry {
  at: string;
  title: string;
  /** Matéria do CityNews (link interno) ou item de outro veículo (link externo). */
  kind: "citynews" | "aggregated";
  href: string;
  sourceName: string;
}

export interface TopicDetail extends TopicView {
  articles: ArticleSummary[];
  aggregated: AggregatedView[];
  agreements: string[];
  disagreements: string[];
  unconfirmed: string[];
  faq: { q: string; a: string }[];
  /** Quem revisou o resumo por IA do assunto. */
  summaryReviewer?: string;
  /** Mais recente primeiro. */
  timeline: TimelineEntry[];
}

export interface EventView {
  id: string;
  slug: string;
  href: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  priceCents: number | null;
  isFree: boolean;
  ageRating: string;
  category: string;
  accessibility: string | null;
  origin: "official" | "organizer" | "reader";
  description: string | null;
  /** Quando a organização (ou a fonte oficial) confirmou as informações. */
  confirmedAt: string | null;
  /** Link do original (eventos coletados da internet); `null` nos cadastrados na casa. */
  sourceUrl: string | null;
  /** Preço não informado pela fonte: nunca vale como gratuito. */
  priceUnknown: boolean;
}

export interface CollectionView {
  id: string;
  slug: string;
  href: string;
  title: string;
  description: string;
  itemCount: number;
}

/** Correção publicada (P24, /correcoes). */
export interface PublicCorrection {
  id: string;
  kind: "correction" | "right_of_reply";
  note: string;
  publishedAt: string;
  article: { title: string; href: string } | null;
}

/** Coleção com capa e itens em ordem (P08). */
export type CollectionEntry =
  | { kind: "article"; item: ArticleSummary }
  | { kind: "topic"; item: TopicView }
  | { kind: "event"; item: EventView }
  | { kind: "aggregated"; item: AggregatedView };

export interface CollectionDetail extends CollectionView {
  curator?: string;
  updatedAt: string;
  items: CollectionEntry[];
}

/** Atalho de editoria no Explorar (P07). */
export interface SectionShortcut {
  slug: string;
  name: string;
  href: string;
  todayCount: number;
}

export interface ExploreData {
  generatedAt: string;
  sections: SectionShortcut[];
  topics: TopicView[];
  collections: CollectionView[];
  /** `explorar.topo`: matéria em evidência (pino ou automático, com capa); `null` sem candidata. */
  featured: ArticleSummary | null;
  /** Mais lidas dos últimos 7 dias (sem repetir a matéria em evidência). */
  mostRead: ArticleSummary[];
}

export interface SourceView {
  slug: string;
  name: string;
  href: string;
  locality: string;
}

export interface HomeData {
  generatedAt: string;
  urgent: ArticleSummary | null;
  lead: ArticleSummary | null;
  /** `home.destaques`: até 3 matérias com capa, sem repetir a manchete (FD-T2). */
  highlights: ArticleSummary[];
  now: ArticleSummary[];
  topics: TopicView[];
  collections: CollectionView[];
  events: EventView[];
  sectionBlocks: { section: SectionRef; articles: ArticleSummary[] }[];
  mostRead: ArticleSummary[];
  sponsored: ArticleSummary | null;
  sources: SourceView[];
  aggregated: AggregatedView[];
  /** Ordem e ativação dos módulos abaixo da primeira dobra (A06, `home_layouts`). */
  modules: HomeModule[];
}

/**
 * Fonte com sinais de ranking normalizados (P2-T5) e dados do card (DESIGN.md §6).
 * `reach` é a soma de sessões em 30 dias: a interface só mostra o aproximado (`formatReach`).
 */
export type SourceEntry = ComputedSignals & {
  id: string;
  name: string;
  href: string;
  baseUrl: string;
  categories: string[];
  reliability: "primary" | "verified" | "standard" | "low";
  itemsToday: number;
  /** Último item publicado pela fonte (ou última coleta). */
  lastUpdatedAt: string | null;
};
