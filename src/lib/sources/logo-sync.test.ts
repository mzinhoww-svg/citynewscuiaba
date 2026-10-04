import { err, ok } from "@/lib/result";
import type { FoundLogo, LogoFailure } from "./logo-fetch";
import { dueSources, syncSourceLogos, type LogoSourceRow, type LogoStore } from "./logo-sync";

const NOW = new Date("2026-10-04T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function row(over: Partial<LogoSourceRow> & { slug: string }): LogoSourceRow {
  return {
    id: `id-${over.slug}`,
    name: over.slug.toUpperCase(),
    baseUrl: `https://${over.slug}.example/`,
    logoPath: null,
    logoSource: null,
    checkedAt: null,
    foundAt: null,
    outcome: null,
    ...over,
  };
}

const found = (url: string): FoundLogo => ({
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "image/png",
  width: 192,
  height: 192,
  converted: false,
  originUrl: url,
  kind: "apple-touch-icon",
});

describe("dueSources", () => {
  it("sem logo: nunca checada ou checada há 7 dias; manual nunca", () => {
    const rows = [
      row({ slug: "nova" }),
      row({ slug: "recente", checkedAt: ago(2), outcome: "none" }),
      row({ slug: "velha", checkedAt: ago(8), outcome: "none" }),
      row({ slug: "manual", logoPath: "x/a.png", logoSource: "manual", checkedAt: ago(90) }),
      row({ slug: "removida", logoPath: null, logoSource: "manual" }),
    ];
    expect(dueSources(rows, NOW).map((r) => r.slug)).toEqual(["nova", "velha"]);
  });

  it("logo auto: renova só depois de 30 dias da última vez achada", () => {
    const rows = [
      row({
        slug: "fresca",
        logoPath: "a/1.png",
        logoSource: "auto",
        foundAt: ago(10),
        checkedAt: ago(10),
        outcome: "found",
      }),
      row({
        slug: "antiga",
        logoPath: "a/2.png",
        logoSource: "auto",
        foundAt: ago(40),
        checkedAt: ago(40),
        outcome: "found",
      }),
      row({
        slug: "antiga-checada",
        logoPath: "a/3.png",
        logoSource: "auto",
        foundAt: ago(40),
        checkedAt: ago(3),
        outcome: "none",
      }),
    ];
    expect(dueSources(rows, NOW).map((r) => r.slug)).toEqual(["antiga"]);
  });

  it("falha de rede volta em 1 dia; as sem logo vêm antes das renovações", () => {
    const rows = [
      row({
        slug: "auto",
        logoPath: "a/2.png",
        logoSource: "auto",
        foundAt: ago(60),
        checkedAt: ago(60),
        outcome: "found",
      }),
      row({ slug: "fora", checkedAt: ago(1.5), outcome: "unreachable" }),
      row({ slug: "nunca" }),
    ];
    expect(dueSources(rows, NOW).map((r) => r.slug)).toEqual(["nunca", "fora", "auto"]);
  });
});

function makeStore(rows: LogoSourceRow[]) {
  const saved: { id: string; origin: string }[] = [];
  const checks: { id: string; outcome: string }[] = [];
  const store: LogoStore = {
    listSources: async () => rows,
    saveLogo: async (r, f) => {
      if (r.logoSource === "manual") return "manual";
      saved.push({ id: r.id, origin: f.originUrl });
      return "saved";
    },
    recordCheck: async (id, outcome) => {
      checks.push({ id, outcome });
    },
  };
  return { store, saved, checks };
}

describe("syncSourceLogos", () => {
  it("processa só o limite por chamada, grava e registra a checagem", async () => {
    const rows = ["a", "b", "c", "d"].map((slug) => row({ slug }));
    const { store, saved, checks } = makeStore(rows);
    const discover = vi.fn(async (url: string) => ok(found(`${url}icon.png`)));
    const r = await syncSourceLogos({ store, discover, now: () => NOW }, { limit: 2 });
    expect(r.processed.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(r.processed.every((p) => p.outcome === "found")).toBe(true);
    expect(saved).toHaveLength(2);
    expect(checks.map((c) => c.outcome)).toEqual(["found", "found"]);
    expect(r.pending).toBe(2);
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it("idempotente: depois de gravar, a mesma fonte não é refeita", async () => {
    const rows = [row({ slug: "a" })];
    const { store } = makeStore(rows);
    const discover = vi.fn(async () => err<LogoFailure>({ reason: "no_logo", attempts: [] }));
    const deps = { store, discover, now: () => NOW };
    await syncSourceLogos(deps, { limit: 5 });
    rows[0] = { ...rows[0]!, checkedAt: NOW.toISOString(), outcome: "none" };
    const again = await syncSourceLogos(deps, { limit: 5 });
    expect(again.processed).toEqual([]);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it("logo manual nunca é sobrescrita, nem com sourceId explícito", async () => {
    const rows = [row({ slug: "m", logoPath: "m/a.png", logoSource: "manual" })];
    const { store, saved } = makeStore(rows);
    const discover = vi.fn(async () => ok(found("https://m.example/x.png")));
    const r = await syncSourceLogos({ store, discover, now: () => NOW }, { sourceId: "id-m" });
    expect(r.processed[0]).toMatchObject({ slug: "m", outcome: "skipped_manual" });
    expect(discover).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("corrida: se virou manual entre a busca e a gravação, não grava", async () => {
    const rows = [row({ slug: "a" })];
    const { store } = makeStore(rows);
    store.saveLogo = async () => "manual";
    const r = await syncSourceLogos(
      { store, discover: async () => ok(found("https://a.example/i.png")), now: () => NOW },
      {},
    );
    expect(r.processed[0]?.outcome).toBe("skipped_manual");
  });

  it("dry: descobre mas não grava nem registra", async () => {
    const rows = [row({ slug: "a" })];
    const { store, saved, checks } = makeStore(rows);
    const r = await syncSourceLogos(
      { store, discover: async () => ok(found("https://a.example/i.png")), now: () => NOW },
      { dry: true },
    );
    expect(r.processed[0]).toMatchObject({ outcome: "found", origin: "https://a.example/i.png" });
    expect(saved).toEqual([]);
    expect(checks).toEqual([]);
  });

  it("dry com skip anda na fila sem gravar", async () => {
    const rows = ["a", "b", "c"].map((slug) => row({ slug }));
    const { store } = makeStore(rows);
    const discover = async (url: string) => ok(found(`${url}i.png`));
    const deps = { store, discover, now: () => NOW };
    const first = await syncSourceLogos(deps, { dry: true, limit: 2 });
    const second = await syncSourceLogos(deps, { dry: true, limit: 2, skip: 2 });
    expect(first.processed.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(first.pending).toBe(1);
    expect(second.processed.map((p) => p.slug)).toEqual(["c"]);
    expect(second.pending).toBe(0);
  });

  it("falhas viram resultados por fonte e uma exceção não derruba o lote", async () => {
    const rows = ["a", "b", "c"].map((slug) => row({ slug }));
    const { store, checks } = makeStore(rows);
    const discover = vi
      .fn()
      .mockResolvedValueOnce(err({ reason: "robots", attempts: [] }))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(err({ reason: "page_unreachable", attempts: [] }));
    const r = await syncSourceLogos({ store, discover, now: () => NOW }, { limit: 5 });
    expect(r.processed.map((p) => p.outcome)).toEqual(["robots", "error", "unreachable"]);
    expect(checks.map((c) => c.outcome)).toEqual(["robots", "error", "unreachable"]);
  });

  it("orçamento de tempo: para de começar fontes novas", async () => {
    const rows = ["a", "b", "c"].map((slug) => row({ slug }));
    const { store } = makeStore(rows);
    let t = NOW.getTime();
    const discover = async () => {
      t += 30_000;
      return err<LogoFailure>({ reason: "no_logo", attempts: [] });
    };
    const r = await syncSourceLogos(
      { store, discover, now: () => new Date(t) },
      { limit: 5, budgetMs: 40_000 },
    );
    expect(r.processed).toHaveLength(2);
    expect(r.pending).toBe(1);
  });
});
