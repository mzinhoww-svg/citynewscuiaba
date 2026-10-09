import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicEdition } from "@/lib/db/newsletter-editions";
import type { EditionItem } from "@/lib/newsletter/agenda-edition";

vi.mock("server-only", () => ({}));

const { EditionView } = await import("./EditionView");

const item = (over: Partial<EditionItem>): EditionItem => ({
  day: "2026-10-10",
  dayLabel: "Sábado, 10 de outubro",
  slug: "forro",
  title: "Forró da Praça",
  url: "https://citynews.example/agenda/forro",
  when: "20h",
  where: "Praça Fictícia, Centro",
  price: "Gratuito",
  origin: "Com informações de Casa Fictícia",
  ...over,
});

const edition: PublicEdition = {
  editionDate: "2026-10-09",
  subject: "Agenda do fim de semana · 9 a 11 de outubro",
  status: "aguardando_provedor",
  publishedAt: "2026-10-08T15:45:00Z",
  items: [
    item({ day: "2026-10-09", dayLabel: "Sexta-feira, 9 de outubro", slug: "show", title: "Show" }),
    item({ title: "Forró <b>quente</b>" }),
    item({ slug: "feira", title: "Feira", origin: null, price: "Consulte a fonte" }),
  ],
};

describe("EditionView", () => {
  it("título, período, dias e itens com link para a Agenda", () => {
    const { container } = render(<EditionView edition={edition} />);
    expect(screen.getByRole("heading", { level: 1, name: "Agenda do fim de semana" })).toBeTruthy();
    expect(screen.getByText("9 a 11 de outubro")).toBeTruthy();
    const days = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(days.slice(0, 2)).toEqual(["Sexta-feira, 9 de outubro", "Sábado, 10 de outubro"]);
    const sat = screen.getByRole("region", { name: "Sábado, 10 de outubro" });
    expect(within(sat).getAllByRole("listitem")).toHaveLength(2);
    // Texto externo é texto: a marcação aparece escapada, nunca vira elemento.
    const link = within(sat).getByRole("link", { name: "Forró <b>quente</b>" });
    expect(link.getAttribute("href")).toBe("/agenda/forro");
    expect(container.querySelector("b")).toBeNull();
    expect(within(sat).getAllByText("20h · Praça Fictícia, Centro")).toHaveLength(2);
    expect(within(sat).getByText("Com informações de Casa Fictícia")).toBeTruthy();
    expect(within(sat).getByText("Consulte a fonte")).toBeTruthy();
    expect(
      screen.getByText("Confirme horários e valores na fonte oficial antes de sair de casa."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quero receber" }).getAttribute("href")).toBe(
      "/newsletter#inscrever",
    );
  });

  it("sem vocabulário proibido", () => {
    const { container } = render(<EditionView edition={edition} />);
    expect(container.textContent).not.toMatch(/\bIA\b|gerad[oa]|automátic|normaliz/i);
  });

  it("edição publicada sem itens: aviso e link para a agenda completa", () => {
    render(<EditionView edition={{ ...edition, items: [] }} />);
    expect(
      screen.getByText(/Os eventos desta edição foram cancelados ou retirados\./),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Veja a agenda completa." }).getAttribute("href")).toBe(
      "/agenda",
    );
    expect(screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Receba no seu e-mail",
    ]);
  });
});
