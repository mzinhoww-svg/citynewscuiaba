import type { AgeRating } from "./age-rating";
import type { EvidenceRecord } from "./extract/evidence";

/** Evento como a página ou o feed da fonte o descreve, ainda sem checagem. */
export interface RawEvent {
  title: string;
  /** ISO com fuso, "YYYY-MM-DDTHH:mm" (relógio de Cuiabá) ou só "YYYY-MM-DD" (sem horário). */
  start: string;
  end?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  url?: string | null;
  /** Preço em centavos; `0` = gratuito; ausente = não informado. */
  priceCents?: number | null;
  online?: boolean;
  category?: string | null;
  /** Imagem de divulgação (JSON-LD `image`, Tribe `image.url`, `og:image`): lida pelo código, nunca pela IA. */
  imageUrl?: string | null;
  /** Organização do evento (JSON-LD `organizer.name`, Tribe `organizer`, `organizador` com trecho). */
  organizer?: string | null;
  /** Texto da classificação etária da fonte (normalizado por `normalizeAgeRating`). */
  ageRating?: string | null;
}

export type SourceKind = "jsonld" | "ical" | "rss" | "sympla" | "tribe" | "ai_page";

/** Fonte de eventos configurável (docs/agenda-collector.md). */
export interface AgendaSource {
  /** Identificador estável (vai em `event_listings.source_id`). */
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /** `official` = órgão público; `organizer` = casa de show, produtora ou plataforma. */
  origin: "official" | "organizer";
  /** Local padrão quando o item não traz (calendário de um espaço só). */
  defaultVenue?: string;
  defaultNeighborhood?: string;
  /** Exige cidade Cuiabá ou Várzea Grande no item (listas amplas, como plataformas de ingresso). */
  requireCity?: boolean;
  /** Categoria usada quando o texto do evento não permite inferir. */
  defaultCategory?: string;
  /** `status in ('active','degraded') and archived_at is null` em `sources`. */
  enabled: boolean;
  /** UUID da fonte em `sources` (vai em `event_listings.source_ref`). */
  uuid: string;
  /** Fonte que confirma (casa, organizador): um evento de descoberta é confirmado por ela. */
  confirms: boolean;
  /** Avisos do coletor (`collector_notes`): dado para o modelo, nunca instrução. */
  notes: string[];
  /** URLs de listagem extras (`list_urls`), lidas depois de `url` no caminho `ai_page`. */
  listUrls: string[];
}

export interface NormalizedEvent {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  priceCents: number | null;
  priceUnknown: boolean;
  category: string;
  sourceUrl: string;
  sourceId: string;
  origin: "official" | "organizer";
  description: string;
  /** Identidade da linha (uma por evento real): nunca muda por confirmação nem por edição. */
  dedupeKey: string;
  /** Local reconhecido (casa na lista de bairros/locais ou veio com endereço). */
  venueKnown: boolean;
  /** UUID da fonte de origem (`sources.id`); `null` quando desconhecido. */
  sourceRef: string | null;
  /** O evento vem de uma fonte que confirma (casa, organizador). */
  confirms: boolean;
  /**
   * UUID de outra fonte que confirma e também lista este evento (confirmação entre fontes).
   * Nulo nos eventos da própria fonte que confirma: esses contam como confirmados por
   * `sources.confirms` da fonte de origem.
   */
  confirmedBySourceId: string | null;
  evidence: EvidenceRecord;
  /** Organização do evento (texto saneado), ou `null`. */
  organizer: string | null;
  /** Faixa etária da lista fechada; sem informação na fonte, `consulte`. */
  ageRating: AgeRating;
  /** URL absoluta da imagem de divulgação a registrar (ainda sem cópia), ou `null`. */
  imageUrl: string | null;
  /** Página cujo HTML trouxe a imagem e os hosts que ela referencia (regra de host da imagem). */
  imageContext: { site: string; cdnHosts: string[] } | null;
  /** Ativo no Media Registry (`event_listings.media_id`), ou `null`. */
  mediaId: string | null;
}

export const REJECT_REASONS = [
  "sem_titulo",
  "sem_data",
  "sem_horario",
  "data_passada",
  "data_distante",
  "evento_online",
  "fora_de_cuiaba",
  "local_desconhecido",
  "palavrao",
  "texto_suspeito",
  "fora_do_perfil",
  "link_suspeito",
  "sem_link",
  "sem_ano",
  "trecho_ausente",
  "extracao_invalida",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export type Verdict = { ok: true } | { ok: false; reasons: RejectReason[] };
