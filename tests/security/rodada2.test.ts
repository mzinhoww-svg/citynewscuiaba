// @vitest-environment node
// Segurança, segunda rodada (A-218): achados P2/P3 da auditoria de 04/10/2026 que ficaram fora da
// spec 2026-10-04-seguranca-p1-design.md. Clientes anon, leitor sem papel e equipe contra o banco
// local (migration 0188).
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { publicContentExists } from "@/lib/db/queries";
import type { Database } from "@/lib/db/types";
import { clientOf, SEED_USERS } from "../integration/studio";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const service = createServiceClient();

/** SQL direto no banco local/CI (catálogo do Postgres). */
function psql(sql: string): string[] {
  const out = execFileSync("psql", [DB_URL, "-At", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres", PGOPTIONS: "-c client_min_messages=warning" },
  });
  return out.split("\n").filter(Boolean);
}
const run = randomBytes(3).toString("hex");
const HELENA = SEED_USERS.helena.id; // admin
const OTAVIO = SEED_USERS.otavio.id; // editor (cidade, servicos, clima, agenda)

function anonClient(headers?: Record<string, string>): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } },
  );
}

/** JWT HS256 assinado com o segredo local: `authenticated` sem `sub` (auth.uid() nulo). */
function jwtWithoutSub(): string {
  const secret =
    process.env.SUPABASE_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 600,
  })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

let reader: DbClient;
let readerId = "";
let draftId = "";
const eventIds: number[] = [];

beforeAll(async () => {
  const email = `leitor-r2-${run}@example.com`;
  const password = `s3nha-${randomUUID()}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  readerId = made.data.user.id;
  reader = anonClient();
  const login = await reader.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(login.error.message);
  await service.from("profiles").upsert({ id: readerId, display_name: `Leitora ${run}` });

  const draft = await service
    .from("articles")
    .select("id")
    .not("status", "in", "(published,updated)")
    .limit(1)
    .single();
  if (draft.error) throw new Error(draft.error.message);
  draftId = draft.data.id;

  const ev = await service
    .from("events")
    .insert({
      name: "source_viewed",
      at: new Date().toISOString(),
      anon_id: randomUUID(),
      session: { probe: run },
      consent: { personalization: true },
      algo_version: "probe",
      props: { query: `busca-${run}` },
    } as never)
    .select("id")
    .single();
  if (ev.error) throw new Error(ev.error.message);
  eventIds.push(Number(ev.data.id));
});

afterAll(async () => {
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (readerId) {
    await service.from("profiles").delete().eq("id", readerId);
    await service.auth.admin.deleteUser(readerId);
  }
});

describe("C1-04 colunas internas de articles", () => {
  it.each(["embedding", "tsv", "scheduled_for"])("anônimo não lê %s", async (col) => {
    const { error } = await anonClient().from("articles").select(col).limit(1);
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("o portal continua lendo as colunas que mostra e filtrando por destino", async () => {
    const { data, error } = await anonClient()
      .from("articles")
      .select("id, slug, title, urgent_strip, confidence_score, author_id")
      .contains("publish_destinations", ["home"])
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("C1-05 oráculo de papéis", () => {
  it("leitor não descobre o papel de outra conta", async () => {
    const calls = await Promise.all([
      reader.rpc("has_role", { uid: HELENA, role: "admin" }),
      reader.rpc("is_staff", { uid: HELENA }),
      reader.rpc("has_any_role", { uid: HELENA, roles: ["admin"] }),
      reader.rpc("can_edit_section", { uid: OTAVIO, section: "cidade" }),
      reader.rpc("control_can_view", { uid: HELENA }),
      reader.rpc("control_can_operate", { uid: HELENA }),
      reader.rpc("push_can", { p_uid: HELENA, p_action: "push.settings" }),
      reader.rpc("push_can", { p_uid: OTAVIO, p_action: "push.request", p_section: "cidade" }),
      reader.rpc("can_approve_media", { uid: HELENA, media: randomUUID() }),
    ]);
    for (const c of calls) {
      expect(c.error).toBeNull();
      expect(c.data).toBe(false);
    }
  });

  it("leitor não descobre autor nem editoria de rascunho", async () => {
    const owner = await reader.rpc("article_owner", { article: draftId });
    const section = await reader.rpc("article_section", { article: draftId });
    expect(owner.error).toBeNull();
    expect(owner.data).toBeNull();
    expect(section.error).toBeNull();
    expect(section.data).toBeNull();
  });

  it("a equipe e o serviço continuam consultando", async () => {
    const paulo = await clientOf("paulo");
    expect((await paulo.rpc("has_role", { uid: HELENA, role: "admin" })).data).toBe(true);
    expect((await service.rpc("has_role", { uid: HELENA, role: "admin" })).data).toBe(true);
    expect((await paulo.rpc("article_section", { article: draftId })).data).not.toBeNull();
  });
});

describe("C1-06 eventos individuais e perfis de leitores", () => {
  it.each(["paulo", "otavio", "marina"] as const)("%s não lê linhas de events", async (who) => {
    const r = await (await clientOf(who)).from("events").select("id").in("id", eventIds);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });

  it.each(["helena", "thiago", "diego"] as const)("%s ainda lê events", async (who) => {
    const r = await (await clientOf(who)).from("events").select("id").in("id", eventIds);
    expect(r.data?.length).toBe(1);
  });

  it("o painel de recomendação (metrics.view) continua com agregados", async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const r = await (await clientOf("paulo")).rpc("rec_events_summary", { p_since: since });
    expect(r.error).toBeNull();
    expect((r.data ?? []).some((row) => row.algo_version === "probe")).toBe(true);
    const back = await (await clientOf("paulo")).rpc("rec_return_7d", { p_since: since });
    expect(back.error).toBeNull();
    const none = await reader.rpc("rec_events_summary", { p_since: since });
    expect(none.data ?? []).toEqual([]);
  });

  it("leitura não lê perfil de leitor; moderador lê; equipe lê nomes da equipe", async () => {
    const paulo = await clientOf("paulo");
    expect((await paulo.from("profiles").select("id").eq("id", readerId)).data).toEqual([]);
    expect((await paulo.from("profiles").select("id").eq("id", HELENA)).data?.length).toBe(1);
    const carlos = await clientOf("carlos");
    expect((await carlos.from("profiles").select("id").eq("id", readerId)).data?.length).toBe(1);
  });
});

describe("C1-07 funções security definer sem papel", () => {
  it("leitor não recebe o hash de conteúdo de regras", async () => {
    const r = await reader.rpc("approval_target_hash", { p_kind: "rules", p_target: "rules:1" });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
    const staff = await (
      await clientOf("marina")
    ).rpc("approval_target_hash", { p_kind: "rules", p_target: "rules:1" });
    expect(staff.data).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lock_fast_lane_max fora do gatilho é recusada", async () => {
    const r = await reader.rpc("lock_fast_lane_max");
    expect(r.error?.code).toBe("42501");
  });

  it("push_settings_int só lê os limites numéricos do push", async () => {
    await service
      .from("app_settings")
      .upsert({ key: `push.zz_probe_${run}`, value: 42, updated_at: new Date().toISOString() });
    const r = await reader.rpc("push_settings_int", {
      p_key: `push.zz_probe_${run}`,
      p_default: 5,
    });
    expect(r.data).toBe(5);
    const ok = await reader.rpc("push_settings_int", { p_key: "push.quiet_start", p_default: 1 });
    expect(ok.data).toBe(22);
    await service.from("app_settings").delete().eq("key", `push.zz_probe_${run}`);
  });
});

describe("C1-08 revogação e guarda de uid nulo", () => {
  it("authenticated não executa approval_assert_content (só as funções de aprovação a chamam)", () => {
    expect(
      psql(
        "select has_function_privilege('authenticated', 'public.approval_assert_content(public.approvals)', 'execute')",
      ),
    ).toEqual(["f"]);
  });

  // Guarda de regressão: função security definer executável por anon é decisão explícita. Nova
  // entrada aqui exige conferir que a função não confia em `auth.uid()` nulo.
  it("só a allowlist de funções security definer é executável por anon", () => {
    const rows = psql(`
      select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prosecdef
         and has_function_privilege('anon', p.oid, 'execute')
       order by 1`);
    expect(rows).toEqual([
      "featured_request_images",
      "public_article_gone",
      "public_most_read",
      "search_did_you_mean",
      "search_hybrid",
      "search_suggest",
    ]);
  });

  it.each([
    ["control_guard_view", {}],
    ["contingency_pause_cycle", { p_reason: "probe" }],
    ["prompt_rollback", { p_agent: "zz", p_to: 1 }],
    ["rules_rollback", {}],
  ] as const)("%s recusa JWT authenticated sem sub", async (fn, args) => {
    const forged = anonClient({ Authorization: `Bearer ${jwtWithoutSub()}` });
    const r = await forged.rpc(fn as never, args as never);
    expect(r.error?.code).toBe("42501");
  });
});

describe("audit_log_insert (P1 adiado)", () => {
  it("leitura não grava auditoria fora do painel de fontes", async () => {
    const paulo = await clientOf("paulo");
    const r = await paulo.from("audit_log").insert({
      actor: SEED_USERS.paulo.id,
      action: "push.approved",
      object_ref: `probe:${run}`,
      details: {},
    });
    expect(r.error?.code).toBe("42501");
  });

  it("quem gerencia fontes continua auditando source.*", async () => {
    const diego = await clientOf("diego");
    const r = await diego.from("audit_log").insert({
      actor: SEED_USERS.diego.id,
      action: "source.analyze",
      object_ref: `source:${randomUUID()}`,
      details: { probe: run },
    });
    expect(r.error).toBeNull();
  });

  it("nem quem gerencia fontes grava ação de outro domínio", async () => {
    const diego = await clientOf("diego");
    const r = await diego.from("audit_log").insert({
      actor: SEED_USERS.diego.id,
      action: "rules.approved",
      object_ref: `probe:${run}`,
      details: {},
    });
    expect(r.error?.code).toBe("42501");
  });
});

describe("C3-03 denúncia só de conteúdo público", () => {
  it("matéria publicada existe; rascunho e id inventado não", async () => {
    const pub = await service
      .from("articles")
      .select("id")
      .in("status", ["published", "updated"])
      .limit(1)
      .single();
    expect(await publicContentExists(`article:${pub.data!.id}`)).toEqual({ ok: true, value: true });
    expect(await publicContentExists(`article:${draftId}`)).toEqual({ ok: true, value: false });
    expect(await publicContentExists(`event:${randomUUID()}`)).toEqual({ ok: true, value: false });
    expect(await publicContentExists("article:x")).toEqual({ ok: true, value: false });
  });
});
