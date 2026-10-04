import type { NewsScope } from "@/lib/geo/news-scope";

/** Chave de uma posição de destaque (`home.lead`, `editoria.lead`...). Vem da tabela, não do código. */
export type SlotKey = string;

export type FeaturedPage = "home" | "editoria" | "explorar";

export interface Slot {
  key: SlotKey;
  page: FeaturedPage;
  label: string;
  capacity: number;
}

/** Posições cadastradas por padrão (espelho do seed da migration 0090). */
export const DEFAULT_SLOTS: readonly Slot[] = [
  { key: "home.lead", page: "home", label: "Início · manchete", capacity: 1 },
  { key: "home.destaques", page: "home", label: "Início · destaques", capacity: 3 },
  { key: "editoria.lead", page: "editoria", label: "Editoria · destaque", capacity: 1 },
  { key: "explorar.topo", page: "explorar", label: "Explorar · topo", capacity: 1 },
];

/** Linha de `featured_items`: fixação manual do admin (ou `hot`, no futuro). */
export interface Pin {
  id: string;
  slotKey: SlotKey;
  /** Só `editoria.lead`: a editoria da posição. */
  sectionSlug: string | null;
  articleId: string;
  position: number;
  startsAt: Date;
  /** `null` = fica até o admin remover (R28 do dono: manual não expira sozinho). */
  endsAt: Date | null;
  endedAt: Date | null;
}

/**
 * Matéria publicada que pode disputar uma posição. `hasCover` = capa aprovada de verdade (foto,
 * reprodução com crédito ou ilustração aprovada), nunca cartão tipográfico (R39).
 */
export interface Candidate {
  id: string;
  publishedAt: Date;
  sectionSlug: string;
  /** 0 a 1 (`articles.confidence_score`). */
  confidenceScore: number;
  /** Fontes independentes da matéria. */
  sourceCount: number;
  sponsored: boolean;
  hasCover: boolean;
  newsScope: NewsScope | null;
  nationalCommotion: boolean;
}

export type FeaturedSource = "manual" | "hot" | "automatic";

export interface Resolved {
  items: Candidate[];
  /** `manual` se algum pino ocupa a posição; `hot` (pauta quente) ou `automatic` caso contrário. */
  source: FeaturedSource;
  /** Quando a posição deve ser reavaliada (fim do pino ou da janela); `null` = até remover. */
  until: Date | null;
  /** Candidatas melhores que as escolhidas que ficaram de fora por falta de capa (R39): buscar imagem. */
  needsImage: string[];
  /** Pinos ativos que não puderam ocupar a posição (saiu do ar, patrocinada, sem capa). */
  dropped: { pinId: string; articleId: string; reason: "gone" | "ineligible" | "no_cover" }[];
}
