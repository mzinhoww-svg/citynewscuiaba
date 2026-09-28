/**
 * Perfil sugerido para uma fonte nova (spec §7.1 passo 9, FS-T4). Duas fontes de sugestão,
 * nunca misturadas:
 * - `ruleSuggestions`: regra pura, sem IA (nome, slug, confiabilidade, camada, limite de taxa);
 * - `profileSource`: agente `source_profiler`, só com metadados da prévia (nunca corpo de
 *   matéria, nunca instrução) — editorias, localidade, alertas de qualidade e seletores de página.
 *
 * A IA nunca sugere política de imagem, política de republicação, confiabilidade, fonte única ou
 * frequência de coleta (D-F11, D-F12): essas decisões ficam só em `ruleSuggestions` ou humanas.
 */
import { parseHTML } from "linkedom";
import type { CallAgent } from "@/lib/ai/call-agent";
import { sourceProfileSchema, type QualityFlag } from "@/lib/ai/schemas/source-profile";
import type { AiError } from "@/lib/ai/types";
import { err, ok, type Result } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { isSafeSelector } from "./page-list";
import type { Locality, PageSelectors, Reliability, SourceLayer, SourcePreview } from "./types";
import { hostKey, slugFromName } from "./url";

/** Menos de 3 itens limpos na prévia: não vale a pena chamar o modelo (Review Focus 5). */
const MIN_CLEAN_ITEMS = 3;
/** Nunca mais que isso vai ao modelo (a prévia já limita a 10, mas a régua fica aqui também). */
const MAX_ITEMS = 20;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_STRUCTURE_CHARS = 4000;
const RATIONALE_MAX_CHARS = 400;

export interface SuggestedField<T> {
  value: T;
  origin: "ia";
  /** Confiança do modelo (0–1); vem de `localityConfidence`, único valor que ele reporta. */
  confidence: number;
}

/** Sugestão do agente `source_profiler`, um campo por vez (§7.2: sugestão nunca aplica sozinha). */
export interface ProfileSuggestion {
  categories: SuggestedField<string[]>;
  locality: SuggestedField<Locality>;
  qualityFlags: SuggestedField<QualityFlag[]>;
  pageSelectors: SuggestedField<PageSelectors | null>;
  rationale: SuggestedField<string>;
}

export interface ProfileInput {
  preview: SourcePreview;
  /** Esqueleto da página (`domOutline`); `null` quando a fonte já tem feed. */
  domOutline: string | null;
  /** Editorias existentes (`sections.slug`): sugestão fora daqui é descartada. */
  sections: string[];
}

const SYSTEM =
  "Responda só com o que os dados abaixo permitem concluir. Sem menção a política de imagem, " +
  "política de republicação, confiabilidade, fonte única ou frequência de coleta: essas decisões " +
  "são humanas.";

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function selectorsSafe(sel: PageSelectors): boolean {
  return [sel.item, sel.link, sel.title, ...(sel.date ? [sel.date] : [])].every(isSafeSelector);
}

/**
 * Envia ao modelo um bloco por item da prévia (título, data e caminho da URL — nunca a URL
 * inteira, nunca resumo nem corpo), um bloco `meta` (nome do site e descrição, saneados e
 * limitados) e, quando houver, um bloco `estrutura` com o esqueleto da página. Pós-validação:
 * editorias fora de `sections` descartadas, seletores reprovados em `isSafeSelector` viram `null`.
 */
export async function profileSource(
  callAgent: CallAgent,
  input: ProfileInput,
): Promise<Result<ProfileSuggestion, AiError | "insufficient_data">> {
  const items = input.preview.items.slice(0, MAX_ITEMS);
  if (items.length < MIN_CLEAN_ITEMS) return err("insufficient_data");

  const data = items.map((item, i) => ({
    id: `item-${i + 1}`,
    text: [item.title, item.publishedAt ?? "sem data", pathOf(item.url)].join(" | "),
  }));

  const siteName = input.preview.siteName?.trim() ?? "";
  const description = input.preview.description
    ? sanitizeExternalText(input.preview.description, MAX_DESCRIPTION_CHARS).text
    : "";
  data.push({ id: "meta", text: [siteName, description].filter((s) => s.length > 0).join(" | ") });

  if (input.domOutline) {
    data.push({ id: "estrutura", text: input.domOutline.slice(0, MAX_STRUCTURE_CHARS) });
  }

  const task =
    `Editorias disponíveis (sugira só entre estas): ${input.sections.join(", ")}.` +
    (input.domOutline
      ? " O bloco `estrutura` é o esqueleto da página sem feed: sugira `pageSelectors`."
      : " Esta fonte já tem feed: `pageSelectors` deve ser null.");

  const res = await callAgent(
    "source_profiler",
    { system: SYSTEM, data, task },
    sourceProfileSchema,
  );
  if (!res.ok) return res;

  const draft = res.value;
  const categories = draft.categories.filter((c) => input.sections.includes(c));
  const pageSelectors =
    draft.pageSelectors && selectorsSafe(draft.pageSelectors) ? draft.pageSelectors : null;
  const confidence = draft.localityConfidence;

  return ok({
    categories: { value: categories, origin: "ia", confidence },
    locality: { value: draft.locality, origin: "ia", confidence },
    qualityFlags: { value: [...draft.qualityFlags], origin: "ia", confidence },
    pageSelectors: { value: pageSelectors, origin: "ia", confidence },
    rationale: { value: draft.rationale.slice(0, RATIONALE_MAX_CHARS), origin: "ia", confidence },
  });
}

const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "path", "iframe"]);

/**
 * Esqueleto da página sem texto nem atributos além de `class` (§7.1 passo 6): uma linha por
 * elemento, indentada pela profundidade, até `MAX_STRUCTURE_CHARS`. Nunca sai texto de nó, nunca
 * `id`, `href`, `src` ou qualquer outro atributo — só a estrutura de tags e classes.
 */
export function domOutline(html: string): string {
  const { document } = parseHTML(html);
  const skipSelector = [...SKIP_TAGS].join(",");
  const lines: string[] = [];
  let total = 0;

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const tag = el.tagName?.toLowerCase();
    if (!tag || SKIP_TAGS.has(tag)) continue;
    if (el.closest(skipSelector)) continue; // dentro de um ramo já ignorado (script, svg…)

    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) depth++;
    const classes = (el.getAttribute("class") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    const label = classes.length > 0 ? `${tag}.${classes.join(".")}` : tag;
    const line = `${"  ".repeat(depth)}${label}`;
    if (total + line.length + 1 > MAX_STRUCTURE_CHARS) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

export interface RuleField<T> {
  value: T;
  origin: "regra";
  needsApproval?: boolean;
}

export interface RuleSuggestions {
  name: RuleField<string>;
  slug: RuleField<string>;
  /** `null` = padrão global (`app_settings.default_frequency_minutes`). */
  frequency: RuleField<number | null>;
  reliability: RuleField<Reliability>;
  layer: RuleField<SourceLayer>;
  rateLimitPerHour: RuleField<number>;
}

/** Domínios de poder público (D-F3, D-F11): confiabilidade `primary` pedindo aprovação. */
const OFFICIAL_SUFFIXES = [".gov.br", ".jus.br", ".mp.br", ".leg.br"];

const DEFAULT_RATE_LIMIT_PER_HOUR = 20;

function isOfficialHost(host: string): boolean {
  return OFFICIAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Sugestões por regra fixa (nunca IA): nome e slug a partir do que a descoberta já trouxe,
 * confiabilidade e camada a partir do domínio (D-F11), limite de taxa padrão. Confiabilidade
 * `primary` é mudança crítica (§ regras globais): nasce marcada `needsApproval`.
 */
export function ruleSuggestions(preview: SourcePreview, url: URL): RuleSuggestions {
  const host = hostKey(url);
  const name = preview.siteName?.trim() || host;
  const official = isOfficialHost(host);

  return {
    name: { value: name, origin: "regra" },
    slug: { value: slugFromName(name), origin: "regra" },
    frequency: { value: null, origin: "regra" },
    reliability: {
      value: official ? "primary" : "standard",
      origin: "regra",
      needsApproval: official,
    },
    layer: { value: official ? 1 : 2, origin: "regra" },
    rateLimitPerHour: { value: DEFAULT_RATE_LIMIT_PER_HOUR, origin: "regra" },
  };
}
