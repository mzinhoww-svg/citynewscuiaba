import { describe, vi } from "vitest";
import {
  GONE_CHECKED_HEADER,
  createGoneChecker,
  createGoneResolver,
  goneHeaderValue,
  goneSlugFromPath,
  parseGoneHeader,
  proxyGoneHint,
} from "./gone";

it("só olha a página da matéria, não o histórico nem outras rotas", () => {
  expect(goneSlugFromPath("/materia/materia-arquivada-seed")).toBe("materia-arquivada-seed");
  expect(goneSlugFromPath("/materia/materia-arquivada-seed/historico")).toBeNull();
  expect(goneSlugFromPath("/agenda/x")).toBeNull();
  expect(goneSlugFromPath("/materia/Nao_Valido")).toBeNull();
});

it("consulta o banco uma vez por slug dentro do prazo do cache", async () => {
  const lookup = vi.fn(async (slug: string) => (slug === "arquivada" ? "Retirada." : null));
  let t = 0;
  const isGone = createGoneChecker(lookup, { ttlMs: 60_000, now: () => t });
  expect(await isGone("arquivada")).toBe(true);
  expect(await isGone("arquivada")).toBe(true);
  expect(await isGone("publica")).toBe(false);
  expect(lookup).toHaveBeenCalledTimes(2);
  t = 61_000;
  await isGone("arquivada");
  expect(lookup).toHaveBeenCalledTimes(3);
});

it("falha na consulta não derruba a página: segue como não arquivada", async () => {
  const isGone = createGoneChecker(async () => {
    throw new Error("rede");
  });
  expect(await isGone("qualquer")).toBe(false);
});

describe("cabeçalho do proxy (UX-W5-T2, item 81)", () => {
  it("leva o resultado da checagem com o motivo acentuado intacto", () => {
    expect(parseGoneHeader(goneHeaderValue(null))).toEqual({ reason: null });
    const reason = "Retirada do ar a pedido; ver correção.";
    expect(goneHeaderValue(reason)).toMatch(/^[\x20-\x7e]+$/);
    expect(parseGoneHeader(goneHeaderValue(reason))).toEqual({ reason });
  });

  it("valor ausente, desconhecido ou malformado não conta como checado", () => {
    expect(parseGoneHeader(null)).toBeNull();
    expect(parseGoneHeader("")).toBeNull();
    expect(parseGoneHeader("talvez")).toBeNull();
    expect(parseGoneHeader("1;")).toBeNull();
    expect(parseGoneHeader("1;%E0%A4%A")).toBeNull();
    expect(parseGoneHeader(`1;${"a".repeat(2000)}`)).toBeNull();
  });

  it("requisição de prefetch não passa pelo proxy: o cabeçalho dela é do cliente e é ignorado", () => {
    const value = goneHeaderValue("Motivo");
    expect(proxyGoneHint(new Headers({ [GONE_CHECKED_HEADER]: value }))).toEqual({
      reason: "Motivo",
    });
    expect(
      proxyGoneHint(new Headers({ [GONE_CHECKED_HEADER]: value, "next-router-prefetch": "1" })),
    ).toBeNull();
    expect(
      proxyGoneHint(new Headers({ [GONE_CHECKED_HEADER]: value, purpose: "prefetch" })),
    ).toBeNull();
    expect(proxyGoneHint(new Headers())).toBeNull();
  });

  it("resolvedor distingue não removida (checado) de falha na consulta (não checado)", async () => {
    const resolve = createGoneResolver(async (slug) => (slug === "arquivada" ? "Retirada." : null));
    expect(await resolve("arquivada")).toEqual({ reason: "Retirada." });
    expect(await resolve("publica")).toEqual({ reason: null });
    const failing = createGoneResolver(async () => {
      throw new Error("rede");
    });
    expect(await failing("qualquer")).toBeNull();
  });
});
