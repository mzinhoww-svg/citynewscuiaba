/**
 * Fonte de eventos no Painel de Fontes (AGM-T6, spec §5.1): configuração da coleta da Agenda
 * (`sources.kind = 'events'`), leitura do formulário de cadastro/edição e patch do que mudou.
 * Sem banco e sem rede, mas só para o servidor: valida URL com `url.ts`, que leva `pipeline/net`
 * (Node). Telas no cliente importam as constantes de `event-source-constants.ts`.
 */
import { err, ok, type Result } from "@/lib/result";
import type { SourceKind as ExtractKind } from "@/lib/agenda/types";
import { normalizePastedUrl, slugFromName } from "./url";

export type { ExtractKind };

import { EVENT_ORIGINS, EXTRACT_KINDS, type EventOrigin } from "./event-source-constants";

export { EVENT_ORIGINS, EXTRACT_KINDS, type EventOrigin };

/** Até 10 avisos para o coletor (dado para o modelo, nunca instrução) e 10 listagens extras. */
export const MAX_NOTES = 10;
export const MAX_NOTE_CHARS = 300;
export const MAX_LIST_URLS = 10;
const MAX_TEXT = 120;
const CATEGORY = /^[a-z0-9-]{1,40}$/;

export interface EventSourceConfig {
  extractKind: ExtractKind;
  origin: EventOrigin;
  /** "Confirma fatos": casa ou organizador cujo evento confirma um evento de descoberta. */
  confirms: boolean;
  notes: string[];
  listUrls: string[];
  requireCity: boolean;
  defaultVenue: string | null;
  defaultNeighborhood: string | null;
  defaultCategory: string | null;
}

export interface EventSourceInput {
  name: string;
  /** Só no cadastro (identidade da fonte); `null` na edição. */
  slug: string | null;
  baseUrl: string | null;
  config: EventSourceConfig;
}

export type EventFormField =
  | "name"
  | "baseUrl"
  | "extractKind"
  | "eventOrigin"
  | "collectorNotes"
  | "listUrls"
  | "defaultVenue"
  | "defaultNeighborhood"
  | "defaultCategory";

/** Mensagens curtas por campo (pt-BR), mostradas ao lado do campo. */
export const EVENT_FORM_ERRORS: Record<EventFormField, string> = {
  name: "Nome é obrigatório.",
  baseUrl: "Informe um endereço http ou https válido.",
  extractKind: "Escolha como os eventos são lidos.",
  eventOrigin: "Escolha a origem: órgão público ou organizador.",
  collectorNotes: `Até ${MAX_NOTES} avisos, com até ${MAX_NOTE_CHARS} caracteres cada.`,
  listUrls: `Até ${MAX_LIST_URLS} endereços http ou https válidos, um por linha.`,
  defaultVenue: `Até ${MAX_TEXT} caracteres.`,
  defaultNeighborhood: `Até ${MAX_TEXT} caracteres.`,
  defaultCategory: "Use só letras minúsculas, números e hífen.",
};

const withScheme = (v: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;

const lines = (v: string): string[] => [
  ...new Set(
    v
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  ),
];

type FormLike = Pick<FormData, "get">;
const str = (form: FormLike, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};
const bool = (form: FormLike, key: string): boolean => {
  const v = str(form, key);
  return v === "on" || v === "true" || v === "1";
};
const optional = (v: string): string | null => (v.trim() ? v.trim() : null);

/** Formulário de fonte de eventos → entrada validada ou erros por campo. */
export function parseEventSourceForm(
  form: FormLike,
  opts: { create: boolean },
): Result<EventSourceInput, Partial<Record<EventFormField, string>>> {
  const errors: Partial<Record<EventFormField, string>> = {};
  const name = str(form, "name").trim().slice(0, 200);
  if (!name) errors.name = EVENT_FORM_ERRORS.name;

  let baseUrl: string | null = null;
  if (opts.create) {
    const u = normalizePastedUrl(withScheme(str(form, "baseUrl")));
    if (u.ok && str(form, "baseUrl").trim()) baseUrl = u.value.toString();
    else errors.baseUrl = EVENT_FORM_ERRORS.baseUrl;
  }

  const kind = str(form, "extractKind");
  const extractKind = (EXTRACT_KINDS as readonly string[]).includes(kind)
    ? (kind as ExtractKind)
    : null;
  if (!extractKind) errors.extractKind = EVENT_FORM_ERRORS.extractKind;
  const originRaw = str(form, "eventOrigin");
  const origin = (EVENT_ORIGINS as readonly string[]).includes(originRaw)
    ? (originRaw as EventOrigin)
    : null;
  if (!origin) errors.eventOrigin = EVENT_FORM_ERRORS.eventOrigin;

  const notes = lines(str(form, "collectorNotes"));
  if (notes.length > MAX_NOTES || notes.some((n) => n.length > MAX_NOTE_CHARS))
    errors.collectorNotes = EVENT_FORM_ERRORS.collectorNotes;

  const listUrls: string[] = [];
  const rawUrls = lines(str(form, "listUrls"));
  if (rawUrls.length > MAX_LIST_URLS) errors.listUrls = EVENT_FORM_ERRORS.listUrls;
  for (const raw of rawUrls) {
    const u = normalizePastedUrl(withScheme(raw));
    if (!u.ok) {
      errors.listUrls = EVENT_FORM_ERRORS.listUrls;
      break;
    }
    if (!listUrls.includes(u.value.toString())) listUrls.push(u.value.toString());
  }

  const defaultVenue = optional(str(form, "defaultVenue"));
  if (defaultVenue && defaultVenue.length > MAX_TEXT)
    errors.defaultVenue = EVENT_FORM_ERRORS.defaultVenue;
  const defaultNeighborhood = optional(str(form, "defaultNeighborhood"));
  if (defaultNeighborhood && defaultNeighborhood.length > MAX_TEXT)
    errors.defaultNeighborhood = EVENT_FORM_ERRORS.defaultNeighborhood;
  const defaultCategory = optional(str(form, "defaultCategory"));
  if (defaultCategory && !CATEGORY.test(defaultCategory))
    errors.defaultCategory = EVENT_FORM_ERRORS.defaultCategory;

  if (Object.keys(errors).length > 0 || !extractKind || !origin) return err(errors);
  const slugRaw = str(form, "slug").trim().toLowerCase();
  return ok({
    name,
    slug: opts.create ? slugRaw || slugFromName(name) : null,
    baseUrl,
    config: {
      extractKind,
      origin,
      confirms: bool(form, "confirms"),
      notes,
      listUrls,
      requireCity: bool(form, "requireCity"),
      defaultVenue,
      defaultNeighborhood,
      defaultCategory,
    },
  });
}

interface EventColumns {
  extract_kind: string | null;
  event_origin: string | null;
  confirms: boolean;
  collector_notes: string[];
  list_urls: string[];
  require_city: boolean;
  default_venue: string | null;
  default_neighborhood: string | null;
  default_category: string | null;
}

/** Colunas de evento de `sources` → configuração (a constraint garante tipo e origem). */
export function eventConfigFromRow(row: EventColumns): EventSourceConfig {
  const kind = (EXTRACT_KINDS as readonly string[]).includes(row.extract_kind ?? "")
    ? (row.extract_kind as ExtractKind)
    : "ai_page";
  return {
    extractKind: kind,
    origin: row.event_origin === "official" ? "official" : "organizer",
    confirms: row.confirms,
    notes: row.collector_notes,
    listUrls: row.list_urls,
    requireCity: row.require_city,
    defaultVenue: row.default_venue,
    defaultNeighborhood: row.default_neighborhood,
    defaultCategory: row.default_category,
  };
}

/** Chaves do `SourcePatch` (camelCase) para as colunas de evento. */
export interface EventPatch {
  extractKind?: ExtractKind;
  eventOrigin?: EventOrigin;
  confirms?: boolean;
  collectorNotes?: string[];
  listUrls?: string[];
  requireCity?: boolean;
  defaultVenue?: string | null;
  defaultNeighborhood?: string | null;
  defaultCategory?: string | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Só o que mudou entre a configuração de antes e a nova. */
export function eventPatch(before: EventSourceConfig, after: EventSourceConfig): EventPatch {
  const out: EventPatch = {};
  if (before.extractKind !== after.extractKind) out.extractKind = after.extractKind;
  if (before.origin !== after.origin) out.eventOrigin = after.origin;
  if (before.confirms !== after.confirms) out.confirms = after.confirms;
  if (!same(before.notes, after.notes)) out.collectorNotes = after.notes;
  if (!same(before.listUrls, after.listUrls)) out.listUrls = after.listUrls;
  if (before.requireCity !== after.requireCity) out.requireCity = after.requireCity;
  if (before.defaultVenue !== after.defaultVenue) out.defaultVenue = after.defaultVenue;
  if (before.defaultNeighborhood !== after.defaultNeighborhood)
    out.defaultNeighborhood = after.defaultNeighborhood;
  if (before.defaultCategory !== after.defaultCategory) out.defaultCategory = after.defaultCategory;
  return out;
}
