import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioScreen } from "./StudioScreen";

afterEach(cleanup);

const LONG = "Título de oitenta caracteres para testar a quebra de linha no cabeçalho do Estúdio";

describe("StudioScreen", () => {
  it("mostra rótulo da seção, h1, introdução, ações e o conteúdo", () => {
    render(
      <StudioScreen
        section="Control Center"
        title="Execuções"
        intro="Ciclos do pipeline."
        actions={<button type="button">Nova</button>}
      >
        <p>corpo</p>
      </StudioScreen>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Execuções" })).toBeInTheDocument();
    expect(screen.getByText("Control Center")).toBeInTheDocument();
    expect(screen.getByText("Ciclos do pipeline.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova" })).toBeInTheDocument();
    expect(screen.getByText("corpo")).toBeInTheDocument();
  });

  it("título de 80 caracteres quebra em vez de estourar", () => {
    expect(LONG.length).toBeGreaterThanOrEqual(80);
    render(<StudioScreen title={LONG}>x</StudioScreen>);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/break-words|wrap-anywhere/);
    expect(h1.parentElement?.className).toMatch(/min-w-0/);
  });

  it("caminho de navegação com aria-label Caminho e aria-current no último", () => {
    render(
      <StudioScreen
        title="Folha do Cerrado"
        breadcrumbs={[
          { href: "/estudio/control", label: "Control Center" },
          { href: "/estudio/control/fontes", label: "Fontes" },
          { href: "/estudio/control/fontes/1", label: "Folha do Cerrado" },
        ]}
      >
        x
      </StudioScreen>,
    );
    const nav = screen.getByRole("navigation", { name: "Caminho" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const links = within(nav).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/estudio/control");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(links[2]).toHaveAttribute("aria-current", "page");
  });

  it("com erro, mostra o erro no lugar do conteúdo e mantém o cabeçalho", () => {
    render(
      <StudioScreen title="Fila" error={<p>falhou</p>}>
        <p>corpo</p>
      </StudioScreen>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Fila" })).toBeInTheDocument();
    expect(screen.getByText("falhou")).toBeInTheDocument();
    expect(screen.queryByText("corpo")).toBeNull();
  });

  it("sem rótulo nem caminho, não renderiza nav nem rótulo vazio", () => {
    const { container } = render(<StudioScreen title="Newsroom">x</StudioScreen>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelector(".type-eyebrow")).toBeNull();
  });
});
