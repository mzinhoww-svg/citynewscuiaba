// @vitest-environment node
// RLS (CLAUDE.md §8): visitante anônimo e leitor sem papel não leem nada operacional nem
// pessoal, inclusive as tabelas dos pacotes P4/P5/PWA. Confere a estrutura (RLS ligada, políticas
// para anon só de leitura pública) e o comportamento (consultas reais com a chave anon).
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const service = createServiceClient();
const run = randomBytes(3).toString("hex");

function psql(sql: string): string[][] {
  const out = execFileSync("psql", [DB_URL, "-At", "-F", "\t", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres", PGOPTIONS: "-c client_min_messages=warning" },
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));
}

function anonClient(): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Tabelas e visões que nunca podem devolver linha a anônimo nem a leitor sem papel. */
const SENSITIVE = [
  // Decisão, IA e auditoria
  "decisions",
  "ai_calls",
  "ai_agents",
  "ai_models",
  "ai_prompts",
  "audit_log",
  "audit_log_view",
  "approvals",
  "rules",
  "rec_weights",
  "rec_campaigns",
  "rec_experiments",
  "eval_runs",
  "eval_cases",
  // Eventos e operação
  "events",
  "pipeline_events",
  "pipeline_events_view",
  "pipeline_quarantine",
  "jobs",
  "rate_limits",
  "ingest_runs",
  "raw_items",
  "collected_items",
  "sources",
  "notifications",
  "app_settings",
  // Pessoas, convites e privacidade
  "user_roles",
  "staff_invites",
  "privacy_requests",
  "integration_keys",
  "team_members",
  "teams",
  "reader_emails",
  // Push
  "push_subscriptions",
  "push_sends",
  "push_deliveries",
  "push_batches",
  "push_send_counters",
  "push_funnel_daily",
  // Guia Cuiabá: modelos, propostas, reclamações e execuções nunca são públicos
  "guide_templates",
  "guide_proposals",
  "venue_reports",
  "guide_runs",
] as const;

/** Funções que existem e nunca podem ser executadas por anon (nome, argumentos válidos). */
const ADMIN_RPCS: [string, Record<string, unknown>][] = [
  ["control_logs", {}],
  ["control_source_health", {}],
  ["approval_apply", { p_id: "00000000-0000-4000-8000-000000000000" }],
  ["push_dispatch_due", { p_now: new Date().toISOString() }],
  ["purge_deleted_accounts", { p_days: 30 }],
  ["anonymize_old_events", { p_days: 30 }],
  ["taxonomy_merge_tags", { p_from: "a", p_into: "b" }],
  ["rules_rollback", {}],
  ["queue_enqueue", { p_queue: "pipeline", p_dedupe_key: "x", p_message: {}, p_delay_sec: 0 }],
  ["push_delivery_result", { p_delivery: 1, p_outcome: "accepted" }],
  ["app_setting_set", { p_key: "security.retention_days", p_value: 30, p_ctx: {}, p_ip_hash: "x" }],
];

const created = {
  events: [] as string[],
  invites: [] as string[],
  privacy: [] as string[],
  subs: [] as string[],
  users: [] as string[],
  approvals: [] as string[],
};
let reader: DbClient;
let readerId = "";

beforeAll(async () => {
  // Linhas sentinela para as tabelas que o seed deixa vazias: sem elas "0 linhas" não prova nada.
  const ev = await service
    .from("events")
    .insert({
      name: "security_probe",
      at: new Date().toISOString(),
      session: { probe: run },
      consent: {},
      algo_version: "probe",
    } as never)
    .select("id")
    .maybeSingle();
  if (ev.data?.id) created.events.push(String(ev.data.id));

  // O banco recém-criado não tem pedido de aprovação: sonda própria.
  const apr = await service
    .from("approvals")
    .insert({
      kind: "push.resume",
      target_ref: `sonda-${run}`,
      requested_by: "c1000000-0000-4000-8000-000000000007",
      justification: "sonda de segurança",
    })
    .select("id")
    .single();
  if (apr.error) throw new Error(apr.error.message);
  created.approvals.push(apr.data.id);

  const pr = await service
    .from("privacy_requests")
    .insert({ kind: "access", email: `sonda-${run}@example.com`, notes: "sonda de segurança" })
    .select("id")
    .single();
  if (pr.error) throw new Error(pr.error.message);
  created.privacy.push(pr.data.id);

  const sub = await service
    .from("push_subscriptions")
    .insert({
      endpoint: `https://fcm.googleapis.com/fcm/send/rls-${run}`,
      p256dh: randomBytes(65).toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      manage_token_hash: randomBytes(32).toString("base64url"),
      targets: ["section:cidade"],
    })
    .select("id")
    .single();
  if (sub.error) throw new Error(sub.error.message);
  created.subs.push(sub.data.id);

  // Leitor logado sem nenhum papel.
  const email = `leitor-rls-${run}@example.com`;
  const password = `s3nha-${randomUUID()}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  readerId = made.data.user.id;
  created.users.push(readerId);
  reader = anonClient();
  const login = await reader.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(login.error.message);

  // Convite de outra pessoa (o leitor não pode vê-lo).
  const inv = await service
    .from("staff_invites")
    .insert({
      user_id: "c1000000-0000-4000-8000-000000000006",
      email: `convite-${run}@example.com`,
      role: "revisor",
    } as never)
    .select("user_id")
    .maybeSingle();
  if (inv.data) created.invites.push(inv.data.user_id);
});

afterAll(async () => {
  if (created.events.length)
    await service
      .from("events")
      .delete()
      .in("id", created.events as never);
  await service.from("approvals").delete().in("id", created.approvals);
  await service.from("privacy_requests").delete().in("id", created.privacy);
  await service.from("push_subscriptions").delete().in("id", created.subs);
  await service.from("staff_invites").delete().like("email", `%${run}%`);
  for (const id of created.users) await service.auth.admin.deleteUser(id);
});

describe("estrutura: RLS ligada e políticas para anon só de leitura pública", () => {
  it("toda tabela do schema public tem RLS ligada", () => {
    const rows = psql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
          and not c.relispartition order by 1`,
    );
    expect(rows.map((r) => r[0])).toEqual([]);
  });

  it("as únicas políticas que valem para anon são SELECT em conteúdo público", () => {
    const rows = psql(
      `select tablename, policyname, cmd from pg_policies
        where schemaname = 'public' and roles && array['anon','public']::name[] order by 1, 2`,
    );
    expect(rows.filter((r) => r[2] !== "SELECT")).toEqual([]);
    expect(rows.map((r) => r[0])).toEqual([
      "article_media",
      "article_sources",
      "articles",
      "collection_items",
      "collections",
      "corrections",
      "event_listings",
      "feature_flags",
      "featured_items",
      "featured_slots",
      "guide_list_items",
      "guide_lists",
      "home_layouts",
      "media_assets",
      "places",
      "redirects",
      "sections",
      "topics",
      "venue_media",
      "venues",
    ]);
  });

  it("nenhuma tabela sensível tem política para anon ou para public", () => {
    const rows = psql(
      `select tablename from pg_policies
        where schemaname = 'public' and roles && array['anon','public']::name[]`,
    ).map((r) => r[0]);
    for (const t of SENSITIVE) expect(rows, t).not.toContain(t);
  });

  it("função security definer chamável por anon é só a lista pública (fora gatilhos)", () => {
    const rows = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
          and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    ).map((r) => r[0]);
    expect(rows).toEqual([
      // FD-T1 (0090): só enfileira busca de imagem de matéria publicada sem capa (R39), no máximo
      // uma por matéria a cada 3 h; não lê nem devolve dado.
      "featured_request_images",
      "public_article_gone",
      "public_most_read",
      "search_did_you_mean",
      "search_hybrid",
      "search_suggest",
    ]);
  });
});

describe("comportamento: anônimo (chave anon)", () => {
  it("as sentinelas existem para o service role (a prova não é vazia)", async () => {
    for (const t of [
      "decisions",
      "ai_calls",
      "audit_log",
      "approvals",
      "pipeline_events",
    ] as const) {
      const r = await service.from(t).select("*", { count: "exact", head: true });
      expect(r.count ?? 0, t).toBeGreaterThan(0);
    }
    const pr = await service
      .from("privacy_requests")
      .select("id", { count: "exact", head: true })
      .in("id", created.privacy);
    expect(pr.count).toBe(1);
    const ps = await service
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .in("id", created.subs);
    expect(ps.count).toBe(1);
  });

  it.each(SENSITIVE)("%s: nenhuma linha", async (table) => {
    const r = await anonClient()
      .from(table as never)
      .select("*")
      .limit(5);
    expect(r.data ?? []).toHaveLength(0);
  });

  it.each(SENSITIVE.filter((t) => !t.endsWith("_view")))("%s: escrita recusada", async (table) => {
    const anon = anonClient();
    const ins = await anon
      .from(table as never)
      .insert({} as never)
      .select();
    expect(ins.error, `insert em ${table}`).not.toBeNull();
    expect(ins.error!.message).toMatch(/row-level security|permission denied/i);
    // Atualizar e apagar não pode alterar nada (RLS filtra as linhas; sem grant dá erro).
    const upd = await anon
      .from(table as never)
      .update({} as never)
      .not("id" as never, "is", null)
      .select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await anon
      .from(table as never)
      .delete()
      .not("id" as never, "is", null)
      .select();
    expect(del.data ?? []).toHaveLength(0);
  });

  it("linhas sentinela de privacidade e push seguem intactas depois das tentativas", async () => {
    const pr = await service.from("privacy_requests").select("id").in("id", created.privacy);
    expect(pr.data).toHaveLength(1);
    const ps = await service.from("push_subscriptions").select("id").in("id", created.subs);
    expect(ps.data).toHaveLength(1);
  });

  it("RPC operacional/administrativa: sem permissão de execução para anon (42501)", async () => {
    const anon = anonClient();
    for (const [fn, args] of ADMIN_RPCS) {
      const r = await anon.rpc(fn as never, args as never);
      expect(r.error?.code, fn).toBe("42501");
      expect(r.data ?? null, fn).toBeNull();
    }
  });
});

describe("comportamento: leitor logado sem papel", () => {
  it.each(SENSITIVE)("%s: nenhuma linha", async (table) => {
    const r = await reader
      .from(table as never)
      .select("*")
      .limit(5);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("não vê solicitação de privacidade nem convite de outra pessoa", async () => {
    const pr = await reader.from("privacy_requests").select("id").in("id", created.privacy);
    expect(pr.data ?? []).toHaveLength(0);
    const inv = await reader.from("staff_invites").select("user_id").like("email", `%${run}%`);
    expect(inv.data ?? []).toHaveLength(0);
  });

  it("RPC operacional/administrativa: leitor sem papel é recusado e nada muda", async () => {
    for (const [fn, args] of ADMIN_RPCS) {
      const r = await reader.rpc(fn as never, args as never);
      // Erro de permissão ou, nas consultas filtradas por RLS, lista vazia.
      const empty = Array.isArray(r.data) && (r.data as unknown[]).length === 0;
      expect(r.error !== null || empty, fn).toBe(true);
    }
    const flag = await service
      .from("app_settings")
      .select("value")
      .eq("key", "security.retention_days")
      .single();
    expect(flag.data!.value).not.toBe(30);
  });

  it("não se concede papel nem aprova pedido", async () => {
    const role = await reader
      .from("user_roles")
      .insert({ user_id: readerId, role: "admin" } as never)
      .select();
    expect(role.error).not.toBeNull();
    const apr = await reader.rpc("approval_apply" as never, { p_id: randomUUID() } as never);
    expect(apr.error).not.toBeNull();
    const roles = await service.from("user_roles").select("user_id").eq("user_id", readerId);
    expect(roles.data ?? []).toHaveLength(0);
  });
});
