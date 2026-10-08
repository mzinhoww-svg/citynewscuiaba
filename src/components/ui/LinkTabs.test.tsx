import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkTabs } from "./LinkTabs";

const items = [
  { href: "/estudio/fila?aba=todas", label: "Todas", count: 12, current: true },
  { href: "/estudio/fila?aba=minhas", label: "Minhas", count: 0 },
  { href: "/estudio/fila?aba=urgentes", label: "Urgentes" },
] as const;

describe("LinkTabs", () => {
  it("é navegação com links comuns e marca a aba atual", () => {
    render(<LinkTabs label="Abas da fila" items={items} />);
    const nav = screen.getByRole("navigation", { name: "Abas da fila" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(links[0]?.getAttribute("href")).toBe("/estudio/fila?aba=todas");
    expect(links[1]?.getAttribute("aria-current")).toBeNull();
    expect(links[2]?.getAttribute("aria-current")).toBeNull();
  });

  it("mostra a contagem em texto, inclusive zero", () => {
    render(<LinkTabs label="Abas da fila" items={items} />);
    expect(screen.getByRole("link", { name: /Todas.*12/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Minhas.*0/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Urgentes" })).toBeTruthy();
  });

  it("lista rola na horizontal; o esmaecimento de borda fica no <nav>, nunca na lista", () => {
    render(<LinkTabs label="Abas da fila" items={items} />);
    const list = screen.getByRole("list");
    const nav = screen.getByRole("navigation", { name: "Abas da fila" });
    expect(list.className).toContain("overflow-x-auto");
    // Máscara num contêiner rolável vira bloco preto no Safari do iPhone (A-152).
    expect(list.className).not.toContain("scroll-fade");
    expect(list).not.toHaveAttribute("data-fade");
    expect(nav.className).toContain("scroll-fade");
    expect(nav.getAttribute("data-fade")).toBe("none");
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-tap");
  });
});
