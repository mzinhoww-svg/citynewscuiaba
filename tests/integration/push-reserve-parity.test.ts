// @vitest-environment node
// Paridade entre `decideReservation` (src/lib/push/rules.ts) e `push_reserve` (0040): os mesmos
// casos de tests/fixtures/push/reserve-cases.json rodam contra o banco (Review Focus 2 do plano).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import type { ReserveInput } from "@/lib/push/rules";
import cases from "../fixtures/push/reserve-cases.json";

const service = createServiceClient();
const subs: string[] = [];
const sends: string[] = [];
let articles: string[] = [];
let seq = 0;

beforeAll(async () => {
  const { data } = await service.from("articles").select("id").order("id").limit(60);
  articles = (data ?? []).map((r) => r.id);
  await service.from("app_settings").upsert([
    { key: "push.default_daily_limit", value: 3 },
    { key: "push.quiet_start", value: 22 },
    { key: "push.quiet_end", value: 7 },
  ]);
});

afterAll(async () => {
  if (sends.length) await service.from("push_sends").delete().in("id", sends);
  if (subs.length) await service.from("push_subscriptions").delete().in("id", subs);
});

const TTL_H: Record<string, number> = { follow: 6, urgent: 2, highlight: 12 };

/** Inscrição e envio que reproduzem o caso; `hasArticle` vira uma entrega `sent` anterior. */
async function materialize(input: ReserveInput) {
  seq++;
  const article = articles[seq % articles.length]!;
  const sub = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/par-${randomBytes(6).toString("hex")}`,
      p256dh: randomBytes(65).toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      manage_token_hash: randomBytes(32).toString("base64url"),
      want_follow: input.want.follow,
      want_urgent: input.want.urgent,
      want_highlight: input.want.highlight,
      quiet_start: input.quiet.start,
      quiet_end: input.quiet.end,
      daily_limit: input.limit,
      day_key: input.dayKey,
      day_count: input.dayCount,
    })
    .select("id")
    .single();
  if (sub.error) throw new Error(sub.error.message);
  subs.push(sub.data.id);
  // Um `follow` por matéria (índice único): o pool do seed é pequeno e os casos o reutilizam.
  if (input.kind === "follow") {
    const old = await service
      .from("push_sends")
      .select("id")
      .eq("kind", "follow")
      .eq("article_id", article);
    for (const r of old.data ?? []) {
      await service.from("push_sends").delete().eq("id", r.id);
      sends.splice(sends.indexOf(r.id), 1);
    }
  }
  // TTL conta a partir de started_at: started_at = ttlEndsAt − TTL do tipo.
  const startedAt = new Date(
    Date.parse(input.ttlEndsAt) - TTL_H[input.kind]! * 3_600_000,
  ).toISOString();
  const send = await service
    .from("push_sends")
    .insert({
      kind: input.kind,
      article_id: article,
      title: "Paridade",
      body: "Caso do fixture",
      origin_label: "ORIGINAL CITYNEWS",
      url: "/materia/paridade",
      tag: `par${seq}`,
      audience: input.kind === "follow" ? { type: "targets" } : { type: "all" },
      status: "dispatching",
      requested_by: input.kind === "follow" ? null : "c1000000-0000-4000-8000-000000000002",
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (send.error) throw new Error(send.error.message);
  sends.push(send.data.id);
  if (input.hasArticle) {
    const prev = await service
      .from("push_sends")
      .insert({
        kind: "urgent",
        article_id: article,
        title: "Anterior",
        body: "Já enviado",
        origin_label: "ORIGINAL CITYNEWS",
        url: "/materia/paridade",
        tag: `prev${seq}`,
        audience: { type: "all" },
        status: "sent",
        requested_by: "c1000000-0000-4000-8000-000000000002",
      })
      .select("id")
      .single();
    if (prev.error) throw new Error(prev.error.message);
    sends.push(prev.data.id);
    const d = await service.from("push_deliveries").insert({
      send_id: prev.data.id,
      subscription_id: sub.data.id,
      article_id: article,
      status: "sent",
    });
    if (d.error) throw new Error(d.error.message);
  }
  return { sub: sub.data.id, send: send.data.id };
}

async function notBeforeOf(id: number | null): Promise<string | null> {
  if (id === null) return null;
  const { data } = await service
    .from("push_deliveries")
    .select("not_before, status")
    .eq("id", id)
    .single();
  return data?.status === "deferred" && data.not_before
    ? new Date(data.not_before).toISOString()
    : null;
}

describe("push_reserve = decideReservation", () => {
  it.each(
    cases as {
      name: string;
      input: ReserveInput;
      expected: { outcome: string; notBefore: string | null };
    }[],
  )("$name", async ({ input, expected }) => {
    const { sub, send } = await materialize(input);
    const { data, error } = await service.rpc("push_reserve", {
      p_sub: sub,
      p_send: send,
      p_now: input.now,
    });
    if (error) throw new Error(error.message);
    const r = data![0]!;
    expect({ outcome: r.outcome, notBefore: await notBeforeOf(r.delivery_id) }).toEqual(expected);
  });
});
