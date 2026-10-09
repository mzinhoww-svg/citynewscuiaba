import {
  AGENDA_LIST,
  buildAgendaEdition,
  weekendRange,
  type EditionEvent,
  type EditionItem,
  type WeekendRange,
} from "./agenda-edition";
import { renderEditionEmail } from "./email-html";
import { buildRecipients, type EmailSender } from "./sender";

/**
 * Rodada semanal da "Agenda do fim de semana" (ARD-T5, spec §6 e §8), sem banco: o job
 * (`/api/jobs/newsletter-agenda`) injeta leitura, gravação, envio e auditoria.
 *
 * - `< 3` eventos: grava `draft` com o motivo; nada é publicado nem enviado.
 * - Pronta: grava `published` (a página web sai) e chama o envio. Sem provedor:
 *   `aguardando_provedor`. Enviada: `sent` com `sent_at`.
 * - Falha do envio (ou sem segredo para o link de descadastro): a edição fica `published`
 *   (a página continua no ar) e o motivo vai para a auditoria e para o relatório; a próxima
 *   rodada tenta de novo. `failed` não é usado aqui porque esconderia a página pública (RLS).
 * - Idempotente por `(list, edition_date)`: rodar de novo na mesma semana reescreve a edição;
 *   edição já `sent` nunca é reescrita nem reenviada.
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
  status: "draft" | "published";
  publishedAt: string | null;
}

export interface EditionRunDeps {
  now: Date;
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
  const range = weekendRange(deps.now);
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
  const saved = await deps.save({
    list: AGENDA_LIST,
    editionDate: date,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    items: edition.items,
    status: ready ? "published" : "draft",
    publishedAt: ready ? (existing?.publishedAt ?? nowIso) : null,
  });
  if (!saved) return { status: "sent", editionDate: date, items: 0, skipped: true };
  const count = edition.items.length;

  if (!ready) {
    await deps.audit(ref, { status: "draft", reason: edition.reason, items: count });
    await deps.revalidate();
    return { status: "draft", editionDate: date, items: count, reason: edition.reason };
  }

  const report = await send(deps, saved.id, rendered, nowIso);
  await deps.audit(ref, {
    status: report.status,
    items: count,
    provider: deps.sender.name,
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
