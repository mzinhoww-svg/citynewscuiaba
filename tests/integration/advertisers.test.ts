// @vitest-environment node
// MS-T2 (docs/media-slots.md §5.6): anunciante estruturado e creative com `kind`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { clientOf, service } from "./studio";

const run = randomUUID().slice(0, 8);
const name = `Padaria do Porto ${run}`;
const base = {
  starts_on: "2026-10-01",
  ends_on: "2026-10-31",
  allowed_sections: ["cidade"],
  creative: { title: "Pão quente às 6h", href: "https://padaria.example" },
};

afterAll(async () => {
  await service.from("sponsored_campaigns").delete().ilike("advertiser", `%${run}%`);
  await service.from("advertisers").delete().ilike("name", `%${run}%`);
});

describe("anunciante estruturado (MS-T2)", () => {
  it("campanha nova cria o anunciante e reaproveita o mesmo nome sem diferenciar caixa", async () => {
    const helena = await clientOf("helena");
    const a = await helena
      .from("sponsored_campaigns")
      .insert({ ...base, advertiser: name })
      .select("id, advertiser_id")
      .single();
    expect(a.error).toBeNull();
    expect(a.data?.advertiser_id).toBeTruthy();
    const b = await helena
      .from("sponsored_campaigns")
      .insert({ ...base, advertiser: name.toUpperCase() })
      .select("advertiser_id")
      .single();
    expect(b.data?.advertiser_id).toBe(a.data?.advertiser_id);

    const rows = await service.from("advertisers").select("id").ilike("name", `%${run}%`);
    expect(rows.data?.length).toBe(1);
  });

  it("creative sem kind ganha kind native; kind desconhecido é recusado", async () => {
    const saved = await service
      .from("sponsored_campaigns")
      .insert({ ...base, advertiser: `${name} B` })
      .select("creative")
      .single();
    expect((saved.data?.creative as { kind?: string }).kind).toBe("native");
    const r = await service
      .from("sponsored_campaigns")
      .insert({ ...base, advertiser: `${name} C`, creative: { kind: "resposta", title: "x" } });
    expect(r.error).not.toBeNull();
  });

  it("leitor anônimo não lê anunciantes", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const r = await anon.from("advertisers").select("id").limit(1);
    expect(r.data ?? []).toEqual([]);
  });
});
