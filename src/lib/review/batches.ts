/** Tamanho de cada lote da publicação forçada (um passo `forced_publish` por lote). */
export const FORCED_BATCH_SIZE = 50;

export function toBatches<T>(items: readonly T[], size: number = FORCED_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `forced:<job>:<lote>` (referência do passo na fila). */
export const forcedItemRef = (jobId: string, batch: number): string => `forced:${jobId}:${batch}`;

export function parseForcedItemRef(ref: string): { jobId: string; batch: number } | null {
  const m =
    /^forced:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,5})$/i.exec(ref);
  return m ? { jobId: m[1]!, batch: Number(m[2]) } : null;
}
