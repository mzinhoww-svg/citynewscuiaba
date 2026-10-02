import "server-only";
import type { DbClient } from "@/lib/db/client";
import { createServiceClient } from "@/lib/db/client";
import type { Queue, QueuedMessage } from "./ports";
import { dedupeKey, parsePipelineMessage, type QueueName } from "./types";

export type { Queue, QueuedMessage } from "./ports";
export type { PipelineMessage, QueueName, StepName } from "./types";

export class QueueError extends Error {
  constructor(op: string, detail: string) {
    super(`fila: ${op} falhou: ${detail}`);
    this.name = "QueueError";
  }
}

function check(op: string, error: { message: string } | null): void {
  if (error) throw new QueueError(op, error.message);
}

/**
 * `namespace` prefixa o nome da fila (`<ns>:pipeline`) e isola testes que rodam em paralelo no
 * mesmo banco. Produção não usa namespace.
 */
export function createQueue(db: DbClient, opts: { namespace?: string } = {}): Queue {
  const name = (q: QueueName): string => (opts.namespace ? `${opts.namespace}:${q}` : q);

  return {
    async enqueue(queue, msg, o = {}) {
      const { data, error } = await db.rpc("queue_enqueue", {
        p_queue: name(queue),
        p_dedupe_key: o.dedupeKey ?? dedupeKey(msg),
        p_message: msg,
        p_delay_sec: Math.max(0, Math.floor(o.delaySec ?? 0)),
      });
      check("enqueue", error);
      return data !== null;
    },

    async readBatch(queue, n, vtSec) {
      const { data, error } = await db.rpc("queue_read", {
        p_queue: name(queue),
        p_n: Math.max(0, Math.floor(n)),
        p_vt_sec: Math.max(0, Math.floor(vtSec)),
      });
      check("readBatch", error);
      const out: QueuedMessage[] = [];
      for (const row of data ?? []) {
        const parsed = parsePipelineMessage(row.message);
        if (!parsed.ok) {
          // Mensagem malformada nunca é executada: vai direto para a quarentena.
          await this.quarantine(queue, { msgId: row.msg_id }, `mensagem inválida: ${parsed.error}`);
          continue;
        }
        out.push({
          msgId: row.msg_id,
          readCt: row.read_ct,
          msg: { ...parsed.value, attempt: row.read_ct },
        });
      }
      return out;
    },

    async ack(queue, msgId) {
      const { error } = await db.rpc("queue_ack", { p_queue: name(queue), p_msg_id: msgId });
      check("ack", error);
    },

    async fail(queue, msgId, message, delaySec) {
      const { error } = await db.rpc("queue_fail", {
        p_queue: name(queue),
        p_msg_id: msgId,
        p_error: message,
        p_delay_sec: Math.max(0, Math.floor(delaySec)),
      });
      check("fail", error);
    },

    async release(queue, msgId) {
      const { error } = await db.rpc("queue_release", { p_queue: name(queue), p_msg_id: msgId });
      check("release", error);
    },

    async quarantine(queue, item, message) {
      const { error } = await db.rpc("queue_quarantine", {
        p_queue: name(queue),
        p_msg_id: item.msgId,
        p_error: message,
      });
      check("quarantine", error);
    },

    async moveExhausted(queue, maxReads) {
      const { data, error } = await db.rpc("queue_move_exhausted", {
        p_queue: name(queue),
        p_max_reads: Math.max(1, Math.floor(maxReads)),
      });
      check("moveExhausted", error);
      return (data ?? []).map((row) => {
        const parsed = parsePipelineMessage(row.message);
        return { msg: parsed.ok ? parsed.value : null, error: row.error };
      });
    },

    async pending(queue, filter = {}) {
      if (filter.itemRef !== undefined) {
        // `queue_pending` (0004) não filtra por item: o tick rápido (`previous_pending`, §7.8)
        // conta direto em `jobs` (service role), com a mesma semântica.
        let q = db
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("queue", name(queue))
          .eq("message->>itemRef", filter.itemRef);
        if (filter.runId !== undefined) q = q.eq("message->>runId", filter.runId);
        if (filter.steps !== undefined) q = q.in("message->>step", [...filter.steps]);
        const { count, error } = await q;
        check("pending", error);
        return count ?? 0;
      }
      const { data, error } = await db.rpc("queue_pending", {
        p_queue: name(queue),
        ...(filter.runId !== undefined ? { p_run_id: filter.runId } : {}),
        ...(filter.steps !== undefined ? { p_steps: [...filter.steps] } : {}),
      });
      check("pending", error);
      return data ?? 0;
    },
  };
}

let defaultQueue: Queue | undefined;

/** Fila de produção com service role (criada na primeira chamada). */
export function pipelineQueue(): Queue {
  defaultQueue ??= createQueue(createServiceClient());
  return defaultQueue;
}

export const enqueue: Queue["enqueue"] = (q, msg, o) => pipelineQueue().enqueue(q, msg, o);
export const readBatch: Queue["readBatch"] = (q, n, vt) => pipelineQueue().readBatch(q, n, vt);
export const ack: Queue["ack"] = (q, id) => pipelineQueue().ack(q, id);
export const fail: Queue["fail"] = (q, id, e, d) => pipelineQueue().fail(q, id, e, d);
export const release: Queue["release"] = (q, id) => pipelineQueue().release(q, id);
export const quarantine: Queue["quarantine"] = (q, item, e) =>
  pipelineQueue().quarantine(q, item, e);
export const moveExhausted: Queue["moveExhausted"] = (q, max) =>
  pipelineQueue().moveExhausted(q, max);
