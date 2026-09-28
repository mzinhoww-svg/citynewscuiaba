// @vitest-environment node
// Conta do leitor (P2-T11/T12): o próprio leitor grava seguidas, salvos e preferências pela RLS;
// a exclusão pedida em /perfil só vale depois de 7 dias e nunca apaga conta da equipe.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const PASSWORD = "senha-de-teste-123";
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
  reader = client();
  const r = await reader.auth.signInWithPassword({ email, password: PASSWORD });
  if (r.error) throw r.error;
});

afterAll(async () => {
  await service.from("follows").delete().eq("owner_ref", userId);
  await service.from("profiles").delete().eq("id", userId);
  await service.auth.admin.deleteUser(userId).catch(() => undefined);
  await service.from("profiles").update({ delete_requested_at: null }).eq("id", PAULO);
});

describe("conta do leitor", () => {
  it("leitor cria o próprio perfil, grava preferências e seguidas; não mexe no perfil alheio", async () => {
    const p = await reader.from("profiles").insert({ id: userId, display_name: "Leitora" });
    expect(p.error).toBeNull();
    const prefs = await reader
      .from("profiles")
      .update({
        preferences: { interests: [{ key: "Cidade", evidence: "3 leituras", weak: false }] },
      })
      .eq("id", userId);
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
    expect((await service.from("profiles").select("id").eq("id", PAULO)).data).toHaveLength(1);
  });

  it("anon não chama a limpeza", async () => {
    const r = await client().rpc("purge_deleted_accounts", { p_days: 7 });
    expect(r.error).not.toBeNull();
  });
});
