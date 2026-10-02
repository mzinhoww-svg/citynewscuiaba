/**
 * `PushSendStore` em memória (só testes): reproduz as regras de `push_reserve` com
 * `decideReservation`, o índice único parcial (mesma matéria uma vez por inscrição) e os
 * contadores. Serve aos testes dos jobs sem banco.
 */
import {
  decideReservation,
  effectiveLimit,
  effectiveQuiet,
  PLATFORM_QUIET,
  TTL_HOURS,
  cuiabaDay,
} from "../rules";
import type { Audience, PushKind, TargetKey } from "../types";
import {
  ORPHAN_AFTER_MS,
  type DeliverySub,
  type DueDelivery,
  type PushArticle,
  type PushSend,
  type PushSendStore,
} from "./store";

export interface MemorySub extends DeliverySub {
  targets: TargetKey[];
  wantFollow: boolean;
  wantUrgent: boolean;
  wantHighlight: boolean;
  quiet: { start: number; end: number };
  dailyLimit: number;
  dayKey: string | null;
  dayCount: number;
  removed?: boolean;
}

export interface MemoryDelivery {
  id: number;
  sendId: string;
  subId: string;
  articleId: string;
  status: "queued" | "deferred" | "sent" | "failed" | "expired" | "skipped";
  skipReason: string | null;
  notBefore: string | null;
  attempts: number;
  http: number | null;
  error: string | null;
  createdAt: string;
}

export interface MemoryPushStore extends PushSendStore {
  subs: MemorySub[];
  sends: Map<string, PushSend & { reason: string | null; counters: Record<string, number> }>;
  deliveries: MemoryDelivery[];
  batches: Map<string, { status: string; afterIdx: number; untilIdx: number }>;
  articles: Map<string, PushArticle>;
  notifications: { title: string; severity: string }[];
  isPaused: boolean;
  send(id: string): PushSend & { reason: string | null; counters: Record<string, number> };
  addSend(s: Partial<PushSend> & { id: string; kind: PushKind; articleId: string }): void;
}

export function sub(id: string, targets: TargetKey[], over: Partial<MemorySub> = {}): MemorySub {
  return {
    id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: "B".repeat(87),
    auth: "a".repeat(22),
    targets,
    wantFollow: true,
    wantUrgent: true,
    wantHighlight: true,
    quiet: PLATFORM_QUIET,
    dailyLimit: 3,
    dayKey: null,
    dayCount: 0,
    ...over,
  };
}

export function article(id: string, over: Partial<PushArticle> = {}): PushArticle {
  return {
    id,
    slug: `materia-${id}`,
    status: "published",
    title: `Título ${id}`,
    dek: `Linha fina ${id}`,
    urgent: false,
    sponsored: false,
    publishMode: "human",
    sectionSlug: "cidade",
    topicSlug: null,
    neighborhoods: ["cpa"],
    sourceSlugs: ["folha-do-cerrado"],
    originLabel: "ORIGINAL CITYNEWS",
    ...over,
  };
}

export function memoryPushStore(
  init: { subs?: MemorySub[]; articles?: PushArticle[]; paused?: boolean } = {},
): MemoryPushStore {
  const subs = init.subs ?? [];
  const articles = new Map((init.articles ?? []).map((a) => [a.id, a]));
  const sends = new Map<
    string,
    PushSend & { reason: string | null; counters: Record<string, number> }
  >();
  const deliveries: MemoryDelivery[] = [];
  const batches = new Map<string, { status: string; afterIdx: number; untilIdx: number }>();
  const notifications: { title: string; severity: string }[] = [];
  let seq = 0;
  let sendSeq = 0;

  const matches = (
    s: MemorySub,
    kind: PushKind,
    targets: TargetKey[] | null,
    audience: Audience,
  ) => {
    if (s.removed) return false;
    const want =
      kind === "follow" ? s.wantFollow : kind === "urgent" ? s.wantUrgent : s.wantHighlight;
    if (!want) return false;
    if (targets) return targets.some((t) => s.targets.includes(t));
    if (audience.type === "section") return s.targets.includes(`section:${audience.slug}`);
    if (audience.type === "bairro") return s.targets.includes(`bairro:${audience.slug}`);
    return true;
  };
  const audienceSubs = (send: PushSend) => {
    const a = send.kind === "follow" ? articles.get(send.articleId) : null;
    const targets: TargetKey[] | null =
      send.kind === "follow" && a
        ? ([
            `section:${a.sectionSlug}`,
            ...a.neighborhoods.map((n) => `bairro:${n}`),
            ...a.sourceSlugs.map((x) => `source:${x}`),
          ] as TargetKey[])
        : null;
    return subs.filter((s) => matches(s, send.kind, targets, send.audience));
  };

  const store: MemoryPushStore = {
    subs,
    sends,
    deliveries,
    batches,
    articles,
    notifications,
    isPaused: init.paused ?? false,
    send: (id) => sends.get(id)!,
    addSend(s) {
      sends.set(s.id, {
        title: `Título ${s.articleId}`,
        body: `Linha fina ${s.articleId}`,
        originLabel: "ORIGINAL CITYNEWS",
        url: `/materia/materia-${s.articleId}`,
        tag: s.articleId.replace(/-/g, "").slice(0, 32),
        audience: s.kind === "follow" ? { type: "targets" } : { type: "all" },
        status: "queued",
        batchesTotal: 0,
        batchesDone: 0,
        startedAt: null,
        reason: null,
        counters: {},
        ...s,
      });
    },
    async paused() {
      return store.isPaused;
    },
    async articleForPush(id) {
      return articles.get(id) ?? null;
    },
    async ensureFollowSend(a) {
      const existing = [...sends.values()].find((s) => s.kind === "follow" && s.articleId === a.id);
      if (existing) return existing;
      if (a.urgent || a.sponsored || !["published", "updated"].includes(a.status)) return null;
      const id = `send-${++sendSeq}`;
      store.addSend({
        id,
        kind: "follow",
        articleId: a.id,
        title: a.title,
        body: a.dek,
        originLabel: a.originLabel,
        url: `/materia/${a.slug}`,
        status: "dispatching",
        startedAt: new Date().toISOString(),
      });
      return sends.get(id)!;
    },
    async getSend(id) {
      return sends.get(id) ?? null;
    },
    async planBatches(sendId, _targets, _audience, _kind, _pageSize, batchSize = 100) {
      const send = sends.get(sendId)!;
      const list = audienceSubs(send);
      const n = Math.ceil(list.length / batchSize);
      for (let i = 0; i < n; i++)
        batches.set(`${sendId}:${i + 1}`, {
          status: "queued",
          afterIdx: i * batchSize,
          untilIdx: Math.min(list.length, (i + 1) * batchSize),
        });
      Object.assign(send, {
        batchesTotal: n,
        status: n === 0 ? "sent" : "dispatching",
        startedAt: send.startedAt ?? new Date().toISOString(),
      });
      send.counters.targets_n = list.length;
      return n;
    },
    async batchSubscriptions(sendId, batchNo) {
      const b = batches.get(`${sendId}:${batchNo}`);
      if (!b) return { status: "missing", subs: [] };
      const list = audienceSubs(sends.get(sendId)!);
      return {
        status: b.status,
        subs: list
          .slice(b.afterIdx, b.untilIdx)
          .map(({ id, endpoint, p256dh, auth }) => ({ id, endpoint, p256dh, auth })),
      };
    },
    async reserve(subId, sendId, now) {
      const s = subs.find((x) => x.id === subId && !x.removed);
      const send = sends.get(sendId)!;
      if (!s) return { outcome: "gone", deliveryId: null };
      const ttlEndsAt = new Date(
        Date.parse(send.startedAt ?? now.toISOString()) + TTL_HOURS[send.kind] * 3_600_000,
      ).toISOString();
      const d = decideReservation({
        kind: send.kind,
        want: { follow: s.wantFollow, urgent: s.wantUrgent, highlight: s.wantHighlight },
        quiet: effectiveQuiet(s.quiet),
        limit: effectiveLimit(s.dailyLimit),
        dayKey: s.dayKey,
        dayCount: s.dayCount,
        hasArticle: deliveries.some(
          (x) =>
            x.subId === subId &&
            x.articleId === send.articleId &&
            ["queued", "deferred", "sent"].includes(x.status),
        ),
        ttlEndsAt,
        now: now.toISOString(),
      });
      const id = ++seq;
      const base: MemoryDelivery = {
        id,
        sendId,
        subId,
        articleId: send.articleId,
        status: "skipped",
        skipReason: null,
        notBefore: null,
        attempts: 0,
        http: null,
        error: null,
        createdAt: now.toISOString(),
      };
      if (d.outcome === "ok") {
        deliveries.push({ ...base, status: "queued" });
        s.dayKey = cuiabaDay(now);
        s.dayCount = (s.dayKey === cuiabaDay(now) && s.dayKey ? s.dayCount : 0) + 1;
        send.counters.queued_n = (send.counters.queued_n ?? 0) + 1;
      } else if (d.outcome === "deferred") {
        if (send.kind === "follow")
          for (const x of deliveries)
            if (x.subId === subId && x.status === "deferred")
              Object.assign(x, { status: "skipped", skipReason: "coalesced" });
        deliveries.push({ ...base, status: "deferred", notBefore: d.notBefore });
      } else {
        deliveries.push({ ...base, skipReason: d.outcome.replace("skipped_", "") });
        send.counters[`${d.outcome}_n`] = (send.counters[`${d.outcome}_n`] ?? 0) + 1;
      }
      return { outcome: d.outcome, deliveryId: id };
    },
    async deliveryResult(id, outcome, http, error, retryAt) {
      const d = deliveries.find((x) => x.id === id)!;
      const send = sends.get(d.sendId)!;
      d.http = http;
      d.error = error;
      if (outcome === "accepted") {
        d.status = "sent";
        send.counters.accepted_n = (send.counters.accepted_n ?? 0) + 1;
      } else if (outcome === "gone") {
        d.status = "failed";
        send.counters.removed_n = (send.counters.removed_n ?? 0) + 1;
        const s = subs.find((x) => x.id === d.subId);
        if (s) s.removed = true;
      } else if (outcome === "retry") {
        d.status = "queued";
        d.attempts += 1;
        d.notBefore = retryAt;
      } else {
        d.status = "failed";
        send.counters.failed_n = (send.counters.failed_n ?? 0) + 1;
      }
    },
    async finishBatch(sendId, batchNo) {
      const b = batches.get(`${sendId}:${batchNo}`);
      const send = sends.get(sendId)!;
      if (b && b.status !== "done") {
        b.status = "done";
        send.batchesDone += 1;
      }
      const allDone = send.batchesDone >= send.batchesTotal;
      if (allDone && send.status === "dispatching") send.status = "sent";
      return { allDone };
    },
    async pauseSend(sendId, reason) {
      const send = sends.get(sendId)!;
      send.status = "paused";
      send.reason = reason;
    },
    async cancelSend(sendId, reason) {
      const send = sends.get(sendId)!;
      // Como no banco: só envio ainda vivo (um `sent` não volta atrás).
      if (!["queued", "scheduled", "dispatching", "paused"].includes(send.status)) return;
      send.status = "cancelled";
      send.reason = reason;
    },
    async pauseBatch(sendId, batchNo) {
      const b = batches.get(`${sendId}:${batchNo}`);
      if (b) b.status = "paused";
    },
    async dueDeliveries(sendId, now, limit = 100) {
      const t = now.getTime();
      const out: DueDelivery[] = [];
      for (const d of deliveries) {
        if (d.sendId !== sendId || !["queued", "deferred"].includes(d.status)) continue;
        const orphan =
          d.status === "queued" &&
          d.attempts === 0 &&
          Date.parse(d.createdAt) < t - ORPHAN_AFTER_MS;
        if (!orphan && (!d.notBefore || Date.parse(d.notBefore) > t)) continue;
        const s = subs.find((x) => x.id === d.subId && !x.removed);
        if (!s) continue;
        out.push({
          id: d.id,
          subscription: { id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          attempts: d.attempts,
          deferred: d.status === "deferred",
        });
        if (out.length >= limit) break;
      }
      return out;
    },
    async claimDue(id, now) {
      const d = deliveries.find((x) => x.id === id);
      if (!d) return "gone";
      if (d.status === "skipped" && d.skipReason === "coalesced") return "coalesced";
      if (d.status !== "queued" && d.status !== "deferred") return "gone";
      const send = sends.get(d.sendId)!;
      const ttl =
        Date.parse(send.startedAt ?? now.toISOString()) + TTL_HOURS[send.kind] * 3_600_000;
      if (now.getTime() > ttl) {
        d.status = "expired";
        return "expired";
      }
      if (d.status === "queued") return "ok";
      const s = subs.find((x) => x.id === d.subId)!;
      const count = s.dayKey === cuiabaDay(now) ? s.dayCount : 0;
      if (count >= effectiveLimit(s.dailyLimit)) {
        d.status = "skipped";
        d.skipReason = "limit";
        return "skipped_limit";
      }
      d.status = "queued";
      d.notBefore = null;
      s.dayKey = cuiabaDay(now);
      s.dayCount = count + 1;
      return "ok";
    },
    async expirePending(sendId) {
      for (const d of deliveries)
        if (d.sendId === sendId && (d.status === "queued" || d.status === "deferred"))
          Object.assign(d, { status: "expired", skipReason: "expired" });
    },
    async notifyVapidInvalid() {
      notifications.push({ title: "Chaves VAPID inválidas", severity: "critical" });
    },
  };
  return store;
}
