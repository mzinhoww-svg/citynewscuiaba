import "server-only";
import { studioContext } from "@/lib/studio/context";
import { afterKey, type KeyValue } from "./cursor";
import { queryQueue, queueKeys, type QueueFilter } from "./queue";

/**
 * Próximo item da fila depois de `afterId` (UX-W3-T1, item 46: "Aprovar e ir para o próximo"),
 * com a mesma aba, os mesmos filtros e a mesma ordem de `listQueue` (prazo, data, id), pulando o
 * que já não está para decidir (publicada, agendada, arquivada). A posição vem dos valores
 * atuais de `afterId`, lidos antes da aprovação: a página calcula o próximo ao montar.
 * `null` quando `afterId` não existe (ou a RLS o esconde) ou quando não há mais nada.
 */
export async function nextQueueItem(filter: QueueFilter, afterId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(afterId)) return null;
  const ctx = await studioContext();
  const { data, error } = await ctx.db
    .from("studio_queue")
    .select("id, due_at, updated_at, published_at")
    .eq("id", afterId)
    .maybeSingle();
  if (error) throw new Error(`próximo da fila: ${error.message}`);
  if (!data) return null;
  const row: Record<string, string | null> = data;
  const keys = queueKeys(filter);
  const values: KeyValue[] = keys.map((k) => row[k.col] ?? null);
  const r = await queryQueue(filter, { limit: 1, where: afterKey(keys, values), openOnly: true });
  return r.rows[0]?.id ?? null;
}
