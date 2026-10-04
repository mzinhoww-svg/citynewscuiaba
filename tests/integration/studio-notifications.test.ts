// @vitest-environment node
// BELL-T1 · Central de notificações da equipe contra o banco local: RLS por papel e por pessoa,
// dedupe, leitura individual, gatilhos de origem (denúncias, aprovação, disjuntor) e push de
// urgências só para quem optou.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { clientOf, SEED_USERS, service } from "./studio";

const tag = randomUUID().slice(0, 8);
const key = (s: string) => `test-${tag}:${s}`;
const created = { subs: [] as string[], approvals: [] as string[], reports: [] as string[] };

async function notify(
  over: Partial<Database["public"]["Functions"]["studio_notify"]["Args"]> & { dedupe: string },
) {
  const { dedupe, ...rest } = over;
  const r = await service.rpc("studio_notify", {
    p_kind: "approval_pending",
    p_severity: "warn",
    p_title: `Teste ${tag}`,
    p_body: "corpo",
    p_href: "/estudio/control/aprovacoes",
    p_object_ref: `test:${tag}`,
    p_roles: [],
    ...rest,
    p_dedupe: dedupe,
  });
  if (r.error) throw r.error;
  return r.data;
}

async function visibleTo(user: keyof typeof SEED_USERS, dedupes: string[]) {
  const db = await clientOf(user);
  const { data, error } = await db.rpc("studio_notifications_for", { p_limit: 100 });
  if (error) throw error;
  const { data: rows } = await service
    .from("studio_notifications")
    .select("id, dedupe_key")
    .in("dedupe_key", dedupes);
  const ids = new Map((rows ?? []).map((r) => [r.id, r.dedupe_key]));
  return (data ?? []).filter((n) => ids.has(n.id)).map((n) => ids.get(n.id)!);
}

afterAll(async () => {
  await service.from("push_subscriptions").delete().in("id", created.subs);
  await service.from("approvals").delete().in("id", created.approvals);
  await service.from("reports").delete().in("id", created.reports);
  await service.from("studio_notifications").delete().like("dedupe_key", `test-${tag}:%`);
  await service
    .from("studio_notifications")
    .delete()
    .or(
      `dedupe_key.like.reports3:content-${tag}%,dedupe_key.like.reply:%,dedupe_key.like.breaker%,object_ref.eq.test:${tag}`,
    );
});

describe("RLS por papel", () => {
  it("só enxerga quem tem o papel na audiência; outros papéis e leitura não veem", async () => {
    const k = key("roles");
    await notify({ dedupe: k, p_roles: ["moderador"] });
    expect(await visibleTo("carlos", [k])).toEqual([k]);
    for (const other of ["paulo", "helena", "marina", "juliana", "diego"] as const)
      expect(await visibleTo(other, [k])).toEqual([]);
  });

  it("a tabela em si também respeita o papel (select direto)", async () => {
    const k = key("direct");
    await notify({ dedupe: k, p_roles: ["moderador"] });
    const carlos = await (
      await clientOf("carlos")
    )
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k);
    const paulo = await (
      await clientOf("paulo")
    )
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k);
    expect(carlos.data).toHaveLength(1);
    expect(paulo.data).toEqual([]);
  });

  it("audiência por pessoa e exclusão de quem pediu", async () => {
    const k = key("people");
    await notify({
      dedupe: k,
      p_roles: ["admin", "editor_chefe"],
      p_exclude_user_ids: [SEED_USERS.marina.id],
    });
    expect(await visibleTo("helena", [k])).toEqual([k]);
    expect(await visibleTo("marina", [k])).toEqual([]);
    const k2 = key("userids");
    await notify({ dedupe: k2, p_user_ids: [SEED_USERS.diego.id] });
    expect(await visibleTo("diego", [k2])).toEqual([k2]);
    expect(await visibleTo("helena", [k2])).toEqual([]);
  });

  it("escrita: ninguém grava notificação pelo cliente; anon não chama o produtor", async () => {
    const helena = await clientOf("helena");
    const ins = await helena.from("studio_notifications").insert({
      kind: "approval_pending",
      title: "x",
      href: "/estudio",
      dedupe_key: key("forjada"),
    });
    expect(ins.error).not.toBeNull();
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const r = await anon.rpc("studio_notifications_for", {});
    expect(r.data ?? []).toEqual([]);
    const forge = await helena.rpc("studio_notify", {
      p_kind: "k_forjada",
      p_severity: "info",
      p_title: "t",
      p_body: "",
      p_href: "/estudio",
      p_object_ref: "x",
      p_roles: ["admin"],
      p_dedupe: key("forjada2"),
    });
    expect(forge.error).not.toBeNull();
  });
});

describe("dedupe e leitura individual", () => {
  it("a mesma chave não repete", async () => {
    const k = key("dedupe");
    const first = await notify({ dedupe: k, p_roles: ["moderador"] });
    const second = await notify({ dedupe: k, p_roles: ["moderador"] });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    const { data } = await service.from("studio_notifications").select("id").eq("dedupe_key", k);
    expect(data).toHaveLength(1);
  });

  it("a leitura é de cada pessoa: A marca, B continua com não lida; A não vê a leitura de B", async () => {
    const k = key("reads");
    await notify({ dedupe: k, p_roles: ["admin", "editor_chefe"] });
    const { data: row } = await service
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k)
      .single();
    const id = row!.id;
    const helena = await clientOf("helena");
    const marina = await clientOf("marina");
    const before = (await helena.rpc("studio_unread_count")).data ?? 0;
    expect((await helena.rpc("studio_notifications_mark_read", { p_ids: [id] })).data).toBe(1);
    expect((await helena.rpc("studio_unread_count")).data).toBe(before - 1);
    const listM = (await marina.rpc("studio_notifications_for", { p_limit: 100 })).data ?? [];
    expect(listM.find((n) => n.id === id)?.read_at).toBeNull();
    const listH = (await helena.rpc("studio_notifications_for", { p_limit: 100 })).data ?? [];
    expect(listH.find((n) => n.id === id)?.read_at).not.toBeNull();
    // Marina não enxerga a linha de leitura da Helena.
    const reads = await marina
      .from("studio_notification_reads")
      .select("user_id")
      .eq("notification_id", id);
    expect(reads.data ?? []).toEqual([]);
  });

  it("não dá para marcar o que não é do seu papel", async () => {
    const k = key("foreign");
    await notify({ dedupe: k, p_roles: ["moderador"] });
    const { data: row } = await service
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k)
      .single();
    const paulo = await clientOf("paulo");
    expect((await paulo.rpc("studio_notifications_mark_read", { p_ids: [row!.id] })).data).toBe(0);
    const { data } = await service
      .from("studio_notification_reads")
      .select("user_id")
      .eq("notification_id", row!.id);
    expect(data).toEqual([]);
  });

  it("marcar todas, filtro de não lidas e tipo", async () => {
    const k = key("all");
    await notify({ dedupe: k, p_roles: ["moderador"], p_kind: "reports_burst" });
    const carlos = await clientOf("carlos");
    expect((await carlos.rpc("studio_unread_count")).data).toBeGreaterThan(0);
    await carlos.rpc("studio_notifications_mark_all_read");
    expect((await carlos.rpc("studio_unread_count")).data).toBe(0);
    const unread = await carlos.rpc("studio_notifications_for", { p_only_unread: true });
    expect(unread.data ?? []).toEqual([]);
    const byKind = await carlos.rpc("studio_notifications_for", {
      p_kind: "reports_burst",
      p_limit: 100,
    });
    expect((byKind.data ?? []).every((n) => n.kind === "reports_burst")).toBe(true);
    expect(byKind.data?.length).toBeGreaterThan(0);
  });

  it("expiradas somem do sino e voltam no histórico", async () => {
    const k = key("expired");
    await notify({ dedupe: k, p_roles: ["moderador"], p_ttl: "-1 hour" });
    const carlos = await clientOf("carlos");
    const bell = (await carlos.rpc("studio_notifications_for", { p_limit: 100 })).data ?? [];
    const hist =
      (await carlos.rpc("studio_notifications_for", { p_limit: 100, p_history: true })).data ?? [];
    const { data: row } = await service
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k)
      .single();
    expect(bell.some((n) => n.id === row!.id)).toBe(false);
    expect(hist.some((n) => n.id === row!.id)).toBe(true);
  });
});

describe("gatilhos de origem", () => {
  it("3 denúncias na mesma matéria geram uma notificação urgente para quem modera", async () => {
    const ref = `article:content-${tag}`;
    for (let i = 0; i < 4; i++) {
      const { data, error } = await service
        .from("reports")
        .insert({ content_ref: ref, kind: "wrong_info", message: `d${i}` })
        .select("id")
        .single();
      if (error) throw error;
      created.reports.push(data.id);
    }
    const { data } = await service
      .from("studio_notifications")
      .select("severity, audience, kind")
      .like("dedupe_key", `reports3:${ref}:%`);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ severity: "urgent", kind: "reports_burst" });
    const carlos = await clientOf("carlos");
    const list =
      (await carlos.rpc("studio_notifications_for", { p_kind: "reports_burst", p_limit: 100 }))
        .data ?? [];
    expect(list.some((n) => n.object_ref === ref)).toBe(true);
    const paulo = await clientOf("paulo");
    const other =
      (await paulo.rpc("studio_notifications_for", { p_kind: "reports_burst", p_limit: 100 }))
        .data ?? [];
    expect(other.some((n) => n.object_ref === ref)).toBe(false);
  });

  it("pedido de aprovação avisa admin e chefia, menos quem pediu", async () => {
    const { data, error } = await service
      .from("approvals")
      .insert({
        kind: "prompt.publish",
        target_ref: `prompt:test-${tag}`,
        requested_by: SEED_USERS.marina.id,
        justification: "teste da central",
      })
      .select("id")
      .single();
    if (error) throw error;
    created.approvals.push(data.id);
    const k = `approval:${data.id}`;
    expect(await visibleTo("helena", [k])).toEqual([k]);
    expect(await visibleTo("marina", [k])).toEqual([]);
    expect(await visibleTo("paulo", [k])).toEqual([]);
  });

  it("disjuntor aberto é urgente para admin, chefia e operador de IA; religar vira backlog liberado", async () => {
    const was = await service
      .from("publish_breaker")
      .select("tripped_at, trip_reason, reset_at")
      .eq("id", true)
      .single();
    const at = new Date().toISOString();
    await service
      .from("publish_breaker")
      .update({ tripped_at: at, trip_reason: "hourly" })
      .eq("id", true);
    const key1 = `breaker:${Math.round(Date.parse(at) / 1000)}`;
    expect(await visibleTo("diego", [key1])).toEqual([key1]);
    expect(await visibleTo("carlos", [key1])).toEqual([]);
    await service
      .from("publish_breaker")
      .update({ tripped_at: null, trip_reason: null, reset_at: new Date().toISOString() })
      .eq("id", true);
    const { data: released } = await service
      .from("studio_notifications")
      .select("kind")
      .eq("kind", "backlog_released")
      .eq("object_ref", "breaker");
    expect(released?.length).toBeGreaterThan(0);
    await service
      .from("publish_breaker")
      .update({
        tripped_at: was.data?.tripped_at ?? null,
        trip_reason: was.data?.trip_reason ?? null,
        reset_at: was.data?.reset_at ?? null,
      })
      .eq("id", true);
  });

  it("denúncia vencida entra pela varredura, uma vez por dia", async () => {
    const { data, error } = await service
      .from("reports")
      .insert({
        content_ref: `article:overdue-${tag}`,
        kind: "other",
        due_at: new Date(Date.now() - 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    created.reports.push(data.id);
    await service.rpc("studio_notifications_sweep");
    const again = await service.rpc("studio_notifications_sweep");
    expect(again.data).toBe(0);
    const carlos = await clientOf("carlos");
    const list =
      (await carlos.rpc("studio_notifications_for", { p_kind: "reports_overdue", p_limit: 50 }))
        .data ?? [];
    expect(list.length).toBeGreaterThan(0);
  });

  it("um erro dentro do produtor nunca derruba o evento de origem", async () => {
    // href inválido viola o check da tabela: `studio_notify` engole e devolve null.
    const r = await service.rpc("studio_notify", {
      p_kind: "approval_pending",
      p_severity: "info",
      p_title: "x",
      p_body: "",
      p_href: "https://fora.test",
      p_object_ref: "x",
      p_roles: ["admin"],
      p_dedupe: key("ruim"),
    });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });
});

describe("push de urgências da equipe", () => {
  const sub = (userId: string, on: boolean) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${tag}-${userId.slice(-2)}`,
    p256dh: "B".repeat(87),
    auth: "A".repeat(22),
    manage_token_hash: "h",
    user_id: userId,
    staff_alerts: on,
  });

  it("só quem optou e tem o papel da audiência entra; depois de tratado, não volta", async () => {
    const k = key("push");
    // O despacho pega até 20 por vez; resíduos de outras rodadas não podem ocupar a vaga.
    await service
      .from("studio_notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("severity", "urgent")
      .is("push_sent_at", null);
    await notify({
      dedupe: k,
      p_kind: "reports_burst",
      p_severity: "urgent",
      p_roles: ["moderador", "leitura"],
    });
    const rows = [
      sub(SEED_USERS.carlos.id, true), // moderador, optou: recebe
      sub(SEED_USERS.paulo.id, false), // leitura, não optou: não
      sub(SEED_USERS.helena.id, true), // admin, optou mas fora da audiência: não
    ];
    for (const r of rows) {
      const { data, error } = await service
        .from("push_subscriptions")
        .insert(r)
        .select("id")
        .single();
      if (error) throw error;
      created.subs.push(data.id);
    }
    const { data: row } = await service
      .from("studio_notifications")
      .select("id")
      .eq("dedupe_key", k)
      .single();
    const due = await service.rpc("studio_urgent_push_due");
    const mine = (due.data ?? []).find((d) => d.id === row!.id);
    expect(mine).toBeDefined();
    const endpoints = (mine!.subs as { endpoint: string }[]).map((s) => s.endpoint);
    expect(endpoints).toEqual([rows[0]!.endpoint]);
    await service.rpc("studio_urgent_push_done", { p_ids: [row!.id] });
    const after = await service.rpc("studio_urgent_push_due");
    expect((after.data ?? []).some((d) => d.id === row!.id)).toBe(false);
  });
});
