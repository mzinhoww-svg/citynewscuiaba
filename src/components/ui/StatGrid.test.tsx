import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatGrid } from "./StatGrid";

afterEach(cleanup);

const LONG = "a".repeat(80);

describe("StatGrid", () => {
  it("renderiza dt e dd pareados dentro de um dl", () => {
    const { container } = render(
      <StatGrid
        items={[
          { label: "Impressões", value: "1.200" },
          { label: "Cliques", value: "34", hint: "últimos 7 dias" },
        ]}
      />,
    );
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    const groups = Array.from(dl!.children);
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.querySelector("dt")).not.toBeNull();
      expect(g.querySelector("dd")).not.toBeNull();
    }
    const dts = Array.from(container.querySelectorAll("dt")).map((n) => n.textContent);
    expect(dts).toEqual(["Impressões", "Cliques"]);
    expect(groups[0]!.querySelector("dd")!.textContent).toBe("1.200");
    expect(screen.getByText("últimos 7 dias")).toBeTruthy();
  });

  it("vira link com alvo de toque quando o item tem href", () => {
    render(
      <StatGrid
        items={[
          { label: "Na fila", value: "12", href: "/estudio/fila" },
          { label: "Publicadas", value: "40" },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Na fila/ });
    expect(link.getAttribute("href")).toBe("/estudio/fila");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const tile = link.closest("dl > div") as HTMLElement;
    expect(tile.className).toContain("min-h-tap");
  });

  it("quebra valor longo sem estourar", () => {
    render(<StatGrid items={[{ label: "Modelo", value: LONG }]} />);
    const dd = screen.getByText(LONG);
    expect(dd.className).toContain("break-words");
    expect((dd.closest("dl > div") as HTMLElement).className).toContain("min-w-0");
  });

  it("aplica colunas pedidas", () => {
    const { container } = render(<StatGrid columns={5} items={[{ label: "A", value: "1" }]} />);
    expect(container.querySelector("dl")!.className).toContain("md:grid-cols-5");
  });
});
