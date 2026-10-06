// @vitest-environment node
// UX-W5-T4 (item 84): as cinco rotinas que faziam uma consulta por item (reclamações do Guia,
// menções de lugares, gravação de lugares, alcance da fila de avisos e coleções da migração de
// conta) dão o mesmo resultado de antes com no máximo 2 chamadas ao banco, qualquer que seja N.
// "Antes" é a consulta por item reproduzida aqui, lida com o mesmo cliente.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import type { Venue } from "@/lib/guide/types";
import type { AnonProfile } from "@/lib/anon/types";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.20.30.41" }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    createServerClient: async () => {
      if (!state.client) throw new Error("sem sessão no teste");
      return state.client;
    },
  };
});

const { asUser, clientOf, SEED_USERS, service } = await import("./studio");
const { adminOpenReports } = await import("@/lib/db/queries/guide-admin");
const { createGuideListStore } = await import("@/lib/db/guide-list-store");
const { createGuideStore } = await import("@/lib/db/guide-store");
const { queueRows } = await import("@/lib/db/queries/push-admin");
const { applyMigration } = await import("@/lib/db/account");
const { venueRecord } = await import("@/lib/guide/testing");

const mark = Date.now().toString(36);
const ART_CIDADE = "c2000000-0000-4000-8000-000000000002";

/** Cliente que conta as chamadas ao banco (`from` e `rpc`); o resto passa direto. */
function counting(db: DbClient): { db: DbClient; calls: string[] } {
  const calls: string[] = [];
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if ((prop === "from" || prop === "rpc") && typeof value === "function") {
        return (...args: unknown[]) => {
          calls.push(`${prop}:${String(args[0])}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxy, calls };
}

const venueIds: string[] = [];
const listIds: string[] = [];
const reportIds: string[] = [];
const pushIds: string[] = [];
let readerId = "";

afterAll(async () => {
  if (listIds.length) await service.from("guide_lists").delete().in("id", listIds);
  if (reportIds.length) await service.from("venue_reports").delete().in("id", reportIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);
  if (pushIds.length) await service.from("push_sends").delete().in("id", pushIds);
  await service.from("venues").delete().like("name", `%N1 ${mark}%`);
  if (readerId) await service.auth.admin.deleteUser(readerId);
});

async function saveVenues(n: number): Promise<string[]> {
  const store = createGuideStore(service);
  await store.save(
    {
      inserts: Array.from({ length: n }, (_, i) =>
        venueRecord({ name: `Hotel N1 ${mark} ${i}`, category: "hotel", neighborhood: "Porto" }),
      ),
      updates: [],
    },
    new Date(),
  );
  const { data, error } = await service
    .from("venues")
    .select("id")
    .like("name", `Hotel N1 ${mark} %`)
    .order("name");
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  venueIds.push(...ids);
  return ids;
}

describe("adminOpenReports (reclamações do Guia)", () => {
  it("conta as listas suspensas por reclamação em uma consulta só", async () => {
    const [v1, v2] = await saveVenues(2);
    const reports = await service
      .from("venue_reports")
      .insert([
        { venue_id: v1!, reason: "Fechou definitivamente" },
        { venue_id: v2!, reason: "Endereço errado no Guia" },
        { venue_id: v1!, reason: "Telefone não atende mais" },
      ])
      .select("id");
    if (reports.error) throw reports.error;
    const [r1, r2] = reports.data.map((r) => r.id);
    reportIds.push(...reports.data.map((r) => r.id));
    const lists = await service
      .from("guide_lists")
      .insert(
        [r1, r1, r2].map((rid, i) => ({
          slug: `lista-n1-${mark}-${i}`,
          title: `Lista de teste N1 ${mark} ${i}`,
          category: "hotel",
          status: "suspended",
          suspended_reason: `venue_report:${rid}`,
        })),
      )
      .select("id");
    if (lists.error) throw lists.error;
    listIds.push(...lists.data.map((l) => l.id));

    const { db, calls } = counting(service);
    const out = await adminOpenReports(db);
    expect(calls.length).toBeLessThanOrEqual(2);

    // Antes: uma contagem por reclamação.
    for (const r of out) {
      const before = await service
        .from("guide_lists")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspended")
        .like("suspended_reason", `venue_report:${r.id}`);
      expect(r.suspendedLists).toBe(before.count ?? 0);
    }
    const byId = new Map(out.map((r) => [r.id, r.suspendedLists]));
    expect(byId.get(r1!)).toBe(2);
    expect(byId.get(r2!)).toBe(1);
    expect(byId.get(reportIds[2]!)).toBe(0);
  });
});

describe("mentions (menções de lugares nas matérias)", () => {
  it("dá a mesma contagem por lugar da busca de frase item a item", async () => {
    const { data, error } = await service
      .from("articles")
      .select("title")
      .in("status", ["published", "updated"])
      .limit(6);
    if (error) throw error;
    const names = [
      ...(data ?? []).map((a) => a.title.split(/\s+/).slice(0, 2).join(" ")),
      "Lugar Que Não Existe Nas Matérias",
      "Solo", // uma palavra: fica de fora
    ];
    const venues: Venue[] = names.map((name, i) => ({
      ...venueRecord({ name }),
      id: randomUUID(),
      slug: `lugar-${i}`,
      status: "active",
      dataUpdatedAt: null,
    }));

    const { db, calls } = counting(service);
    const got = await createGuideListStore(db).mentions(venues);
    expect(calls.length).toBeLessThanOrEqual(2);

    // Antes: uma busca de frase por lugar.
    const fold = (s: string) =>
      s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    const expected = new Map<string, number>();
    for (const v of venues) {
      const phrase = fold(v.name);
      if (phrase.split(/\s+/).length < 2) continue;
      const r = await service
        .from("articles")
        .select("id", { count: "exact", head: true })
        .in("status", ["published", "updated"])
        .textSearch("tsv", phrase, { config: "portuguese", type: "phrase" });
      if (r.error) throw r.error;
      expected.set(v.id, r.count ?? 0);
    }
    expect(got).toEqual(expected);
    expect([...got.values()].some((n) => n > 0)).toBe(true);
    expect(got.has(venues.at(-1)!.id)).toBe(false);
  });
});

describe("save (gravação de lugares)", () => {
  it("insere com slug único e atualiza em lote, com no máximo 2 chamadas", async () => {
    const at = new Date("2026-10-05T12:00:00Z");
    const base = (n: number) =>
      venueRecord({ name: `Bar N1 ${mark}`, category: "bar", neighborhood: `Bairro ${n}` });
    // Dois lugares com o mesmo nome e bairro: o segundo ganha sufixo.
    const first = counting(service);
    expect(
      await createGuideStore(first.db).save(
        { inserts: [base(1), base(1), base(2)], updates: [] },
        at,
      ),
    ).toEqual({ inserted: 3, updated: 0 });
    expect(first.calls.length).toBeLessThanOrEqual(2);
    const { data: rows, error } = await service
      .from("venues")
      .select("id, slug, neighborhood, rating_updated_at")
      .like("name", `Bar N1 ${mark}`)
      .order("slug");
    if (error) throw error;
    venueIds.push(...rows.map((r) => r.id));
    const slugs = rows.map((r) => r.slug);
    const b1 = slugs.find((s) => s.endsWith("bairro-1"))!;
    expect(slugs).toEqual(expect.arrayContaining([b1, `${b1}-2`]));
    expect(new Set(slugs).size).toBe(3);

    // Novo lote com colisão no banco (sufixo -3) e atualizações.
    const [u1, u2] = rows;
    const later = new Date("2026-10-05T13:00:00Z");
    const second = counting(service);
    const res = await createGuideStore(second.db).save(
      {
        inserts: [base(1)],
        updates: [
          {
            id: u1!.id,
            record: {
              ...base(1),
              phone: "+55 65 3333-0000",
              rating: 4.5,
              sources: ["osm", "manual"],
            },
            ratingChecked: true,
          },
          { id: u2!.id, record: { ...base(1), address: "Rua Nova, 10" }, ratingChecked: false },
        ],
      },
      later,
    );
    expect(res).toEqual({ inserted: 1, updated: 2 });
    expect(second.calls.length).toBeLessThanOrEqual(2);
    const { data: after } = await service
      .from("venues")
      .select("id, slug, phone, rating, address, data_sources, data_updated_at, rating_updated_at")
      .like("name", `Bar N1 ${mark}`);
    venueIds.push(...(after ?? []).filter((r) => !venueIds.includes(r.id)).map((r) => r.id));
    expect(after?.map((r) => r.slug)).toContain(`${b1}-3`);
    const a1 = after!.find((r) => r.id === u1!.id)!;
    expect(a1).toMatchObject({
      phone: "+55 65 3333-0000",
      rating: 4.5,
      data_sources: ["osm", "manual"],
    });
    expect(new Date(a1.data_updated_at!).toISOString()).toBe(later.toISOString());
    expect(new Date(a1.rating_updated_at!).toISOString()).toBe(later.toISOString());
    const a2 = after!.find((r) => r.id === u2!.id)!;
    expect(a2.address).toBe("Rua Nova, 10");
    expect(new Date(a2.data_updated_at!).toISOString()).toBe(later.toISOString());
    // Sem `ratingChecked`, a data da nota não muda.
    expect(
      a2.rating_updated_at === u2!.rating_updated_at ||
        new Date(a2.rating_updated_at!).getTime() === new Date(u2!.rating_updated_at!).getTime(),
    ).toBe(true);
  });
});

describe("queueRows (alcance na fila de avisos)", () => {
  it("estima o alcance de todos os pedidos numa chamada, igual à estimativa por pedido", async () => {
    const base = {
      article_id: ART_CIDADE,
      title: "Teste N1",
      body: "Fila sem consulta por item.",
      origin_label: "CityNews",
      url: "/materia/teste-n1",
      requested_by: SEED_USERS.helena.id,
      status: "pending_approval",
      justification: null as string | null,
      scheduled_at: null as string | null,
    };
    const ins = await service
      .from("push_sends")
      .insert([
        { ...base, kind: "highlight", tag: `n1-${mark}-1`, audience: { type: "all" } },
        {
          ...base,
          kind: "urgent",
          tag: `n1-${mark}-2`,
          audience: { type: "section", slug: "cidade" },
          justification: "Teste de lote",
        },
        {
          ...base,
          kind: "highlight",
          tag: `n1-${mark}-3`,
          audience: { type: "bairro", slug: "porto" },
          status: "scheduled",
          scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ])
      .select("id");
    if (ins.error) throw ins.error;
    pushIds.push(...ins.data.map((r) => r.id));

    const helena = await clientOf("helena");
    const { db, calls } = counting(helena);
    state.client = db;
    let rows;
    try {
      rows = await asUser("helena", () => queueRows());
    } finally {
      state.client = null;
    }
    if (!rows.ok) throw new Error("fila");
    const estimateCalls = calls.filter((c) => c.startsWith("rpc:push_audience_estimate"));
    expect(estimateCalls.length).toBeLessThanOrEqual(1);
    // O resto é fixo (sessão, envios, nomes, matérias, editorias) e não cresce com a fila.
    expect(new Set(calls.filter((c) => c !== "from:sections")).size).toBe(
      calls.filter((c) => c !== "from:sections").length,
    );

    // Antes: uma estimativa por pedido.
    const mine = rows.value.filter((r) => pushIds.includes(r.id));
    expect(mine).toHaveLength(3);
    for (const r of mine) {
      const sent = await service
        .from("push_sends")
        .select("kind, audience")
        .eq("id", r.id)
        .single();
      const est = await helena.rpc("push_audience_estimate", {
        p_kind: sent.data!.kind,
        p_audience: sent.data!.audience,
      });
      expect(r.reach).toBe(typeof est.data === "number" ? est.data : null);
    }
  });
});

describe("applyMigration (coleções do leitor)", () => {
  beforeAll(async () => {
    const email = `n1-${mark}@exemplo.com`;
    const created = await service.auth.admin.createUser({
      email,
      password: "senha-de-teste-123",
      email_confirm: true,
    });
    if (created.error) throw created.error;
    readerId = created.data.user.id;
  });

  it("grava todas as coleções e itens em 2 chamadas", async () => {
    const reader = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const s = await reader.auth.signInWithPassword({
      email: `n1-${mark}@exemplo.com`,
      password: "senha-de-teste-123",
    });
    if (s.error) throw s.error;
    const plan = {
      follows: [],
      saved: [],
      interests: [],
      history: 0,
      summary: "",
      otherFollows: [],
      alerts: [],
      hidden: [],
      collections: [
        { name: "Para ler depois", items: ["article:a", "article:b", "article:a"] },
        { name: "Vazia", items: [] },
        { name: "Viagem", items: ["article:c"] },
      ],
    };
    const { db, calls } = counting(reader as DbClient);
    await applyMigration(db, readerId, plan, {} as AnonProfile);
    expect(calls.length).toBeLessThanOrEqual(2);

    const { data: cols, error } = await service
      .from("collections")
      .select("id, title, description, is_editorial, slug, collection_items(content_ref, position)")
      .eq("owner_ref", readerId);
    if (error) throw error;
    const byTitle = new Map(
      cols.map((c) => [
        c.title,
        [...c.collection_items]
          .sort((a, b) => a.position - b.position)
          .map((i) => [i.content_ref, i.position]),
      ]),
    );
    expect(cols).toHaveLength(3);
    expect(
      cols.every((c) => !c.is_editorial && c.description === "" && c.slug.startsWith("pessoal-")),
    ).toBe(true);
    expect(byTitle.get("Para ler depois")).toEqual([
      ["article:a", 0],
      ["article:b", 1],
    ]);
    expect(byTitle.get("Vazia")).toEqual([]);
    expect(byTitle.get("Viagem")).toEqual([["article:c", 0]]);
  });
});
