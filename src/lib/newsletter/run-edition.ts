import {
  AGENDA_LIST,
  buildAgendaEdition,
  weekendRange,
  type EditionEvent,
  type EditionItem,
  type WeekendRange,
} from "./agenda-edition";
import { dayStart } from "@/lib/format/date";
import { renderEditionEmail } from "./email-html";
import { buildRecipients, type EmailSender } from "./sender";

/**
 * Rodada semanal da "Agenda do fim de semana" (ARD-T5, spec §6 e §8), sem banco: o job
 * (`/api/jobs/newsletter-agenda`) injeta leitura, gravação, envio e auditoria. O pg_cron chama
 * na quinta 11h45 (Cuiabá) e de novo na sexta 10h45 (`newsletter-agenda-retry`, 0203).
 *
 * - Nunca publicada e com `< 3` eventos: `draft` com o motivo; nada sai no site nem por e-mail.
 * - Publicada uma vez, fica no ar: rodadas seguintes atualizam os itens e preservam
 *   `published_at`, mesmo com menos de 3 (ou nenhum) evento; aí não há envio.
 * - Pronta: grava `published` (a página web sai) e chama o envio. Sem provedor (B-005):
 *   `aguardando_provedor`, que é o estado final de exibição até existir provedor. Enviada:
 *   `sent` com `sent_at`.
 * - Falha do envio (ou sem segredo para o link de descadastro): a edição fica `published`
 *   (a página continua no ar), o motivo vai para a auditoria e para o relatório, e a rodada de
 *   sexta tenta de novo. `failed` não é usado: esconderia a página pública (RLS).
 * - Prazo do envio = fim do fim de semana: com `now` depois de domingo 23:59:59, o envio nunca
 *   é chamado (`sendError: "expired"`), estado terminal para o envio.
 * - Idempotente por `(list, edition_date)`; edição já `sent` nunca é reescrita nem reenviada.
 */

export type EditionStatus = "draft" | "published" | "aguardando_provedor" | "sent" | "failed";

export interface StoredEdition {
  id: string;
  status: EditionStatus;
  publishedAt: string | null;
}

export interface EditionWrite {
  list: string;
  editionDate: string;
  subject: string;
  html: string;
  text: string;
  items: EditionItem[];
  status: "draft" | "published" | "aguardando_provedor";
  publishedAt: string | null;
}

export interface EditionRunDeps {
  now: Date;
  /** Reprocessar a edição de outra semana ("AAAA-MM-DD"); sem ele, a semana de `now`. */
  editionDate?: string;
  siteUrl: string;
  /** Segredo dos links assinados (descadastro); `null` em produção sem segredo. */
  secret: string | null;
  sender: EmailSender;
  /** Eventos públicos que tocam o fim de semana (RLS: confirmado e não retirado). */
  loadEvents(range: WeekendRange): Promise<EditionEvent[]>;
  find(list: string, editionDate: string): Promise<StoredEdition | null>;
  /** Grava a edição; `null` quando ela já foi enviada (não reescreve). */
  save(row: EditionWrite): Promise<StoredEdition | null>;
  setStatus(id: string, status: "aguardando_provedor" | "sent", at: string): Promise<void>;
  /** E-mails confirmados e não descadastrados da lista. */
  recipients(list: string): Promise<string[]>;
  audit(objectRef: string, details: Record<string, unknown>): Promise<void>;
  revalidate(): Promise<void>;
}

export interface EditionRunReport {
  status: EditionStatus;
  editionDate: string;
  items: number;
  /** Edição já enviada: nada mudou. */
  skipped?: true;
  reason?: string;
  recipients?: number;
  sendError?: string;
}

export async function runAgendaEdition(deps: EditionRunDeps): Promise<EditionRunReport> {
  const range = weekendRange(deps.editionDate ? dayStart(deps.editionDate) : deps.now);
  const date = range.editionDate;
  const ref = `newsletter:${AGENDA_LIST}:${date}`;
  const existing = await deps.find(AGENDA_LIST, date);
  if (existing?.status === "sent")
    return { status: "sent", editionDate: date, items: 0, skipped: true };

  const edition = buildAgendaEdition(await deps.loadEvents(range), range, {
    siteUrl: deps.siteUrl,
  });
  const rendered = renderEditionEmail(edition, { siteUrl: deps.siteUrl });
  const nowIso = deps.now.toISOString();
  const ready = edition.status === "ready";
  const wasPublic = !!existing?.publishedAt;
  const expired = deps.now.getTime() > range.end.getTime();
  const willSend = ready && !expired;
  const status: EditionWrite["status"] =
    !ready && !wasPublic
      ? "draft"
      : !willSend && existing?.status === "aguardando_provedor"
        ? "aguardando_provedor"
        : "published";
  const saved = await deps.save({
    list: AGENDA_LIST,
    editionDate: date,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    items: edition.items,
    status,
    publishedAt: status === "draft" ? null : (existing?.publishedAt ?? nowIso),
  });
  if (!saved) return { status: "sent", editionDate: date, items: 0, skipped: true };
  const count = edition.items.length;

  const report: Pick<EditionRunReport, "status" | "recipients" | "sendError" | "reason"> = willSend
    ? await send(deps, saved.id, rendered, nowIso)
    : {
        status,
        ...(edition.reason ? { reason: edition.reason } : {}),
        ...(ready && expired ? { sendError: "expired" } : {}),
      };
  await deps.audit(ref, {
    status: report.status,
    items: count,
    ...(willSend ? { provider: deps.sender.name } : {}),
    ...(report.reason ? { reason: report.reason } : {}),
    ...(report.recipients !== undefined ? { recipients: report.recipients } : {}),
    ...(report.sendError ? { sendError: report.sendError } : {}),
  });
  await deps.revalidate();
  return { editionDate: date, items: count, ...report };
}

async function send(
  deps: EditionRunDeps,
  id: string,
  rendered: ReturnType<typeof renderEditionEmail>,
  nowIso: string,
): Promise<Pick<EditionRunReport, "status" | "recipients" | "sendError">> {
  const list = buildRecipients(await deps.recipients(AGENDA_LIST), deps.siteUrl, deps.secret);
  if (!list.ok) return { status: "published", sendError: list.error };
  const sent = await deps.sender.send(rendered, list.value);
  if (!sent.ok)
    return { status: "published", recipients: list.value.length, sendError: sent.error.message };
  await deps.setStatus(id, sent.value.status, nowIso);
  return { status: sent.value.status, recipients: list.value.length };
}
