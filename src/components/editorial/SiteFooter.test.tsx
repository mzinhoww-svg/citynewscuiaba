import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isFilled } from "@/content/pt-BR/institutional";
import { SiteFooter } from "./SiteFooter";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/content/pt-BR/nav-footer");
});

describe("isFilled", () => {
  it("falso para vazio, espaços e texto pendente", () => {
    expect(isFilled("")).toBe(false);
    expect(isFilled("   ")).toBe(false);
    expect(isFilled("CNPJ: [PREENCHER]")).toBe(false);
    expect(isFilled("[PREENCHER]")).toBe(false);
  });
  it("verdadeiro para texto real", () => {
    expect(isFilled("CNPJ: 12.345.678/0001-90")).toBe(true);
  });
});

describe("SiteFooter", () => {
  it("não mostra [PREENCHER] nem a seção de dados da empresa quando nada está preenchido", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).not.toHaveTextContent("PREENCHER");
    expect(footer).not.toHaveTextContent(/CNPJ|Razão social|Encarregado/);
    expect(footer.querySelector("[data-company]")).toBeNull();
    expect(footer).toHaveTextContent("© 2026 CityNews Cuiabá");
  });

  it("mostra o WhatsApp oficial com link (R42)", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "WhatsApp (65) 99622-7110" })).toHaveAttribute(
      "href",
      "https://wa.me/5565996227110",
    );
  });

  it("mostra só as linhas preenchidas", async () => {
    vi.resetModules();
    vi.doMock("@/content/pt-BR/nav-footer", async (orig) => {
      const mod = await orig<typeof import("@/content/pt-BR/nav-footer")>();
      return {
        ...mod,
        LEGAL: { ...mod.LEGAL, cnpj: "CNPJ: 12.345.678/0001-90" },
      };
    });
    const { SiteFooter: Footer } = await import("./SiteFooter");
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("CNPJ: 12.345.678/0001-90");
    expect(footer).not.toHaveTextContent("Razão social");
    expect(footer).not.toHaveTextContent("PREENCHER");
    expect(footer.querySelector("[data-company]")).not.toBeNull();
  });
});
