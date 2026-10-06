import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsibleFilters } from "./CollapsibleFilters";

function mockDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

function setup(props: Partial<Parameters<typeof CollapsibleFilters>[0]> = {}) {
  render(
    <CollapsibleFilters {...props}>
      <label>
        Estado <select name="estado" />
      </label>
    </CollapsibleFilters>,
  );
  const button = screen.getByRole("button", { name: /^Filtros/ });
  const body = document.getElementById(button.getAttribute("aria-controls") ?? "")!;
  return { button, body };
}

describe("CollapsibleFilters · atalho / (UX-W3-T5, item 53)", () => {
  it("com focusHotkey, / abre o painel recolhido e foca o primeiro campo", () => {
    mockDesktop(false);
    render(
      <CollapsibleFilters focusHotkey>
        <input type="hidden" name="aba" value="x" />
        <select aria-label="Estado" name="estado" />
      </CollapsibleFilters>,
    );
    const button = screen.getByRole("button", { name: /^Filtros/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Estado" }));
  });

  it("sem focusHotkey, / não faz nada (portal)", () => {
    mockDesktop(false);
    const { button } = setup();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("CollapsibleFilters", () => {
  it("no celular começa recolhido (CSS: escondido abaixo de lg, visível no desktop)", () => {
    mockDesktop(false);
    const { button, body } = setup();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(body.className).toContain("hidden");
    expect(body.className).toContain("lg:block");
  });

  it("no desktop começa aberto e o aria-expanded acompanha", () => {
    mockDesktop(true);
    const { button } = setup();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("alterna aberto e fechado pelo botão, em qualquer tela", () => {
    mockDesktop(false);
    const { button, body } = setup();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(body.className).toMatch(/(^|\s)block(\s|$)/);
    expect(body.className).not.toContain("hidden");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(body.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(body.className).not.toContain("lg:block");
  });

  it("mostra quantos filtros estão ativos e o Limpar fora do painel", () => {
    mockDesktop(false);
    setup({ activeCount: 2, clearHref: "/fila" });
    expect(screen.getByRole("button", { name: "Filtros, 2 ativos" })).toBeInTheDocument();
    expect(screen.getByText("2 ativos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute("href", "/fila");
  });

  it("sem filtro ativo não mostra contagem nem Limpar", () => {
    mockDesktop(false);
    setup({ activeCount: 0, clearHref: "/fila" });
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Limpar filtros" })).toBeNull();
  });
});
