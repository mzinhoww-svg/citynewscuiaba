import { hasCreditLine } from "./credit-line";

/**
 * Checklist automático e portão de completude da publicação automática (AUT-T4; A16 e R41).
 *
 * `autoChecklist` conserta o que dá para consertar sem pessoa (texto alternativo da capa, SEO,
 * taxonomia) e só devolve como bloqueio o que não dá: matéria sem fonte citada e sem título.
 * `isComplete` diz se a matéria está por inteiro: corpo no mínimo de linhas (e sem parágrafo
 * cortado), fonte citada e capa já decidida. Funções puras.
 */

/** Mínimo de linhas do corpo renderizado (R41). Só publica com menos se as fontes não têm conteúdo. */
export const MIN_BODY_LINES = 30;
/** Caracteres por linha na coluna de leitura (para contar as linhas do corpo renderizado). */
export const CHARS_PER_LINE = 75;
/** Material de fonte abaixo disto não sustenta 30 linhas sem encher: `short_reason` direto. */
export const MIN_MATERIAL_CHARS = 1500;
/** Quantas vezes a redação refaz o texto curto antes de publicar com `short_reason` (R41). */
export const MAX_REWRITES = 2;
/** Espera máxima por uma capa pendente antes do cartão tipográfico (A16). */
export const COVER_WAIT_MS = 10 * 60_000;

export type ShortReason = "insufficient_source";

type Node = { type?: unknown; attrs?: unknown; content?: unknown; text?: unknown };
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function inlineText(node: unknown): string {
  if (!isRecord(node)) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(inlineText).join("") : "";
}

/** Blocos de texto do corpo (parágrafos e títulos) sem a linha de crédito. */
export function bodyBlocks(body: unknown): { type: "paragraph" | "heading"; text: string }[] {
  if (!isRecord(body) || !Array.isArray(body.content)) return [];
  const out: { type: "paragraph" | "heading"; text: string }[] = [];
  for (const raw of body.content as Node[]) {
    if (!isRecord(raw)) continue;
    if (isRecord(raw.attrs) && raw.attrs.credit === true) continue;
    const text = inlineText(raw).trim();
    if (!text) continue;
    if (raw.type === "paragraph" || raw.type === "heading") out.push({ type: raw.type, text });
  }
  return out;
}

/** Linhas do corpo renderizado: cada bloco ocupa ao menos uma linha, e uma por 75 caracteres. */
export function bodyLines(body: unknown): number {
  return bodyBlocks(body).reduce(
    (n, b) => n + Math.max(1, Math.ceil(b.text.length / CHARS_PER_LINE)),
    0,
  );
}

/** O último parágrafo termina em pontuação final? Texto cortado no meio da frase não termina. */
export function endsCleanly(body: unknown): boolean {
  const last = bodyBlocks(body)
    .filter((b) => b.type === "paragraph")
    .at(-1);
  return last === undefined || /[.!?…:]["”’')\]]*$/.test(last.text);
}

export type CoverState = "photo" | "typographic" | "pending";

export interface ArticleCheck {
  title: string;
  dek: string;
  body: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  tags: string[];
  neighborhoods: string[];
  sectionSlug: string;
  /** Fontes ligadas à matéria (`article_sources`). */
  sourceCount: number;
  cover: CoverState;
  /** Texto alternativo da capa (`article_media.alt`); `null` quando a capa é cartão ou falta. */
  coverAlt: string | null;
  shortReason: ShortReason | null;
}

export interface ChecklistPatch {
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
  neighborhoods?: string[];
  coverAlt?: string;
}

export interface ChecklistResult {
  /** O que foi consertado, por nome (`alt`, `seo`, `taxonomy`). */
  fixed: string[];
  blockers: ("no_source" | "no_title")[];
  /** Campos a gravar (vazio se nada faltava). */
  patch: ChecklistPatch;
}

const clip = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
};

/**
 * Gera `alt`, SEO e taxonomia que faltam; só `no_source` e `no_title` bloqueiam. Com a taxonomia
 * a editoria vira etiqueta e os bairros vêm dos itens (`context`); sem bairro nenhum fica vazio
 * (matéria sem bairro continua válida para a automática).
 */
export function autoChecklist(
  a: ArticleCheck,
  context: { tags?: string[]; neighborhoods?: string[] } = {},
): ChecklistResult {
  const fixed: string[] = [];
  const patch: ChecklistPatch = {};
  const blockers: ChecklistResult["blockers"] = [];

  if (a.title.trim() === "") blockers.push("no_title");
  if (a.sourceCount < 1 || !hasCreditLine(isRecord(a.body) ? a.body : {}))
    blockers.push("no_source");

  const seoTitleOk = !!a.seoTitle && a.seoTitle.trim().length > 0 && a.seoTitle.trim().length <= 70;
  const seoDescOk =
    !!a.seoDescription &&
    a.seoDescription.trim().length > 0 &&
    a.seoDescription.trim().length <= 160;
  if (!seoTitleOk || !seoDescOk) {
    if (!seoTitleOk) patch.seoTitle = clip(a.title, 70);
    if (!seoDescOk)
      patch.seoDescription = clip(
        a.dek.trim() || (bodyBlocks(a.body).find((b) => b.type === "paragraph")?.text ?? a.title),
        160,
      );
    fixed.push("seo");
  }

  const tags = a.tags.filter((t) => t.trim() !== "");
  if (tags.length === 0) {
    const fromItems = (context.tags ?? []).filter((t) => t.trim() !== "").slice(0, 8);
    patch.tags = fromItems.length > 0 ? fromItems : [a.sectionSlug];
    fixed.push("taxonomy");
  }
  if (
    a.neighborhoods.filter((n) => n.trim() !== "").length === 0 &&
    (context.neighborhoods ?? []).length > 0
  ) {
    patch.neighborhoods = [...new Set(context.neighborhoods)];
    if (!fixed.includes("taxonomy")) fixed.push("taxonomy");
  }

  if (a.cover === "photo" && (a.coverAlt === null || a.coverAlt.trim() === "")) {
    patch.coverAlt = clip(`Foto ilustrativa da matéria: ${a.title}`, 120);
    fixed.push("alt");
  }
  return { fixed, blockers, patch };
}

export type Missing = "body" | "source" | "cover";

/**
 * A matéria está por inteiro? Corpo com o mínimo de linhas (ou `short_reason` registrado) e sem
 * parágrafo cortado, fonte citada na linha final e capa já decidida (foto ou cartão tipográfico,
 * nunca "a caminho").
 */
export function isComplete(a: ArticleCheck): { ok: boolean; missing: Missing[] } {
  const missing: Missing[] = [];
  const lines = bodyLines(a.body);
  const short = lines < MIN_BODY_LINES && a.shortReason === null;
  if (lines === 0 || short || !endsCleanly(a.body)) missing.push("body");
  if (a.sourceCount < 1 || !hasCreditLine(isRecord(a.body) ? a.body : {})) missing.push("source");
  if (a.cover === "pending") missing.push("cover");
  return { ok: missing.length === 0, missing };
}

/** O material das fontes é curto demais para 30 linhas sem encher? */
export function insufficientMaterial(itemTexts: readonly string[]): boolean {
  return itemTexts.reduce((n, t) => n + t.length, 0) < MIN_MATERIAL_CHARS;
}
