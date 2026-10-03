/**
 * Linha final de crédito de toda matéria publicada pelo pipeline: "Com informações de {fonte}",
 * com link para o original (AUT-T2, spec de autonomia §3; a atribuição é o efeito legal da
 * publicação automática de segurança, política e saúde).
 *
 * O parágrafo carrega `attrs.credit = true` e a lista de fontes, para a página pública montar os
 * links; o texto simples fica no próprio parágrafo (vale também quando a redação edita o corpo).
 */

export interface CreditSource {
  name: string;
  url: string;
}

type DocNode = { type?: unknown; attrs?: unknown; content?: unknown };
export type Doc = { type: "doc"; content: unknown[] };

/** Prefixo único da linha de crédito (também usado para reconhecer a linha em corpo editado). */
export const CREDIT_PREFIX = "Com informações de";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Fontes distintas por nome (a primeira URL de cada), na ordem de chegada. */
export function creditSourcesOf(
  items: readonly { sourceName: string; canonicalUrl: string }[],
): CreditSource[] {
  const seen = new Map<string, CreditSource>();
  for (const i of items) {
    const name = i.sourceName.trim();
    if (!name || !/^https?:\/\//i.test(i.canonicalUrl)) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, url: i.canonicalUrl });
  }
  return [...seen.values()];
}

/** "A", "A e B", "A, B e C". */
export function creditText(sources: readonly CreditSource[]): string {
  const names = sources.map((s) => s.name);
  const list =
    names.length <= 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `${CREDIT_PREFIX} ${list}`;
}

/** O último bloco do corpo já é a linha de crédito? */
export function hasCreditLine(doc: { content?: unknown }): boolean {
  const last = Array.isArray(doc.content) ? doc.content[doc.content.length - 1] : undefined;
  return isRecord(last) && isRecord(last.attrs) && last.attrs.credit === true;
}

/**
 * Acrescenta a linha final "Com informações de {fonte}" (uma ou mais fontes). Idempotente: se o
 * corpo já termina numa linha de crédito, ela é refeita. Sem fonte citável o corpo volta como
 * está (o portão de completude barra a publicação: `isComplete` → `source`).
 */
export function appendCreditLine(
  doc: { type: "doc"; content?: unknown[] },
  sources: readonly CreditSource[],
  /** Ids dos itens citados (todo parágrafo do pipeline cita ao menos um item). */
  citations: readonly string[] = [],
): Doc {
  const body = [...(doc.content ?? [])];
  if (hasCreditLine({ content: body })) body.pop();
  if (sources.length === 0) return { type: "doc", content: body };
  const node: DocNode = {
    type: "paragraph",
    attrs: {
      credit: true,
      citations: [...citations],
      sources: sources.map((s) => ({ name: s.name, url: s.url })),
    },
    content: [{ type: "text", text: creditText(sources) }],
  };
  return { type: "doc", content: [...body, node] };
}

/** Fontes de um parágrafo de crédito (lidas do corpo salvo), ou `null` se não for crédito. */
export function creditSourcesOfNode(node: unknown): CreditSource[] | null {
  if (!isRecord(node) || !isRecord(node.attrs) || node.attrs.credit !== true) return null;
  const list = node.attrs.sources;
  if (!Array.isArray(list)) return [];
  return list.flatMap((s) =>
    isRecord(s) && typeof s.name === "string" && typeof s.url === "string"
      ? [{ name: s.name, url: s.url }]
      : [],
  );
}
