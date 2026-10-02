import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { NewSubscription, PushSubscriptionStore, SubscriptionRow } from "@/lib/push/api";
import type { PushPrefs } from "@/lib/push/schemas";
import type { BrowserFamily, DeviceClass, Platform, TargetKey } from "@/lib/push/types";

type Row = Database["public"]["Tables"]["push_subscriptions"]["Row"];
type Insert = Database["public"]["Tables"]["push_subscriptions"]["Insert"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS =
  "id, endpoint, p256dh, auth, endpoint_host, manage_token_hash, targets, want_follow, want_urgent, want_highlight, quiet_start, quiet_end, daily_limit, metrics_consent, installed, user_id, browser, device_class, platform";

function fail(op: string, e: { message: string } | null): never {
  throw new Error(`push_subscriptions: ${op} falhou: ${e?.message ?? "sem retorno"}`);
}

function toRow(
  r: Pick<
    Row,
    | "id"
    | "endpoint"
    | "p256dh"
    | "auth"
    | "endpoint_host"
    | "manage_token_hash"
    | "targets"
    | "want_follow"
    | "want_urgent"
    | "want_highlight"
    | "quiet_start"
    | "quiet_end"
    | "daily_limit"
    | "metrics_consent"
    | "installed"
    | "user_id"
    | "browser"
    | "device_class"
    | "platform"
  >,
): SubscriptionRow {
  return {
    id: r.id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    endpointHost: r.endpoint_host,
    tokenHash: r.manage_token_hash,
    targets: r.targets as TargetKey[],
    prefs: {
      follow: r.want_follow,
      urgent: r.want_urgent,
      highlight: r.want_highlight,
      quietStart: r.quiet_start,
      quietEnd: r.quiet_end,
      dailyLimit: r.daily_limit as PushPrefs["dailyLimit"],
    },
    metricsConsent: r.metrics_consent,
    installed: r.installed,
    userId: r.user_id,
    browser: (r.browser ?? "other") as BrowserFamily,
    deviceClass: (r.device_class ?? "desktop") as DeviceClass,
    platform: (r.platform ?? "other") as Platform,
  };
}

function toInsert(row: NewSubscription): Insert {
  return {
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    endpoint_host: row.endpointHost,
    manage_token_hash: row.tokenHash,
    targets: row.targets,
    want_follow: row.prefs.follow,
    want_urgent: row.prefs.urgent,
    want_highlight: row.prefs.highlight,
    quiet_start: row.prefs.quietStart,
    quiet_end: row.prefs.quietEnd,
    daily_limit: row.prefs.dailyLimit,
    metrics_consent: row.metricsConsent,
    installed: row.installed,
    user_id: row.userId,
    browser: row.browser,
    device_class: row.deviceClass,
    platform: row.platform,
    last_seen_at: new Date().toISOString(),
  };
}

/** Store das inscrições (service role: só as rotas `/api/push/*`). */
export function createPushSubscriptionStore(db: DbClient): PushSubscriptionStore {
  return {
    async findByEndpoint(endpoint) {
      const { data, error } = await db
        .from("push_subscriptions")
        .select("id, manage_token_hash")
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (error) fail("findByEndpoint", error);
      return data ? { id: data.id, tokenHash: data.manage_token_hash } : null;
    },
    async insert(row) {
      const { data, error } = await db
        .from("push_subscriptions")
        .insert(toInsert(row))
        .select("id")
        .single();
      if (error || !data) fail("insert", error);
      return { id: data.id };
    },
    async replace(id, row) {
      const { error } = await db
        .from("push_subscriptions")
        .update({ ...toInsert(row), consecutive_failures: 0 })
        .eq("id", id);
      if (error) fail("replace", error);
    },
    async get(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await db
        .from("push_subscriptions")
        .select(COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("get", error);
      return data ? toRow(data) : null;
    },
    async update(id, patch) {
      const p = patch.prefs ?? {};
      const upd: Database["public"]["Tables"]["push_subscriptions"]["Update"] = {
        ...(patch.targets ? { targets: patch.targets } : {}),
        ...(p.follow !== undefined ? { want_follow: p.follow } : {}),
        ...(p.urgent !== undefined ? { want_urgent: p.urgent } : {}),
        ...(p.highlight !== undefined ? { want_highlight: p.highlight } : {}),
        ...(p.quietStart !== undefined ? { quiet_start: p.quietStart } : {}),
        ...(p.quietEnd !== undefined ? { quiet_end: p.quietEnd } : {}),
        ...(p.dailyLimit !== undefined ? { daily_limit: p.dailyLimit } : {}),
        ...(patch.metricsConsent !== undefined ? { metrics_consent: patch.metricsConsent } : {}),
        ...(patch.installed !== undefined ? { installed: patch.installed } : {}),
        ...(patch.seen ? { last_seen_at: new Date().toISOString() } : {}),
      };
      const { error } = await db.from("push_subscriptions").update(upd).eq("id", id);
      if (error) fail("update", error);
    },
    async remove(id) {
      const { error } = await db.from("push_subscriptions").delete().eq("id", id);
      if (error) fail("remove", error);
    },
    async rotate(id, endpoint, keys) {
      const { error } = await db
        .from("push_subscriptions")
        .update({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          consecutive_failures: 0,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) fail("rotate", error);
    },
    async receiptHit(sendId, event, device, browser, now) {
      const { data, error } = await db.rpc("push_receipt_hit", {
        p_send: sendId,
        p_event: event,
        p_device: device,
        p_browser: browser,
        p_now: now.toISOString(),
      });
      if (error) fail("receiptHit", error);
      return data === true;
    },
  };
}
