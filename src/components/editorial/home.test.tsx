import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { AggregatedView, ArticleSummary } from "@/lib/db/queries/types";
import type { NewsletterState } from "@/lib/newsletter/subscribe";
import { AggregatedSection, NewsletterForm, UrgentBar } from "../index";

const article = {
  id: "u1",
  slug: "alerta",
  href: "/materia/alerta",
  title: "Defesa Civil emite alerta de tempestade para Cuiabá",
  publishedAt: "2026-09-27T17:50:00Z",
} as ArticleSummary;

const agg = (i: number): AggregatedView => ({
  id: `g${i}`,
  title: `Item ${i}`,
  url: `https://fonte${i}.example/x`,
  sourceName: `Fonte ${i}`,
  sourceSlug: `fonte-${i}`,
  publishedAt: null,
  summary: null,
  sectionSlug: null,
  topicId: null,
  labels: { shown: [{ kind: "aggregated", text: "AGREGADO", detail: `Fonte ${i}` }], hidden: [] },
});

describe("UrgentBar", () => {
  it("é alerta com nome Urgente e link para a matéria", () => {
    render(<UrgentBar article={article} now={new Date("2026-09-27T18:00:00Z")} />);
    const alert = screen.getByRole("alert", { name: /Urgente/ });
    expect(within(alert).getByRole("link", { name: article.title })).toHaveAttribute(
      "href",
      "/materia/alerta",
    );
    expect(within(alert).getByText("há 10 min")).toBeInTheDocument();
  });

  it("é uma linha fina: título e hora correm no mesmo parágrafo, sem faixa alta", () => {
    render(<UrgentBar article={article} now={new Date("2026-09-27T18:00:00Z")} />);
    const alert = screen.getByRole("alert", { name: /Urgente/ });
    const row = alert.querySelector("p");
    expect(row).not.toBeNull();
    expect(row).toContainElement(within(alert).getByRole("link", { name: article.title }));
    expect(row).toContainElement(within(alert).getByText("há 10 min"));
    expect(alert.firstElementChild).toHaveClass("py-2");
  });
});

describe("AggregatedSection", () => {
  it("região com aviso e cards agregados; vazia não renderiza", () => {
    const { rerender, container } = render(<AggregatedSection items={[agg(1), agg(2)]} />);
    const region = screen.getByRole("region", { name: "Veja também em outros portais" });
    expect(within(region).getAllByText("AGREGADO")).toHaveLength(2);
    expect(region.className).toMatch(/bg-aggregated/);
    for (const card of within(region).getAllByRole("article"))
      expect(within(card).getAllByTestId("origin-label")).toHaveLength(1);
    expect(within(region).getByText(/não republica/)).toBeInTheDocument();
    rerender(<AggregatedSection items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NewsletterForm", () => {
  it("mostra erro com exemplo e preserva o e-mail digitado", async () => {
    const action = vi.fn(async (_s: NewsletterState, f: FormData): Promise<NewsletterState> => ({
      status: "invalid",
      message: "Confira o e-mail digitado. Exemplo: ana@exemplo.com",
      email: String(f.get("email")),
    }));
    render(<NewsletterForm action={action} />);
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@");
    await userEvent.click(screen.getByRole("button", { name: "Inscrever" }));
    await waitFor(() => expect(screen.getByText(/Exemplo: ana@exemplo.com/)).toBeInTheDocument());
    expect(screen.getByLabelText("E-mail")).toHaveValue("ana@");
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("sucesso aparece no status", async () => {
    const action = vi.fn(async (): Promise<NewsletterState> => ({
      status: "success",
      message: "Inscrição recebida.",
      email: "",
    }));
    render(<NewsletterForm action={action} />);
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await userEvent.click(screen.getByRole("button", { name: "Inscrever" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Inscrição recebida"));
  });

  it("campo-armadilha fica fora da árvore acessível", () => {
    render(<NewsletterForm action={vi.fn()} />);
    expect(screen.queryByLabelText("Não preencha este campo")).not.toBeVisible();
  });
});
