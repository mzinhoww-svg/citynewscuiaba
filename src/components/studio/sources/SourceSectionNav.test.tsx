import { render, screen } from "@testing-library/react";
import { SourceSectionNav, currentSection } from "./SourceSectionNav";

let path = "/estudio/control/fontes/abc";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

const BASE = "/estudio/control/fontes/abc";

describe("SourceSectionNav", () => {
  it("marca só a seção atual com aria-current=page", () => {
    path = `${BASE}/coleta`;
    render(<SourceSectionNav basePath={BASE} />);
    const nav = screen.getByRole("navigation", { name: "Seções da fonte" });
    expect(nav).toBeInTheDocument();
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Coleta e teste");
    expect(screen.getByRole("link", { name: "Configuração" })).toHaveAttribute(
      "href",
      `${BASE}/configuracao`,
    );
  });

  it("a raiz é o resumo, com ou sem barra final", () => {
    expect(currentSection(BASE, BASE)).toBe("resumo");
    expect(currentSection(BASE, `${BASE}/`)).toBe("resumo");
    expect(currentSection(BASE, `${BASE}/historico`)).toBe("historico");
    expect(currentSection(BASE, `${BASE}/itens`)).toBe("itens");
  });
});
