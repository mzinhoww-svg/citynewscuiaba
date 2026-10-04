// @vitest-environment node
// Conta do leitor (P2-T11/T12): o próprio leitor grava seguidas, salvos e preferências pela RLS;
// a exclusão pedida em /perfil só vale depois de 7 dias e nunca apaga conta da equipe.
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportAccount } from "@/lib/db/account";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const PASSWORD = "senha-de-teste-123";
const TRAP_NAME = "lote-falha-forcada";

/** SQL direto no banco local/CI (psql), para montar uma falha que a API não consegue criar. */
function sql(text: string) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente");
  execFileSync("psql", [url, "-q", "-v", "ON_ERROR_STOP=1", "-c", text], {
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
}
const PAULO = "c1000000-0000-4000-8000-000000000010"; // papel "leitura": conta da equipe
const service = createServiceClient();
const email = `conta-${Date.now()}@exemplo.com`;
let userId = "";
let reader: DbClient;

function client(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

beforeAll(async () => {
  const created = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  // Conta com prova de posse do e-mail (confirmação por link), que exporta e expurga o dado
  // guardado pelo e-mail (C1-02). A auto-confirmação de `createUser` sozinha não é prova.
  sql(`update auth.users set confirmation_sent_at = now() where id = '${userId}'`);
  reader = client();
  const r = await reader.auth.signInWithPassword({ email, password: PASSWORD });
  if (r.error) throw r.error;
});

async function seedEmailData(addr: string) {
  const subs = await service.from("newsletter_subscriptions").insert({
    email: addr,
    list: "diaria",
    token_hash: "-",
    confirmed_at: new Date().toISOString(),
  });
  if (subs.error) throw subs.error;
  const al = await service.from("alerts").insert({
    owner_ref: `email:${addr}`,
    target_kind: "bairro",
    target_id: "cpa",
    frequency: "daily",
    channel: "email",
    active: true,
  });
  if (al.error) throw al.error;
  const q = await service.from("reader_emails").insert({
    kind: "alert_confirm",
    to_email: addr,
    subject: "s",
    body: "b",
    ref: "alert:x",
  });
  if (q.error) throw q.error;
}
async function emailDataLeft(addr: string) {
  const [a, b, c] = await Promise.all([
    service.from("newsletter_subscriptions").select("list").eq("email", addr),
    service.from("alerts").select("id").eq("owner_ref", `email:${addr}`),
    service.from("reader_emails").select("id").eq("to_email", addr),
  ]);
  return (a.data?.length ?? 0) + (b.data?.length ?? 0) + (c.data?.length ?? 0);
}

afterAll(async () => {
  await service.from("newsletter_subscriptions").delete().eq("email", email);
  await service.from("alerts").delete().eq("owner_ref", `email:${email}`);
  await service.from("reader_emails").delete().eq("to_email", email);
  await service.from("follows").delete().eq("owner_ref", userId);
  await service.from("profiles").delete().eq("id", userId);
  await service.auth.admin.deleteUser(userId).catch(() => undefined);
  await service.from("profiles").update({ delete_requested_at: null }).eq("id", PAULO);
});

describe("conta do leitor", () => {
  it("leitor cria o próprio perfil, grava preferências e seguidas; não mexe no perfil alheio", async () => {
    const p = await reader.from("profiles").insert({ id: userId, display_name: "Leitora" });
    expect(p.error).toBeNull();
    const prefs = await reader.from("reader_preferences").upsert({
      user_id: userId,
      preferences: { interests: [{ key: "Cidade", evidence: "3 leituras", weak: false }] },
    });
    expect(prefs.error).toBeNull();
    const f = await reader
      .from("follows")
      .insert({ owner_ref: userId, target_kind: "source", target_id: "mt-agora" });
    expect(f.error).toBeNull();
    const other = await reader
      .from("profiles")
      .update({ display_name: "X" })
      .eq("id", PAULO)
      .select("id");
    expect(other.data).toEqual([]);
  });

  it("exportação inclui newsletter, alertas por e-mail e fila do e-mail da conta (gate P2, I5)", async () => {
    await seedEmailData(email);
    const { data: auth } = await reader.auth.getUser();
    const data = await exportAccount(reader, auth.user!);
    expect(data.byEmail?.newsletter).toEqual([
      expect.objectContaining({ list: "diaria", confirmed_at: expect.any(String) }),
    ]);
    expect(data.byEmail?.alerts).toEqual([
      expect.objectContaining({ target_kind: "bairro", target_id: "cpa", active: true }),
    ]);
    expect(data.byEmail?.emails).toEqual([
      expect.objectContaining({ kind: "alert_confirm", status: "queued" }),
    ]);
    // Outro leitor não enxerga os dados deste e-mail pela mesma função.
    const other = await client().rpc("export_email_data");
    expect(other.data ?? null).toBeNull();
  });

  it("exclusão só depois de 7 dias; conta da equipe fica", async () => {
    const ask = await reader
      .from("profiles")
      .update({ delete_requested_at: new Date().toISOString() })
      .eq("id", userId);
    expect(ask.error).toBeNull();
    expect((await service.rpc("purge_deleted_accounts", { p_days: 7 })).data).toBe(0);

    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await service.from("profiles").update({ delete_requested_at: old }).in("id", [userId, PAULO]);
    const n = await service.rpc("purge_deleted_accounts", { p_days: 7 });
    expect(n.data).toBe(1);
    expect((await service.from("profiles").select("id").eq("id", userId)).data).toEqual([]);
    expect(
      (await service.from("follows").select("owner_ref").eq("owner_ref", userId)).data,
    ).toEqual([]);
    expect((await service.auth.admin.getUserById(userId)).data.user).toBeNull();
    expect(await emailDataLeft(email)).toBe(0);
    expect((await service.from("profiles").select("id").eq("id", PAULO)).data).toHaveLength(1);
  });

  it("uma conta com erro não impede as outras (gate P2, M7)", async () => {
    const make = async (name: string) => {
      const u = await service.auth.admin.createUser({
        email: `lote-${name}-${Date.now()}@exemplo.com`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (u.error) throw u.error;
      const id = u.data.user.id;
      const p = await service.from("profiles").insert({
        id,
        display_name: name,
        delete_requested_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      });
      if (p.error) throw p.error;
      return id;
    };
    const bad = await make(TRAP_NAME);
    const good = await make("lote-boa");
    // Falha forçada só nesta conta: gatilho temporário que recusa apagar o perfil dela.
    sql(`create or replace function m7_trap_fn() returns trigger language plpgsql as $$
      begin if old.display_name = '${TRAP_NAME}' then raise exception 'falha forçada'; end if;
      return old; end $$;
      create trigger m7_trap before delete on public.profiles
      for each row execute function m7_trap_fn();`);
    try {
      const n = await service.rpc("purge_deleted_accounts", { p_days: 7 });
      expect(n.error).toBeNull();
      expect(n.data).toBe(1);
    } finally {
      sql(
        "drop trigger if exists m7_trap on public.profiles; drop function if exists m7_trap_fn();",
      );
    }
    expect((await service.from("profiles").select("id").eq("id", good)).data).toEqual([]);
    expect((await service.from("profiles").select("id").eq("id", bad)).data).toHaveLength(1);
    const failed = await service
      .from("audit_log")
      .select("action")
      .eq("object_ref", `profile:${bad}`)
      .eq("action", "account.delete_failed");
    expect(failed.data).toHaveLength(1);
    await service.from("profiles").delete().eq("id", bad);
    await service.auth.admin.deleteUser(bad).catch(() => undefined);
  });

  it("anon não chama a limpeza", async () => {
    const r = await client().rpc("purge_deleted_accounts", { p_days: 7 });
    expect(r.error).not.toBeNull();
  });
});
