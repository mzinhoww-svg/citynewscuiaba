import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Panel } from "./Panel";

afterEach(cleanup);

describe("Panel", () => {
  it("usa section, tom branco e respiro médio por padrão", () => {
    const { container } = render(<Panel>Conteúdo</Panel>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toContain("rounded-lg");
    expect(el.className).toContain("border-line-subtle");
    expect(el.className).toContain("bg-card-white");
    expect(el.className).toContain("p-4");
  });

  it("renderiza a tag pedida com tom e respiro", () => {
    const { container, rerender } = render(
      <Panel as="article" tone="section" pad="lg">
        A
      </Panel>,
    );
    let el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("ARTICLE");
    expect(el.className).toContain("bg-section");
    expect(el.className).not.toContain("bg-card-white");
    expect(el.className).toContain("p-6");

    rerender(
      <Panel as="div" pad="sm" className="extra">
        A
      </Panel>,
    );
    el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("p-3");
    expect(el.className).toContain("extra");
  });

  it("repassa aria-labelledby e vira região nomeada", () => {
    render(
      <>
        <h2 id="t">Custos do dia</h2>
        <Panel aria-labelledby="t">Valores</Panel>
      </>,
    );
    const region = screen.getByRole("region", { name: "Custos do dia" });
    expect(region.getAttribute("aria-labelledby")).toBe("t");
  });
});
