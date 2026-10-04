// @vitest-environment node
// GUIA-T5 · Admin do Guia contra o banco real: permissões (site.manage e article.edit na editoria),
// propor por link com página fictícia, publicar só com Como escolhemos, patrocínio que nunca mexe na
// ordem, suspender, reativar, descartar, reclamação e auditoria `guide.*`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { guideTags } from "@/lib/guide/venue-media";
import { venueRecord } from "@/lib/guide/testing";
import { createGuideStore } from "@/lib/db/guide-store";
import {
  adjustListCommand,
  decideReportCommand,
  discardListCommand,
  proposeFromLinkCommand,
  proposeManualCommand,
  publishListCommand,
  restoreListCommand,
  saveTemplateCommand,
  saveVenueCommand,
  setSponsorCommand,
  suspendListCommand,
} from "@/lib/studio/guide";
import { runWithStudioContext } from "@/lib/studio/context";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

const db = createServiceClient();
const venues = createGuideStore(db);
const mark = Date.now().toString(36);
const OTAVIO = SEED_USERS.otavio.id;
const venueIds: string[] = [];
const listIds: string[] = [];
const extraVenueIds: string[] = [];
const templateSlugs: string[] = [];
const reportIds: string[] = [];
let otavioSections: string[] = [];

/** Otávio (editor) com as editorias dadas: a sessão guarda os papéis lidos no primeiro login. */
async function asEditor<T>(sections: string[], fn: () => Promise<T>): Promise<T> {
  return runWithStudioContext(
    {
      session: {
        userId: OTAVIO,
        email: SEED_USERS.otavio.email,
        roles: [{ role: "editor", sections }],
      },
      db: await clientOf("otavio"),
      revalidate: async () => {},
      now: () => new Date(),
    },
    fn,
  );
}

const rec = (n: number, over: Parameters<typeof venueRecord>[0] = {}) =>
  venueRecord({
    name: `Hotel Teste ${mark} ${n}`,
    category: "hotel",
    address: `Rua do Teste, ${n}`,
    neighborhood: "Porto",
    phone: "+55 65 3000-0000",
    hours: "Mo-Su 00:00-24:00",
    website: `https://hotel${n}-${mark}.example`,
    lat: -15.6 - n / 100,
    lng: -56.1,
    rating: 4.9 - n / 10,
    ratingCount: 300,
    ratingSource: "tripadvisor",
    tripadvisorRank: n,
    placeIds: { osm: `node/${mark}${n}`, tripadvisor: String(Date.now() + n) },
    sources: ["osm", "tripadvisor"],
    ...over,
  });

async function seedVenues(count = 5): Promise<string[]> {
  await venues.save(
    { inserts: Array.from({ length: count }, (_, i) => rec(i + 1)), updates: [] },
    new Date(),
  );
  const { data } = await db
    .from("venues")
    .select("id, name")
    .like("name", `Hotel Teste ${mark}%`)
    .order("name");
  const ids = (data ?? []).map((v) => v.id);
  venueIds.splice(0, venueIds.length, ...ids);
  return ids;
}

const MANUAL = (ids: string[], over: Record<string, unknown> = {}) => ({
  title: `Os melhores hotéis de teste ${mark}`,
  category: "hotel",
  venueIds: ids,
  ...over,
});

async function manualList(who: "marina" | "helena" = "marina") {
  const r = await asUser(who, () => proposeManualCommand(MANUAL(venueIds) as never));
  if (!r.ok) throw new Error(`proposta manual falhou: ${r.error} ${r.message ?? ""}`);
  listIds.push(r.value.listId);
  return r.value.listId;
}

beforeAll(async () => {
  process.env.CRAWLER_FIXTURES = "1";
  await seedVenues();
  const cur = await service.from("user_roles").select("sections").eq("user_id", OTAVIO).single();
  otavioSections = cur.data?.sections ?? [];
});

afterAll(async () => {
  delete process.env.CRAWLER_FIXTURES;
  await service.from("user_roles").update({ sections: otavioSections }).eq("user_id", OTAVIO);
  if (reportIds.length) await db.from("venue_reports").delete().in("id", reportIds);
  const { data: bySlug } = await db.from("guide_lists").select("id").like("title", `%${mark}%`);
  const ids = [...new Set([...listIds, ...(bySlug ?? []).map((l) => l.id)])];
  // Listas criadas pela proposta por link usam o título do CityNews: acha pelos itens.
  const { data: viaItems } = await db
    .from("guide_list_items")
    .select("list_id")
    .in("venue_id", venueIds);
  for (const l of viaItems ?? []) if (!ids.includes(l.list_id)) ids.push(l.list_id);
  if (ids.length) {
    await db.from("guide_proposals").delete().in("list_id", ids);
    await db.from("guide_list_items").delete().in("list_id", ids);
    await db.from("guide_lists").delete().in("id", ids);
  }
  await db.from("venue_media").delete().in("venue_id", venueIds);
  await db
    .from("venues")
    .delete()
    .in("id", [...venueIds, ...extraVenueIds]);
  await db.from("venues").delete().like("slug", `%${mark}%`);
  await db
    .from("venues")
    .delete()
    .in("name", [
      "Padaria Pão Dourado",
      "Padaria Lua Nova",
      "Confeitaria Estrela do Sul",
      "Panificadora Cerrado Vivo",
    ])
    .in("category", ["padaria"]);
  if (templateSlugs.length) await db.from("guide_templates").delete().in("slug", templateSlugs);
});

describe("permissões do admin do Guia", () => {
  it("jornalista e leitura não propõem nada, e a negação deixa rastro", async () => {
    const r = await asUser("juliana", () => proposeManualCommand(MANUAL(venueIds) as never));
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    const l = await asUser("paulo", () => proposeManualCommand(MANUAL(venueIds) as never));
    expect(l).toMatchObject({ ok: false, error: "forbidden" });
    const { data } = await service
      .from("audit_log")
      .select("action")
      .eq("action", "guide.propose.denied")
      .order("id", { ascending: false })
      .limit(1);
    expect(data).toHaveLength(1);
  });

  it("editor de outras editorias é recusado; com a editoria guia-cuiaba propõe, ajusta e publica", async () => {
    const denied = await asEditor(otavioSections, () =>
      proposeManualCommand(MANUAL(venueIds) as never),
    );
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });

    await service
      .from("user_roles")
      .update({ sections: [...otavioSections, "guia-cuiaba"] })
      .eq("user_id", OTAVIO);
    const withGuide = [...otavioSections, "guia-cuiaba"];
    const prop = await asEditor(withGuide, () =>
      proposeManualCommand(MANUAL(venueIds, { title: `Hotéis do editor ${mark}` }) as never),
    );
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    listIds.push(prop.value.listId);
    const pub = await asEditor(withGuide, () => publishListCommand({ id: prop.value.listId }));
    expect(pub.ok).toBe(true);
    // Mas patrocínio, modelos e lugares são de quem tem site.manage.
    const sp = await asEditor(withGuide, () =>
      setSponsorCommand({
        id: prop.value.listId,
        sponsored: true,
        sponsorKind: "citynews",
        sponsorName: "CityNews",
      }),
    );
    expect(sp).toMatchObject({ ok: false, error: "forbidden" });
    const tpl = await asEditor(withGuide, () =>
      saveTemplateCommand({
        title: `Modelo do editor ${mark}`,
        noun: "hotéis",
        category: "hotel",
        take: 5,
        minVenues: 5,
        active: true,
      }),
    );
    expect(tpl).toMatchObject({ ok: false, error: "forbidden" });
    await service.from("user_roles").update({ sections: otavioSections }).eq("user_id", OTAVIO);
  });

  it("admin (site.manage) também gerencia as listas", async () => {
    const r = await asUser("helena", () =>
      proposeManualCommand(MANUAL(venueIds, { title: `Hotéis do admin ${mark}` }) as never),
    );
    expect(r.ok).toBe(true);
    if (r.ok) listIds.push(r.value.listId);
  });
});

describe("propor por link (página fictícia)", () => {
  it("extrai só os nomes, confere nos provedores, descarta o que não existe e cria a lista do CityNews", async () => {
    const r = await asUser("marina", () =>
      proposeFromLinkCommand({
        url: "https://saboresmt.example/melhores-padarias",
        category: null,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    listIds.push(r.value.listId);
    expect(r.value.verified).toBe(4);
    expect(r.value.discarded).toEqual(["Padaria Aurora"]);

    const list = await db.from("guide_lists").select("*").eq("id", r.value.listId).single();
    expect(list.data).toMatchObject({ status: "proposal", origin: "link", category: "padaria" });
    expect(list.data?.title).toBe("As 4 melhores padarias de Cuiabá");
    const prop = await db
      .from("guide_proposals")
      .select("*")
      .eq("list_id", r.value.listId)
      .single();
    expect(prop.data?.source_url).toBe("https://saboresmt.example/melhores-padarias");
    const analysis = JSON.stringify(prop.data?.analysis);
    expect(analysis).toContain("saboresmt.example");
    // Nada do texto do portal de origem chega ao banco.
    expect(analysis).not.toContain("trinta anos");
    expect(analysis).not.toContain("votação entre os leitores");
    expect(JSON.stringify(list.data)).not.toContain("trinta anos");
    const { data } = await service
      .from("audit_log")
      .select("details")
      .eq("action", "guide.propose")
      .order("id", { ascending: false })
      .limit(1);
    expect((data?.[0]?.details as { origin?: string }).origin).toBe("link");
  });

  it("link bloqueado por robots.txt, inválido ou sem lista vira erro com mensagem clara", async () => {
    const bad = await asUser("marina", () =>
      proposeFromLinkCommand({ url: "ftp://x.example/a" } as never),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const none = await asUser("marina", () =>
      proposeFromLinkCommand({ url: "https://folhadocerrado.example/termos", category: null }),
    );
    expect(none.ok).toBe(false);
    if (!none.ok)
      expect(none.message).toMatch(/Não encontramos uma lista|não foi possível|robots/i);
  });
});

describe("publicar, ajustar, suspender e reativar", () => {
  it("não publica sem Como escolhemos e publica com ele, com data, autor e proposta decidida", async () => {
    const id = await manualList();
    await db.from("guide_lists").update({ criteria: "" }).eq("id", id);
    const no = await asUser("marina", () => publishListCommand({ id }));
    expect(no).toMatchObject({ ok: false, error: "invalid" });
    if (!no.ok) expect(no.message).toMatch(/Como escolhemos/);

    await db
      .from("guide_lists")
      .update({
        criteria:
          "Reunimos hotéis de Cuiabá com dados públicos e ordenamos por nota, ranking e menções.",
      })
      .eq("id", id);
    const tags: string[][] = [];
    const ok = await asUser("marina", () => publishListCommand({ id }), {
      revalidate: async (t) => void tags.push(t),
    });
    expect(ok.ok).toBe(true);
    const row = await db.from("guide_lists").select("*").eq("id", id).single();
    expect(row.data?.status).toBe("published");
    expect(row.data?.published_by).toBe(SEED_USERS.marina.id);
    const days =
      (new Date(row.data!.next_refresh_at!).getTime() -
        new Date(row.data!.refreshed_at!).getTime()) /
      86_400_000;
    expect(Math.round(days)).toBe(90);
    const prop = await db
      .from("guide_proposals")
      .select("status, decided_by")
      .eq("list_id", id)
      .single();
    expect(prop.data).toMatchObject({ status: "published", decided_by: SEED_USERS.marina.id });
    expect(tags[0]).toContain(guideTags.index);
    const again = await asUser("marina", () => publishListCommand({ id }));
    expect(again).toMatchObject({ ok: false, error: "conflict" });
    const audit = await service
      .from("audit_log")
      .select("object_ref, actor")
      .eq("action", "guide.publish")
      .eq("object_ref", `guide_list:${id}`);
    expect(audit.data).toHaveLength(1);
  });

  it("ajustar muda título, critério, ordem e notas, recalcula a pontuação e audita", async () => {
    const id = await manualList();
    const before = await db
      .from("guide_list_items")
      .select("venue_id, position")
      .eq("list_id", id)
      .order("position");
    const order = (before.data ?? []).map((i) => i.venue_id).reverse();
    const r = await asUser("marina", () =>
      adjustListCommand({
        id,
        title: `Hotéis ajustados ${mark}`,
        intro: "Introdução do editor.",
        criteria: "Critério ajustado pelo editor, com mais de quarenta caracteres para valer.",
        items: order.map((venueId, i) => ({
          venueId,
          note: i === 0 ? "Melhor café da manhã." : null,
        })),
      }),
    );
    expect(r.ok).toBe(true);
    const after = await db
      .from("guide_list_items")
      .select("venue_id, position, editor_note, score")
      .eq("list_id", id)
      .order("position");
    expect((after.data ?? []).map((i) => i.venue_id)).toEqual(order);
    expect(after.data?.[0]?.editor_note).toBe("Melhor café da manhã.");
    expect(after.data?.every((i) => (i.score ?? 0) > 0)).toBe(true);
    const row = await db.from("guide_lists").select("title, intro").eq("id", id).single();
    expect(row.data).toMatchObject({
      title: `Hotéis ajustados ${mark}`,
      intro: "Introdução do editor.",
    });
    const dup = await asUser("marina", () =>
      adjustListCommand({
        id,
        title: `Hotéis ajustados ${mark}`,
        criteria: "Critério suficiente para o teste de repetição aqui.",
        items: [order[0], order[0], order[1]].map((venueId) => ({ venueId: venueId! })),
      }),
    );
    expect(dup).toMatchObject({ ok: false, error: "invalid" });
  });

  it("suspender e reativar listas publicadas, com motivo e auditoria", async () => {
    const id = await manualList();
    await asUser("marina", () => publishListCommand({ id }));
    const bad = await asUser("marina", () => suspendListCommand({ id, reason: "x" }));
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const s = await asUser("marina", () =>
      suspendListCommand({ id, reason: "Conferência de endereços" }),
    );
    expect(s.ok).toBe(true);
    const row = await db
      .from("guide_lists")
      .select("status, suspended_reason")
      .eq("id", id)
      .single();
    expect(row.data).toMatchObject({
      status: "suspended",
      suspended_reason: "editor: Conferência de endereços",
    });
    const r = await asUser("marina", () => restoreListCommand({ id }));
    expect(r.ok).toBe(true);
    expect((await db.from("guide_lists").select("status").eq("id", id).single()).data?.status).toBe(
      "published",
    );
    const actions = await service
      .from("audit_log")
      .select("action")
      .eq("object_ref", `guide_list:${id}`);
    expect((actions.data ?? []).map((a) => a.action).sort()).toEqual([
      "guide.propose",
      "guide.publish",
      "guide.restore",
      "guide.suspend",
    ]);
  });

  it("lugar fora do ar impede publicar e reativar", async () => {
    const id = await manualList();
    const [first] = venueIds;
    await db.from("venues").update({ status: "inactive" }).eq("id", first!);
    const pub = await asUser("marina", () => publishListCommand({ id }));
    expect(pub).toMatchObject({ ok: false, error: "invalid" });
    await db.from("venues").update({ status: "active" }).eq("id", first!);
  });

  it("descartar proposta exige motivo e só vale para proposta ou rascunho", async () => {
    const id = await manualList();
    const bad = await asUser("marina", () => discardListCommand({ id, reason: "" }));
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const ok = await asUser("marina", () =>
      discardListCommand({ id, reason: "Fora do que queremos agora" }),
    );
    expect(ok.ok).toBe(true);
    const prop = await db
      .from("guide_proposals")
      .select("status, decision_note")
      .eq("list_id", id)
      .single();
    expect(prop.data).toMatchObject({
      status: "discarded",
      decision_note: "Fora do que queremos agora",
    });
    const again = await asUser("marina", () => discardListCommand({ id, reason: "de novo" }));
    expect(again).toMatchObject({ ok: false, error: "conflict" });
  });
});

describe("Patrocinado nunca altera a ordem (Review Focus 5)", () => {
  it("só CityNews e parceiros, com nome; liga e desliga sem tocar nos itens", async () => {
    const id = await manualList();
    await asUser("marina", () => publishListCommand({ id }));
    const itemsBefore = JSON.stringify(
      (
        await db
          .from("guide_list_items")
          .select("venue_id, position, score")
          .eq("list_id", id)
          .order("position")
      ).data,
    );

    const noName = await asUser("marina", () =>
      setSponsorCommand({ id, sponsored: true, sponsorKind: "partner", sponsorName: "" }),
    );
    expect(noName).toMatchObject({ ok: false, error: "invalid" });
    const anyone = await asUser("marina", () =>
      setSponsorCommand({
        id,
        sponsored: true,
        sponsorKind: "anunciante",
        sponsorName: "Qualquer",
      } as never),
    );
    expect(anyone).toMatchObject({ ok: false, error: "invalid" });

    const partner = await asUser("marina", () =>
      setSponsorCommand({
        id,
        sponsored: true,
        sponsorKind: "partner",
        sponsorName: "Hotel Parceiro Teste",
      }),
    );
    expect(partner.ok).toBe(true);
    let row = await db
      .from("guide_lists")
      .select("sponsored, sponsor_name, sponsor_kind")
      .eq("id", id)
      .single();
    expect(row.data).toEqual({
      sponsored: true,
      sponsor_name: "Hotel Parceiro Teste",
      sponsor_kind: "partner",
    });

    const city = await asUser("helena", () =>
      setSponsorCommand({
        id,
        sponsored: true,
        sponsorKind: "citynews",
        sponsorName: "Outro nome",
      }),
    );
    expect(city.ok).toBe(true);
    row = await db
      .from("guide_lists")
      .select("sponsored, sponsor_name, sponsor_kind")
      .eq("id", id)
      .single();
    expect(row.data).toEqual({
      sponsored: true,
      sponsor_name: "CityNews",
      sponsor_kind: "citynews",
    });

    const off = await asUser("marina", () => setSponsorCommand({ id, sponsored: false }));
    expect(off.ok).toBe(true);
    const itemsAfter = JSON.stringify(
      (
        await db
          .from("guide_list_items")
          .select("venue_id, position, score")
          .eq("list_id", id)
          .order("position")
      ).data,
    );
    expect(itemsAfter).toBe(itemsBefore);
    const log = await service
      .from("audit_log")
      .select("action")
      .eq("object_ref", `guide_list:${id}`)
      .eq("action", "guide.sponsor");
    expect(log.data).toHaveLength(3);
  });
});

describe("lugares, modelos e reclamações", () => {
  it("lugar manual entra com a fonte da redação; inativar tira das listas novas", async () => {
    const r = await asUser("marina", () =>
      saveVenueCommand({
        name: `Pousada Manual ${mark}`,
        category: "hotel",
        neighborhood: "Porto",
        address: "Rua Manual, 1",
        status: "active",
      }),
    );
    expect(r.ok).toBe(true);
    const row = await db
      .from("venues")
      .select("id, data_sources, status, slug")
      .like("name", `Pousada Manual ${mark}`)
      .single();
    expect(row.data?.data_sources).toEqual(["manual"]);
    extraVenueIds.push(row.data!.id);
    const off = await asUser("marina", () =>
      saveVenueCommand({
        id: row.data!.id,
        name: `Pousada Manual ${mark}`,
        category: "hotel",
        status: "inactive",
      }),
    );
    expect(off.ok).toBe(true);
    expect(
      (await db.from("venues").select("status").eq("id", row.data!.id).single()).data?.status,
    ).toBe("inactive");
    const denied = await asUser("juliana", () =>
      saveVenueCommand({ name: "Qualquer lugar", category: "hotel", status: "active" }),
    );
    expect(denied).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("modelo novo e título repetido", async () => {
    const input = {
      title: `Os 5 melhores hotéis modelo ${mark}`,
      noun: "hotéis",
      category: "hotel",
      take: 5,
      minVenues: 5,
      active: true,
    };
    const r = await asUser("marina", () => saveTemplateCommand(input));
    expect(r.ok).toBe(true);
    const slug = (
      await db.from("guide_templates").select("slug").like("title", `%modelo ${mark}`).single()
    ).data?.slug;
    if (slug) templateSlugs.push(slug);
    const dup = await asUser("marina", () => saveTemplateCommand(input));
    expect(dup).toMatchObject({ ok: false, error: "conflict" });
  });

  it("reclamação improcedente devolve as listas ao ar; a decisão é auditada", async () => {
    const id = await manualList();
    await asUser("marina", () => publishListCommand({ id }));
    const rep = await db.rpc("guide_report_venue", {
      p_venue: venueIds[0]!,
      p_reason: "Endereço mudou segundo um leitor.",
    });
    const reportId = (rep.data as { reportId: string }).reportId;
    reportIds.push(reportId);
    expect((await db.from("guide_lists").select("status").eq("id", id).single()).data?.status).toBe(
      "suspended",
    );
    const tags: string[][] = [];
    const r = await asUser(
      "marina",
      () =>
        decideReportCommand({ id: reportId, decision: "dismiss", note: "Conferido, está certo." }),
      {
        revalidate: async (t) => void tags.push(t),
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.restored.length).toBeGreaterThanOrEqual(1);
    expect((await db.from("guide_lists").select("status").eq("id", id).single()).data?.status).toBe(
      "published",
    );
    const log = await service
      .from("audit_log")
      .select("action")
      .eq("object_ref", `venue_report:${reportId}`);
    expect(log.data?.map((a) => a.action)).toEqual(["guide.report.decide"]);
    const again = await asUser("marina", () =>
      decideReportCommand({ id: reportId, decision: "confirm" }),
    );
    expect(again).toMatchObject({ ok: false, error: "conflict" });
  });
});
