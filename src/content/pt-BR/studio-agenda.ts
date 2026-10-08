/**
 * Textos do Estúdio para a coleta da Agenda (AGM-T6 e seguintes): como a fonte é lida, origem,
 * situação da execução e motivo de cada recusa. Só Estúdio e Control Center (aqui "IA" pode
 * aparecer); a tela pública usa `portal-agenda.ts`.
 */
import type { SourceStatus as RunStatus } from "@/lib/agenda/collect";
import type { RejectReason, SourceKind as ExtractKind } from "@/lib/agenda/types";

/** Tipo de extração (`sources.extract_kind`). */
export const EXTRACT_KIND_TEXT: Record<ExtractKind, string> = {
  jsonld: "Dados estruturados da página (JSON-LD)",
  ical: "Calendário iCal",
  rss: "Feed RSS",
  sympla: "Lista de eventos da Sympla",
  tribe: "API de eventos do WordPress (The Events Calendar)",
  ai_page: "Leitura da página com IA",
};

/** Origem do evento (`sources.event_origin`). */
export const EVENT_ORIGIN_TEXT: Record<"official" | "organizer", string> = {
  official: "Órgão público",
  organizer: "Organizador, casa ou plataforma",
};

/** Situação da fonte numa execução da coleta. */
export const RUN_STATUS_TEXT: Record<RunStatus, string> = {
  ok: "Ok",
  robots: "Bloqueada pelo robots.txt",
  indisponivel: "Fonte indisponível",
  erro: "Erro na coleta",
  ia_adiada: "Adiada: teto ou prazo da IA",
  adiada: "Adiada: prazo da execução",
};

/** Motivo de recusa de um evento coletado, em texto (nunca só o código). */
export const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  sem_titulo: "Sem título",
  sem_data: "Sem data",
  sem_horario: "Sem horário",
  data_passada: "Data já passou",
  data_distante: "Data distante demais",
  evento_online: "Evento on-line",
  fora_de_cuiaba: "Fora de Cuiabá e Várzea Grande",
  local_desconhecido: "Local desconhecido",
  palavrao: "Linguagem imprópria",
  texto_suspeito: "Texto suspeito na página",
  fora_do_perfil: "Fora do perfil da Agenda",
  link_suspeito: "Link suspeito",
  sem_link: "Sem link para o evento",
  sem_ano: "Data sem ano na página",
  trecho_ausente: "Trecho de evidência não encontrado na página",
  extracao_invalida: "Leitura da página inválida",
};

/** Campo do evento sustentado por um trecho da página (evidência). */
export const EVIDENCE_FIELD_TEXT = {
  titulo: "Título",
  data: "Data",
  horario: "Horário",
  local: "Local",
  cidade: "Cidade",
  preco: "Preço",
  organizador: "Organizador",
} as const;

/** Onde o modelo viu o ano da data. */
export const EVIDENCE_YEAR_TEXT = {
  corpo: "ano no texto da página",
  url: "ano no endereço da página",
  ausente: "sem ano na página",
} as const;
