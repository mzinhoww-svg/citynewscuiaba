// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { EditionItem } from "./agenda-edition";
import { escapeHtml, renderEditionEmail, UNSUBSCRIBE_PLACEHOLDER } from "./email-html";

const item = (over: Partial<EditionItem> = {}): EditionItem => ({
  day: "2026-10-10",
  dayLabel: "Sábado, 10 de outubro",
  slug: "show",
  title: 'Show <b>forte</b> & "quente"',
  url: "https://citynews.example/agenda/show",
  when: "20h",
  where: "Teatro Fictício, Centro",
  price: "Gratuito",
  origin: "Com informações de Casa Fictícia",
  ...over,
});

const edition = {
  editionDate: "2026-10-09",
  rangeLabel: "9 a 11 de outubro",
  subject: "Agenda do fim de semana · 9 a 11 de outubro",
  items: [
    item({ day: "2026-10-09", dayLabel: "Sexta-feira, 9 de outubro", slug: "a", title: "Forró" }),
    item(),
    item({
      slug: "c",
      title: "Feira <img src=x onerror=alert(1)>",
      url: "javascript:alert(1)",
      origin: null,
    }),
  ],
};

describe("renderEditionEmail", () => {
  const { html, text } = renderEditionEmail(edition, { siteUrl: "https://citynews.example/" });

  it("HTML de e-mail seguro: sem script, sem atributo on*, pt-BR, tabelas e estilos inline", () => {
    expect(html).not.toMatch(/<script/i);
    // Atributo on* dentro de uma tag (o texto escapado não abre tag).
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=[^>]*>/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<link|@import|<img/i);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toMatch(/<table[^>]*role="presentation"/);
    expect(html).toContain("style=");
  });

  it("escapa o texto externo", () => {
    expect(html).toContain("Show &lt;b&gt;forte&lt;/b&gt; &amp; &quot;quente&quot;");
    expect(html).not.toContain("<b>forte</b>");
    expect(html).toContain("Feira &lt;img src=x onerror=alert(1)&gt;");
  });

  it("links: evento, ver no site e descadastro (placeholder trocado no envio)", () => {
    expect(html).toContain('href="https://citynews.example/agenda/show"');
    expect(html).toContain('href="https://citynews.example/newsletter/agenda/2026-10-09"');
    expect(html).toContain("Ver no site");
    expect(html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
    expect(html).toContain("Sair desta newsletter");
    // Link que não é do próprio site vira o link da agenda (nunca `javascript:`).
    expect(html).toContain('href="https://citynews.example/agenda/c"');
  });

  it("dias agrupados, origem e aviso para confirmar na fonte", () => {
    expect(html.indexOf("Sexta-feira, 9 de outubro")).toBeLessThan(
      html.indexOf("Sábado, 10 de outubro"),
    );
    expect(html).toContain("Com informações de Casa Fictícia");
    expect(html).toContain("Confirme horários e valores na fonte oficial antes de sair de casa.");
  });

  it("versão texto espelha o conteúdo", () => {
    expect(text).toContain("Agenda do fim de semana · 9 a 11 de outubro");
    expect(text).toContain("SEXTA-FEIRA, 9 DE OUTUBRO");
    expect(text).toContain("Forró");
    expect(text).toContain("Show <b>forte</b>");
    expect(text).toContain("20h · Teatro Fictício, Centro · Gratuito");
    expect(text).toContain("https://citynews.example/agenda/show");
    expect(text).toContain("Ver no site: https://citynews.example/newsletter/agenda/2026-10-09");
    expect(text).toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(text).not.toMatch(/<(table|td|a )/);
  });

  it("sem IA nem emoji", () => {
    expect(`${html}\n${text}`).not.toMatch(/\bIA\b|gerad[oa]|\p{Extended_Pictographic}/u);
  });
});

describe("escapeHtml", () => {
  it("escapa os cinco caracteres", () => {
    expect(escapeHtml(`<a href='x'>&"`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;&quot;");
  });
});
