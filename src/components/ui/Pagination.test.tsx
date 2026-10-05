import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./Pagination";

const hrefFor = (p: number) => `/estudio/control/fontes?pagina=${p}`;

describe("Pagination", () => {
  it("é um nav com nome e mostra Página X de Y", () => {
    render(<Pagination page={2} totalPages={5} hrefFor={hrefFor} label="Paginação das fontes" />);
    const nav = screen.getByRole("navigation", { name: "Paginação das fontes" });
    expect(within(nav).getByText("Página 2 de 5")).toBeInTheDocument();
  });

  it("na primeira página não tem link Anterior", () => {
    render(<Pagination page={1} totalPages={5} hrefFor={hrefFor} label="Paginação" />);
    expect(screen.queryByRole("link", { name: /anterior/i })).toBeNull();
    const next = screen.getByRole("link", { name: /próxima/i });
    expect(next).toHaveAttribute("href", hrefFor(2));
  });

  it("na última página não tem link Próxima", () => {
    render(<Pagination page={5} totalPages={5} hrefFor={hrefFor} label="Paginação" />);
    expect(screen.queryByRole("link", { name: /próxima/i })).toBeNull();
    expect(screen.getByRole("link", { name: /anterior/i })).toHaveAttribute("href", hrefFor(4));
  });

  it("marca o número atual com aria-current=page e liga os outros números", () => {
    render(<Pagination page={3} totalPages={5} hrefFor={hrefFor} label="Paginação" />);
    const current = screen.getByText("3", { selector: "[aria-current='page']" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Página 4" })).toHaveAttribute("href", hrefFor(4));
    expect(screen.getAllByRole("link").every((a) => a.tagName === "A")).toBe(true);
  });

  it("com muitas páginas resume os números com reticências", () => {
    render(<Pagination page={10} totalPages={20} hrefFor={hrefFor} label="Paginação" />);
    const numbers = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent)
      .filter((t) => t !== "");
    expect(numbers).toEqual(["1", "…", "9", "10", "11", "…", "20"]);
  });

  it("alvos de toque de 44 px", () => {
    render(<Pagination page={2} totalPages={3} hrefFor={hrefFor} label="Paginação" />);
    for (const a of screen.getAllByRole("link")) expect(a.className).toMatch(/min-h-tap|size-tap/);
  });

  it("uma página só não renderiza nada", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} hrefFor={hrefFor} label="Paginação" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
