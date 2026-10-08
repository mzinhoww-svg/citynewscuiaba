// @vitest-environment node
// Revisão do gate P2 (I2): histórico, interesses e ocultações do leitor são só dele. Nenhum
// papel da equipe (aqui `leitura` e `admin`) lê `preferences` nem o vínculo com o id anônimo.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const PASSWORD = "senha-de-teste-123";
const service = createServiceClient();
const email = `privacidade-${Date.now()}@exemplo.com`;
const ANON = "a1b2c3d4-0000-4000-8000-00000000abcd";
let userId = "";
let reader: DbClient;
let paulo: DbClient; // papel "leitura"
let admin: DbClient; // Helena, papel "admin"

function client(): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
async function as(mail: string, password = SEED_PASSWORD): Promise<DbClient> {
  const c = client();
  const r = await c.auth.signInWithPassword({ email: mail, password });
  if (r.error) throw r.error;
  return c;
}

beforeAll(async () => {
  const created = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  [reader, paulo, admin] = await Promise.all([
    as(email, PASSWORD),
    as("paulo.rezende@citynews.local"),
    as("helena.costa@citynews.local"),
  ]);
  const p = await reader.from("profiles").insert({ id: userId, display_name: "Leitora" });
  if (p.error) throw p.error;
  const w = await reader.from("reader_preferences").upsert({
    user_id: userId,
    preferences: { history: [{ ref: "a:1", at: "2026-09-20T10:00:00Z", seconds: 90 }] },
    migrated_from_anon: ANON,
  });
  if (w.error) throw w.error;
});

afterAll(async () => {
  await service.from("profiles").delete().eq("id", userId);
  await service.auth.admin.deleteUser(userId).catch(() => undefined);
});

describe("preferências do leitor (I2)", () => {
  it("o próprio leitor lê o que gravou", async () => {
    const r = await reader
      .from("reader_preferences")
      .select("preferences, migrated_from_anon")
      .eq("user_id", userId)
      .single();
    expect(r.error).toBeNull();
    expect(r.data?.migrated_from_anon).toBe(ANON);
  });

  it("equipe `leitura` não lê o perfil do leitor (C1-06), nem preferências nem id anônimo", async () => {
    const row = await paulo.from("profiles").select("*").eq("id", userId);
    expect(row.error).toBeNull();
    expect(row.data).toEqual([]);
    const prefs = await paulo.from("reader_preferences").select("*").eq("user_id", userId);
    expect(prefs.data ?? []).toEqual([]);
  });

  it("quem atende leitor (moderador) vê o perfil público, mas não preferências nem id anônimo", async () => {
    const carlos = await as("carlos.nunes@citynews.local");
    const row = await carlos.from("profiles").select("*").eq("id", userId).single();
    expect(row.error).toBeNull();
    expect(row.data?.display_name).toBe("Leitora");
    expect(row.data).not.toHaveProperty("preferences");
    expect(row.data).not.toHaveProperty("migrated_from_anon");
    const prefs = await carlos.from("reader_preferences").select("*").eq("user_id", userId);
    expect(prefs.data ?? []).toEqual([]);
  });

  it("nem o admin lê preferências pela API", async () => {
    const prefs = await admin.from("reader_preferences").select("*").eq("user_id", userId);
    expect(prefs.data ?? []).toEqual([]);
    const write = await admin
      .from("reader_preferences")
      .update({ preferences: {} })
      .eq("user_id", userId)
      .select("user_id");
    expect(write.data ?? []).toEqual([]);
  });

  it("a exclusão da conta leva as preferências junto", async () => {
    await service
      .from("profiles")
      .update({ delete_requested_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq("id", userId);
    await service.rpc("purge_deleted_accounts", { p_days: 7 });
    const left = await service.from("reader_preferences").select("user_id").eq("user_id", userId);
    expect(left.data).toEqual([]);
  });
});
