import { parseHTML } from "linkedom";
import { CRITERIA_KINDS, guideExtractSchema, type CriteriaKind } from "@/lib/ai/schemas/guide";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import { err, ok, type Result } from "@/lib/result";
import { removeHiddenElements } from "@/lib/security/hidden";
import { sanitizeExternalText, wrapAsData } from "@/lib/security/sanitize";
import { CATEGORIES, CUISINES } from "./categories";
import { normalizedName } from "./merge";
import { fold as foldText } from "@/lib/text/fold";

/**
 * Proposta por link (GUIA-T4, spec G7). O editor cola o link de uma lista de outro veículo; daqui
 * saem só nomes de lugares, a categoria, o TIPO de critério (vocabulário fechado) e observações
 * nossas. Nunca texto copiado: nomes são fatos e curtos; o resto é escrito por nós. O texto do
 * portal é dado, nunca instrução: instrução embutida é detectada, anotada e ignorada, e o modelo
 * opcional só escolhe entre elementos que existem na página (nada que ele invente entra).
 * Respeita `robots.txt`, o limite por hora do domínio e SSRF (`crawlGet`).
 */

export type ExtractError =
  "invalid_url" | "robots" | "unavailable" | "rate_limited" | "http_error" | "no_names";

export interface LinkExtraction {
  names: string[];
  category: string | null;
  criteria: CriteriaKind | null;
  notes: string[];
}

export interface ExtractDeps {
  crawl: CrawlDeps;
  /**
   * Modelo de extração (opcional). Recebe o texto da página dentro de delimitadores de dados e
   * devolve JSON no formato de `guideExtractSchema`. Qualquer falha ou saída fora do formato é
   * ignorada: a extração por estrutura da página basta.
   */
  model?: (input: { title: string; data: string }) => Promise<unknown>;
}

const MAX_NAMES = 20;
const MAX_NAME_CHARS = 80;
const MAX_NAME_WORDS = 7;
export const INJECTION_NOTE = "Instrução embutida na página foi ignorada.";

const GENERIC_HEADINGS = new Set([
  "como chegar",
  "sobre",
  "leia tambem",
  "leia mais",
  "comentarios",
  "newsletter",
  "compartilhe",
  "veja tambem",
  "mais lidas",
  "publicidade",
  "redes sociais",
  "contato",
  "menu",
  "busca",
  "pesquisar",
  "relacionadas",
  "materias relacionadas",
  "tags",
  "autor",
]);

const fold = (s: string) => foldText(s).trim();

/** "1. Padaria X – a melhor da cidade" → "Padaria X". */
export function cleanName(raw: string): string | null {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^\s*(?:#\s*)?\d{1,2}\s*(?:[.)º°:–—-]|\s)\s*/u, "");
  s = s.split(/\s[–—|-]\s|:\s| — /u)[0] ?? s;
  s = s
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/[“”"]/g, "")
    .trim();
  if (s.length < 2 || s.length > MAX_NAME_CHARS) return null;
  if (s.split(" ").length > MAX_NAME_WORDS) return null;
  if (/https?:|www\.|@|[<>{}[\]]|[.!?]$/.test(s)) return null;
  if (!/^[\p{Lu}\d]/u.test(s)) return null;
  if (GENERIC_HEADINGS.has(fold(s))) return null;
  return s;
}

function unique(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = normalizedName(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

type Json = Record<string, unknown>;

function jsonLdNames(doc: Document): string[] {
  const out: string[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const o = n as Json;
    if (Array.isArray(o["@graph"])) visit(o["@graph"]);
    const t = o["@type"];
    const isList = t === "ItemList" || (Array.isArray(t) && t.includes("ItemList"));
    if (isList && Array.isArray(o["itemListElement"])) {
      for (const el of o["itemListElement"] as Json[]) {
        const item = el["item"] && typeof el["item"] === "object" ? (el["item"] as Json) : el;
        if (typeof item["name"] === "string") out.push(item["name"]);
      }
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ""));
    } catch {
      // JSON-LD quebrado é ignorado.
    }
  }
  return out;
}

const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** Textos de elementos que podem ser nome de lugar (o modelo só escolhe entre eles). */
function structureTexts(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("h2, h3, h4, li, strong, b")) {
    const strong = el.querySelector("strong, b");
    out.push(textOf(strong && /^li$/i.test(el.tagName) ? strong : el));
  }
  return out;
}

function headingNames(root: ParentNode): string[] {
  const hs = [...root.querySelectorAll("h2, h3, h4")];
  const numbered = hs.filter((h) => /^\s*(?:#\s*)?\d{1,2}\s*[.)º°:–—-]?\s*\S/u.test(textOf(h)));
  const use = numbered.length >= 3 ? numbered : hs;
  return use.map((h) => cleanName(textOf(h))).filter((n): n is string => n !== null);
}

function listNames(root: ParentNode): string[] {
  const lists = [...root.querySelectorAll("ol")];
  for (const ol of lists) {
    const names = [...ol.children]
      .filter((li) => /^li$/i.test(li.tagName))
      .map((li) => {
        const strong = li.querySelector("strong, b");
        return cleanName(textOf(strong ?? li));
      })
      .filter((n): n is string => n !== null);
    if (names.length >= 3) return names;
  }
  return [];
}

function guessCategory(
  title: string,
  url: string,
): { category: string | null; cuisine: string | null } {
  const hay = fold(`${title} ${url.replace(/[-_/]+/g, " ")}`);
  const cat = CATEGORIES.find((c) => hay.includes(fold(c.noun)) || hay.includes(fold(c.singular)));
  const cuisine = CUISINES.find((c) => hay.includes(fold(c.label.replace(/^de /, ""))));
  return {
    category: cat ? cat.slug : cuisine ? "restaurante" : null,
    cuisine: cuisine?.slug ?? null,
  };
}

function guessCriteria(text: string): CriteriaKind | null {
  const t = fold(text);
  if (/\bvotac|\bvote\b|\bvotos\b|enquete/.test(t)) return CRITERIA_KINDS[1];
  if (/tripadvisor|google maps|ranking de plataforma/.test(t)) return CRITERIA_KINDS[3];
  if (/avaliac|\bnota\b|estrelas|\breviews?\b/.test(t)) return CRITERIA_KINDS[0];
  if (/escolhemos|selecao da redacao|curadoria|nossa equipe visitou/.test(t))
    return CRITERIA_KINDS[2];
  return null;
}

/** Baixa e analisa o link. Só devolve nomes, categoria, tipo de critério e notas nossas. */
export async function extractFromLink(
  rawUrl: string,
  deps: ExtractDeps,
): Promise<Result<LinkExtraction, ExtractError>> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return err("invalid_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return err("invalid_url");

  const bucket = `guide-link:${url.hostname.toLowerCase()}`;
  const robots = await checkRobots(deps.crawl, url.href, { bucket, limitPerHour: 30 });
  if (robots.kind === "disallowed") return err("robots");
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable") return err("unavailable");

  const res = await crawlGet(deps.crawl, url.href, {
    bucket,
    limitPerHour: 30,
    accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
  });
  if (res.kind === "rate_limited") return err("rate_limited");
  if (res.kind === "http_error") return err("http_error");
  if (res.kind !== "ok") return err("unavailable");

  const { document } = parseHTML(res.body);
  removeHiddenElements(document);
  const ld = jsonLdNames(document);
  const title = textOf(
    document.querySelector("h1") ?? document.querySelector("title") ?? document.documentElement,
  );
  for (const el of document.querySelectorAll(
    "script, style, noscript, nav, footer, aside, form, header",
  ))
    el.remove();
  const root = document.querySelector("article, main") ?? document.body ?? document;

  const clean = (xs: string[]) => xs.map(cleanName).filter((n): n is string => n !== null);
  let names = unique(clean(ld));
  if (names.length < 3) names = unique(headingNames(root));
  if (names.length < 3) names = unique(listNames(root));

  // O texto da página é dado: só serve para detectar instrução embutida e o tipo de critério.
  const pageText = textOf(root);
  const checked = sanitizeExternalText(pageText);
  const notes: string[] = [];
  if (checked.injection) notes.push(INJECTION_NOTE);
  names = names.filter((n) => !sanitizeExternalText(n).injection);

  if (deps.model && names.length < MAX_NAMES) {
    try {
      const raw = await deps.model({ title, data: wrapAsData("pagina", checked.text) });
      const parsed = guideExtractSchema.safeParse(raw);
      if (parsed.success) {
        const onPage = new Set(structureTexts(root).map((t) => fold(cleanName(t) ?? "")));
        onPage.delete("");
        const extra = parsed.data.names.filter((n) => onPage.has(fold(cleanName(n) ?? "")));
        names = unique([
          ...names,
          ...extra.map((n) => cleanName(n)).filter((n): n is string => n !== null),
        ]);
      }
    } catch {
      // Modelo fora do ar: vale a extração por estrutura.
    }
  }

  names = names.slice(0, MAX_NAMES);
  if (names.length < 3) return err("no_names");

  const { category, cuisine } = guessCategory(title, url.href);
  if (cuisine) notes.push(`Cozinha: ${cuisine}.`);
  notes.push(`${names.length} nomes encontrados na lista original.`);
  return ok({ names, category, criteria: guessCriteria(pageText), notes });
}
