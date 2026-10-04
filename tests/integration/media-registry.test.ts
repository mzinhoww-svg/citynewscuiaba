// @vitest-environment node
// D-02 (migration 0152): Media Registry sobre `media_assets` e `article_media`.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";

const service = createServiceClient();
const created: string[] = [];
let articleIds: string[] = [];

async function asset(fields: Record<string, unknown>) {
  const { data, error } = await service
    .from("media_assets")
    .insert({
      kind: "reproduction",
      storage_path: `teste/${randomUUID()}.jpg`,
      license: "reproducao",
      allowed_use: "editorial",
      status: "approved",
      ...fields,
    })
    .select("id, rights_status, disclaimer, usage_scope, updated_at")
    .single();
  expect(error).toBeNull();
  created.push(data!.id);
  return data!;
}

async function registry(id: string) {
  const { data, error } = await service.from("media_registry").select("*").eq("id", id).single();
  expect(error).toBeNull();
  return data!;
}

afterAll(async () => {
  if (created.length) {
    await service.from("article_media").delete().in("media_id", created);
    await service.from("media_assets").delete().in("id", created);
  }
});

describe("Media Registry (D-02)", () => {
  it("imagem externa sem autor: registrada como direitos desconhecidos, só editorial, com o aviso", async () => {
    const a = await asset({
      origin_url: "https://exemplo.test/foto.jpg",
      source_name: "Folha do Cerrado",
    });
    expect(a).toMatchObject({
      rights_status: "unknown",
      disclaimer: "Foto: reprodução web",
      usage_scope: ["editorial"],
    });
    expect(await registry(a.id)).toMatchObject({
      origin: "Folha do Cerrado",
      original_url: "https://exemplo.test/foto.jpg",
      author: null,
      rights_status: "unknown",
    });
  });

  it("licença conhecida: licensed; vencida hoje: expired no registro", async () => {
    const ok = await asset({ kind: "licensed", license: "CC BY 4.0", license_until: "2099-01-01" });
    expect(ok.rights_status).toBe("licensed");
    expect(ok.usage_scope).toEqual(["editorial", "social", "thumbnail"]);
    const old = await asset({ kind: "licensed", license: "Banco X", license_until: "2020-01-01" });
    expect((await registry(old.id)).rights_status).toBe("expired");
  });

  it("bloquear ou retirar marca blocked; status manual pending é respeitado até bloqueio", async () => {
    const a = await asset({});
    await service.from("media_assets").update({ rights_status: "pending" }).eq("id", a.id);
    expect((await registry(a.id)).rights_status).toBe("pending");
    const { data: kept } = await service
      .from("media_assets")
      .select("rights_status")
      .eq("id", a.id)
      .single();
    expect(kept?.rights_status).toBe("pending");
    await service
      .from("media_assets")
      .update({ status: "blocked", removed_at: new Date().toISOString(), removal_reason: "pedido" })
      .eq("id", a.id);
    const { data: blocked } = await service
      .from("media_assets")
      .select("rights_status")
      .eq("id", a.id)
      .single();
    expect(blocked?.rights_status).toBe("blocked");
  });

  it("um ativo em várias matérias: crédito exibido em cada uso e todas as matérias rastreáveis", async () => {
    const { data: arts } = await service.from("articles").select("id").limit(2);
    articleIds = (arts ?? []).map((r) => r.id);
    expect(articleIds).toHaveLength(2);
    const a = await asset({ credit: "Foto: João Silva / Folha do Cerrado" });
    for (const id of articleIds) {
      const { error } = await service.from("article_media").insert({
        article_id: id,
        media_id: a.id,
        rationale: "teste",
        chosen_by: "sistema",
        role: "inline",
        position: 99,
      });
      expect(error).toBeNull();
    }
    const { data: uses } = await service
      .from("article_media")
      .select("credit_shown")
      .eq("media_id", a.id);
    expect(uses?.map((u) => u.credit_shown)).toEqual([
      "Foto: João Silva / Folha do Cerrado",
      "Foto: João Silva / Folha do Cerrado",
    ]);
    const r = await registry(a.id);
    expect(r.uses).toBe(2);
    expect([...r.article_ids].sort()).toEqual([...articleIds].sort());
  });

  it("anônimo não lê o registro", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await anon.from("media_registry").select("id").limit(1);
    expect(error).not.toBeNull();
  });
});
