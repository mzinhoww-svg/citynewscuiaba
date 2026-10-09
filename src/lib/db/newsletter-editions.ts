import "server-only";
import { z } from "zod";
import type { AgendaAuditAction } from "@/lib/audit/actions";
import type { DbClient, PublicCache } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import type { EditionItem } from "@/lib/newsletter/agenda-edition";
import type { EditionStatus, EditionWrite, StoredEdition } from "@/lib/newsletter/run-edition";
import type { Result } from "@/lib/result";
import { many, one, readPublic } from "./queries/run";
import type { QueryError } from "./queries/types";

/**
 * Edições da newsletter (`newsletter_editions`, ARD-T1/ARD-T5). A escrita é do job, com service
 * role; a leitura pública usa o cliente anônimo, e a RLS já só devolve edição `published`,
 * `aguardando_provedor` ou `sent` (rascunho e falha nunca aparecem no site).
 */

/** Autor das escritas automáticas da Agenda na auditoria. */
export const AGENDA_SYSTEM_ACTOR = "system:agenda";

/** Cache das leituras públicas: o job revalida a tag `newsletter`; no máximo 5 min de atraso. */
export const NEWSLETTER_CACHE: PublicCache = { tags: ["newsletter"], revalidate: 300 };

const STATUSES = ["draft", "published", "aguardando_provedor", "sent", "failed"] as const;
const statusOf = (s: string): EditionStatus => STATUSES.find((x) => x === s) ?? "draft";

const itemSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayLabel: z.string(),
  slug: z.string(),
  title: z.string(),
  url: z.string(),
  when: z.string(),
  where: z.string(),
  price: z.string(),
  origin: z.string().nullable(),
});

/** Itens gravados em `items` (jsonb). Item fora do formato fica de fora (nunca quebra a página). */
export function parseEditionItems(raw: unknown): EditionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = itemSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

type Row = { id: string; status: string; published_at: string | null };
const stored = (r: Row): StoredEdition => ({
  id: r.id,
  status: statusOf(r.status),
  publishedAt: r.published_at,
});

export async function findEdition(
  db: DbClient,
  list: string,
  editionDate: string,
): Promise<StoredEdition | null> {
  const r = await db
    .from("newsletter_editions")
    .select("id, status, published_at")
    .eq("list", list)
    .eq("edition_date", editionDate)
    .maybeSingle();
  if (r.error) throw new Error(`newsletter_editions: ${r.error.message}`);
  return r.data ? stored(r.data) : null;
}

/**
 * Grava a edição por `(list, edition_date)`. Edição já `sent` nunca é reescrita: a atualização
 * tem `status <> 'sent'` no filtro e devolve `null` quando não tocou em nada. Duas rodadas ao
 * mesmo tempo: a segunda inserção bate no `unique` e vira atualização.
 */
export async function saveEdition(db: DbClient, w: EditionWrite): Promise<StoredEdition | null> {
  const values = {
    subject: w.subject,
    html: w.html,
    text: w.text,
    items: w.items as unknown as NonNullable<Json>,
    status: w.status,
    published_at: w.publishedAt,
    sent_at: null,
  };
  const update = async () => {
    const r = await db
      .from("newsletter_editions")
      .update(values)
      .eq("list", w.list)
      .eq("edition_date", w.editionDate)
      .neq("status", "sent")
      .select("id, status, published_at")
      .maybeSingle();
    if (r.error) throw new Error(`newsletter_editions: ${r.error.message}`);
    return r.data ? stored(r.data) : null;
  };
  if (await findEdition(db, w.list, w.editionDate)) return update();
  const ins = await db
    .from("newsletter_editions")
    .insert({ list: w.list, edition_date: w.editionDate, ...values })
    .select("id, status, published_at")
    .single();
  if (ins.error?.code === "23505") return update();
  if (ins.error) throw new Error(`newsletter_editions: ${ins.error.message}`);
  return stored(ins.data);
}

/** Resultado do envio; nunca mexe em edição já `sent`. */
export async function setEditionStatus(
  db: DbClient,
  id: string,
  status: "aguardando_provedor" | "sent",
  at: string,
): Promise<void> {
  const r = await db
    .from("newsletter_editions")
    .update({ status, sent_at: status === "sent" ? at : null })
    .eq("id", id)
    .neq("status", "sent");
  if (r.error) throw new Error(`newsletter_editions: ${r.error.message}`);
}

const PAGE = 1000;

/** E-mails confirmados e não descadastrados da lista (`newsletter_subscriptions`). */
export async function listRecipients(db: DbClient, list: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await db
      .from("newsletter_subscriptions")
      .select("email")
      .eq("list", list)
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null)
      .order("email", { ascending: true })
      .range(from, from + PAGE - 1);
    if (r.error) throw new Error(`newsletter_subscriptions: ${r.error.message}`);
    out.push(...(r.data ?? []).map((x) => x.email));
    if ((r.data ?? []).length < PAGE) return out;
  }
}

/** Registro da ação automática em `audit_log` (só o service role grava direto). */
export async function agendaSystemAudit(
  db: DbClient,
  action: AgendaAuditAction,
  objectRef: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor: AGENDA_SYSTEM_ACTOR,
    action,
    object_ref: objectRef,
    details: details as NonNullable<Json>,
  });
  if (error) throw new Error(`agenda audit: ${error.message}`);
}

/** Edição pública (página `/newsletter/agenda/{data}` e amostra de `/newsletter`). */
export interface PublicEdition {
  editionDate: string;
  subject: string;
  status: EditionStatus;
  publishedAt: string | null;
  items: EditionItem[];
}

const PUBLIC_COLUMNS = "edition_date, subject, status, published_at, items";
type PublicRow = {
  edition_date: string;
  subject: string;
  status: string;
  published_at: string | null;
  items: Json;
};
const toPublic = (r: PublicRow): PublicEdition => ({
  editionDate: r.edition_date,
  subject: r.subject,
  status: statusOf(r.status),
  publishedAt: r.published_at,
  items: parseEditionItems(r.items),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Edição pública da lista pela data da sexta; `null` quando não existe ou é rascunho. */
export async function getPublicEdition(
  list: string,
  editionDate: string,
): Promise<Result<PublicEdition | null, QueryError>> {
  return readPublic(async (db) => {
    if (!DATE.test(editionDate)) return null;
    const row = await db
      .from("newsletter_editions")
      .select(PUBLIC_COLUMNS)
      .eq("list", list)
      .eq("edition_date", editionDate)
      .maybeSingle()
      .then(one);
    return row ? toPublic(row) : null;
  }, NEWSLETTER_CACHE);
}

/** Última edição pública da lista (a mais recente pela data). */
export async function getLatestPublicEdition(
  list: string,
): Promise<Result<PublicEdition | null, QueryError>> {
  return readPublic(async (db) => {
    const rows = await db
      .from("newsletter_editions")
      .select(PUBLIC_COLUMNS)
      .eq("list", list)
      .order("edition_date", { ascending: false })
      .limit(1)
      .then(many);
    return rows[0] ? toPublic(rows[0]) : null;
  }, NEWSLETTER_CACHE);
}
