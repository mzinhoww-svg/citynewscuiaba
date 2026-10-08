import type { AdminReply } from "../admin/AdminStatus";

/** Resultado enxuto da busca de matéria para fixar (só o que a tela mostra). */
export interface SearchHit {
  id: string;
  title: string;
  sectionName: string;
  publishedAt: string;
  /** Capa aprovada de verdade; `null` bloqueia a fixação (R39). */
  imageSrc: string | null;
  imageAlt: string;
}

/** Prazo escolhido: botões, "até remover" ou data final (ISO). */
export type PinDurationChoice =
  "1h" | "3h" | "6h" | "12h" | "24h" | "3d" | "until_removed" | { until: string };

export interface PinPayload {
  slotKey: string;
  sectionSlug?: string;
  articleId: string;
  duration: PinDurationChoice;
  note?: string;
  /** Fixação que esta troca encerra. */
  replaceId?: string;
}

/** Ações do servidor que a tela chama (Server Actions finas sobre `src/lib/studio/featured`). */
export interface FeaturedApi {
  pin: (i: PinPayload) => Promise<AdminReply>;
  unpin: (i: { id: string }) => Promise<AdminReply>;
  reorder: (i: { slotKey: string; ids: string[] }) => Promise<AdminReply>;
  search: (q: string) => Promise<SearchHit[]>;
  /** Dispensa a pauta quente (HOT-T3): o assunto sai dos destaques e o mesmo sinal não o traz de volta. */
  dismiss: (i: { id: string }) => Promise<AdminReply>;
}
