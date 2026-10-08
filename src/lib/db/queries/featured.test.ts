import type { DbClient } from "@/lib/db/client";
import { getFeatured, resolveFeatured, toCandidate, type PinRow } from "./featured";

const at = (local: string) => new Date(`${local}-04:00`);

type Row = Record<string, unknown>;

/** Banco fictício: qualquer cadeia do PostgREST resolve para as linhas da tabela pedida. */
function fakeDb(tables: Record<string, Row[]>, opts: { failOn?: string } = {}): DbClient {
  const builder = (table: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              opts.failOn === table
                ? Promise.resolve({ data: null, error: { message: `${table} indisponível` } }).then(
                    ok,
                    bad,
                  )
                : Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, bad);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };
  return {
    from: (table: string) => builder(table),
    rpc: (name: string) => builder(`rpc:${name}`),
  } as unknown as DbClient;
}

function articleRow(id: string, over: Row = {}): Row {
  return {
    id,
    slug: `materia-${id}`,
    kind: "original",
    topic_id: null,
    section_slug: "cidade",
    title: `Matéria ${id}`,
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    ai_summary: null,
    ai_summary_reviewed_by: null,
    status: "published",
    publish_mode: "human",
    confidence: "media",
    confidence_score: 0.4,
    author_id: null,
    agent_id: null,
    urgent: false,
    sponsored: false,
    published_at: at("2026-10-03T09:00:00").toISOString(),
    updated_at: at("2026-10-03T09:00:00").toISOString(),
    seo_title: null,
    seo_description: null,
    news_scope: "cuiaba",
    national_commotion: false,
    ...over,
  };
}

const cover = (articleId: string): Row => ({
  article_id: articleId,
  alt: "Foto",
  role: "cover",
  position: null,
  media_assets: {
    id: `m-${articleId}`,
    kind: "original",
    storage_path: `x/${articleId}.jpg`,
    origin_url: null,
    page_url: null,
    source_id: null,
    source_name: null,
    license: "CityNews",
    credit: "CityNews",
    status: "approved",
  },
});

const pinRow = (articleId: string, over: Partial<PinRow> = {}): PinRow => ({
  id: `pin-${articleId}`,
  slot_key: "home.lead",
  section_slug: null,
  article_id: articleId,
  position: 0,
  starts_at: at("2026-10-03T08:00:00").toISOString(),
  ends_at: null,
  ended_at: null,
  ...over,
});

describe("getFeatured", () => {
  const base = {
    sections: [{ slug: "cidade", name: "Cidade", parent_slug: null }],
    featured_slots: [{ key: "home.lead", page: "home", label: "Início · manchete", capacity: 1 }],
  };

  it("pino manual aparece como lead", async () => {
    const db = fakeDb({
      ...base,
      articles: [articleRow("auto", { confidence_score: 0.9 }), articleRow("manual")],
      article_media: [cover("auto"), cover("manual")],
      featured_items: [{ ...pinRow("manual") }],
    });
    const r = await getFeatured(db, "home.lead", { now: at("2026-10-03T14:10:00") });
    expect(r.items.map((a) => a.id)).toEqual(["manual"]);
    expect(r.source).toBe("manual");
  });

  it("sem pino, o lead é o mesmo dentro da janela de 1 h e muda na seguinte", async () => {
    const tables = {
      ...base,
      articles: [
        articleRow("antiga", { confidence_score: 0.3 }),
        articleRow("nova", {
          confidence_score: 0.4,
          published_at: at("2026-10-03T14:20:00").toISOString(),
        }),
      ],
      article_media: [cover("antiga"), cover("nova")],
      featured_items: [],
    };
    const lead = async (iso: string) =>
      (await getFeatured(fakeDb(tables), "home.lead", { now: at(iso) })).items[0]?.id;
    expect(await lead("2026-10-03T14:00:00")).toBe("antiga");
    expect(await lead("2026-10-03T14:59:59")).toBe("antiga");
    expect(await lead("2026-10-03T15:00:00")).toBe("nova");
  });

  it("R39: automático ignora matéria sem capa e pede a imagem dela", async () => {
    const requested: unknown[] = [];
    const db = fakeDb({
      ...base,
      articles: [articleRow("semcapa", { confidence_score: 0.9 }), articleRow("comcapa")],
      article_media: [cover("comcapa")],
      featured_items: [],
    });
    const spy = {
      ...db,
      from: db.from.bind(db),
      rpc: (name: string, args: unknown) => {
        requested.push([name, args]);
        return db.rpc(name as never, args as never);
      },
    } as unknown as DbClient;
    const r = await getFeatured(spy, "home.lead", { now: at("2026-10-03T14:10:00") });
    expect(r.items.map((a) => a.id)).toEqual(["comcapa"]);
    expect(r.needsImage).toEqual(["semcapa"]);
    expect(requested).toEqual([["featured_request_images", { p_ids: ["semcapa"] }]]);
  });

  it("exclude tira matéria já usada em outro lugar da página (urgente)", async () => {
    const db = fakeDb({
      ...base,
      articles: [articleRow("a", { confidence_score: 0.9 }), articleRow("b")],
      article_media: [cover("a"), cover("b")],
      featured_items: [],
    });
    const r = await getFeatured(db, "home.lead", {
      now: at("2026-10-03T14:10:00"),
      exclude: ["a"],
    });
    expect(r.items.map((a) => a.id)).toEqual(["b"]);
  });

  it("falha da tabela devolve vazio com o erro (a página cai no comportamento anterior)", async () => {
    const db = fakeDb(
      { ...base, articles: [articleRow("a")], article_media: [cover("a")] },
      { failOn: "featured_items" },
    );
    const r = await getFeatured(db, "home.lead", { now: at("2026-10-03T14:10:00") });
    expect(r.items).toEqual([]);
    expect(r.error).toContain("featured_items");
  });

  it("tabela de posições vazia usa o cadastro padrão; posição desconhecida devolve vazio", async () => {
    const tables = {
      articles: [articleRow("a")],
      article_media: [cover("a")],
      featured_items: [],
      sections: [],
    };
    const r = await getFeatured(fakeDb(tables), "home.lead", { now: at("2026-10-03T14:10:00") });
    expect(r.items.map((a) => a.id)).toEqual(["a"]);
    const none = await getFeatured(fakeDb(tables), "nao.existe", {});
    expect(none.items).toEqual([]);
  });
});

describe("getFeatured · pauta quente (HOT-T3)", () => {
  const base = {
    sections: [{ slug: "cidade", name: "Cidade", parent_slug: null }],
    featured_slots: [{ key: "home.lead", page: "home", label: "Início · manchete", capacity: 1 }],
  };
  const now = at("2026-10-03T14:10:00");
  const hotRow = (articleId: string, over: Partial<PinRow> = {}): Row => ({
    ...pinRow(articleId, {
      id: `hot-${articleId}`,
      kind: "hot",
      dismissed_at: null,
      starts_at: at("2026-10-03T13:00:00").toISOString(),
      ends_at: at("2026-10-03T16:00:00").toISOString(),
      ...over,
    }),
  });

  it("pino quente vigente vira o lead com source hot e a matéria em `hot`", async () => {
    const db = fakeDb({
      ...base,
      articles: [articleRow("auto", { confidence_score: 0.9 }), articleRow("quente")],
      article_media: [cover("auto"), cover("quente")],
      featured_items: [hotRow("quente")],
    });
    const r = await getFeatured(db, "home.lead", { now });
    expect(r.items.map((a) => a.id)).toEqual(["quente"]);
    expect(r.source).toBe("hot");
    expect(r.hot).toEqual(["quente"]);
  });

  it("manual vence o quente", async () => {
    const db = fakeDb({
      ...base,
      articles: [articleRow("manual"), articleRow("quente")],
      article_media: [cover("manual"), cover("quente")],
      featured_items: [{ ...pinRow("manual") }, hotRow("quente")],
    });
    const r = await getFeatured(db, "home.lead", { now });
    expect(r.items.map((a) => a.id)).toEqual(["manual"]);
    expect(r.source).toBe("manual");
    expect(r.hot).toEqual([]);
  });

  it("quente dispensado, vencido ou ainda não começado não ocupa: volta ao automático", async () => {
    for (const over of [
      { dismissed_at: at("2026-10-03T13:30:00").toISOString() },
      { ends_at: at("2026-10-03T14:00:00").toISOString() },
      { starts_at: at("2026-10-03T15:00:00").toISOString() },
    ]) {
      const db = fakeDb({
        ...base,
        articles: [articleRow("auto", { confidence_score: 0.9 }), articleRow("quente")],
        article_media: [cover("auto"), cover("quente")],
        featured_items: [hotRow("quente", over)],
      });
      const r = await getFeatured(db, "home.lead", { now });
      expect(r.items.map((a) => a.id)).toEqual(["auto"]);
      expect(r.source).toBe("automatic");
      expect(r.hot).toEqual([]);
    }
  });

  it("matéria do pino quente patrocinada ou sem capa é pulada", async () => {
    const db = fakeDb({
      ...base,
      articles: [
        articleRow("auto", { confidence_score: 0.9 }),
        articleRow("quente", { sponsored: true }),
      ],
      article_media: [cover("auto"), cover("quente")],
      featured_items: [hotRow("quente")],
    });
    const r = await getFeatured(db, "home.lead", { now });
    expect(r.items.map((a) => a.id)).toEqual(["auto"]);
    expect(r.hot).toEqual([]);
  });
});

describe("resolveFeatured / toCandidate", () => {
  it("toCandidate: reprodução sem crédito não é capa", async () => {
    const db = fakeDb({
      sections: [],
      articles: [articleRow("r")],
      article_media: [
        {
          ...cover("r"),
          media_assets: { ...(cover("r").media_assets as Row), kind: "reproduction", credit: null },
        },
      ],
      featured_slots: [],
      featured_items: [],
    });
    const r = await getFeatured(db, "home.lead", { now: at("2026-10-03T14:10:00") });
    expect(r.items).toEqual([]);
    expect(typeof toCandidate).toBe("function");
    expect(typeof resolveFeatured).toBe("function");
  });
});
