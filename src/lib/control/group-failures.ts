/**
 * Agrupamento das falhas do pipeline (item 54): a mesma etapa com o mesmo erro, ignorando números
 * e identificadores na mensagem ("timeout after 3000ms on item 12" e "… on item 99" são uma falha
 * só, com contagem 2). Funções puras; a tela de Falhas usa o resultado para o resumo por grupo.
 */

export interface FailureLike {
  id: number | string;
  step: string;
  error: string;
}

export interface FailureGroup {
  key: string;
  step: string;
  /** Mensagem normalizada: números viram `#` e identificadores viram `‹id›`. */
  message: string;
  count: number;
  ids: string[];
}

const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Sequência hexadecimal longa com letra e dígito (hash, id curto). */
const HEX_ID = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi;
const NUMBER = /\d+(?:[.,]\d+)*/g;

export function normalizeFailureMessage(message: string): string {
  return message
    .replace(UUID_ANY, "‹id›")
    .replace(HEX_ID, "‹id›")
    .replace(NUMBER, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export function failureKey(step: string, error: string): string {
  return `${step}\u0000${normalizeFailureMessage(error)}`;
}

export function groupFailures(jobs: readonly FailureLike[]): FailureGroup[] {
  const byKey = new Map<string, FailureGroup>();
  for (const j of jobs) {
    const key = failureKey(j.step, j.error);
    const group = byKey.get(key);
    if (group) {
      group.count += 1;
      group.ids.push(String(j.id));
    } else {
      byKey.set(key, {
        key,
        step: j.step,
        message: normalizeFailureMessage(j.error),
        count: 1,
        ids: [String(j.id)],
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.count - a.count || a.step.localeCompare(b.step) || a.message.localeCompare(b.message),
  );
}

/** Mesmas regras de `parseLogFilters` (ciclo em uuid; objeto `tipo:id`). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_REF = /^(source|raw|item|topic|article):[0-9a-z-]{1,80}(#[0-9a-z_-]{1,40})?$/i;

/** Logs do objeto que falhou; referência fora do formato não vira link. */
export function failureItemHref(itemRef: string): string | null {
  return ITEM_REF.test(itemRef)
    ? `/estudio/control/logs?item=${encodeURIComponent(itemRef)}`
    : null;
}

/** Detalhe da execução (ciclo) da falha. */
export function failureRunHref(runRef: string | null): string | null {
  return runRef && UUID.test(runRef) ? `/estudio/control/execucoes/${runRef}` : null;
}
