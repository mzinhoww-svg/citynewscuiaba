import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { QueueTable, type QueueTableRow } from "./QueueTable";

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
