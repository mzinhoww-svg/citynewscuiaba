import "server-only";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import type { DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import { tagFor } from "@/lib/push/payload";
import type {
  ClaimOutcome,
  DeliverySub,
  DueDelivery,
  PushSend,
  PushSendStore,
} from "@/lib/push/steps/store";
import { BODY_MAX, sanitizeNotificationText, TITLE_MAX } from "@/lib/push/text";
import type { Audience, PushKind, ReserveOutcome, SendStatus, TargetKey } from "@/lib/push/types";

type SendRow = Database["public"]["Tables"]["push_sends"]["Row"];

function fail(op: string, e: { message: string } | null): never {
  throw new Error(`push_sends: ${op} falhou: ${e?.message ?? "sem retorno"}`);
}

function toSend(r: SendRow): PushSend {
  return {
    id: r.id,
    kind: r.kind as PushKind,
    articleId: r.article_id,
    title: r.title,
    body: r.body,
    originLabel: r.origin_label,
    url: r.url,
    tag: r.tag,
    audience: (r.audience as Audience | null) ?? { type: "targets" },
    status: r.status as SendStatus,
    batchesTotal: r.batches_total,
    batchesDone: r.batches_done,
    startedAt: r.started_at,
  };
}

/** Rótulo principal da matéria (D-P18): automático, normalizado ou original. */
export function originLabelFor(a: { publishMode: "human" | "auto" | null; kind: string }): string {
  if (a.publishMode === "auto") return LABEL_TEXT.auto_published;
  if (a.kind === "normalized") return LABEL_TEXT.normalized;
  return LABEL_TEXT.original;
}

const SUB_COLS = "id, endpoint, p256dh, auth";

/** Store do envio (service role: só o drain). */
export function createPushSendStore(db: DbClient): PushSendStore {
  /** Filtro do público de um envio (mesmo em `planBatches` e `batchSubscriptions`). */
  function audienceQuery(kind: PushKind, targets: TargetKey[] | null, audience: Audience) {
    let q = db.from("push_subscriptions").select(SUB_COLS);
    q = q.eq(
      kind === "follow" ? "want_follow" : kind === "urgent" ? "want_urgent" : "want_highlight",
      true,
    );
    if (targets) q = q.overlaps("targets", targets);
    else if (audience.type === "section") q = q.contains("targets", [`section:${audience.slug}`]);
    else if (audience.type === "bairro") q = q.contains("targets", [`bairro:${audience.slug}`]);
    return q;
  }

  async function sendTargets(send: PushSend): Promise<TargetKey[] | null> {
    if (send.kind !== "follow") return null;
    const a = await store.articleForPush(send.articleId);
    if (!a) return [];
    const { articleTargets } = await import("@/lib/push/rules");
    return articleTargets(a);
  }

  const store: PushSendStore = {
    async paused() {
      const { data, error } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "push.paused")
        .maybeSingle();
      if (error) fail("paused", error);
      const v = data?.value as { on?: boolean } | null;
      return v?.on === true;
    },

    async articleForPush(id) {
      const { data, error } = await db
        .from("articles")
        .select(
          "id, slug, status, title, dek, kind, urgent, sponsored, publish_mode, section_slug, neighborhoods, topics(slug), article_sources(collected_items(sources(slug)))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) fail("articleForPush", error);
      if (!data) return null;
      const topic = data.topics as { slug: string } | null;
      const links = (data.article_sources ?? []) as {
        collected_items: { sources: { slug: string } | null } | null;
      }[];
      const sourceSlugs = [
        ...new Set(
          links.map((l) => l.collected_items?.sources?.slug).filter((s): s is string => Boolean(s)),
        ),
      ];
      return {
        id: data.id,
        slug: data.slug,
        status: data.status,
        title: data.title,
        dek: data.dek,
        urgent: data.urgent,
        sponsored: data.sponsored,
        publishMode: data.publish_mode,
        sectionSlug: data.section_slug,
        topicSlug: topic?.slug ?? null,
        neighborhoods: data.neighborhoods ?? [],
        sourceSlugs,
        originLabel: originLabelFor({ publishMode: data.publish_mode, kind: data.kind }),
      };
    },

    async ensureFollowSend(a, notBefore) {
      const existing = await db
        .from("push_sends")
        .select("*")
        .eq("kind", "follow")
        .eq("article_id", a.id)
        .maybeSingle();
      if (existing.error) fail("ensureFollowSend", existing.error);
      if (existing.data) return toSend(existing.data);
      if (a.urgent || a.sponsored || a.status !== "published") return null;
      const { data, error } = await db
        .from("push_sends")
        .insert({
          kind: "follow",
          article_id: a.id,
          title: sanitizeNotificationText(a.title, TITLE_MAX),
          body: sanitizeNotificationText(a.dek, BODY_MAX),
          origin_label: a.originLabel,
          url: `/materia/${a.slug}`,
          tag: tagFor(a.id),
          audience: { type: "targets" },
          status: "dispatching",
          not_before: notBefore,
          started_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) {
        // Corrida: outro drain criou o envio da mesma matéria.
        const again = await db
          .from("push_sends")
          .select("*")
          .eq("kind", "follow")
          .eq("article_id", a.id)
          .maybeSingle();
        if (again.data) return toSend(again.data);
        fail("ensureFollowSend", error);
      }
      return toSend(data!);
    },

    async getSend(id) {
      const { data, error } = await db.from("push_sends").select("*").eq("id", id).maybeSingle();
      if (error) fail("getSend", error);
      return data ? toSend(data) : null;
    },

    async planBatches(sendId, targets, audience, kind, pageSize = 500, batchSize = 100) {
      const ids: string[] = [];
      let after: string | null = null;
      for (;;) {
        let q = audienceQuery(kind, targets, audience).order("id").limit(pageSize);
        if (after) q = q.gt("id", after);
        const { data, error } = await q;
        if (error) fail("planBatches", error);
        for (const r of data ?? []) ids.push(r.id);
        if (!data || data.length < pageSize) break;
        after = data[data.length - 1]!.id;
      }
      const rows: Database["public"]["Tables"]["push_batches"]["Insert"][] = [];
      for (let i = 0, n = 1; i < ids.length; i += batchSize, n++)
        rows.push({
          send_id: sendId,
          batch_no: n,
          after_id: i === 0 ? null : ids[i - 1]!,
          until_id: ids[Math.min(ids.length, i + batchSize) - 1]!,
          status: "queued",
        });
      if (rows.length) {
        const { error } = await db
          .from("push_batches")
          .upsert(rows, { onConflict: "send_id,batch_no" });
        if (error) fail("planBatches:batches", error);
      }
      // `started_at` vem do despacho (`push_dispatch_due`) ou do nascimento do `follow`: o TTL
      // conta a partir dele; só preenche quando ainda não existe.
      const cur = await db.from("push_sends").select("started_at").eq("id", sendId).maybeSingle();
      if (cur.error) fail("planBatches:send", cur.error);
      const { error } = await db
        .from("push_sends")
        .update({
          targets_n: ids.length,
          batches_total: rows.length,
          status: rows.length === 0 ? "sent" : "dispatching",
          ...(cur.data?.started_at ? {} : { started_at: new Date().toISOString() }),
          ...(rows.length === 0 ? { finished_at: new Date().toISOString() } : {}),
        })
        .eq("id", sendId)
        .in("status", ["queued", "dispatching"]);
      if (error) fail("planBatches:send", error);
      return rows.length;
    },

    async batchSubscriptions(sendId, batchNo) {
      const b = await db
        .from("push_batches")
        .select("*")
        .eq("send_id", sendId)
        .eq("batch_no", batchNo)
        .maybeSingle();
      if (b.error) fail("batchSubscriptions", b.error);
      if (!b.data) return { status: "missing", subs: [] };
      const send = await store.getSend(sendId);
      if (!send) return { status: "missing", subs: [] };
      let q = audienceQuery(send.kind, await sendTargets(send), send.audience)
        .lte("id", b.data.until_id)
        .order("id");
      if (b.data.after_id) q = q.gt("id", b.data.after_id);
      const { data, error } = await q;
      if (error) fail("batchSubscriptions:subs", error);
      return { status: b.data.status, subs: (data ?? []) as DeliverySub[] };
    },

    async reserve(subId, sendId, now) {
      const { data, error } = await db.rpc("push_reserve", {
        p_sub: subId,
        p_send: sendId,
        p_now: now.toISOString(),
      });
      if (error) fail("reserve", error);
      const r = data?.[0];
      return {
        outcome: (r?.outcome ?? "gone") as ReserveOutcome | "gone",
        deliveryId: r?.delivery_id ?? null,
      };
    },

    async deliveryResult(id, outcome, http, error, retryAt) {
      const r = await db.rpc("push_delivery_result", {
        p_delivery: id,
        p_outcome: outcome,
        ...(http !== null ? { p_http: http } : {}),
        ...(error !== null ? { p_error: error } : {}),
        ...(retryAt !== null ? { p_retry_at: retryAt } : {}),
      });
      if (r.error) fail("deliveryResult", r.error);
    },

    async finishBatch(sendId, batchNo) {
      const { data, error } = await db.rpc("push_finish_batch", {
        p_send: sendId,
        p_batch: batchNo,
      });
      if (error) fail("finishBatch", error);
      return { allDone: data === true };
    },

    async pauseSend(sendId, reason) {
      const { error } = await db
        .from("push_sends")
        .update({ status: "paused", status_reason: reason })
        .eq("id", sendId)
        .in("status", ["queued", "scheduled", "dispatching"]);
      if (error) fail("pauseSend", error);
    },

    async cancelSend(sendId, reason) {
      const { error } = await db
        .from("push_sends")
        .update({ status: "cancelled", status_reason: reason })
        .eq("id", sendId)
        .in("status", ["queued", "scheduled", "dispatching", "paused"]);
      if (error) fail("cancelSend", error);
    },

    async pauseBatch(sendId, batchNo) {
      const { error } = await db
        .from("push_batches")
        .update({ status: "paused" })
        .eq("send_id", sendId)
        .eq("batch_no", batchNo)
        .eq("status", "queued");
      if (error) fail("pauseBatch", error);
    },

    async dueDeliveries(sendId, now, limit = 100) {
      const { data, error } = await db
        .from("push_deliveries")
        .select("id, status, attempts, push_subscriptions(id, endpoint, p256dh, auth)")
        .eq("send_id", sendId)
        .in("status", ["queued", "deferred"])
        .lte("not_before", now.toISOString())
        .order("not_before")
        .limit(limit);
      if (error) fail("dueDeliveries", error);
      const out: DueDelivery[] = [];
      for (const d of data ?? []) {
        if (d.status === "queued" && d.attempts === 0) continue;
        const s = d.push_subscriptions as DeliverySub | null;
        if (!s) continue;
        out.push({
          id: d.id,
          subscription: s,
          attempts: d.attempts,
          deferred: d.status === "deferred",
        });
      }
      return out;
    },

    async claimDue(deliveryId, now) {
      const { data, error } = await db.rpc("push_claim_due", {
        p_delivery: deliveryId,
        p_now: now.toISOString(),
      });
      if (error) fail("claimDue", error);
      return (data ?? "gone") as ClaimOutcome;
    },

    async notifyVapidInvalid(sendId) {
      const p: Json = {
        kind: "push_vapid_invalid",
        channel: "control_center",
        severity: "critical",
        objectRef: `push:${sendId}`,
        dedupeKey: "push-vapid-invalid",
        title: "Chaves VAPID inválidas",
        body: "O serviço de push recusou a assinatura VAPID (403). Os envios foram pausados; confira NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT na Vercel e use Retomar envios em Notificações.",
      };
      const { error } = await db.rpc("notify_once", { p, p_window_sec: 3600 });
      if (error) fail("notifyVapidInvalid", error);
    },
  };
  return store;
}
