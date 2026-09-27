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
  trade: "™",
  shy: "\u00AD",
  zwj: "\u200D",
  zwnj: "\u200C",
  lrm: "\u200E",
  rlm: "\u200F",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  times: "×",
  divide: "÷",
  minus: "−",
  plusmn: "±",
  sect: "§",
  para: "¶",
  cent: "¢",
  pound: "£",
  yen: "¥",
  iexcl: "¡",
  iquest: "¿",
  sbquo: "‚",
  bdquo: "„",
  prime: "′",
  Prime: "″",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup1: "¹",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  szlig: "ß",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  lowast: "∗",
  sol: "/",
  colon: ":",
  semi: ";",
  comma: ",",
  period: ".",
  excl: "!",
  quest: "?",
  lpar: "(",
  rpar: ")",
  lsqb: "[",
  rsqb: "]",
  lbrack: "[",
  rbrack: "]",
  lcub: "{",
  rcub: "}",
  num: "#",
  commat: "@",
  dollar: "$",
  percnt: "%",
  ast: "*",
  equals: "=",
  plus: "+",
  bsol: "\\",
  verbar: "|",
  Tab: "\t",
  NewLine: "\n",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
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

/** Letras gregas e cirílicas iguais às latinas (homóglifos). Só para detecção, nunca no texto. */
const CONFUSABLES: Record<string, string> = {
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  α: "a",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  І: "I",
  Ј: "J",
  Ѕ: "S",
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  һ: "h",
  ӏ: "l",
  ɡ: "g",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");

/**
 * Forma usada só para detecção: largura total e compatíveis normalizados (NFKC), sem acento,
 * homóglifos trocados pela letra latina, minúscula e com espaços unificados.
 */
function forDetection(s: string): string {
  return s
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c)
    .toLowerCase()
    .replace(/[^\S\n]+/g, " ");
}

// Blocos dos padrões. Entre palavras, aceita espaço e pontuação ("Ignore, as instruções").
const SEP = String.raw`[\s,;.!?…"'«»“”()\[\]*_~\-–—]+`;
/** Começo de frase ou linha. */
const START = String.raw`(?:^|[.!?;…]\s*|\n\s*)`;
/** Negação ou subordinada antes do verbo: "não ignore", "que ninguém ignore" não são ordens ao modelo. */
const NOT_AFTER = String.raw`(?<!\b(?:que|nao|ninguem|nunca|jamais)\s+)`;
const DET = String.raw`(?:(?:todas|todos)${SEP})?(?:(?:as|os|suas|seus|tuas|teus|essas|estas|minhas|nossas)${SEP})?`;
const INSTR = String.raw`(?:instruc(?:ao|oes)|regras?|orientac(?:ao|oes)|diretrizes?|comandos?)`;
const PREV = String.raw`(?:anteriores|acima|previas|do${SEP}sistema|originais|iniciais)`;
const ROLE = String.raw`(?:(?:um|uma|o|a)${SEP})?(?:assistente|modelo|ia|ai|editora?|administrador(?:a)?|admin|robo|bot|chatbot|sistema|gpt|llm|desenvolvedor(?:a)?|hacker|root|superusuario|moderador(?:a)?|outr[oa]${SEP}(?:ia|modelo|assistente))\b`;
const EN_PREV = String.raw`(?:(?:all|any)${SEP})?(?:(?:the|your|of${SEP}the)${SEP})?(?:previous|prior|above|earlier|preceding|original)`;

const INJECTION_PATTERNS: RegExp[] = [
  // Imperativo com objeto de instrução ao modelo. "O juiz ignora as regras" não casa.
  new RegExp(
    String.raw`${NOT_AFTER}\b(?:ignore|ignorem|desconsidere|desconsiderem|esqueca|esquecam|descarte|descartem|despreze|desprezem)${SEP}${DET}${INSTR}\b`,
  ),
  new RegExp(
    String.raw`${NOT_AFTER}\b(?:ignorar|desconsiderar|esquecer)${SEP}${DET}${INSTR}${SEP}${PREV}`,
  ),
  new RegExp(
    String.raw`${START}nao${SEP}(?:siga|sigam|obedeca|obedecam|respeite|respeitem)${SEP}${DET}${INSTR}\b`,
    "m",
  ),
  // "system:" em qualquer começo de frase ou linha. "Sistema:" fica de fora (é título comum).
  new RegExp(String.raw`${START}(?:system|assistant|developer)\s*:`, "m"),
  new RegExp(String.raw`\bvoce${SEP}(?:agora${SEP}e|e${SEP}agora)${SEP}${ROLE}`),
  new RegExp(
    String.raw`\b(?:aja|atue|comporte${SEP}se|finja${SEP}ser|passe${SEP}a${SEP}agir)${SEP}como${SEP}${ROLE}`,
  ),
  new RegExp(String.raw`\bnovas?${SEP}instruc(?:ao|oes)\s*:`),
  new RegExp(
    String.raw`\b(?:ignore|disregard|forget|override)${SEP}${EN_PREV}${SEP}(?:instructions?|rules|prompts?|directions)\b`,
  ),
  new RegExp(
    String.raw`\b(?:ignore|disregard|forget)${SEP}(?:all${SEP})?(?:your${SEP})?(?:instructions|rules)\b`,
  ),
  new RegExp(String.raw`\byou${SEP}are${SEP}now\b`),
  new RegExp(String.raw`\bnew${SEP}instructions?\s*:`),
];

function detect(cleaned: string): string[] {
  const normalized = forDetection(cleaned);
  const matches: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const m = pattern.exec(normalized);
    if (m) {
      const hit = m[0].replace(/^[\s.!?;…]+/, "").trim();
      if (!matches.includes(hit)) matches.push(hit);
    }
  }
  return matches;
}

/** Decodifica entidades e remove HTML em laço: pega HTML escapado uma, duas ou três vezes. */
function decodeAndStrip(raw: string): string {
  let current = stripHtml(raw);
  for (let i = 0; i < 3; i++) {
    const next = stripHtml(decodeEntities(current));
    if (next === current) break;
    current = next;
  }
  return current;
}

const DEFAULT_MAX_CHARS = 12000;

/** HTML escapado (comum em RSS) é decodificado e removido de novo, para não esconder instrução. */
export function sanitizeExternalText(raw: string, maxChars = DEFAULT_MAX_CHARS): SanitizedText {
  const cleaned = tidyWhitespace(
    decodeAndStrip(raw).replace(INVISIBLE, "").replace(CONTROL, " "),
  ).normalize("NFC");
  const matches = detect(cleaned);
  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : DEFAULT_MAX_CHARS;
  const text = Array.from(cleaned).slice(0, limit).join("");
  return { text, injection: matches.length > 0, matches };
}

/** Envelope de dados para prompts. Um fechamento falso dentro do texto é escapado. */
export function wrapAsData(id: string, text: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_.:-]/g, "");
  // Qualquer variação de abertura ou fechamento (espaços, quebras, caixa) vira texto.
  const safeText = text.replace(/<(\s*\/?\s*fonte_externa)/gi, "&lt;$1");
  return `<fonte_externa id="${safeId}">\n${safeText}\n</fonte_externa>`;
}
