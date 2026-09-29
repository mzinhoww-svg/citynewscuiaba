/**
 * Perfil sugerido de uma fonte nova (painel de fontes, FS-T4). A IA vê só metadados (título, data,
 * caminho da URL, nome, descrição e esqueleto da página), sempre sanitizados e envelopados; nunca
 * corpo, imagem nem texto bruto. Ela não sugere política, fonte única, confiabilidade nem
 * frequência: isso vem de regras (`ruleSuggestions`) ou de decisão humana.
 */
import { parseHTML } from "linkedom";
import type { AgentInput, CallAgent } from "@/lib/ai/call-agent";
import { sourceProfileSchema } from "@/lib/ai/schemas/source-profile";
import type { AiError } from "@/lib/ai/types";
import { err, ok, type Result } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { effectiveFrequency, suggestFrequency } from "./frequency";
import { isSafeSelector } from "./page-list";
import type { Locality, PageSelectors, Reliability, SourceLayer, SourcePreview } from "./types";
import { slugFromName } from "./url";

export const MIN_PROFILE_ITEMS = 3;
export const MAX_PROFILE_ITEMS = 20;
export const MAX_OUTLINE_CHARS = 4000;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_TITLE_CHARS = 300;

export type QualityFlag =
  "caca_clique" | "agregador" | "paywall" | "baixa_relevancia_local" | "patrocinado" | "sem_data";

export interface Suggestion<T> {
  value: T;
  origin: "ia";
  confidence: number;
}

export interface ProfileSuggestion {
  categories: Suggestion<string[]>;
  locality: Suggestion<Locality>;
  qualityFlags: Suggestion<QualityFlag[]>;
  /** `null` quando não é página sem feed ou quando o seletor reprovou em `isSafeSelector`. */
  pageSelectors: Suggestion<PageSelectors | null>;
  rationale: Suggestion<string>;
}

export interface ProfileInput {
  preview: SourcePreview;
  /** Esqueleto de `domOutline`; só para página sem feed. */
  domOutline: string | null;
  /** Slugs de editorias aceitas (as do portal). */
  sections: string[];
}

const pathOf = (url: string): string => {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? "?…" : "");
  } catch {
    return "";
  }
};

/** Confere que a saída é injeção-livre: item cujo título dispara o detector é descartado. */
function cleanItems(preview: SourcePreview): { text: string }[] {
  const out: { text: string }[] = [];
  for (const it of preview.items) {
    if (out.length >= MAX_PROFILE_ITEMS) break;
    const title = sanitizeExternalText(it.title, MAX_TITLE_CHARS);
    if (title.injection || title.text.length === 0) continue;
    // Só os três campos conhecidos: qualquer outro (corpo, imagem) fica de fora por construção.
    out.push({
      text: `título: ${title.text}\ndata: ${it.publishedAt ?? "sem data"}\ncaminho: ${pathOf(it.url)}`,
    });
  }
  return out;
}

/**
 * Chama o agente `source_profiler`. Com menos de 3 itens limpos não chama o modelo
 * (`insufficient_data`). Editorias fora de `sections` são descartadas e seletores reprovados em
 * `isSafeSelector` viram `null`.
 */
export async function profileSource(
  callAgent: CallAgent,
  input: ProfileInput,
): Promise<Result<ProfileSuggestion, AiError | "insufficient_data">> {
  const items = cleanItems(input.preview);
  if (items.length < MIN_PROFILE_ITEMS) return err("insufficient_data");

  const data: AgentInput["data"] = items.map((it, i) => ({ id: `item-${i + 1}`, text: it.text }));
  data.push({
    id: "meta",
    text: `nome: ${input.preview.siteName ?? "desconhecido"}\ndescrição: ${sanitizeExternalText(input.preview.description ?? "", MAX_DESCRIPTION_CHARS).text}`,
  });
  if (input.domOutline)
    data.push({ id: "estrutura", text: input.domOutline.slice(0, MAX_OUTLINE_CHARS) });

  const r = await callAgent(
    "source_profiler",
    {
      system: `Editorias permitidas: ${input.sections.join(", ")}.`,
      data,
      task: "Sugira o perfil desta fonte a partir da amostra.",
    },
    sourceProfileSchema,
  );
  if (!r.ok) return err(r.error);

  const p = r.value;
  const confidence = p.localityConfidence;
  const allowed = new Set(input.sections);
  const selectors = p.pageSelectors;
  const safe =
    selectors &&
    [
      selectors.item,
      selectors.link,
      selectors.title,
      ...(selectors.date ? [selectors.date] : []),
    ].every(isSafeSelector)
      ? selectors
      : null;
  const ia = <T>(value: T): Suggestion<T> => ({ value, origin: "ia", confidence });
  return ok({
    categories: ia(p.categories.filter((c) => allowed.has(c))),
    locality: ia(p.locality),
    qualityFlags: ia(p.qualityFlags),
    pageSelectors: ia(safe),
    rationale: ia(p.rationale),
  });
}

const SKIP_TAGS = new Set(["script", "style", "noscript", "svg", "head", "template", "iframe"]);
const CLASS_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;

/**
 * Esqueleto da página para a IA: uma linha por elemento (`profundidade:tag.classe.classe`), sem
 * texto nem atributos além de `class`, sem `<` nem `>`, até 4 000 caracteres.
 */
export function domOutline(html: string): string {
  let root: Element | null = null;
  try {
    const { document } = parseHTML(html);
    root =
      document.body && document.body.children.length > 0
        ? document.body
        : (document.documentElement ?? null);
  } catch {
    return "";
  }
  const lines: string[] = [];
  let size = 0;
  const walk = (el: Element, depth: number): void => {
    for (const child of Array.from(el.children)) {
      if (size >= MAX_OUTLINE_CHARS || depth > 12) return;
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag) || !/^[a-z][a-z0-9-]*$/.test(tag)) continue;
      const classes = (child.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => CLASS_RE.test(c))
        .slice(0, 4);
      const line = `${depth}:${tag}${classes.map((c) => `.${c}`).join("")}`;
      if (size + line.length + 1 > MAX_OUTLINE_CHARS) return;
      lines.push(line);
      size += line.length + 1;
      walk(child, depth + 1);
    }
  };
  if (root) walk(root, 1);
  return lines.join("\n");
}

export interface RuleSuggestion<T> {
  value: T;
  origin: "regra";
  /** `true` exige aprovação de outra pessoa (campo crítico). */
  needsApproval: boolean;
}

export interface RuleSuggestions {
  name: RuleSuggestion<string>;
  slug: RuleSuggestion<string>;
  frequency: RuleSuggestion<number>;
  reliability: RuleSuggestion<Reliability>;
  layer: RuleSuggestion<SourceLayer | null>;
  rateLimitPerHour: RuleSuggestion<number>;
}

const OFFICIAL_HOST = /\.(gov|jus|mp|leg)\.br$/i;
const DEFAULT_RATE_LIMIT_PER_HOUR = 60;

const rule = <T>(value: T, needsApproval = false): RuleSuggestion<T> => ({
  value,
  origin: "regra",
  needsApproval,
});

/**
 * Sugestões por regra, sem IA. Domínios oficiais (`.gov.br`, `.jus.br`, `.mp.br`, `.leg.br`) sugerem
 * `primary` na camada 1, sempre pedindo aprovação. O `Crawl-delay` limita a cota por hora e a
 * frequência sugerida sai da cadência dos itens, nunca na via rápida.
 */
export function ruleSuggestions(
  preview: SourcePreview,
  url: URL,
  opts: { crawlDelaySec?: number | null; now?: Date } = {},
): RuleSuggestions {
  const host = url.hostname.toLowerCase();
  const official = OFFICIAL_HOST.test(host);
  const name = (preview.siteName ?? "").trim() || host.replace(/^www\./, "");
  const crawlDelaySec = opts.crawlDelaySec ?? null;
  const cadence = suggestFrequency(
    preview.items.flatMap((i) => (i.publishedAt ? [i.publishedAt] : [])),
    opts.now ?? new Date(),
  );
  const frequency = effectiveFrequency(cadence.minutes, cadence.minutes, {
    crawlDelaySec,
    termsMinIntervalMinutes: null,
  }).minutes;
  const rate =
    crawlDelaySec && crawlDelaySec > 0
      ? Math.max(1, Math.min(DEFAULT_RATE_LIMIT_PER_HOUR, Math.floor(3600 / crawlDelaySec)))
      : DEFAULT_RATE_LIMIT_PER_HOUR;
  return {
    name: rule(name),
    slug: rule(slugFromName(name)),
    frequency: rule(frequency),
    reliability: official ? rule<Reliability>("primary", true) : rule<Reliability>("standard"),
    layer: rule<SourceLayer | null>(official ? 1 : null),
    rateLimitPerHour: rule(rate),
  };
}
