import { vi } from "vitest";
import { createGoneChecker, goneSlugFromPath } from "./gone";

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
