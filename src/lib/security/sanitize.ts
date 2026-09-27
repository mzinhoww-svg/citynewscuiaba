/**
 * Segurança de texto externo (spec §6.6). Todo conteúdo coletado passa por aqui antes de
 * chegar a um modelo: HTML removido, tamanho controlado e padrões de instrução detectados.
 * Texto externo é dado, nunca instrução.
 */

export interface SanitizedText {
  text: string;
  injection: boolean;
  matches: string[];
}

const BLOCK_TAGS =
  "address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul";

const VOWEL_ENTITIES: Record<string, string> = {};
for (const [base, marks] of Object.entries({
  a: { acute: "á", grave: "à", circ: "â", tilde: "ã", uml: "ä" },
  e: { acute: "é", grave: "è", circ: "ê", uml: "ë" },
  i: { acute: "í", grave: "ì", circ: "î", uml: "ï" },
  o: { acute: "ó", grave: "ò", circ: "ô", tilde: "õ", uml: "ö" },
  u: { acute: "ú", grave: "ù", circ: "û", uml: "ü" },
})) {
  for (const [mark, char] of Object.entries(marks)) {
    VOWEL_ENTITIES[`${base}${mark}`] = char;
    VOWEL_ENTITIES[`${base.toUpperCase()}${mark}`] = char.toUpperCase();
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  ...VOWEL_ENTITIES,
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
  deg: "°",
  ordm: "º",
  ordf: "ª",
  middot: "·",
  bull: "•",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  euro: "€",
  copy: "©",
  reg: "®",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Invisíveis usados para esconder instruções (zero-width, bidi) e controles, exceto \n e \t. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function stripHtml(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(script|style|noscript|template|iframe|object)\b[^>]*>[\s\S]*$/gi, " ")
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "");
}

function tidyWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Forma usada só para detecção: sem acento, minúscula, sem invisíveis. */
function forDetection(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const INJECTION_PATTERNS: RegExp[] = [
  /\bignor(?:e|ar|em|a)\s+(?:(?:a|as|o|os|todas\s+as|todos\s+os)\s+)?(?:\S+\s+)?(?:instruc\w*|regras?|orientac\w*)/,
  /\bdesconsider(?:e|ar|em|a)\s+(?:(?:a|as|todas\s+as)\s+)?(?:\S+\s+)?(?:regras?|instruc\w*)/,
  /\besquec(?:a|er|am)\s+(?:(?:a|as|todas\s+as)\s+)?(?:\S+\s+)?(?:regras?|instruc\w*)/,
  /^\s*system\s*:/m,
  /\bvoce\s+agora\s+e\b/,
  /\baja\s+como\b/,
  /\bnova\s+instrucao\b/,
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/,
  /\byou\s+are\s+now\b/,
];

function detect(cleaned: string): string[] {
  const normalized = forDetection(cleaned);
  const matches: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const m = pattern.exec(normalized);
    if (m) matches.push(m[0].trim());
  }
  return matches;
}

/** HTML escapado (comum em RSS) é decodificado e removido de novo, para não esconder instrução. */
export function sanitizeExternalText(raw: string, maxChars = 12000): SanitizedText {
  const cleaned = tidyWhitespace(
    stripHtml(decodeEntities(stripHtml(raw)))
      .replace(INVISIBLE, "")
      .replace(CONTROL, " "),
  ).normalize("NFC");
  const matches = detect(cleaned);
  const text = Array.from(cleaned).slice(0, Math.max(0, maxChars)).join("");
  return { text, injection: matches.length > 0, matches };
}

/** Envelope de dados para prompts. Um fechamento falso dentro do texto é escapado. */
export function wrapAsData(id: string, text: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_.:-]/g, "");
  const safeText = text.replace(/<(\/?\s*fonte_externa)/gi, "&lt;$1");
  return `<fonte_externa id="${safeId}">\n${safeText}\n</fonte_externa>`;
}
