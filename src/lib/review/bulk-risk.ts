/**
 * Resumo dos riscos de uma seleção da fila de revisão para "Publicar mesmo assim" (REV-T1).
 * Função pura: recebe fatos já carregados de cada matéria e devolve contagens e exemplos. Nada
 * aqui lê banco nem decide publicar; quem confirma é a pessoa, no diálogo.
 */

/** Editorias sensíveis, uma contagem para cada. */
export const SENSITIVE_SECTIONS = ["politica", "seguranca", "saude"] as const;
export type SensitiveSection = (typeof SENSITIVE_SECTIONS)[number];

/** "Texto curto": abaixo de 30 linhas, com 12 palavras por linha (A-105). */
export const SHORT_TEXT_LINES = 30;
export const WORDS_PER_LINE = 12;
/** Quantos riscos o diálogo mostra. */
export const TOP_RISKS = 5;
const EXAMPLE_MAX = 80;

export type RiskKey =
  | "sensitive_politica"
  | "sensitive_seguranca"
  | "sensitive_saude"
  | "single_source"
  | "no_photo"
  | "short_text"
  | "doubtful"
  | "low_score"
  | "reported"
  | "no_citable_source";

/** Ordem de desempate (do mais grave ao menos). */
export const RISK_ORDER: readonly RiskKey[] = [
  "sensitive_saude",
  "sensitive_seguranca",
  "sensitive_politica",
  "doubtful",
  "reported",
  "no_citable_source",
  "single_source",
  "low_score",
  "short_text",
  "no_photo",
];

export interface RiskItem {
  id: string;
  title: string;
  sectionSlug: string;
  /** Fontes independentes ligadas à matéria. */
  sourceCount: number;
  /** Há ao menos uma fonte com link para o original. */
  hasCitableSource: boolean;
  hasApprovedPhoto: boolean;
  wordCount: number;
  /** Motivo curto registrado quando o texto saiu curto (revisão do pipeline), se houver. */
  shortReason: string | null;
  /** Marcada como duvidosa ou com fontes divergentes. */
  doubtful: boolean;
  confidence: "baixa" | "média" | "alta";
  /** Tem denúncia aberta. */
  reported: boolean;
  /** Corpo com algum texto; sem corpo é impossível publicar. */
  hasBody: boolean;
}

export interface RiskEntry {
  key: RiskKey;
  count: number;
  example: string;
}

export interface RiskSummary {
  /** Matérias que serão publicadas (com corpo). */
  total: number;
  /** Sem corpo algum: ficam de fora. */
  excluded: { id: string; title: string }[];
  publishableIds: string[];
  /** Todos os riscos com ao menos 1 matéria, do maior para o menor. */
  risks: RiskEntry[];
  /** Os `TOP_RISKS` maiores. */
  top: RiskEntry[];
}

export const linesOf = (wordCount: number): number => Math.ceil(wordCount / WORDS_PER_LINE);

function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= EXAMPLE_MAX ? t : `${t.slice(0, EXAMPLE_MAX - 1).trimEnd()}…`;
}

function risksOf(i: RiskItem): RiskKey[] {
  const out: RiskKey[] = [];
  if ((SENSITIVE_SECTIONS as readonly string[]).includes(i.sectionSlug))
    out.push(`sensitive_${i.sectionSlug as SensitiveSection}`);
  if (i.sourceCount === 1) out.push("single_source");
  if (!i.hasApprovedPhoto) out.push("no_photo");
  if (linesOf(i.wordCount) < SHORT_TEXT_LINES) out.push("short_text");
  if (i.doubtful) out.push("doubtful");
  if (i.confidence === "baixa") out.push("low_score");
  if (i.reported) out.push("reported");
  if (!i.hasCitableSource || i.sourceCount === 0) out.push("no_citable_source");
  return out;
}

function exampleOf(key: RiskKey, i: RiskItem): string {
  if (key === "short_text") {
    const base = `${i.title} (${linesOf(i.wordCount)} linhas)`;
    return clip(i.shortReason ? `${base}: ${i.shortReason}` : base);
  }
  return clip(i.title);
}

export function summarizeRisks(selection: readonly RiskItem[]): RiskSummary {
  const publishable = selection.filter((i) => i.hasBody);
  const excluded = selection.filter((i) => !i.hasBody).map((i) => ({ id: i.id, title: i.title }));
  const acc = new Map<RiskKey, RiskEntry>();
  for (const i of publishable) {
    for (const key of risksOf(i)) {
      const cur = acc.get(key);
      if (cur) cur.count += 1;
      else acc.set(key, { key, count: 1, example: exampleOf(key, i) });
    }
  }
  const risks = [...acc.values()].sort(
    (a, b) => b.count - a.count || RISK_ORDER.indexOf(a.key) - RISK_ORDER.indexOf(b.key),
  );
  return {
    total: publishable.length,
    excluded,
    publishableIds: publishable.map((i) => i.id),
    risks,
    top: risks.slice(0, TOP_RISKS),
  };
}
