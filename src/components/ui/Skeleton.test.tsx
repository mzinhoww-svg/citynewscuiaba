import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

// Item 44: esqueletos sempre pelo componente, em três formas além das linhas de texto.
describe("Skeleton", () => {
  it("padrão: linhas de texto, decorativo e com pulso só sem movimento reduzido", () => {
    const { container } = render(<Skeleton lines={3} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.className).toContain("motion-safe:animate-pulse");
    expect(root?.querySelectorAll(".bg-section")).toHaveLength(3);
  });

  it("line: uma barra de texto com a largura pedida", () => {
    const { container } = render(<Skeleton shape="line" className="w-1/2" />);
    const el = container.firstElementChild;
    expect(el?.className).toMatch(/\bh-4\b/);
    expect(el?.className).toContain("w-1/2");
    expect(el?.className).toContain("bg-section");
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });

  it("block: bloco com dimensões e raio por props", () => {
    const { container } = render(<Skeleton shape="block" round="pill" className="size-16" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("size-16");
    expect(el?.className).toContain("rounded-pill");
    expect(el?.className).toContain("motion-safe:animate-pulse");
  });

  it("card: cartão com bordas e as linhas de cada item", () => {
    const { container } = render(<Skeleton shape="card" rows={4} lines={2} />);
    const card = container.firstElementChild;
    expect(card?.className).toContain("rounded-lg");
    expect(card?.className).toContain("border-line-section");
    expect(card?.children).toHaveLength(4);
    expect(card?.querySelectorAll(".bg-section")).toHaveLength(8);
  });
});
