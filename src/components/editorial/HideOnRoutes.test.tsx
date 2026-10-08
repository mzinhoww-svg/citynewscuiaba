import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { HideOnRoutes, hiddenOn } from "./HideOnRoutes";

describe("hiddenOn", () => {
  it("esconde na rota e nas sub-rotas, não em rotas com o mesmo começo", () => {
    expect(hiddenOn("/perfil", ["/perfil"])).toBe(true);
    expect(hiddenOn("/perfil/seguranca", ["/perfil"])).toBe(true);
    expect(hiddenOn("/perfilx", ["/perfil"])).toBe(false);
    expect(hiddenOn("/", ["/perfil"])).toBe(false);
  });
});

describe("HideOnRoutes", () => {
  it("mostra o conteúdo fora das rotas listadas", () => {
    pathname.mockReturnValue("/materia/x");
    render(<HideOnRoutes prefixes={["/perfil"]}>faixa</HideOnRoutes>);
    expect(screen.getByText("faixa")).toBeInTheDocument();
  });
  it("some nas rotas listadas", () => {
    pathname.mockReturnValue("/perfil/excluir");
    render(<HideOnRoutes prefixes={["/perfil"]}>faixa</HideOnRoutes>);
    expect(screen.queryByText("faixa")).toBeNull();
  });
});
