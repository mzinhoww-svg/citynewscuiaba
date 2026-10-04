import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppPage from "./app/page";
import AdvertisePage from "./anuncie/page";
import AboutPage from "./sobre/page";

/*
 * UI-T11: Anuncie, App e Sobre recompostos em blocos de marketing sem perder conteúdo.
 * Um h1 por página; cada bloco com h2; ações com nome acessível; nenhuma tela diz "IA".
 */

function blocksHaveH2(container: HTMLElement) {
  const sections = Array.from(container.querySelectorAll("section[aria-labelledby]"));
  expect(sections.length).toBeGreaterThan(2);
  for (const s of sections) {
    const label = s.getAttribute("aria-labelledby")!;
    const heading = container.querySelector(`#${label}`);
    expect(heading, label).not.toBeNull();
    expect(["H1", "H2", "H3"]).toContain(heading!.tagName);
  }
  expect(container.querySelectorAll("h1")).toHaveLength(1);
}

function noAiLabel(container: HTMLElement) {
  expect(container.textContent).not.toMatch(/\bIA\b|inteligência artificial/i);
}

describe("/sobre", () => {
  it("hero, o que você encontra, como trabalhamos, quem somos e FAQ", () => {
    const { container } = render(<AboutPage />);
    blocksHaveH2(container);
    noAiLabel(container);
    expect(screen.getByRole("heading", { level: 1, name: "Sobre o CityNews" })).toBeVisible();
    for (const h of ["O que você encontra aqui", "Como trabalhamos", "Quem somos"])
      expect(screen.getByRole("heading", { level: 2, name: h })).toBeVisible();
    expect(screen.getByRole("link", { name: "Ler os princípios editoriais" })).toHaveAttribute(
      "href",
      "/principios-editoriais",
    );
    // Dado institucional pendente não vai à tela (A-143).
    expect(container.textContent).not.toMatch(/PREENCHER|aguardam dados oficiais/);
    expect(container.querySelectorAll("details").length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/como-usamos-ia"]')).toBeNull();
    expect(container.querySelector('a[href="/metodologia"]')).toBeNull();
  });
});

describe("/anuncie", () => {
  it("regras fixas, contato comercial com e-mail real e FAQ", () => {
    const { container } = render(<AdvertisePage />);
    blocksHaveH2(container);
    noAiLabel(container);
    expect(screen.getByRole("heading", { level: 1, name: "Anuncie no CityNews" })).toBeVisible();
    const rules = screen.getByRole("region", { name: "Regras fixas" });
    expect(within(rules).getAllByRole("listitem")).toHaveLength(4);
    expect(within(rules).getByText(/rótulo PATROCINADO/)).toBeVisible();
    const contact = screen.getByRole("region", { name: "Contato comercial" });
    expect(within(contact).getByRole("link", { name: "Falar com o comercial" })).toHaveAttribute(
      "href",
      "mailto:contato@citynews.com.br",
    );
    expect(within(contact).getByText("E-mail: contato@citynews.com.br")).toBeVisible();
    expect(contact.textContent).not.toMatch(/PREENCHER|Telefone|aguardam dados oficiais/);
    // Sem dado inventado: nenhum número de audiência, cliente ou depoimento.
    expect(container.textContent).not.toMatch(/leitores por mês|visitantes|depoimento|clientes/i);
  });
});

describe("/app", () => {
  it("benefícios, passo a passo por plataforma (h3) e FAQ", () => {
    const { container } = render(<AppPage />);
    blocksHaveH2(container);
    noAiLabel(container);
    expect(screen.getByRole("heading", { level: 1, name: "Baixar o app" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "O que muda" })).toBeVisible();
    for (const h of [
      "Android (Chrome)",
      "iPhone e iPad (Safari)",
      "Mac (Safari)",
      "Windows (Chrome ou Edge)",
      "Outros navegadores",
    ])
      expect(screen.getByRole("heading", { level: 3, name: h })).toBeVisible();
    expect(
      screen.getByText("Seu navegador não permite instalar; use o site normalmente."),
    ).toBeVisible();
  });
});
