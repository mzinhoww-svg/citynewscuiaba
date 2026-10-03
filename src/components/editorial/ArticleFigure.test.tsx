import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArticleImage } from "@/lib/db/queries/types";
import { ArticleFigure } from "./ArticleFigure";

const repro: ArticleImage = {
  src: "/api/media/m-1",
  alt: "Fumaça sobre o rio Cuiabá",
  kind: "reproduction",
  credit: "mtagora.example",
  author: "Ana Souza",
  originUrl: "https://mtagora.example/materia-1",
};

describe("ArticleFigure", () => {
  it("legenda 'Reprodução web · Fonte' com crédito do autor e 'Ver original' fora da área da foto", () => {
    const { container } = render(<ArticleFigure image={repro} />);
    const caption = screen.getByText(/Reprodução web · mtagora\.example/);
    expect(caption).toHaveTextContent("Foto: Ana Souza");
    const img = screen.getByRole("img", { name: "Fumaça sobre o rio Cuiabá" });
    const box = img.parentElement!;
    expect(box.contains(caption)).toBe(false);
    const link = screen.getByRole("link", { name: /Ver original/ });
    expect(link).toHaveAttribute("href", "https://mtagora.example/materia-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(box.contains(link)).toBe(false);
    expect(container.querySelector("figure > figcaption")).not.toBeNull();
  });

  it("proporção fixa na caixa da foto (CLS zero)", () => {
    render(<ArticleFigure image={repro} />);
    const box = screen.getByRole("img").parentElement!;
    expect(box.style.aspectRatio.replace(/\s/g, "")).toBe("16/9");
  });

  it("sem texto alternativo usa 'Imagem de {Fonte} sobre a matéria'", () => {
    render(<ArticleFigure image={{ ...repro, alt: "  " }} />);
    expect(
      screen.getByRole("img", { name: "Imagem de mtagora.example sobre a matéria" }),
    ).toBeInTheDocument();
  });

  it("sem autor nem link, só a legenda; prefixo configurável", () => {
    render(
      <ArticleFigure
        image={{ src: "/x", alt: "Praça", kind: "reproduction", credit: "MT Agora" }}
        captionPrefix="Reprodução"
      />,
    );
    expect(screen.getByText("Reprodução · MT Agora")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/Foto:/)).toBeNull();
  });

  it("foto própria não ganha 'Reprodução web' nem 'Ver original'", () => {
    render(<ArticleFigure image={{ src: "/x", alt: "Praça", kind: "original" }} />);
    expect(screen.queryByText(/Reprodução web/)).toBeNull();
    expect(screen.getByText("Foto original")).toBeInTheDocument();
  });

  it("prioridade só na capa: carga imediata; no texto, preguiçosa", () => {
    const { rerender } = render(<ArticleFigure image={repro} priority />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
    rerender(<ArticleFigure image={repro} />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });
});
