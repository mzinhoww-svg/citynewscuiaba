import { render } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { Icon, type IconProps, type IconSize } from "./Icon";

// Item 42 da spec de melhorias: a escala de ícones é fechada em 14/16/18/20/24.
describe("Icon", () => {
  it("aceita só os tamanhos da escala", () => {
    expectTypeOf<IconSize>().toEqualTypeOf<14 | 16 | 18 | 20 | 24>();
    expectTypeOf<NonNullable<IconProps["size"]>>().toEqualTypeOf<IconSize>();
    // @ts-expect-error: 22 está fora da escala (use 20 ou 24).
    const off = <Icon name="search" size={22} />;
    expect(off).toBeTruthy();
  });

  it("usa o tamanho pedido e herda a cor do texto por padrão", () => {
    const { container } = render(<Icon name="search" size={20} className="text-meta" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("class")).toContain("text-meta");
  });
});
