import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TagLink } from "./TagLink";

describe("TagLink", () => {
  it("é um link comum com alvo de toque e pílula", () => {
    render(<TagLink href="/tema/chuva">Chuva</TagLink>);
    const link = screen.getByRole("link", { name: "Chuva" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/tema/chuva");
    expect(link.className).toContain("min-h-tap");
    expect(link.className).toContain("rounded-pill");
    expect(link.getAttribute("aria-current")).toBeNull();
    expect(link.className).not.toContain("font-semibold");
  });

  it("ativo marca aria-current e muda além da cor (peso)", () => {
    render(
      <TagLink href="/editoria/cidade" active>
        Cidade
      </TagLink>,
    );
    const link = screen.getByRole("link", { name: "Cidade" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("font-semibold");
  });

  it("ícone é decorativo e não muda o nome acessível", () => {
    const { container } = render(
      <TagLink href="/agenda" icon="calendar">
        Agenda
      </TagLink>,
    );
    expect(screen.getByRole("link", { name: "Agenda" })).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
