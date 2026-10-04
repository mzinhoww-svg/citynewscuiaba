import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Benefits, Cta, Faq, Hero } from "./index";

/*
 * UI-T11: blocos de marketing (hero, benefícios, CTA, FAQ) inspirados no TripleD, em Tailwind
 * com tokens. Cada bloco tem um título, CTA com nome acessível, nada de cor ou px crus e
 * animação só atrás de `motion-safe:`.
 */

const DIR = join(process.cwd(), "src/components/editorial/marketing");
const FILES = ["Hero.tsx", "Benefits.tsx", "Cta.tsx", "Faq.tsx"];

describe("Hero", () => {
  it("é o título da página (h1) por padrão, com introdução e CTA nomeado", () => {
    render(
      <Hero
        id="h"
        title="Newsletters"
        intro="Escolha o que quer receber."
        action={{ label: "Escolher newsletters", href: "#inscrever" }}
      />,
    );
    const region = screen.getByRole("region", { name: "Newsletters" });
    expect(within(region).getByRole("heading", { level: 1, name: "Newsletters" })).toBeVisible();
    expect(within(region).getByText("Escolha o que quer receber.")).toBeVisible();
    expect(within(region).getByRole("link", { name: "Escolher newsletters" })).toHaveAttribute(
      "href",
      "#inscrever",
    );
  });

  it("como bloco interno usa h2 e aceita ações próprias", () => {
    render(
      <Hero id="h2" level={2} title="Bloco" intro="Texto">
        <button type="button">Instalar</button>
      </Hero>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Bloco" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "Instalar" })).toBeVisible();
  });
});

describe("Benefits", () => {
  it("h2, lista de itens com título h3 e texto", () => {
    render(
      <Benefits
        id="b"
        title="O que muda"
        items={[
          { icon: "wifi-off", title: "Sem internet", text: "Lê o que já abriu." },
          { text: "Item só com texto." },
        ]}
      />,
    );
    const region = screen.getByRole("region", { name: "O que muda" });
    expect(within(region).getByRole("heading", { level: 2, name: "O que muda" })).toBeVisible();
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByRole("heading", { level: 3, name: "Sem internet" })).toBeVisible();
    expect(within(region).getByText("Item só com texto.")).toBeVisible();
  });
});

describe("Cta", () => {
  it("h2 e link de ação com nome acessível", () => {
    render(
      <Cta
        id="c"
        title="Contato comercial"
        text="Fale com a equipe."
        action={{ label: "Escrever para o comercial", href: "mailto:contato@citynews.com.br" }}
      />,
    );
    const region = screen.getByRole("region", { name: "Contato comercial" });
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Contato comercial",
    );
    expect(within(region).getByRole("link", { name: "Escrever para o comercial" })).toHaveAttribute(
      "href",
      "mailto:contato@citynews.com.br",
    );
  });

  it("aceita conteúdo próprio (formulário) no lugar do link", () => {
    render(
      <Cta id="c2" title="Inscrever">
        <form aria-label="Inscrição">
          <button type="submit">Enviar</button>
        </form>
      </Cta>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Inscrever" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeVisible();
  });
});

describe("Faq", () => {
  it("h2 e perguntas em <details>/<summary>, recolhidas", () => {
    const { container } = render(
      <Faq
        id="f"
        title="Perguntas frequentes"
        items={[
          { question: "Preciso de conta?", answer: "Não. Só o e-mail." },
          { question: "Como saio?", answer: "Pelo link em cada edição." },
        ]}
      />,
    );
    const region = screen.getByRole("region", { name: "Perguntas frequentes" });
    expect(within(region).getByRole("heading", { level: 2 })).toBeVisible();
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(2);
    details.forEach((d) => {
      expect(d.open).toBe(false);
      expect(d.querySelector("summary")).not.toBeNull();
    });
    expect(container.querySelector("summary")).toHaveTextContent("Preciso de conta?");
    expect(within(region).getByText("Não. Só o e-mail.")).toBeInTheDocument();
  });
});

describe("fonte dos blocos", () => {
  it.each(FILES)("%s: sem hex, px crus nem gradiente", (f) => {
    const src = readFileSync(join(DIR, f), "utf8");
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toMatch(/\d+px/);
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/framer-motion/);
  });

  it.each(FILES)("%s: animação e transição só atrás de motion-safe", (f) => {
    const src = readFileSync(join(DIR, f), "utf8");
    const classes = src.match(/[\w:-]*(?:animate-|transition)[\w-]*/g) ?? [];
    const bare = classes.filter((c) => !c.startsWith("motion-safe:"));
    expect(bare).toEqual([]);
  });

  it("nenhum bloco escreve a sigla IA", () => {
    const { container } = render(
      <>
        <Hero id="a" title="T" intro="I" />
        <Benefits id="b" title="B" items={[{ text: "x" }]} />
        <Cta id="c" title="C" action={{ label: "Ir", href: "/" }} />
        <Faq id="d" title="F" items={[{ question: "q", answer: "a" }]} />
      </>,
    );
    expect(container.textContent).not.toMatch(/\bIA\b|inteligência artificial/i);
  });
});
