import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { BottomNav } from "./BottomNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("BottomNav", () => {
  it("é a navegação Principal com 5 destinos e marca o atual", () => {
    render(<BottomNav active="home" />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
  });

  it("fica fixa na base, na camada de navegação (abaixo do banner e dos diálogos) e some no desktop", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    for (const c of ["fixed", "inset-x-0", "bottom-0", "z-sticky", "lg:hidden", "pb-safe"]) {
      expect(nav).toHaveClass(c);
    }
    // Nenhuma camada numérica solta: só os tokens de --z-*.
    expect(nav.className).not.toMatch(/z-\[|z-\d/);
  });
});
