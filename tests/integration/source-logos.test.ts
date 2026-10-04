// @vitest-environment node
// Logotipos das fontes (LOGO-T1, migration 0120): `logo_source`, gatilho, RPC do automático e
// tabela de checagens. O Storage não existe na pilha local: a gravação do arquivo é coberta pelos
// testes de unidade; aqui vale o contrato do banco.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createSourceLogoStore } from "@/lib/db/source-logo-store";
import type { Database } from "@/lib/db/types";
import { dueSources } from "@/lib/sources/logo-sync";

const db = createServiceClient();
const touched = new Set<string>();

/** Volta a fonte ao estado do seed (sem logotipo, sem origem e sem checagem). */
async function normalize(id: string) {
  await db.from("source_logo_checks").delete().eq("source_id", id);
  await db.from("sources").update({ logo_path: null }).eq("id", id);
  // O gatilho marca `manual` quando `logo_path` muda; zera depois, sem tocar em `logo_path`.
  await db.from("sources").update({ logo_source: null, logo_origin_url: null }).eq("id", id);
}

async function pick(name: string) {
  const { data } = await db.from("sources").select("id").eq("name", name).single();
  if (!data) throw new Error(`fonte de seed ausente: ${name}`);
  touched.add(data.id);
  await normalize(data.id);
  return data.id;
}

afterAll(async () => {
  for (const id of touched) await normalize(id);
});

describe("logotipos das fontes (0120)", () => {
  it("seed sem logotipo: todas na vez; nenhuma manual", async () => {
    const rows = await createSourceLogoStore(db).listSources();
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const fresh = rows.filter(
      (r) => r.logoPath === null && r.logoSource === null && r.checkedAt === null,
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(dueSources(fresh, new Date()).length).toBe(fresh.length);
    expect(fresh.every((r) => r.baseUrl.startsWith("http"))).toBe(true);
  });

  it("RPC do automático grava origem e marca 'auto'", async () => {
    const id = await pick("Folha do Cerrado");
    const r = await db.rpc("source_logo_auto_set", {
      p_id: id,
      p_path: `${id}/aaaaaaaaaaaaaaaa.png`,
      p_origin: "https://folhadocerrado.example/apple-touch-icon.png",
    });
    expect(r.data).toBe("saved");
    const { data } = await db
      .from("sources")
      .select("logo_path, logo_source, logo_origin_url")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({
      logo_path: `${id}/aaaaaaaaaaaaaaaa.png`,
      logo_source: "auto",
      logo_origin_url: "https://folhadocerrado.example/apple-touch-icon.png",
    });
    const rows = await createSourceLogoStore(db).listSources();
    expect(rows.find((x) => x.id === id)).toMatchObject({ logoSource: "auto" });
  });

  it("mudança de logo_path fora da RPC (painel) vira 'manual' e a RPC não pisa mais", async () => {
    const id = await pick("MT Agora");
    const up = await db
      .from("sources")
      .update({ logo_path: `${id}/bbbbbbbbbbbbbbbb.png` })
      .eq("id", id);
    expect(up.error).toBeNull();
    const after = await db
      .from("sources")
      .select("logo_path, logo_source, logo_origin_url")
      .eq("id", id)
      .single();
    expect(after.data).toMatchObject({ logo_source: "manual", logo_origin_url: null });

    const r = await db.rpc("source_logo_auto_set", {
      p_id: id,
      p_path: `${id}/cccccccccccccccc.png`,
      p_origin: "https://mtagora.example/x.png",
    });
    expect(r.data).toBe("manual");
    const still = await db.from("sources").select("logo_path").eq("id", id).single();
    expect(still.data?.logo_path).toBe(`${id}/bbbbbbbbbbbbbbbb.png`);
  });

  it("remover o logotipo pelo painel também protege contra a busca automática", async () => {
    const id = await pick("Portal Várzea");
    await db.rpc("source_logo_auto_set", {
      p_id: id,
      p_path: `${id}/d.png`,
      p_origin: "https://x.example/d.png",
    });
    await db.from("sources").update({ logo_path: null }).eq("id", id);
    const { data } = await db
      .from("sources")
      .select("logo_path, logo_source")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({ logo_path: null, logo_source: "manual" });
    const r = await db.rpc("source_logo_auto_set", {
      p_id: id,
      p_path: `${id}/e.png`,
      p_origin: "https://x.example/e.png",
    });
    expect(r.data).toBe("manual");
  });

  it("RPC inexistente devolve not_found e só o service_role executa", async () => {
    const r = await db.rpc("source_logo_auto_set", {
      p_id: "00000000-0000-4000-8000-000000000000",
      p_path: "x/y.png",
      p_origin: "https://x.example/y.png",
    });
    expect(r.data).toBe("not_found");
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const denied = await anon.rpc("source_logo_auto_set", {
      p_id: "00000000-0000-4000-8000-000000000000",
      p_path: "x/y.png",
      p_origin: "https://x.example/y.png",
    });
    expect(denied.error).not.toBeNull();
  });

  it("checagens: o service grava e a rotina lê; anon não enxerga a tabela", async () => {
    const id = await pick("Cena Cuiabana");
    const store = createSourceLogoStore(db);
    await store.recordCheck(id, "none", "sem imagem", false);
    let row = (await store.listSources()).find((r) => r.id === id);
    expect(row).toMatchObject({ outcome: "none", foundAt: null });
    expect(row?.checkedAt).not.toBeNull();
    await store.recordCheck(id, "found", "https://x.example/a.png", true);
    row = (await store.listSources()).find((r) => r.id === id);
    expect(row).toMatchObject({ outcome: "found" });
    expect(row?.foundAt).not.toBeNull();

    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const read = await anon.from("source_logo_checks").select("source_id");
    expect(read.data ?? []).toHaveLength(0);
  });
});
