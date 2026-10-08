/**
 * Prévia do teste de conexão de uma fonte de eventos (AGM-T6, spec §5.1): o painel roda a coleta
 * em ensaio (`dryRun`) só para a fonte e mostra até 5 eventos com os trechos de evidência e as
 * recusas com o motivo. A prévia é limitada (1 listagem + 5 páginas ao modelo) e não conta no
 * teto diário da Agenda, porque o ensaio não grava execução.
 */
import type { CollectReport, RejectedSample, SourceStatus } from "./collect";
import type { EvidenceRecord } from "./extract/evidence";

/** Chamadas ao modelo da prévia: 1 listagem + 5 páginas de evento. */
export const PREVIEW_AI_CALLS = 6;
/** Eventos mostrados na prévia. */
export const PREVIEW_MAX_EVENTS = 5;

export interface PreviewEvent {
  title: string;
  startsAt: string;
  venue: string;
  sourceUrl: string;
  evidence: EvidenceRecord;
}

export interface EventSourcePreviewData {
  status: SourceStatus;
  detail: string | null;
  found: number;
  approved: number;
  aiPages: number;
  events: PreviewEvent[];
  rejected: RejectedSample[];
}

/** Relatório do ensaio → prévia da fonte (`id` = slug, `uuid` = `sources.id`). */
export function previewFromReport(
  report: CollectReport,
  source: { id: string; uuid: string },
): EventSourcePreviewData {
  const rep = report.sources.find((s) => s.uuid === source.uuid || s.id === source.id);
  if (!rep)
    return {
      status: "erro",
      detail: null,
      found: 0,
      approved: 0,
      aiPages: 0,
      events: [],
      rejected: [],
    };
  const events = (report.preview ?? [])
    .filter((p) => p.sourceId === rep.id)
    .slice(0, PREVIEW_MAX_EVENTS)
    .map(({ title, startsAt, venue, sourceUrl, evidence }) => ({
      title,
      startsAt,
      venue,
      sourceUrl,
      evidence,
    }));
  return {
    status: rep.status,
    detail: rep.detail ?? null,
    found: rep.found,
    approved: rep.approved,
    aiPages: rep.aiPages,
    events,
    rejected: rep.rejectedSamples,
  };
}

export type PreviewProblemCode = "robots" | "unavailable" | "error" | "deferred" | "no_events";

/**
 * O que impede ativar a fonte de eventos (robots.txt, fonte fora do ar, erro, prévia adiada por
 * teto ou prazo, nenhum evento aprovado); `null` = pode ativar.
 */
export function previewActivationProblem(
  p: EventSourcePreviewData,
): { code: PreviewProblemCode; detail: string | null } | null {
  const detail = p.detail;
  switch (p.status) {
    case "robots":
      return { code: "robots", detail };
    case "indisponivel":
      return { code: "unavailable", detail };
    case "erro":
      return { code: "error", detail };
    case "ia_adiada":
    case "adiada":
      return { code: "deferred", detail };
    case "ok":
      // Aprovado = passou nas checagens (antes da duplicidade com o que já está guardado).
      return p.approved > 0 ? null : { code: "no_events", detail: null };
  }
}
