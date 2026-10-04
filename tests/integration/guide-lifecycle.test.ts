// @vitest-environment node
// GUIA-T7 · Publicação pelas regras, atualização de 90 dias e suspensão por reclamação, no banco real.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { submitVenueReport } from "@/lib/db/guide-report";
import { createLifecycleStore } from "@/lib/db/guide-lifecycle-store";
import { createGuideListStore, templateFromRow } from "@/lib/db/guide-list-store";
import { createGuideStore } from "@/lib/db/guide-store";
import type { Database } from "@/lib/db/types";
import { proposeForTemplate } from "@/lib/guide/engine";
import { autoPublishList, refreshDue } from "@/lib/guide/lifecycle";
import { venueRecord } from "@/lib/guide/testing";

const db = createServiceClient();
const lists = createGuideListStore(db);
const venues = createGuideStore(db);
const life = createLifecycleStore(db);
const mark = Date.now().toString(36);
const CATEGORY = "lanchonete";
const TEMPLATE = "lanchonetes-cuiaba";
const NOW = new Date();
const listIds = new Set<string>();
let publishedId = "";

const anon = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

const rec = (n: number, over: Parameters<typeof venueRecord>[0] = {}) =>
  venueRecord({
    name: `Lanchonete Teste ${mark} ${n}`,
    category: CATEGORY,
    address: `Rua do Teste, ${n}`,
    neighborhood: "CPA",
    phone: "+55 65 3000-0000",
    hours: "Mo-Su 10:00-22:00",
    website: `https://lanche${n}-${mark}.example`,
    lat: -15.5 - n / 100,
    lng: -56.1,
    rating: 4.9 - n / 10,
    ratingCount: 300,
    ratingSource: "tripadvisor",
    tripadvisorRank: n,
    placeIds: { osm: `node/lc${mark}${n}`, tripadvisor: String(Date.now() + n) },
    sources: ["osm", "tripadvisor"],
    ...over,
  });

async function templateRow() {
  const { data } = await db.from("guide_templates").select("*").eq("slug", TEMPLATE).single();
  return templateFromRow(data!);
}

async function resetTemplate() {
  const { data: tpl } = await db.from("guide_templates").select("id").eq("slug", TEMPLATE).single();
  const { data: old } = await db.from("guide_lists").select("id").eq("template_id", tpl!.id);
  const ids = (old ?? []).map((l) => l.id);
  if (ids.length) {
    await db.from("guide_proposals").delete().in("list_id", ids);
    await db.from("guide_list_items").delete().in("list_id", ids);
    await db.from("guide_lists").delete().in("id", ids);
  }
  await db.from("guide_templates").update({ last_proposed_at: null }).eq("id", tpl!.id);
}

async function setFlag(enabled: boolean) {
  await db.from("feature_flags").update({ enabled }).eq("key", "guide_auto_publish");
}

async function propose(autoPublish = true) {
  const t = await templateRow();
  const deps = life.autoPublishDeps(() => NOW);
  const out = await proposeForTemplate(
    {
      store: lists,
      now: () => NOW,
      ...(autoPublish ? { afterPropose: (r) => autoPublishList(deps, r) } : {}),
    },
    t,
  );
  if (out.status === "proposed") listIds.add(out.listId);
  return out;
}

beforeAll(async () => {
  await resetTemplate();
});

afterAll(async () => {
  await setFlag(true);
  const ids = [...listIds];
  if (ids.length) {
    await db.from("guide_proposals").delete().in("list_id", ids);
    await db.from("guide_list_items").delete().in("list_id", ids);
    await db.from("guide_lists").delete().in("id", ids);
  }
  const { data: v } = await db
    .from("venues")
    .select("id")
    .like("name", `Lanchonete Teste ${mark}%`);
  const vids = (v ?? []).map((x) => x.id);
  if (vids.length) {
    await db.from("venue_reports").delete().in("venue_id", vids);
    await db.from("venues").delete().in("id", vids);
  }
  await resetTemplate();
});

describe("publicação automática", () => {
  it("com 4 lugares conferidos a lista fica como proposta (nunca publica sozinha)", async () => {
    await venues.save({ inserts: [1, 2, 3, 4].map((n) => rec(n)), updates: [] }, NOW);
    const out = await propose();
    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") return;
    expect(out.published).toBe(false);
    expect(out.missing).toContain("min_venues");
    const row = await db.from("guide_lists").select("status").eq("id", out.listId).single();
    expect(row.data?.status).toBe("proposal");
    // Volta ao estado limpo para o próximo caso.
    await resetTemplate();
    listIds.delete(out.listId);
  });

  it("interruptor desligado: cumpre as regras e mesmo assim espera o editor", async () => {
    await venues.save({ inserts: [5, 6].map((n) => rec(n)), updates: [] }, NOW);
    await setFlag(false);
    const out = await propose();
    expect(out.status === "proposed" && out.published).toBe(false);
    expect(out.status === "proposed" && out.autoPublishable).toBe(true);
    await setFlag(true);
    if (out.status === "proposed") {
      const row = await db.from("guide_lists").select("status").eq("id", out.listId).single();
      expect(row.data?.status).toBe("proposal");
      listIds.delete(out.listId);
    }
    await resetTemplate();
  });

  it("com 6 lugares, critério e fontes: publica pelas regras, com data, 90 dias e auditoria do sistema", async () => {
    await setFlag(true);
    const out = await propose();
    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") return;
    expect(out.published).toBe(true);
    publishedId = out.listId;
    const row = await db
      .from("guide_lists")
      .select("status, published_by, published_at, refreshed_at, next_refresh_at")
      .eq("id", out.listId)
      .single();
    expect(row.data?.status).toBe("published");
    expect(row.data?.published_by).toBe("rule");
    const days =
      (new Date(row.data!.next_refresh_at!).getTime() -
        new Date(row.data!.refreshed_at!).getTime()) /
      86_400_000;
    expect(Math.round(days)).toBe(90);
    const prop = await db
      .from("guide_proposals")
      .select("status, decided_by")
      .eq("list_id", out.listId)
      .single();
    expect(prop.data).toEqual({ status: "published", decided_by: "rule" });
    const audit = await db
      .from("audit_log")
      .select("actor, details")
      .eq("action", "guide.publish")
      .eq("object_ref", `guide_list:${out.listId}`);
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]?.actor).toBe("system:guide");
    // Amostra de revisão do painel: o que as regras publicaram.
    const sample = await db
      .from("guide_lists")
      .select("id")
      .eq("published_by", "rule")
      .eq("status", "published");
    expect((sample.data ?? []).map((s) => s.id)).toContain(out.listId);
    // O público lê a lista publicada.
    const pub = await anon().from("guide_lists").select("id").eq("id", out.listId);
    expect(pub.data).toHaveLength(1);
  });
});

describe("atualização de 90 dias", () => {
  it("lista vencida é reordenada com os dados de hoje e o 'Atualizada em' avança", async () => {
    const id = publishedId;
    const old = new Date(NOW.getTime() - 91 * 86_400_000).toISOString();
    await db
      .from("guide_lists")
      .update({
        refreshed_at: old,
        next_refresh_at: new Date(NOW.getTime() - 86_400_000).toISOString(),
      })
      .eq("id", id);
    // O 6º lugar passa a ser o melhor avaliado.
    const six = await db
      .from("venues")
      .select("id")
      .eq("name", `Lanchonete Teste ${mark} 6`)
      .single();
    await db
      .from("venues")
      .update({ rating: 5, rating_count: 5000, tripadvisor_rank: 1 })
      .eq("id", six.data!.id);

    const before = await db
      .from("guide_list_items")
      .select("venue_id, position")
      .eq("list_id", id)
      .order("position");
    const out = await refreshDue(
      { ...life.refreshDeps(() => NOW), due: life.due, revalidate: async () => {} },
      50,
    );
    const mine = out.find((o) => o.slug === TEMPLATE);
    expect(mine?.outcome.status).toBe("refreshed");
    const after = await db
      .from("guide_list_items")
      .select("venue_id, position")
      .eq("list_id", id)
      .order("position");
    expect(after.data?.[0]?.venue_id).toBe(six.data!.id);
    expect(after.data).not.toEqual(before.data);
    const row = await db
      .from("guide_lists")
      .select("refreshed_at, next_refresh_at, status")
      .eq("id", id)
      .single();
    expect(new Date(row.data!.refreshed_at!).getTime()).toBeGreaterThan(
      new Date(old).getTime() + 80 * 86_400_000,
    );
    expect(row.data?.status).toBe("published");
    const audit = await db
      .from("audit_log")
      .select("actor")
      .eq("action", "guide.refresh")
      .eq("object_ref", `guide_list:${id}`);
    expect(audit.data?.length).toBeGreaterThanOrEqual(1);
  });

  it("lista que perde lugares e fica abaixo do mínimo é suspensa na atualização (nunca no ar com dado velho)", async () => {
    const id = publishedId;
    await db
      .from("guide_lists")
      .update({ next_refresh_at: new Date(NOW.getTime() - 1000).toISOString() })
      .eq("id", id);
    const items = await db.from("guide_list_items").select("venue_id").eq("list_id", id);
    const ids = (items.data ?? []).map((i) => i.venue_id);
    await db.from("venues").update({ status: "inactive" }).in("id", ids.slice(0, 3));
    const out = await refreshDue(
      { ...life.refreshDeps(() => NOW), due: life.due, revalidate: async () => {} },
      50,
    );
    expect(out.find((o) => o.slug === TEMPLATE)?.outcome.status).toBe("suspended");
    const row = await db
      .from("guide_lists")
      .select("status, suspended_reason")
      .eq("id", id)
      .single();
    expect(row.data?.status).toBe("suspended");
    expect(row.data?.suspended_reason).toContain("refresh:");
    await db.from("venues").update({ status: "active", status_reason: null }).in("id", ids);
    await db
      .from("guide_lists")
      .update({ status: "published", suspended_reason: null, suspended_at: null })
      .eq("id", id);
  });
});

describe("reclamação de um lugar (Review Focus 4)", () => {
  it("suspende todas as listas que citam o lugar, tira o lugar do ar e audita", async () => {
    const id = publishedId;
    const item = await db
      .from("guide_list_items")
      .select("venue_id")
      .eq("list_id", id)
      .limit(1)
      .single();
    const venueId = item.data!.venue_id;
    const tags: string[][] = [];
    const key = `k-${mark}-1`;
    const r = await submitVenueReport(
      { venueId, reason: "O endereço mudou e o lugar fechou.", contact: "leitor@example.com" },
      key,
      async (t) => void tags.push(t),
    );
    expect(r).toEqual({ status: 200, body: { status: "ok" } });
    expect((await db.from("guide_lists").select("status").eq("id", id).single()).data?.status).toBe(
      "suspended",
    );
    expect((await db.from("venues").select("status").eq("id", venueId).single()).data?.status).toBe(
      "suspended",
    );
    const pub = await anon().from("guide_lists").select("id").eq("id", id);
    expect(pub.data ?? []).toEqual([]);
    expect(tags[0]).toContain(`guide:list:${TEMPLATE}`);
    const rep = await db.from("venue_reports").select("status, contact").eq("venue_id", venueId);
    expect(rep.data).toEqual([{ status: "open", contact: "leitor@example.com" }]);
    const audit = await db.from("audit_log").select("action").eq("object_ref", `venue:${venueId}`);
    expect(audit.data?.map((a) => a.action)).toEqual(["guide.suspend"]);
  });

  it("entrada inválida, lugar inexistente e excesso de avisos por conexão são recusados", async () => {
    const noop = async () => {};
    expect(
      await submitVenueReport({ venueId: "x", reason: "motivo válido" }, "k1", noop),
    ).toMatchObject({ status: 400 });
    expect(await submitVenueReport("texto", "k1", noop)).toMatchObject({ status: 400 });
    expect(
      await submitVenueReport(
        { venueId: "11111111-1111-4111-8111-111111111111", reason: "motivo válido aqui" },
        `k-${mark}-2`,
        noop,
      ),
    ).toEqual({ status: 404, body: { status: "not_found" } });
    expect(await submitVenueReport({ venueId: "x", reason: "motivo válido" }, null, noop)).toEqual({
      status: 429,
      body: { status: "rate_limited" },
    });
    const key = `k-${mark}-3`;
    let last = 0;
    for (let i = 0; i < 7; i += 1) {
      const r = await submitVenueReport({ venueId: "x", reason: "motivo válido" }, key, noop);
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
