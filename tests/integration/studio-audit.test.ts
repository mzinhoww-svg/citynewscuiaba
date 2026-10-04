// @vitest-environment node
// Gate do P4, achados 9 e 19: studio_audit aceita só ações conhecidas, limita tamanho e ritmo
// das negações e não duplica a mesma negação; leitor que tenta publicar deixa rastro.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { runWithStudioContext } from "@/lib/studio/context";
import { publishArticle } from "@/lib/studio/publish";
import { clientOf, SEED_USERS, service } from "./studio";

const PASSWORD = "senha-de-teste-123";
let reader: DbClient;
let readerId = "";
const draft = randomUUID();

async function count(actor: string, action: string, ref?: string) {
  let q = service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor", actor)
    .eq("action", action);
  if (ref) q = q.eq("object_ref", ref);
  return (await q).count ?? 0;
}

beforeAll(async () => {
  const u = await service.auth.admin.createUser({
    email: `leitor-audit-${Date.now()}@exemplo.com`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (u.error) throw u.error;
  readerId = u.data.user.id;
  reader = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const s = await reader.auth.signInWithPassword({ email: u.data.user.email!, password: PASSWORD });
  if (s.error) throw s.error;
  const a = await service.from("articles").insert({
    id: draft,
    slug: `gate-audit-${draft.slice(0, 8)}`,
    kind: "original",
    section_slug: "cidade",
    title: "Rascunho",
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: "draft",
  });
  if (a.error) throw a.error;
});

afterAll(async () => {
  await service.from("articles").delete().eq("id", draft);
  await service.from("profiles").delete().eq("id", readerId);
  await service.auth.admin.deleteUser(readerId).catch(() => undefined);
});

describe("studio_audit", () => {
  it("a lista do banco (studio_audit_actions) e a do código (AUDIT_ACTIONS) são iguais", async () => {
    // Nos dois sentidos: um nome novo no painel ou no Estúdio precisa entrar nas duas listas
    // (migration 0033 + src/lib/audit/actions.ts), senão `studio_audit` recusa com 22023.
    const r = await service.rpc("studio_audit_actions");
    expect(r.error).toBeNull();
    const db = [...(r.data ?? [])].sort();
    const ts = [...AUDIT_ACTIONS].sort();
    expect(db).toEqual(ts);
  });

  it("equipe só grava ações conhecidas (as do Estúdio), nunca nome arbitrário", async () => {
    const db = await clientOf("otavio");
    const bad = await db.rpc("studio_audit", {
      p_actor: SEED_USERS.otavio.id,
      p_action: "rules.approve.forjado",
      p_object_ref: "rules:1",
      p_details: {},
    });
    expect(bad.error?.code).toBe("22023");
    for (const action of AUDIT_ACTIONS) {
      const ok = await db.rpc("studio_audit", {
        p_actor: SEED_USERS.otavio.id,
        p_action: `${action}.denied`,
        p_object_ref: `teste:${action}`,
        p_details: {},
      });
      expect(ok.error, action).toBeNull();
    }
  });

  it("leitor chamando publishArticle num rascunho invisível recebe forbidden com rastro", async () => {
    const r = await runWithStudioContext(
      {
        session: { userId: readerId, email: "leitor@exemplo.com", roles: [] },
        db: reader,
        revalidate: async () => {},
        now: () => new Date(),
      },
      () => publishArticle({ id: draft, when: "now", destinations: ["home"] }),
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await count(readerId, "article.publish.denied", `article:${draft}`)).toBe(1);
  });
  it("leitor: detalhe grande é recusado; negação repetida vira uma linha só", async () => {
    const big = await reader.rpc("studio_audit", {
      p_actor: readerId,
      p_action: "article.publish.denied",
      p_object_ref: "article:x",
      p_details: { junk: "x".repeat(2000) },
    });
    expect(big.error?.code).toBe("22001");
    for (let i = 0; i < 5; i++) {
      const r = await reader.rpc("studio_audit", {
        p_actor: readerId,
        p_action: "article.publish.denied",
        p_object_ref: "article:repetida",
        p_details: { scope: {} },
      });
      expect(r.error).toBeNull();
    }
    expect(await count(readerId, "article.publish.denied", "article:repetida")).toBe(1);
  });

  it("leitor: negações acima do limite por minuto não entram", async () => {
    // O limite é por janela fixa de 60 s (hit_rate_limit): se o laço cruza a virada do minuto, são
    // duas janelas de 20. O teto vale por janela tocada, sem afrouxar o caso normal (1 janela).
    const firstWindow = Math.floor(Date.now() / 60_000);
    for (let i = 0; i < 40; i++) {
      await reader.rpc("studio_audit", {
        p_actor: readerId,
        p_action: "article.edit.denied",
        p_object_ref: `article:${i}`,
        p_details: {},
      });
    }
    const windows = Math.floor(Date.now() / 60_000) - firstWindow + 1;
    expect(await count(readerId, "article.edit.denied")).toBeLessThanOrEqual(20 * windows);
  });
});
