/**
 * Texto de abertura das listas do Guia (A-214): um artigo corrido que cita cada lugar e um
 * comentário curto por lugar, escritos só com os dados que o Guia tem (nome, bairro, nota, número
 * de avaliações, posição e faixa de preço). Nunca afirma visita, prova ou apuração presencial
 * (CLAUDE.md §5.3) e nunca cita número que não esteja nos dados. Se o texto do modelo não passa na
 * conferência, entra o texto montado aqui com os mesmos dados (modo degradado, nunca fila humana).
 */
import type { CallAgent } from "@/lib/ai/call-agent";
import { GuideWriterSchema, type GuideWriterOutput } from "@/lib/ai/schemas/guide-writer";

export interface ArticleVenue {
  id: string;
  position: number;
  name: string;
  neighborhood: string | null;
  rating: number | null;
  ratingCount: number | null;
  ratingSource: "google" | "tripadvisor" | "manual" | null;
  priceLevel: number | null;
}

export interface ArticleInput {
  title: string;
  /** Substantivo no plural ("padarias"). */
  noun: string;
  venues: readonly ArticleVenue[];
}

export interface ListArticle {
  intro: string;
  /** Comentário por id de lugar; lugar sem comentário fica de fora. */
  notes: Record<string, string>;
  source: "ai" | "fallback";
}

/** Parágrafos do texto (separados por linha em branco). */
export function articleParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Assinatura dos lugares na ordem: muda quando a lista muda e o texto precisa ser refeito. */
export function articleSignature(venueIds: readonly string[]): string {
  return venueIds.join(",");
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Palavras que não identificam um lugar (tipo, ligação, cidade). */
const GENERIC = new Set(
  (
    "restaurante restaurantes padaria cafeteria cafe bar bares pizzaria hamburgueria churrascaria " +
    "sorveteria lanchonete hotel museu parque peixaria cozinha paes doces artesanal com para " +
    "cuiaba centro jardim casa"
  ).split(" "),
);

/** Palavras do nome que o identificam (4+ letras, fora das genéricas). */
function nameTokens(name: string): string[] {
  const words = fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
  return words.length > 0
    ? words
    : fold(name)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function mentions(text: string, name: string): boolean {
  const words = new Set(fold(text).split(/[^a-z0-9]+/));
  return nameTokens(name).some((w) => words.has(w));
}

/**
 * Frases que afirmam visita, prova ou apuração que não aconteceu, ou que rotulam o texto como
 * gerado (proibidas no público, §5.3).
 */
const FORBIDDEN: RegExp[] = [
  /\b(visitamos|visitei|provamos|provei|experimentamos|experimentei|estivemos|testamos|degustamos|comemos|bebemos|fomos|conferimos pessoalmente)\b/i,
  /\bnossa (equipe|reportagem|reda[cç][aã]o)\b/i,
  /\b(eu|n[oó]s)\b/i,
  /intelig[eê]ncia artificial/i,
  /\bIA\b/,
  /gerad[oa]s? (por|automaticamente)/i,
  /modelo de linguagem|chatgpt/i,
];

const ratingText = (r: number) => r.toFixed(1).replace(".", ",");

/** Números que o texto pode citar: posições, total, notas e números de avaliações. */
function allowedNumbers(venues: readonly ArticleVenue[]): Set<string> {
  const out = new Set<string>([String(venues.length)]);
  for (const v of venues) {
    out.add(String(v.position));
    // Número que faz parte do nome ou do bairro ("Bakehouse 44").
    for (const m of `${v.name} ${v.neighborhood ?? ""}`.matchAll(/\d+(?:[.,]\d+)*/g)) out.add(m[0]);
    if (v.rating !== null) {
      out.add(ratingText(v.rating));
      out.add(v.rating.toFixed(1));
      if (Number.isInteger(v.rating)) out.add(String(v.rating));
    }
    if (v.ratingCount !== null) {
      out.add(String(v.ratingCount));
      out.add(v.ratingCount.toLocaleString("pt-BR"));
    }
  }
  return out;
}

function numbersOk(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) if (!allowed.has(m[0])) bad.push(m[0]);
  return bad;
}

function textProblems(text: string, allowed: Set<string>): string[] {
  const problems: string[] = [];
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`frase proibida: ${re.source}`);
  const bad = numbersOk(text, allowed);
  if (bad.length > 0) problems.push(`número fora dos dados: ${bad.join(", ")}`);
  return problems;
}

/** Confere o texto do modelo: todos os lugares citados, sem número inventado nem frase proibida. */
export function checkArticle(
  out: GuideWriterOutput,
  venues: readonly ArticleVenue[],
): { ok: true; article: ListArticle } | { ok: false; problems: string[] } {
  const allowed = allowedNumbers(venues);
  const problems = textProblems(out.article, allowed);
  for (const v of venues) if (!mentions(out.article, v.name)) problems.push(`não cita ${v.name}`);
  const ids = new Set(venues.map((v) => v.id));
  const notes: Record<string, string> = {};
  for (const n of out.notes) {
    if (!ids.has(n.id) || notes[n.id]) continue;
    const p = textProblems(n.note, allowed);
    if (p.length > 0) problems.push(...p.map((x) => `comentário de ${n.id}: ${x}`));
    else notes[n.id] = n.note.replace(/\s+/g, " ").trim();
  }
  if (problems.length > 0) return { ok: false, problems };
  const intro = articleParagraphs(out.article).join("\n\n");
  return { ok: true, article: { intro, notes, source: "ai" } };
}

const SOURCE: Record<string, string> = {
  google: "no Google",
  tripadvisor: "no TripAdvisor",
  manual: "",
};

function ratingPhrase(v: ArticleVenue): string {
  if (v.rating === null) return "";
  const where = v.ratingSource ? SOURCE[v.ratingSource] : "";
  const count =
    v.ratingCount !== null
      ? ` em ${v.ratingCount.toLocaleString("pt-BR")} avaliações${where ? ` ${where}` : ""}`
      : where
        ? ` ${where}`
        : "";
  return `nota ${ratingText(v.rating)}${count}`;
}

const inHood = (v: ArticleVenue) => (v.neighborhood ? `, no bairro ${v.neighborhood}` : "");
const withRating = (v: ArticleVenue) => {
  const r = ratingPhrase(v);
  return r ? `, com ${r}` : "";
};

/** Texto montado com os dados quando o do modelo falha ou não passa na conferência. */
export function fallbackArticle(input: ArticleInput): ListArticle {
  const vs = [...input.venues].sort((a, b) => a.position - b.position);
  const [first, second, ...rest] = vs;
  const paragraphs: string[] = [];
  paragraphs.push(
    `Quem procura ${input.noun} em Cuiabá encontra muita opção, mas poucas reúnem ao mesmo tempo nota alta e um grande número de clientes satisfeitos. Esta lista junta as ${vs.length} que mais se destacam nesses dois quesitos.`,
  );
  if (first) {
    let p = `No topo está ${first.name}${inHood(first)}${withRating(first)}.`;
    if (second) p += ` Logo atrás vem ${second.name}${inHood(second)}${withRating(second)}.`;
    paragraphs.push(p);
  }
  if (rest.length > 0) {
    const parts = rest.map(
      (v) => `${v.name}${v.neighborhood ? ` (${v.neighborhood})` : ""}${withRating(v)}`,
    );
    const joined =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join("; ")} e ${parts[parts.length - 1]}`;
    paragraphs.push(`Completam a lista ${joined}.`);
  }
  paragraphs.push(
    "Endereço, telefone, horário e o link de cada lugar estão logo abaixo, na ordem da lista.",
  );
  return { intro: paragraphs.join("\n\n"), notes: {}, source: "fallback" };
}

const PRICE = ["", "preço baixo", "preço moderado", "preço alto", "preço muito alto"];

/** Bloco de dados de um lugar para o modelo (só o que o texto pode usar). */
export function venueFacts(v: ArticleVenue): string {
  const lines = [`Posição: ${v.position}`, `Nome: ${v.name}`];
  if (v.neighborhood) lines.push(`Bairro: ${v.neighborhood}`);
  if (v.rating !== null) lines.push(`Nota: ${ratingText(v.rating)}`);
  if (v.ratingCount !== null) lines.push(`Avaliações: ${v.ratingCount.toLocaleString("pt-BR")}`);
  if (v.ratingSource && SOURCE[v.ratingSource]) lines.push(`Fonte da nota: ${v.ratingSource}`);
  if (v.priceLevel && PRICE[v.priceLevel]) lines.push(`Faixa de preço: ${PRICE[v.priceLevel]}`);
  return lines.join("\n");
}

export interface WriteArticleDeps {
  callAgent: CallAgent;
  /** Tentativas do modelo nesta chamada (padrão 2). */
  attempts?: number;
  /** Sem `true`, texto reprovado devolve `failed` em vez do texto montado (outra rodada tenta). */
  fallback?: boolean;
  /** Problemas da rodada anterior, pedidos como correção já na primeira tentativa. */
  previous?: readonly string[];
  signal?: AbortSignal;
}

export type WriteResult =
  (ListArticle & { problems: string[] }) | { failed: true; problems: string[] };

/**
 * Escreve o texto da lista: modelo com conferência; falha técnica ou texto reprovado tenta de
 * novo e, no fim, usa o texto montado com os dados. Devolve também os problemas encontrados.
 */
export async function writeListArticle(
  deps: WriteArticleDeps,
  input: ArticleInput,
): Promise<WriteResult> {
  const problems: string[] = [];
  const asked = [...(deps.previous ?? [])];
  const attempts = deps.attempts ?? 2;
  for (let i = 0; i < attempts; i += 1) {
    const r = await deps.callAgent(
      "guide_writer",
      {
        system: "",
        data: input.venues.map((v) => ({ id: v.id, text: venueFacts(v) })),
        task:
          `Escreva o texto de abertura da lista "${input.title}" (${input.venues.length} ${input.noun}), ` +
          "citando cada lugar pelo nome, na ordem da lista, e um comentário curto para cada um (use o id do bloco)." +
          (asked.length > 0 ? ` Corrija: ${asked.slice(-3).join("; ")}.` : ""),
      },
      GuideWriterSchema,
      deps.signal ? { signal: deps.signal } : {},
    );
    if (!r.ok) {
      problems.push(`modelo: ${r.error}`);
      continue;
    }
    const checked = checkArticle(r.value, input.venues);
    if (checked.ok) return { ...checked.article, problems };
    problems.push(...checked.problems);
    asked.push(...checked.problems);
  }
  if (deps.fallback === false) return { failed: true, problems };
  return { ...fallbackArticle(input), problems };
}
