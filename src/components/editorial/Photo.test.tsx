import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UI } from "@/content/pt-BR/ui";
import { Photo } from "./Photo";

const SRC = "/api/media/5b0a3f7e-8c1d-4e2f-9a6b-1c2d3e4f5a6b";

describe("Photo: imagens responsivas e substituto (itens 78, 79)", () => {
  it("foto da rota de mídia tem srcset com 480w, 960w e 1440w e o sizes do chamador", () => {
    render(
      <Photo src={SRC} alt="Ponte sobre o rio Cuiabá" sizes="(min-width: 64em) 30vw, 100vw" />,
    );
    const img = screen.getByRole("img", { name: "Ponte sobre o rio Cuiabá" });
    const srcset = img.getAttribute("srcset") ?? "";
    expect(srcset).toContain(`${SRC}?w=480 480w`);
    expect(srcset).toContain(`${SRC}?w=960 960w`);
    expect(srcset).toContain(`${SRC}?w=1440 1440w`);
    expect(img.getAttribute("sizes")).toBe("(min-width: 64em) 30vw, 100vw");
    expect(img.getAttribute("src")).toBe(SRC);
  });

  it("imagem fora da rota de mídia não ganha srcset", () => {
    render(<Photo src="/icons/foto.png" alt="Ícone" />);
    expect(screen.getByRole("img", { name: "Ícone" }).hasAttribute("srcset")).toBe(false);
  });

  it("falha de carregamento troca para o substituto, mantendo o texto alternativo", () => {
    render(<Photo src={SRC} alt="Feira na Orla do Porto" />);
    fireEvent.error(screen.getByRole("img", { name: "Feira na Orla do Porto" }));
    const fallback = screen.getByRole("img", { name: "Feira na Orla do Porto" });
    expect(fallback.tagName).toBe("SPAN");
    expect(fallback).toHaveTextContent(UI.photo);
  });

  it("decorativa que falha vira o marcador escondido do leitor de tela", () => {
    const { container } = render(<Photo src={SRC} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(UI.photo);
  });

  it("URL direta (manchete): usa a direta; se falhar, tenta a rota; se falhar de novo, substituto", () => {
    const direct = "https://x.supabase.co/storage/v1/object/sign/media/original/abc.jpg?token=t";
    const directSet = `${direct.replace("abc.jpg", "abc.w480.webp")} 480w`;
    render(<Photo src={SRC} directSrc={direct} directSrcSet={directSet} alt="Manchete" priority />);
    let img = screen.getByRole("img", { name: "Manchete" });
    expect(img.getAttribute("src")).toBe(direct);
    expect(img.getAttribute("srcset")).toBe(directSet);
    expect(img.getAttribute("loading")).toBe("eager");

    fireEvent.error(img);
    img = screen.getByRole("img", { name: "Manchete" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.getAttribute("srcset")).toContain(`${SRC}?w=480 480w`);

    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Manchete" }).tagName).toBe("SPAN");
  });

  it("sem src mostra o marcador da marca", () => {
    render(<Photo alt="Foto da reportagem" />);
    expect(screen.getByRole("img", { name: "Foto da reportagem" })).toHaveTextContent(UI.photo);
  });
});
