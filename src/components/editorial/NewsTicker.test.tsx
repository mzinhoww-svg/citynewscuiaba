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

  it("duplica o laço escondido dos leitores de tela e fora do Tab", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    const hidden = container.querySelectorAll('li[aria-hidden="true"] a');
    expect(hidden).toHaveLength(2);
    hidden.forEach((a) => expect(a).toHaveAttribute("tabindex", "-1"));
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("pausa no hover e no foco e respeita movimento reduzido", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    const ul = container.querySelector("ul");
    expect(ul?.className).toContain("group-hover/ticker:[animation-play-state:paused]");
    expect(ul?.className).toContain("group-focus-within/ticker:[animation-play-state:paused]");
    expect(ul?.className).toContain("motion-safe:animate-ticker");
  });

  it("não renderiza sem itens", () => {
    const { container } = render(<NewsTicker items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
