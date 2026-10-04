import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PopularSourcesRail, SourceAvatar, SourceCard, type SourceCardData } from "../index";

const LOGO = "https://x.supabase.co/storage/v1/object/public/source-logos/abc/0123456789abcdef.png";

const source: SourceCardData = {
  slug: "mt-agora",
  name: "MT Agora",
  href: "/fontes/mt-agora",
  code: "MA",
  category: "Cidades",
  locality: "Cuiabá",
  reason: "Mais acessada em Cuiabá esta semana",
  reach: 12_000,
  trend: "up",
  itemsToday: 9,
  updatedAt: "2026-10-03T12:00:00Z",
};

describe("logotipo da fonte (R27)", () => {
  it("com logotipo: imagem inteira (object-contain) sobre fundo claro, alt = nome, sem monograma", () => {
    const { container } = render(<SourceAvatar name="MT Agora" code="MA" image={LOGO} size={64} />);
    const img = screen.getByAltText("MT Agora");
    expect(img).toHaveAttribute("src", LOGO);
    expect(img.className).toMatch(/object-contain/);
    expect(img.className).not.toMatch(/object-cover/);
    const circle = screen.getByTestId("source-logo");
    expect(circle.className).toMatch(/bg-branco/);
    expect(circle.className).toMatch(/rounded-pill/);
    expect(container.querySelector("[class*='bg-avatar-']")).toBeNull();
    expect(container.textContent).not.toContain("MA");
  });

  it("sem logotipo: monograma de reserva", () => {
    const { container } = render(<SourceAvatar name="MT Agora" code="MA" size={64} />);
    expect(screen.queryByAltText("MT Agora")).toBeNull();
    expect(container.querySelector("[class*='bg-avatar-']")?.textContent).toBe("MA");
  });

  it("imagem que falha volta ao monograma", () => {
    const { container } = render(<SourceAvatar name="MT Agora" code="MA" image={LOGO} size={64} />);
    fireEvent.error(screen.getByAltText("MT Agora"));
    expect(screen.queryByAltText("MT Agora")).toBeNull();
    expect(container.querySelector("[class*='bg-avatar-']")?.textContent).toBe("MA");
  });

  it("SourceCard mostra o logotipo e mantém a API (nome como link, seguir, ocultar)", () => {
    render(
      <SourceCard
        source={{ ...source, logo: LOGO }}
        onFollow={vi.fn()}
        onHide={vi.fn()}
        now={new Date("2026-10-03T12:30:00Z")}
      />,
    );
    expect(screen.getByAltText("MT Agora")).toHaveAttribute("src", LOGO);
    expect(screen.getByRole("link", { name: "MT Agora" })).toHaveAttribute(
      "href",
      "/fontes/mt-agora",
    );
    expect(screen.getByRole("button", { name: "Seguir MT Agora" })).toBeInTheDocument();
  });

  it("carrossel da home: logotipo onde há, monograma onde não há; o link tem o nome", () => {
    render(
      <PopularSourcesRail
        title="Fontes em destaque"
        sources={[
          { slug: "mt-agora", name: "MT Agora", href: "/fontes/mt-agora", code: "MA", logo: LOGO },
          { slug: "folha", name: "Folha do Cerrado", href: "/fontes/folha", code: "FC" },
        ]}
      />,
    );
    expect(screen.getAllByAltText("MT Agora")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "MT Agora" })).toHaveAttribute(
      "href",
      "/fontes/mt-agora",
    );
    expect(screen.getByRole("link", { name: "Folha do Cerrado" })).toBeInTheDocument();
    expect(screen.getAllByTestId("source-logo")).toHaveLength(1);
  });
});
