import type { RoleGrant } from "@/lib/auth/permissions";
import type { DbClient } from "@/lib/db/client";
import { READ_ONLY_MESSAGE } from "./read-only";
import { runWithStudioContext } from "./context";
import {
  currentBoard,
  featuredTags,
  pinArticle,
  reorder,
  searchEligibleArticles,
  unpin,
} from "./featured";

type Row = Record<string, unknown>;
type Call = { kind: "from" | "rpc"; name: string; method?: string; args: unknown[] };

interface Fake {
  db: DbClient;
  calls: Call[];
  audits: string[];
  tags: string[][];
}

/**
 * Banco fictício do Estúdio: cadeias do PostgREST resolvem para as linhas da tabela, `maybeSingle`
 * para a primeira; `rpc` devolve o que for configurado. Registra o que foi chamado.
 */
function fake(
  tables: Record<string, Row[]>,
  rpcs: Record<string, { data?: unknown; error?: { code?: string; message: string } }> = {},
): Fake {
  const calls: Call[] = [];
  const audits: string[] = [];
  const builder = (table: string): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_, prop: string) => {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, bad);
          }
          if (prop === "maybeSingle") {
            return () => Promise.resolve({ data: tables[table]?.[0] ?? null, error: null });
          }
          return (...args: unknown[]) => {
            calls.push({ kind: "from", name: table, method: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ kind: "rpc", name, args: [args] });
      if (name === "studio_audit") audits.push(String(args.p_action));
      const r = rpcs[name] ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  } as unknown as DbClient;
  return { db, calls, audits, tags: [] };
}

const ADMIN: RoleGrant[] = [{ role: "admin", sections: [] }];
const JORNALISTA: RoleGrant[] = [{ role: "jornalista", sections: [] }];
const NOW = new Date("2026-10-03T18:10:00Z");
const ART = "7f0f6f9e-1b2c-4d3e-8f40-0123456789ab";
const PIN = "9a0f6f9e-1b2c-4d3e-8f40-0123456789cd";

function run<T>(f: Fake, roles: RoleGrant[] | null, fn: () => Promise<T>) {
  return runWithStudioContext(
    {
      session: roles ? { userId: "u1", roles } : null,
      db: f.db,
      revalidate: async (t) => {
        f.tags.push(t);
      },
      now: () => NOW,
    },
    fn,
  );
}

const slotRow = {
  key: "home.lead",
  page: "home",
  label: "Início · manchete",
  capacity: 1,
  position: 0,
};
const okTables = (): Record<string, Row[]> => ({
  featured_slots: [slotRow],
  articles: [{ id: ART, status: "published", sponsored: false }],
  featured_items: [],
  feature_flags: [],
});
const okRpcs = {
  featured_has_cover: { data: true },
  featured_pin: { data: PIN },
  featured_unpin: { data: true },
  featured_reorder: { data: 2 },
};

const input = (over: Record<string, unknown> = {}) => ({
  slotKey: "home.lead",
  articleId: ART,
  duration: "6h" as const,
  ...over,
});

describe("pinArticle", () => {
  it("papel sem permissão: forbidden, com rastro de negação e sem chamar o banco", async () => {
    const f = fake(okTables(), okRpcs);
    const r = await run(f, JORNALISTA, () => pinArticle(input()));
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(f.audits).toEqual(["featured.pin.denied"]);
    expect(f.calls.some((c) => c.name === "featured_pin")).toBe(false);
  });

  it("sem sessão: forbidden", async () => {
    const f = fake(okTables(), okRpcs);
    expect(await run(f, null, () => pinArticle(input()))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("modo leitura bloqueia", async () => {
    const f = fake({ ...okTables(), feature_flags: [{ enabled: true }] }, okRpcs);
    const r = await run(f, ADMIN, () => pinArticle(input()));
    expect(r).toEqual({ ok: false, error: "conflict", message: READ_ONLY_MESSAGE });
    expect(f.calls.some((c) => c.name === "featured_pin")).toBe(false);
  });

  it("prazo inválido: invalid (botão desconhecido, data no passado e além de 14 dias)", async () => {
    const f = fake(okTables(), okRpcs);
    const bad = await run(f, ADMIN, () => pinArticle(input({ duration: "2h" })));
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const past = await run(f, ADMIN, () =>
      pinArticle(input({ duration: { until: new Date(NOW.getTime() - 3_600_000) } })),
    );
    expect(past).toMatchObject({ ok: false, error: "invalid" });
    const far = await run(f, ADMIN, () =>
      pinArticle(input({ duration: { until: new Date(NOW.getTime() + 15 * 86_400_000) } })),
    );
    expect(far).toMatchObject({ ok: false, error: "invalid" });
    expect(f.calls.some((c) => c.name === "featured_pin")).toBe(false);
  });

  it("sucesso: fixa pela função do banco, audita e invalida as tags da home", async () => {
    const f = fake(okTables(), okRpcs);
    const r = await run(f, ADMIN, () => pinArticle(input({ note: "pedido da chefia" })));
    expect(r).toEqual({ ok: true, value: { id: PIN } });
    const call = f.calls.find((c) => c.name === "featured_pin");
    expect(call?.args[0]).toMatchObject({
      p_slot: "home.lead",
      p_section: null,
      p_article: ART,
      p_ends_at: new Date(NOW.getTime() + 6 * 3_600_000).toISOString(),
      p_note: "pedido da chefia",
    });
    expect(f.audits).toEqual(["featured.pin"]);
    expect(f.tags).toEqual([["home"]]);
  });

  it("sem prazo (até remover) manda ends_at nulo", async () => {
    const f = fake(okTables(), okRpcs);
    await run(f, ADMIN, () => pinArticle(input({ duration: "until_removed" })));
    expect(f.calls.find((c) => c.name === "featured_pin")?.args[0]).toMatchObject({
      p_ends_at: null,
    });
  });

  it("R39: matéria sem capa aprovada é recusada antes de gravar", async () => {
    const f = fake(okTables(), { ...okRpcs, featured_has_cover: { data: false } });
    const r = await run(f, ADMIN, () => pinArticle(input()));
    expect(r).toMatchObject({
      ok: false,
      error: "invalid",
      message: expect.stringContaining("capa"),
    });
    expect(f.calls.some((c) => c.name === "featured_pin")).toBe(false);
  });

  it("patrocinada e rascunho: recusadas", async () => {
    for (const article of [
      { id: ART, status: "published", sponsored: true },
      { id: ART, status: "draft", sponsored: false },
    ]) {
      const f = fake({ ...okTables(), articles: [article] }, okRpcs);
      expect(await run(f, ADMIN, () => pinArticle(input()))).toMatchObject({
        ok: false,
        error: "invalid",
      });
    }
  });

  it("posição cheia: conflict; trocar (replaceId) libera a vaga", async () => {
    const tables = {
      ...okTables(),
      featured_items: [{ id: "x", ends_at: null }],
    };
    const full = fake(tables, okRpcs);
    expect(await run(full, ADMIN, () => pinArticle(input()))).toMatchObject({ ok: false });
    const swapOk = fake({ ...okTables(), featured_items: [{ id: PIN, ends_at: null }] }, okRpcs);
    const ok = await run(swapOk, ADMIN, () => pinArticle(input({ replaceId: PIN })));
    expect(ok).toEqual({ ok: true, value: { id: PIN } });
    expect(swapOk.calls.find((c) => c.name === "featured_pin")?.args[0]).toMatchObject({
      p_replace: PIN,
    });
  });

  it("erro do banco vira falha tipada", async () => {
    const f = fake(okTables(), {
      ...okRpcs,
      featured_pin: { error: { code: "23514", message: "featured:capacity" } },
    });
    expect(await run(f, ADMIN, () => pinArticle(input()))).toMatchObject({
      ok: false,
      error: "conflict",
    });
    const forbidden = fake(okTables(), {
      ...okRpcs,
      featured_pin: { error: { code: "42501", message: "featured:forbidden" } },
    });
    expect(await run(forbidden, ADMIN, () => pinArticle(input()))).toMatchObject({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("unpin", () => {
  const tables = () => ({
    ...okTables(),
    featured_items: [{ slot_key: "home.lead", section_slug: null, article_id: ART, ends_at: null }],
  });

  it("remove antes do prazo (a função grava ended_at), audita e invalida", async () => {
    const f = fake(tables(), okRpcs);
    const r = await run(f, ADMIN, () => unpin({ id: PIN }));
    expect(r).toEqual({ ok: true, value: { id: PIN } });
    expect(f.calls.find((c) => c.name === "featured_unpin")?.args[0]).toEqual({ p_id: PIN });
    expect(f.audits).toEqual(["featured.unpin"]);
    expect(f.tags).toEqual([["home"]]);
    // nunca apaga linha
    expect(f.calls.some((c) => c.method === "delete")).toBe(false);
  });

  it("papel sem permissão: forbidden; fixação inexistente: not_found", async () => {
    const f = fake(tables(), okRpcs);
    expect(await run(f, JORNALISTA, () => unpin({ id: PIN }))).toEqual({
      ok: false,
      error: "forbidden",
    });
    const none = fake({ ...tables(), featured_items: [] }, okRpcs);
    expect(await run(none, ADMIN, () => unpin({ id: PIN }))).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("id que não é uuid: invalid", async () => {
    const f = fake(tables(), okRpcs);
    expect(await run(f, ADMIN, () => unpin({ id: "oi" }))).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });
});

describe("reorder", () => {
  it("reordena pela função do banco e audita como featured.update", async () => {
    const f = fake(okTables(), okRpcs);
    const ids = [ART, PIN];
    const r = await run(f, ADMIN, () => reorder({ slotKey: "home.destaques", ids }));
    expect(r).toEqual({ ok: true, value: { count: 2 } });
    expect(f.calls.find((c) => c.name === "featured_reorder")?.args[0]).toEqual({
      p_slot: "home.destaques",
      p_ids: ids,
    });
    expect(f.audits).toEqual(["featured.update"]);
  });
});

describe("searchEligibleArticles", () => {
  const row = (id: string, over: Row = {}): Row => ({
    id,
    slug: `m-${id}`,
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
    confidence_score: 0.5,
    author_id: null,
    agent_id: null,
    urgent: false,
    sponsored: false,
    published_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    seo_title: null,
    seo_description: null,
    news_scope: "cuiaba",
    national_commotion: false,
    ...over,
  });

  it("pede só publicadas não patrocinadas ao banco e ainda descarta o que escapar", async () => {
    const f = fake({
      articles: [row("a"), row("b", { sponsored: true }), row("c", { status: "draft" })],
    });
    const out = await run(f, ADMIN, () => searchEligibleArticles("plantio de soja"));
    expect(out.map((a) => a.id)).toEqual(["a"]);
    const calls = f.calls.filter((c) => c.name === "articles");
    expect(calls).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["sponsored", false] }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: "in", args: ["status", ["published", "updated"]] }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: "ilike", args: ["title", "%plantio de soja%"] }),
    );
  });

  it("curingas e termo curto: busca literal; menos de 2 letras devolve vazio", async () => {
    const f = fake({ articles: [row("a")] });
    await run(f, ADMIN, () => searchEligibleArticles("100%_ok"));
    expect(f.calls).toContainEqual(
      expect.objectContaining({ method: "ilike", args: ["title", "%100 ok%"] }),
    );
    expect(await run(f, ADMIN, () => searchEligibleArticles("a"))).toEqual([]);
  });

  it("sem permissão: vazio e sem ler o banco", async () => {
    const f = fake({ articles: [row("a")] });
    expect(await run(f, JORNALISTA, () => searchEligibleArticles("plantio"))).toEqual([]);
    expect(f.calls).toEqual([]);
  });
});

describe("currentBoard", () => {
  it("cada posição com o ocupante e até quando; manual mostra quem fixou", async () => {
    const cover = {
      article_id: ART,
      alt: "Foto",
      role: "cover",
      position: null,
      media_assets: {
        id: "m1",
        kind: "original",
        storage_path: "x.jpg",
        origin_url: null,
        page_url: null,
        source_id: null,
        source_name: null,
        license: "CityNews",
        credit: "CityNews",
        status: "approved",
      },
    };
    const f = fake({
      featured_slots: [slotRow],
      sections: [{ slug: "cidade", name: "Cidade", parent_slug: null }],
      articles: [
        {
          id: ART,
          slug: "m",
          kind: "original",
          topic_id: null,
          section_slug: "cidade",
          title: "Manchete fixada",
          dek: "x",
          body: { type: "doc", content: [] },
          ai_summary: null,
          ai_summary_reviewed_by: null,
          status: "published",
          publish_mode: "human",
          confidence: "media",
          confidence_score: 0.5,
          author_id: null,
          agent_id: null,
          urgent: false,
          sponsored: false,
          published_at: "2026-10-03T12:00:00Z",
          updated_at: "2026-10-03T12:00:00Z",
          seo_title: null,
          seo_description: null,
          news_scope: "cuiaba",
          national_commotion: false,
        },
      ],
      article_media: [cover],
      featured_items: [
        {
          id: PIN,
          slot_key: "home.lead",
          section_slug: null,
          article_id: ART,
          position: 0,
          starts_at: "2026-10-03T12:00:00Z",
          ends_at: "2026-10-03T21:00:00Z",
          ended_at: null,
          created_by: "u9",
          note: "",
        },
      ],
      profiles: [{ id: "u9", display_name: "Maria" }],
    });
    const board = await run(f, ADMIN, () => currentBoard(NOW));
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({
      slotKey: "home.lead",
      source: "manual",
      until: "2026-10-03T21:00:00.000Z",
      free: 0,
    });
    expect(board[0]!.items[0]).toMatchObject({
      pinId: PIN,
      title: "Manchete fixada",
      pinnedBy: "Maria",
    });
  });
});

describe("featuredTags", () => {
  it("home e explorar têm tag própria; editoria usa section:<slug>", () => {
    expect(featuredTags("home")).toEqual(["home"]);
    expect(featuredTags("explorar")).toEqual(["explore"]);
    expect(featuredTags("editoria", "politica")).toEqual(["section:politica"]);
    expect(featuredTags(undefined)).toEqual(["home", "explore"]);
  });
});
