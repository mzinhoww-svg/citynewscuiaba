// @vitest-environment node
// C1-02 (segurança P1): expurgo de conta e prova de posse do e-mail. Vive em integração porque
// `purge_deleted_accounts` é global: no projeto `security` correria em paralelo com
// account.test.ts, que espera contagens exatas (0 e 1).
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

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

describe("C1-02 expurgo e prova de posse do e-mail", () => {
  const PASSWORD = `s3nha-${randomUUID()}`;
  const DAY = 86_400_000;
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

  async function emailDataLeft(email: string) {
    const [a, b] = await Promise.all([
      service.from("newsletter_subscriptions").select("list").eq("email", email),
      service.from("alerts").select("id").eq("owner_ref", `email:${email}`),
    ]);
    return { newsletter: a.data?.length ?? 0, alerts: b.data?.length ?? 0 };
  }

  /** Pede a exclusão vencida e roda a purga como o cron (0014/0024). */
  async function purge(id: string) {
    const p = await service.from("profiles").insert({
      id,
      display_name: "Vítima C1-02",
      delete_requested_at: new Date(Date.now() - 8 * DAY).toISOString(),
    });
    if (p.error) throw new Error(p.error.message);
    const r = await service.rpc("purge_deleted_accounts", { p_days: 7 });
    expect(r.error).toBeNull();
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

  it("expurgo de conta sem prova apaga a conta e mantém newsletter e alertas do e-mail", async () => {
    const email = await victim("purga-sem");
    const { id } = await account(email);
    await purge(id);
    expect((await service.auth.admin.getUserById(id)).data.user).toBeNull();
    expect((await service.from("profiles").select("id").eq("id", id)).data).toEqual([]);
    expect(await emailDataLeft(email)).toEqual({ newsletter: 1, alerts: 1 });
  });

  it("expurgo de conta com prova apaga também os dados do e-mail", async () => {
    const email = await victim("purga-com");
    const { id } = await account(email);
    psql(`update auth.users set confirmation_sent_at = now() where id = '${id}'`);
    await purge(id);
    expect((await service.auth.admin.getUserById(id)).data.user).toBeNull();
    expect(await emailDataLeft(email)).toEqual({ newsletter: 0, alerts: 0 });
  });
});
