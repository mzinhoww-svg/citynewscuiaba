import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { QueueTable, type QueueTableProps, type QueueTableRow } from "./QueueTable";

const row = (over: Partial<QueueTableRow> = {}): QueueTableRow => ({
  id: "a1",
  title: "Obra na avenida",
  href: "/estudio/fila/a1",
  sectionName: "Cidade",
  status: "in_review",
  publishMode: null,
  confidence: "média",
  fromPipeline: false,
  aiFallback: false,
  sensitive: false,
  recommended: null,
  recommendedRationale: null,
  reviewReason: null,
  assigneeName: null,
  dueAt: null,
  overdue: false,
  canUnpublish: false,
  ...over,
});

describe("QueueTable · atalhos j/k (UX-W3-T5, item 53)", () => {
  it("j e k movem o foco entre as linhas (link do título, que o Enter abre)", async () => {
    const user = userEvent.setup();
    render(
      <QueueTable
        rows={[
          row({ id: "a1", title: "Primeira" }),
          row({ id: "a2", title: "Segunda", href: "/estudio/fila/a2" }),
        ]}
      />,
    );
    const first = screen.getByRole("link", { name: "Primeira" });
    const second = screen.getByRole("link", { name: "Segunda" });
    await user.keyboard("j");
    expect(document.activeElement).toBe(first);
    await user.keyboard("j");
    expect(document.activeElement).toBe(second);
    await user.keyboard("j");
    expect(document.activeElement).toBe(second);
    await user.keyboard("k");
    expect(document.activeElement).toBe(first);
  });
});

describe("QueueTable · prazo vencido (UX-W1-T4, item 9)", () => {
  it("prazo no passado mostra 'Atrasada' em texto visível, não só cor", () => {
    render(<QueueTable rows={[row({ dueAt: "2026-10-01T12:00:00Z", overdue: true })]} />);
    const el = screen.getByText("Atrasada");
    expect(el).not.toHaveClass("sr-only");
    expect(el.closest("td")?.querySelector("svg")).not.toBeNull();
  });

  it("prazo em dia não mostra o aviso", () => {
    render(<QueueTable rows={[row({ dueAt: "2026-12-01T12:00:00Z", overdue: false })]} />);
    expect(screen.queryByText("Atrasada")).toBeNull();
  });
});

describe("QueueTable · decisão rápida (UX-W3-T1, itens 46, 55, 56)", () => {
  const bulkOf = (over: Partial<NonNullable<QueueTableProps["bulk"]>> = {}) => ({
    assignees: [],
    assign: vi.fn(),
    requestReview: vi.fn(),
    ...over,
  });

  it("justificativa visível em uma linha, com 'Ver mais' num details (nunca só title)", () => {
    const rationale = "Fonte confiável, assunto comum e duas fontes independentes confirmam.";
    render(
      <QueueTable rows={[row({ recommended: "publish", recommendedRationale: rationale })]} />,
    );
    expect(document.querySelector(`[title="${rationale}"]`)).toBeNull();
    const summary = screen.getByText("Ver mais").closest("summary");
    expect(summary).not.toBeNull();
    expect(summary?.closest("details")).not.toBeNull();
    expect(within(summary as HTMLElement).getByText(rationale)).toHaveClass("line-clamp-1");
  });

  it("estado da matéria como StatusBadge (tom + ícone + texto)", () => {
    render(<QueueTable rows={[row({ status: "changes_requested" })]} />);
    const badge = screen.getByText("Ajustes pedidos").closest("[data-tone]");
    expect(badge).toHaveAttribute("data-tone", "warn");
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("a barra de lote só aparece com seleção e fica presa ao rodapé", async () => {
    render(<QueueTable rows={[row()]} bulk={bulkOf()} />);
    expect(screen.queryByRole("group", { name: "Ações em lote" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: 'Selecionar "Obra na avenida"' }));
    const bar = screen.getByRole("group", { name: "Ações em lote" });
    expect(bar.closest(".sticky")).toHaveClass("bottom-0", "z-sticky", "pb-safe");
    expect(within(bar).getByText(/1 selecionada/)).toBeVisible();
  });

  it("'Aprovar recomendadas' manda só as que as regras recomendaram publicar", async () => {
    const approveRecommended = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "2 matérias aprovadas", approved: 2, skipped: [] });
    render(
      <QueueTable
        rows={[
          row({ id: "a", title: "A", recommended: "publish" }),
          row({ id: "b", title: "B", recommended: "review" }),
          row({ id: "c", title: "C", recommended: "publish_notify" }),
          row({ id: "d", title: "D", recommended: null }),
        ]}
        bulk={bulkOf({ approveRecommended })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Selecionar as 2 recomendadas" }));
    expect(screen.getByRole("checkbox", { name: 'Selecionar "A"' })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: 'Selecionar "B"' })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: 'Selecionar "B"' }));
    await userEvent.click(screen.getByRole("button", { name: "Aprovar 2 recomendadas" }));
    expect(approveRecommended).toHaveBeenCalledWith({ ids: ["a", "c"] });
    expect(await screen.findByText("2 matérias aprovadas")).toBeVisible();
  });
});
