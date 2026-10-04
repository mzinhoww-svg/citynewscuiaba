// @vitest-environment node
// Segurança P1 (spec 2026-10-04-seguranca-p1-design.md): casos por achado, com clientes anon,
// leitor sem papel e equipe. Cada tarefa acrescenta seu `describe` a este arquivo.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { clientOf, type SeedUser } from "../integration/studio";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const service = createServiceClient();
const run = randomBytes(3).toString("hex");

/** SQL direto no banco local/CI, para o que a API não alcança (`auth.users`). */
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

/** Cliente com a sessão de um usuário de seed da equipe. */
function staff(name: SeedUser): Promise<DbClient> {
  return clientOf(name);
}

let reader: DbClient;
let readerId = "";
let publishedId = "";

beforeAll(async () => {
  // Leitor logado sem nenhum papel.
  const email = `leitor-p1-${run}@example.com`;
  const password = `s3nha-${randomUUID()}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  readerId = made.data.user.id;
  reader = anonClient();
  const login = await reader.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(login.error.message);

  // Matéria publicada do seed que tenha versões.
  const pub = await service.from("articles").select("id").in("status", ["published", "updated"]);
  if (pub.error) throw new Error(pub.error.message);
  for (const a of pub.data ?? []) {
    const v = await service
      .from("article_versions")
      .select("id", { count: "exact", head: true })
      .eq("article_id", a.id);
    if ((v.count ?? 0) > 0) {
      publishedId = a.id;
      break;
    }
  }
  if (!publishedId) throw new Error("seed sem matéria publicada com versões");
});

afterAll(async () => {
  if (readerId) await service.auth.admin.deleteUser(readerId);
});

describe("C1-01 article_versions", () => {
  it("anon não lê article_versions", async () => {
    const r = await anonClient()
      .from("article_versions")
      .select("id")
      .eq("article_id", publishedId);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("leitor sem papel não lê article_versions", async () => {
    const r = await reader.from("article_versions").select("id").eq("article_id", publishedId);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("public_article_versions continua lendo as versões pós-publicação", async () => {
    const r = await anonClient()
      .from("public_article_versions")
      .select("*")
      .eq("article_id", publishedId);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("equipe continua lendo article_versions", async () => {
    const r = await (
      await staff("helena")
    )
      .from("article_versions")
      .select("id")
      .eq("article_id", publishedId);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("C1-03 push_audit", () => {
  const ref = (s: string) => `push:p1-${run}-${s}`;
  const approvalIds: string[] = [];

  afterAll(async () => {
    for (const id of approvalIds) await service.from("approvals").delete().eq("id", id);
  });

  it("leitor sem papel recebe 42501 e nada é gravado", async () => {
    const r = await reader.rpc("push_audit", {
      p_action: "push.approve",
      p_object: ref("leitor"),
      p_details: {},
    });
    expect(r.error?.code).toBe("42501");
    const rows = await service.from("audit_log").select("id").eq("object_ref", ref("leitor"));
    expect(rows.data ?? []).toHaveLength(0);
  });

  it("admin com p_details acima de 2 KB recebe 22023", async () => {
    const r = await (
      await staff("helena")
    ).rpc("push_audit", {
      p_action: "push.approve",
      p_object: ref("grande"),
      p_details: { s: "x".repeat(2100) },
    });
    expect(r.error?.code).toBe("22023");
    const rows = await service.from("audit_log").select("id").eq("object_ref", ref("grande"));
    expect(rows.data ?? []).toHaveLength(0);
  });

  it("admin grava com p_details nulo como {}", async () => {
    const r = await (
      await staff("helena")
    ).rpc("push_audit", {
      p_action: "push.approve",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo gerado não aceita null
      p_details: null as any,
      p_object: ref("nulo"),
    });
    expect(r.error).toBeNull();
    const rows = await service.from("audit_log").select("details").eq("object_ref", ref("nulo"));
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0]?.details).toEqual({});
  });

  it("push_resume_request por admin continua auditando", async () => {
    const reason = `p1-${run}-retomada`;
    const r = await (await staff("helena")).rpc("push_resume_request", { p_reason: reason });
    expect(r.error).toBeNull();
    const id = r.data as unknown as string;
    approvalIds.push(id);
    const rows = await service
      .from("audit_log")
      .select("details")
      .eq("action", "push.resume_requested")
      .contains("details", { approvalId: id });
    expect(rows.data).toHaveLength(1);
  });
});

describe("C1-02 prova de posse do e-mail", () => {
  // Cada caso tem a própria vítima: o GoTrue não aceita duas contas com o mesmo e-mail.
  const PASSWORD = `s3nha-${randomUUID()}`;
  const userIds: string[] = [];
  const emails: string[] = [];

  /** E-mail com newsletter confirmada e alerta `email:` (dados ligados só ao e-mail). */
  async function victim(tag: string): Promise<string> {
    const email = `vitima-${tag}-${run}@exemplo.com`;
    emails.push(email);
    const subs = await service.from("newsletter_subscriptions").insert({
      email,
      list: "diaria",
      token_hash: "-",
      confirmed_at: new Date().toISOString(),
    });
    if (subs.error) throw new Error(subs.error.message);
    const al = await service.from("alerts").insert({
      owner_ref: `email:${email}`,
      target_kind: "bairro",
      target_id: "cpa",
      frequency: "daily",
      channel: "email",
      active: true,
    });
    if (al.error) throw new Error(al.error.message);
    return email;
  }

  /** Conta auto-confirmada (como o cadastro sem "Confirm email"), já logada. */
  async function account(email: string): Promise<{ id: string; db: DbClient }> {
    const made = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (made.error) throw new Error(made.error.message);
    userIds.push(made.data.user.id);
    const db = anonClient();
    const login = await db.auth.signInWithPassword({ email, password: PASSWORD });
    if (login.error) throw new Error(login.error.message);
    return { id: made.data.user.id, db };
  }

  afterAll(async () => {
    for (const email of emails) {
      await service.from("newsletter_subscriptions").delete().eq("email", email);
      await service.from("alerts").delete().eq("owner_ref", `email:${email}`);
    }
    for (const id of userIds) {
      await service.from("profiles").delete().eq("id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  it("conta auto-confirmada com e-mail alheio não exporta", async () => {
    const email = await victim("auto");
    const { id, db } = await account(email);
    // Premissa do GoTrue: auto-confirmação não registra envio de confirmação.
    expect(
      psql(`select confirmation_sent_at is null from auth.users where id = '${id}'`)[0]?.[0],
    ).toBe("t");
    const r = await db.rpc("export_email_data");
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it("conta com confirmação por link exporta", async () => {
    const email = await victim("link");
    const { id, db } = await account(email);
    psql(`update auth.users set confirmation_sent_at = now() where id = '${id}'`);
    const r = await db.rpc("export_email_data");
    expect(r.error).toBeNull();
    const data = r.data as { newsletter: unknown[]; alerts: unknown[] } | null;
    expect(data?.newsletter.length).toBeGreaterThanOrEqual(1);
    expect(data?.alerts.length).toBeGreaterThanOrEqual(1);
  });

  it("conta OAuth exporta", async () => {
    const email = await victim("oauth");
    const { id, db } = await account(email);
    psql(
      `update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{provider}', '"google"') where id = '${id}'`,
    );
    const r = await db.rpc("export_email_data");
    expect(r.error).toBeNull();
    const data = r.data as { newsletter: unknown[] } | null;
    expect(data?.newsletter.length).toBeGreaterThanOrEqual(1);
  });

  it.each(["anonymous", "phone", "sso:acme"])(
    "provedor %s (fora da allowlist OAuth) não exporta",
    async (provider) => {
      const email = await victim(`prov-${provider.replace(/\W/g, "")}`);
      const { id, db } = await account(email);
      psql(
        `update auth.users set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{provider}', '"${provider}"') where id = '${id}'`,
      );
      const r = await db.rpc("export_email_data");
      expect(r.error).toBeNull();
      expect(r.data).toBeNull();
    },
  );

  it("email_ownership_proven não é chamável por leitor nem anon", async () => {
    const asReader = await reader.rpc(
      "email_ownership_proven" as never,
      { p_uid: readerId } as never,
    );
    expect(asReader.error?.code).toBe("42501");
    const asAnon = await anonClient().rpc(
      "email_ownership_proven" as never,
      { p_uid: readerId } as never,
    );
    expect(asAnon.error?.code).toBe("42501");
  });
});
