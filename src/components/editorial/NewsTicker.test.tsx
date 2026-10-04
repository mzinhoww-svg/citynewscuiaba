import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NewsTicker } from "./NewsTicker";

const ITEMS = [
  { title: "Obra no Coxipó", href: "/materia/obra", scope: "cuiaba" as const },
  { title: "Safra em MT", href: "/materia/safra", scope: "mt" as const },
];

describe("NewsTicker", () => {
  it("mostra o rótulo e links reais para cada manchete", () => {
    render(<NewsTicker items={ITEMS} />);
    const region = screen.getByRole("region", { name: "Últimas notícias" });
    expect(within(region).getByText("Última hora")).toBeInTheDocument();
    const links = within(region).getAllByRole("link", { name: "Obra no Coxipó" });
    expect(links[0]).toHaveAttribute("href", "/materia/obra");
  });

  it("uma lista só, sem cópia escondida (não há laço)", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.querySelectorAll('[aria-hidden="true"] a')).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("não se move sozinho: sem animação, com rolagem manual e encaixe", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.innerHTML).not.toMatch(/animate-ticker|animation-play-state/);
    expect(container.querySelector("[aria-live]")).toBeNull();
    const scroller = container.querySelector("ul")!.parentElement!;
    expect(scroller).toHaveClass("overflow-x-auto", "snap-x");
  });

  it("manchetes e rótulo em caixa de frase, 14 px", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.innerHTML).not.toMatch(/uppercase/);
    for (const a of screen.getAllByRole("link")) {
      expect(a).toHaveClass("text-14", "min-h-tap");
      expect(a.className).not.toMatch(/text-12/);
    }
    expect(screen.getByText("Última hora")).toHaveClass("text-14");
  });

  it("não renderiza sem itens", () => {
    const { container } = render(<NewsTicker items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
