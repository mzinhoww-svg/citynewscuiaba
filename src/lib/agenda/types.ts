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
}

export type SourceKind = "jsonld" | "ical" | "rss" | "sympla";

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
  enabled: boolean;
  /** Anotação de termos de uso e robots verificados na inclusão. */
  note?: string;
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
  dedupeKey: string;
  /** Local reconhecido (casa na lista de bairros/locais ou veio com endereço). */
  venueKnown: boolean;
}

export type RejectReason =
  | "sem_titulo"
  | "sem_data"
  | "sem_horario"
  | "data_passada"
  | "data_distante"
  | "evento_online"
  | "fora_de_cuiaba"
  | "local_desconhecido"
  | "palavrao"
  | "texto_suspeito"
  | "fora_do_perfil"
  | "link_suspeito"
  | "sem_link"
  | "sem_ano"
  | "trecho_ausente"
  | "extracao_invalida";

export type Verdict = { ok: true } | { ok: false; reasons: RejectReason[] };
