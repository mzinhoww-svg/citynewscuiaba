import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueueTabs } from "./QueueTabs";

const ITEMS = [
  { key: "all", label: "Tudo", href: "/estudio/fila?aba=all" },
  { key: "exceptions", label: "Fila de exceção", href: "/estudio/fila?aba=exceptions", count: 3 },
  { key: "mine", label: "Minha fila", href: "/estudio/fila?aba=mine", count: 1 },
];

describe("QueueTabs", () => {
  it("contagem visível e no nome acessível da aba", () => {
    render(<QueueTabs label="Abas da fila" items={ITEMS} current="exceptions" />);
    const tab = screen.getByRole("link", { name: "Fila de exceção, 3 itens" });
    expect(tab).toHaveTextContent("3");
    expect(tab).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Minha fila, 1 item" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tudo" })).toBeInTheDocument();
  });
});
