import { z } from "zod";
import { consumptionSchema, sourceConfigSchema, type ConsumptionConfig } from "./schema";
import type { SourceConfig } from "./types";
import { normalizePastedUrl } from "./url";

/**
 * Leitura dos formulários do painel de fontes (FS-T6). Os campos têm o nome do `SourceConfig`
 * (camelCase). Só entra na alteração o campo que veio no formulário; o resto fica como está.
 *
 * Convenções para as telas:
 * - `categories`: um valor por editoria (`getAll`) ou separados por vírgula; sem nenhum, envie
 *   `categoriesPresent=1` para limpar a lista.
 * - Caixa de seleção booleana (`maySoleSource`): envie um `hidden` "false" antes do checkbox
 *   "true"; vale o último valor.
 * - Campo opcional vazio (`""`) vira `null`; `frequencyMinutes` vazio ou `default` = padrão global.
 */

export type FieldErrors = Record<string, string>;

const NULLABLE_TEXT = [
  "displayName",
  "ownerId",
  "termsUrl",
  "agreementUntil",
  "agreementNote",
] as const;
const REQUIRED_TEXT = [
  "name",
  "locality",
  "reliability",
  "imagePolicy",
  "republishPolicy",
] as const;
const NULLABLE_NUMBER = ["layer", "termsMinIntervalMinutes", "frequencyMinutes"] as const;
const REQUIRED_NUMBER = ["rateLimitPerHour", "editorialScore", "priority"] as const;

const last = (form: FormData, key: string): string | null => {
  const all = form.getAll(key).filter((v): v is string => typeof v === "string");
  return all.length === 0 ? null : (all[all.length - 1] ?? null);
};

/** Valor de texto do formulário, ou `undefined` se o campo não veio. */
export function textOf(form: FormData, key: string): string | undefined {
  const v = last(form, key);
  return v === null ? undefined : v;
}

function numberOf(raw: string): number | null {
  const t = raw.trim();
  if (t === "" || t === "default") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export interface ParsedConfig {
  patch: Partial<SourceConfig>;
  fieldErrors: FieldErrors;
}

/** Campos de `SourceConfig` que vieram no formulário, já validados pelo schema de cada campo. */
export function parseConfigFields(form: FormData): ParsedConfig {
  const draft: Record<string, unknown> = {};
  for (const key of REQUIRED_TEXT) {
    const v = last(form, key);
    if (v !== null) draft[key] = v.trim();
  }
  for (const key of NULLABLE_TEXT) {
    const v = last(form, key);
    if (v !== null) draft[key] = v.trim() === "" ? null : v.trim();
  }
  for (const key of REQUIRED_NUMBER) {
    const v = last(form, key);
    if (v !== null) draft[key] = v.trim() === "" ? Number.NaN : Number(v);
  }
  for (const key of NULLABLE_NUMBER) {
    const v = last(form, key);
    if (v !== null) draft[key] = numberOf(v);
  }
  const maySole = last(form, "maySoleSource");
  if (maySole !== null)
    draft.maySoleSource = maySole === "true" || maySole === "on" || maySole === "1";
  if (form.has("categories") || form.has("categoriesPresent")) {
    draft.categories = form
      .getAll("categories")
      .filter((v): v is string => typeof v === "string")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const shape = sourceConfigSchema.shape as Record<string, z.ZodType>;
  const patch: Record<string, unknown> = {};
  const fieldErrors: FieldErrors = {};
  for (const [key, value] of Object.entries(draft)) {
    const schema = shape[key];
    if (!schema) continue;
    const r = schema.safeParse(value);
    if (r.success) patch[key] = r.data;
    else fieldErrors[key] = r.error.issues[0]?.message ?? "Valor inválido.";
  }
  return { patch: patch as Partial<SourceConfig>, fieldErrors };
}

export interface ParsedExtras {
  baseUrl?: string;
  feedUrl?: string | null;
  kind?: "rss" | "sitemap" | "api" | "page";
  consumption?: ConsumptionConfig;
  /** `true` marca os termos como revisados agora; `false` limpa a revisão. */
  termsReviewed?: boolean;
  fieldErrors: FieldErrors;
}

const KINDS = ["rss", "sitemap", "api", "page"] as const;

/** Endereços, tipo e consumo da fonte (não fazem parte de `SourceConfig`). */
export function parseSourceExtras(form: FormData): ParsedExtras {
  const out: ParsedExtras = { fieldErrors: {} };
  const base = last(form, "baseUrl");
  if (base !== null) {
    const u = normalizePastedUrl(base);
    if (u.ok) out.baseUrl = u.value.toString();
    else out.fieldErrors.baseUrl = "Informe um endereço válido, com http ou https.";
  }
  const feed = last(form, "feedUrl");
  if (feed !== null) {
    if (feed.trim() === "") out.feedUrl = null;
    else {
      const u = normalizePastedUrl(feed);
      if (u.ok) out.feedUrl = u.value.toString();
      else out.fieldErrors.feedUrl = "Informe um endereço de feed válido, com http ou https.";
    }
  }
  const kind = last(form, "kind");
  if (kind !== null) {
    if ((KINDS as readonly string[]).includes(kind)) out.kind = kind as (typeof KINDS)[number];
    else out.fieldErrors.kind = "Escolha o tipo de coleta.";
  }
  const cons = last(form, "consumption");
  if (cons !== null && cons.trim() !== "") {
    let json: unknown;
    try {
      json = JSON.parse(cons);
    } catch {
      json = undefined;
    }
    const r = consumptionSchema.safeParse(json);
    if (r.success) out.consumption = r.data;
    else out.fieldErrors.consumption = "Configuração de coleta inválida.";
  }
  const terms = last(form, "termsReviewed");
  if (terms !== null) out.termsReviewed = terms === "true" || terms === "on" || terms === "1";
  return out;
}

/** Tipo de coleta a partir da estratégia descoberta. */
export function kindOfStrategy(strategy: ConsumptionConfig["strategy"]): (typeof KINDS)[number] {
  switch (strategy) {
    case "rss":
    case "atom":
      return "rss";
    case "jsonfeed":
      return "api";
    case "sitemap_news":
      return "sitemap";
    default:
      return "page";
  }
}

const UUID = z.string().uuid();

/** `true` para um uuid válido. */
export const isUuid = (v: string): boolean => UUID.safeParse(v).success;

/** Identificador uuid do formulário, ou `null`. */
export function idOf(form: FormData, key = "id"): string | null {
  const r = UUID.safeParse(last(form, key)?.trim());
  return r.success ? r.data : null;
}

/** Versão otimista do formulário (inteiro >= 1), ou `null`. */
export function versionOf(form: FormData): number | null {
  const v = last(form, "version");
  const n = v === null ? Number.NaN : Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
