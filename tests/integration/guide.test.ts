// @vitest-environment node
// GUIA-T1 · Banco do Guia Cuiabá: RLS pública só de lista publicada e lugar ativo, "Como escolhemos"
// obrigatório para publicar, patrocínio só por admin/editor-chefe, reclamação suspende as listas.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { createServiceClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { clientOf, service } from "./studio";

const mark = Date.now().toString(36);
const db = createServiceClient();

function anon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CRITERIA =
  "Reunimos padarias de Cuiabá com dados públicos e ordenamos por nota, ranking e menções. Só entram lugares com duas fontes.";

let venueA = "";
let venueB = "";
let venueHidden = "";
let published = "";
let proposal = "";
let draft = "";
const venueIds: string[] = [];
const listIds: string[] = [];

async function venue(name: string, over: Record<string, unknown> = {}) {
  const r = await db
    .from("venues")
    .insert({ slug: `${name}-${mark}`, name, category: "padaria", ...over })
    .select("id")
    .single();
  if (r.error) throw r.error;
  venueIds.push(r.data.id);
  return r.data.id;
}
async function list(slug: string, status: string, over: Record<string, unknown> = {}) {
  const r = await db
    .from("guide_lists")
    .insert({
      slug: `${slug}-${mark}`,
      title: `Lista de teste ${slug}`,
      category: "padaria",
      criteria: status === "published" ? CRITERIA : "",
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      ...over,
    })
    .select("id")
    .single();
  if (r.error) throw r.error;
  listIds.push(r.data.id);
  return r.data.id;
}

beforeAll(async () => {
  venueA = await venue("padaria-aurora");
  venueB = await venue("padaria-brisa");
  venueHidden = await venue("padaria-oculta");
  published = await list("publicada", "published");
  proposal = await list("proposta", "proposal");
  draft = await list("rascunho", "draft");
  for (const [l, v, p] of [
    [published, venueA, 1],
    [published, venueB, 2],
    [proposal, venueHidden, 1],
  ] as const) {
    const r = await db.from("guide_list_items").insert({ list_id: l, venue_id: v, position: p });
    expect(r.error).toBeNull();
  }
});

afterAll(async () => {
  await db.from("venue_reports").delete().in("venue_id", venueIds);
  await db.from("guide_list_items").delete().in("list_id", listIds);
  await db.from("guide_proposals").delete().in("list_id", listIds);
  await db.from("guide_lists").delete().in("id", listIds);
  await db.from("venues").delete().in("id", venueIds);
});

describe("RLS pública do Guia", () => {
  it("anon lê só lista publicada, nunca proposta nem rascunho", async () => {
    const r = await anon()
      .from("guide_lists")
      .select("id, status")
      .in("id", [published, proposal, draft]);
    expect(r.error).toBeNull();
    expect(r.data?.map((x) => x.id)).toEqual([published]);
  });

  it("anon lê itens e lugares só de lista publicada; lugar fora de lista publicada fica oculto", async () => {
    const items = await anon().from("guide_list_items").select("venue_id").in("list_id", listIds);
    expect(items.data?.map((i) => i.venue_id).sort()).toEqual([venueA, venueB].sort());
    const venues = await anon().from("venues").select("id").in("id", venueIds);
    expect(venues.data?.map((v) => v.id).sort()).toEqual([venueA, venueB].sort());
  });

  it("lugar suspenso ou inativo some do público mesmo em lista publicada", async () => {
    await db.from("venues").update({ status: "inactive" }).eq("id", venueB);
    const r = await anon().from("venues").select("id").in("id", [venueA, venueB]);
    expect(r.data?.map((v) => v.id)).toEqual([venueA]);
    await db.from("venues").update({ status: "active" }).eq("id", venueB);
  });

  it("anon não lê modelos, propostas, reclamações nem execuções", async () => {
    for (const t of [
      "guide_templates",
      "guide_proposals",
      "venue_reports",
      "guide_runs",
    ] as const) {
      const r = await anon().from(t).select("*").limit(1);
      expect(r.data ?? [], t).toEqual([]);
    }
  });

  it("anon não escreve em nada", async () => {
    const r = await anon()
      .from("venues")
      .insert({ slug: `x-${mark}`, name: "Intruso", category: "padaria" });
    expect(r.error).not.toBeNull();
    const rpc = await anon().rpc("guide_report_venue", {
      p_venue: venueA,
      p_reason: "teste de acesso",
    });
    expect(rpc.error).not.toBeNull();
  });
});

describe("regras do banco", () => {
  it("lista publicada exige o texto Como escolhemos (40+ caracteres)", async () => {
    const r = await db.from("guide_lists").update({ status: "published" }).eq("id", draft);
    expect(r.error?.code).toBe("23514");
    const ok = await db
      .from("guide_lists")
      .update({ status: "published", criteria: CRITERIA, published_at: new Date().toISOString() })
      .eq("id", draft);
    expect(ok.error).toBeNull();
    await db.from("guide_lists").update({ status: "draft" }).eq("id", draft);
  });

  it("patrocínio exige nome e tipo (CityNews ou parceiro), e vice-versa", async () => {
    const noName = await db.from("guide_lists").update({ sponsored: true }).eq("id", draft);
    expect(noName.error?.code).toBe("23514");
    const badKind = await db
      .from("guide_lists")
      .update({ sponsored: true, sponsor_name: "Alguém", sponsor_kind: "anunciante" })
      .eq("id", draft);
    expect(badKind.error).not.toBeNull();
    const orphan = await db.from("guide_lists").update({ sponsor_name: "Alguém" }).eq("id", draft);
    expect(orphan.error?.code).toBe("23514");
  });

  it("editor-chefe liga a flag Patrocinado; leitura não escreve nada no Guia", async () => {
    const marina = await clientOf("marina");
    const ok = await marina
      .from("guide_lists")
      .update({ sponsored: true, sponsor_name: "CityNews", sponsor_kind: "citynews" })
      .eq("id", draft)
      .select("id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    await db
      .from("guide_lists")
      .update({ sponsored: false, sponsor_name: null, sponsor_kind: null })
      .eq("id", draft);

    const paulo = await clientOf("paulo");
    const denied = await paulo
      .from("guide_lists")
      .update({ title: "Alterado indevidamente" })
      .eq("id", draft)
      .select("id");
    expect(denied.data ?? []).toEqual([]);
    const read = await paulo.from("guide_lists").select("id").eq("id", draft);
    expect(read.data ?? []).toEqual([]);
  });

  it("editor sem a editoria guia-cuiaba não gerencia o Guia; com a editoria, gerencia, mas não liga patrocínio", async () => {
    const otavio = await clientOf("otavio");
    const before = await otavio.from("guide_lists").select("id").eq("id", draft);
    expect(before.data ?? []).toEqual([]);

    const orig = await service
      .from("user_roles")
      .select("sections")
      .eq("user_id", "c1000000-0000-4000-8000-000000000003")
      .single();
    await service
      .from("user_roles")
      .update({ sections: [...(orig.data?.sections ?? []), "guia-cuiaba"] })
      .eq("user_id", "c1000000-0000-4000-8000-000000000003");
    try {
      const ok = await otavio
        .from("guide_lists")
        .update({ intro: "Texto do editor" })
        .eq("id", draft)
        .select("id");
      expect(ok.data).toHaveLength(1);
      const sponsor = await otavio
        .from("guide_lists")
        .update({ sponsored: true, sponsor_name: "CityNews", sponsor_kind: "citynews" })
        .eq("id", draft);
      expect(sponsor.error?.code).toBe("42501");
    } finally {
      await service
        .from("user_roles")
        .update({ sections: orig.data?.sections ?? [] })
        .eq("user_id", "c1000000-0000-4000-8000-000000000003");
    }
  });

  it("posição repetida na mesma lista é recusada (confirmada no fim da transação)", async () => {
    const r = await db
      .from("guide_list_items")
      .insert({ list_id: published, venue_id: venueHidden, position: 1 });
    expect(r.error?.code).toBe("23505");
  });
});

describe("reclamação de um lugar (Review Focus 4)", () => {
  it("suspende todas as listas publicadas que o citam e tira o lugar do ar", async () => {
    const second = await list("segunda-publicada", "published");
    await db.from("guide_list_items").insert({ list_id: second, venue_id: venueA, position: 1 });

    const r = await db.rpc("guide_report_venue", {
      p_venue: venueA,
      p_reason: "O endereço mudou e o lugar fechou.",
      p_contact: "leitor@example.com",
    });
    expect(r.error).toBeNull();
    const body = r.data as { reportId: string; suspendedLists: string[] };
    expect(body.suspendedLists).toHaveLength(2);

    const lists = await db.from("guide_lists").select("id, status").in("id", [published, second]);
    expect(lists.data?.every((l) => l.status === "suspended")).toBe(true);
    const pub = await anon().from("guide_lists").select("id").in("id", [published, second]);
    expect(pub.data ?? []).toEqual([]);
    const v = await db.from("venues").select("status").eq("id", venueA).single();
    expect(v.data?.status).toBe("suspended");

    // Improcedente: volta tudo, mas só as listas sem outro lugar fora do ar.
    const marina = await clientOf("marina");
    const dec = await marina.rpc("guide_resolve_report", {
      p_report: body.reportId,
      p_decision: "dismiss",
      p_note: "Conferido: o lugar segue aberto.",
    });
    expect(dec.error).toBeNull();
    const after = await db.from("guide_lists").select("id, status").in("id", [published, second]);
    expect(after.data?.every((l) => l.status === "published")).toBe(true);
    const v2 = await db.from("venues").select("status").eq("id", venueA).single();
    expect(v2.data?.status).toBe("active");
  });

  it("confirmada: o lugar sai e as listas ficam suspensas até um humano ajustar", async () => {
    const r = await db.rpc("guide_report_venue", {
      p_venue: venueB,
      p_reason: "Fechou definitivamente em setembro.",
    });
    const id = (r.data as { reportId: string }).reportId;
    const marina = await clientOf("marina");
    const dec = await marina.rpc("guide_resolve_report", { p_report: id, p_decision: "confirm" });
    expect(dec.error).toBeNull();
    const l = await db.from("guide_lists").select("status").eq("id", published).single();
    expect(l.data?.status).toBe("suspended");
    const v = await db.from("venues").select("status").eq("id", venueB).single();
    expect(v.data?.status).toBe("inactive");
    // Decidir duas vezes é recusado.
    const again = await marina.rpc("guide_resolve_report", { p_report: id, p_decision: "dismiss" });
    expect(again.error).not.toBeNull();
    await db.from("venues").update({ status: "active", status_reason: null }).eq("id", venueB);
    await db
      .from("guide_lists")
      .update({ status: "published", suspended_reason: null })
      .eq("id", published);
  });

  it("quem não gerencia o Guia não decide reclamação", async () => {
    const r = await db.rpc("guide_report_venue", {
      p_venue: venueHidden,
      p_reason: "teste de decisão",
    });
    const id = (r.data as { reportId: string }).reportId;
    const paulo = await clientOf("paulo");
    const dec = await paulo.rpc("guide_resolve_report", { p_report: id, p_decision: "dismiss" });
    expect(dec.error?.code).toBe("42501");
  });
});

describe("auditoria", () => {
  it("as ações do Guia estão nas duas listas (banco e código)", async () => {
    const r = await service.rpc("studio_audit_actions");
    const db_ = r.data ?? [];
    for (const a of AUDIT_ACTIONS.filter((x) => x.startsWith("guide."))) expect(db_).toContain(a);
    expect(db_).toContain("guide.publish");
    expect(db_).toContain("article.force_publish");
  });
});
