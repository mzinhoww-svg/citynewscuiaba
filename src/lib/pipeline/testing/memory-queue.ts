import type { Queue, QueuedMessage } from "../ports";
import { dedupeKey, type PipelineMessage, type QueueName } from "../types";

interface Row {
  id: number;
  queue: QueueName;
  key: string;
  msg: PipelineMessage;
  readCt: number;
  visibleAt: number;
  lastDelaySec?: number;
}

/** Fila em memória com a mesma semântica da tabela `jobs` (só testes). */
export function createMemoryQueue(clock: () => number = () => Date.now()) {
  let seq = 0;
  const rows: Row[] = [];
  const quarantine: { row: Row; error: string }[] = [];
  const remove = (queue: QueueName, id: number) => {
    const i = rows.findIndex((r) => r.queue === queue && r.id === id);
    return i >= 0 ? rows.splice(i, 1)[0] : undefined;
  };

  const queue: Queue = {
    async enqueue(q, msg, o = {}) {
      const key = o.dedupeKey ?? dedupeKey(msg);
      if (rows.some((r) => r.queue === q && r.key === key)) return false;
      rows.push({
        id: ++seq,
        queue: q,
        key,
        msg,
        readCt: 0,
        visibleAt: clock() + (o.delaySec ?? 0) * 1000,
      });
      return true;
    },
    async readBatch(q, n, vtSec) {
      const ready = rows.filter((r) => r.queue === q && r.visibleAt <= clock()).slice(0, n);
      return ready.map((r): QueuedMessage => {
        r.readCt++;
        r.visibleAt = clock() + vtSec * 1000;
        return { msgId: r.id, readCt: r.readCt, msg: { ...r.msg, attempt: r.readCt } };
      });
    },
    async ack(q, id) {
      remove(q, id);
    },
    async fail(q, id, _error, delaySec) {
      const r = rows.find((x) => x.queue === q && x.id === id);
      if (r) {
        r.visibleAt = clock() + delaySec * 1000;
        r.lastDelaySec = delaySec;
      }
    },
    async release(q, id) {
      const r = rows.find((x) => x.queue === q && x.id === id);
      if (r) {
        r.visibleAt = clock();
        r.readCt = Math.max(0, r.readCt - 1);
      }
    },
    async quarantine(q, item, error) {
      const row = remove(q, item.msgId);
      if (row) quarantine.push({ row, error });
    },
    async moveExhausted(q, max) {
      const out = rows.filter((r) => r.queue === q && r.readCt >= max && r.visibleAt <= clock());
      const error = "tentativas esgotadas sem confirmação";
      for (const r of out) await queue.quarantine(q, { msgId: r.id }, error);
      return out.map((r) => ({ msg: r.msg, error }));
    },
    async pending(q, filter = {}) {
      return rows.filter(
        (r) =>
          r.queue === q &&
          (filter.runId === undefined || r.msg.runId === filter.runId) &&
          (filter.itemRef === undefined || r.msg.itemRef === filter.itemRef) &&
          (filter.steps === undefined || filter.steps.includes(r.msg.step)),
      ).length;
    },
  };

  return Object.assign(queue, {
    messages: (q: QueueName = "pipeline") => rows.filter((r) => r.queue === q).map((r) => r.msg),
    quarantined: () => quarantine.map((x) => ({ msg: x.row.msg, error: x.error })),
    delays: () => rows.flatMap((r) => (r.lastDelaySec === undefined ? [] : [r.lastDelaySec])),
    readCounts: () => rows.map((r) => r.readCt),
    setReadCount: (q: QueueName, key: string, n: number) => {
      const r = rows.find((x) => x.queue === q && x.key === key);
      if (r) r.readCt = n;
    },
  });
}
