// @vitest-environment node
// UX-W5-T2 (item 81): metadata e página compartilham a leitura da matéria (React `cache()`), e a
// checagem de "removida" acontece uma vez por requisição (no proxy, quando ele já checou).
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Fora de uma requisição de Server Component o `cache()` do React não memoriza. Aqui ele memoriza
 * como no servidor: argumento primitivo por valor, objeto por identidade. Assim o teste só passa
 * se o carregador repassar argumentos primitivos (um `{ cache: true }` novo a cada chamada não
 * pode furar o cache).
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const keyOf = (v: unknown) => {
    if ((typeof v === "object" && v !== null) || typeof v === "function") {
      const o = v as object;
      if (!ids.has(o)) ids.set(o, ++next);
      return `ref:${ids.get(o)}`;
    }
    return `${typeof v}:${String(v)}`;
  };
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      return (...args: A): R => {
        const key = args.map(keyOf).join("|");
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key) as R;
      };
    },
  };
});

const { getArticleBySlug } = await import("@/lib/db/queries");

function countFetches() {
  const real = globalThis.fetch;
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return real(input, init);
  });
  return urls;
}

const goneCalls = (urls: string[]) => urls.filter((u) => u.includes("/rpc/public_article_gone"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("matéria sem leituras repetidas (UX-W5-T2, item 81)", () => {
  it("generateMetadata e a página leem a matéria uma vez só", async () => {
    const urls = countFetches();
    const slug = "prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
    const a = await getArticleBySlug(slug, { cache: true });
    const reads = urls.length;
    expect(reads).toBeGreaterThan(0);
    const b = await getArticleBySlug(slug, { cache: true });
    expect(urls.length).toBe(reads);
    expect(b).toBe(a);
  });

  it("com o proxy dizendo que a matéria saiu do ar, usa o motivo dele sem consultar de novo", async () => {
    const urls = countFetches();
    const r = await getArticleBySlug("materia-arquivada-seed", {
      gone: { reason: "Motivo vindo do proxy." },
    });
    expect(r).toEqual({ ok: true, value: { gone: true, reason: "Motivo vindo do proxy." } });
    expect(goneCalls(urls)).toEqual([]);
  });

  it("com o proxy dizendo que não saiu do ar, slug inexistente é 404 sem consultar", async () => {
    const urls = countFetches();
    const r = await getArticleBySlug("nao-existe-w5t2", { gone: { reason: null } });
    expect(r).toEqual({ ok: true, value: null });
    expect(goneCalls(urls)).toEqual([]);
  });

  it("matéria pública ignora o motivo (falso) que chegasse pelo cabeçalho", async () => {
    const r = await getArticleBySlug("prefeitura-detalha-novo-plano-de-onibus-cpa-centro", {
      gone: { reason: "Forjado." },
    });
    if (!r.ok || !r.value || "gone" in r.value) throw new Error("esperava a matéria");
    expect(r.value.slug).toBe("prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  });

  it("sem checagem do proxy, a página consulta o motivo como antes", async () => {
    const urls = countFetches();
    const r = await getArticleBySlug("materia-arquivada-seed", { cache: false });
    expect(r).toEqual({ ok: true, value: { gone: true, reason: expect.any(String) } });
    expect(goneCalls(urls)).toHaveLength(1);
  });
});
