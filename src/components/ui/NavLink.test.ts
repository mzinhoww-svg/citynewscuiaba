import { currentNavHref, isCurrentPath } from "./NavLink";

describe("isCurrentPath", () => {
  it("raiz só casa com ela mesma", () => {
    expect(isCurrentPath("/estudio", "/")).toBe(false);
    expect(isCurrentPath("/", "/")).toBe(true);
  });

  it("subpágina casa com o prefixo, exceto quando exact", () => {
    expect(isCurrentPath("/estudio/control/fontes", "/estudio/control")).toBe(true);
    expect(isCurrentPath("/estudio/control/fontes", "/estudio/control", true)).toBe(false);
  });
});

describe("currentNavHref", () => {
  const items = [
    { href: "/estudio/control", label: "Visão geral" },
    { href: "/estudio/control/fontes", label: "Fontes" },
    { href: "/estudio/control/regras", label: "Regras" },
  ];

  it("o item mais específico vence quando um é prefixo do outro", () => {
    expect(currentNavHref("/estudio/control/fontes", items)).toBe("/estudio/control/fontes");
  });

  it("visão geral fica atual só na própria rota", () => {
    expect(currentNavHref("/estudio/control", items)).toBe("/estudio/control");
  });

  it("nenhum item casa fora da árvore", () => {
    expect(currentNavHref("/estudio/admin/usuarios", items)).toBeNull();
  });

  it("respeita `exact` na Newsroom (raiz do Estúdio)", () => {
    const withRoot = [{ href: "/estudio", exact: true }, { href: "/estudio/fila" }];
    expect(currentNavHref("/estudio", withRoot)).toBe("/estudio");
    expect(currentNavHref("/estudio/fila/123", withRoot)).toBe("/estudio/fila");
  });
});
