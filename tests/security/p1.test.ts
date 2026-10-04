// @vitest-environment node
// Segurança P1 (spec 2026-10-04-seguranca-p1-design.md): casos por achado, com clientes anon,
// leitor sem papel e equipe. Cada tarefa acrescenta seu `describe` a este arquivo.
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { clientOf, type SeedUser } from "../integration/studio";

const service = createServiceClient();
const run = randomBytes(3).toString("hex");

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
