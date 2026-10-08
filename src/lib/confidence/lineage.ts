import { textTokens } from "@/lib/pipeline/text-features";

/**
 * Linhagens independentes de um assunto (auditoria 360, P1-02). Veículos que republicam o mesmo
 * texto (release, agência, cópia entre portais) não confirmam o fato de forma independente: contam
 * como uma linhagem só. Dois itens caem na mesma linhagem quando são do mesmo veículo ou quando os
 * trechos compartilham a maior parte das sequências de 4 palavras (cópia, com ou sem acréscimo no
 * fim). Título sozinho nunca junta veículos: títulos curtos se repetem entre apurações distintas.
 *
 * Indicador informativo (D-03, decisão do dono): gravado na decisão do `verify` ao lado de
 * `independentSources`, sem mudar portão, score de confiança nem revisor (ADR-012). Passar a usá-lo
 * na confiança é uma decisão futura e explícita do dono, nunca automática.
 */
export interface LineageItem {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string | null;
}

/** Trecho com menos palavras que isto não serve de prova de cópia. */
const MIN_TOKENS = 15;
const SHINGLE = 4;
/** Fração das sequências do trecho menor que aparece no maior para contar como cópia. */
const CONTAINMENT = 0.8;

function shingles(text: string | null): Set<string> | null {
  const t = textTokens(text ?? "");
  if (t.length < MIN_TOKENS) return null;
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= t.length; i++) out.add(t.slice(i, i + SHINGLE).join(" "));
  return out;
}

function copied(a: Set<string> | null, b: Set<string> | null): boolean {
  if (!a || !b) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const s of small) if (large.has(s)) shared++;
  return shared / small.size >= CONTAINMENT;
}

/** Método registrado na decisão, para auditar falsos agrupamentos e comparar versões. */
export const LINEAGE_METHOD = `shingle${SHINGLE}-containment${CONTAINMENT}-min${MIN_TOKENS}`;

export function independentLineages(items: readonly LineageItem[]): number {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const prints = items.map((i) => shingles(i.excerpt));
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++)
      if (items[a]!.sourceId === items[b]!.sourceId || copied(prints[a]!, prints[b]!)) union(a, b);

  return new Set(items.map((_, i) => find(i))).size;
}

/** Medição que nunca falha a etapa: erro no cálculo vira `null` (sem medida), nunca exceção. */
export function safeIndependentLineages(items: readonly LineageItem[]): number | null {
  try {
    return independentLineages(items);
  } catch {
    return null;
  }
}
