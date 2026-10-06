import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "@/lib/db/queries/approvals";
import { ApprovalInbox } from "./ApprovalInbox";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item = (over: Partial<ApprovalItem>): ApprovalItem => ({
  id: "a1",
  kind: "rules.activate",
  targetRef: "rules:4",
  target: { kind: "rules", version: 4 },
  justification: "Ajuste do limite",
  requestedBy: { id: "u1", name: "Marina" },
  approvedBy: { id: "u1", name: "Marina" },
  status: "applied",
  createdAt: "2026-10-01T12:00:00Z",
  decidedAt: "2026-10-01T12:05:00Z",
  ...over,
});

describe("ApprovalInbox · últimas decisões", () => {
  it("cartões abaixo de md e tabela a partir de md (a inativa fica display:none)", () => {
    render(
      <ApprovalInbox
        pending={[]}
        recent={[item({}), item({ id: "a2", status: "rejected", approvedBy: null })]}
        currentUserId="u1"
        decidable={[]}
        decide={vi.fn()}
      />,
    );
    // A seção e a região rolável da tabela têm o mesmo nome; a da tabela é a que embrulha <table>.
    const region = screen.getByRole("table").closest("[role=region]")!;
    expect(region.className).toMatch(/\bhidden\b/);
    expect(region.className).toContain("md:block");
    const cards = screen.getByRole("list", { name: "Últimas decisões" });
    expect(cards.className).toContain("md:hidden");
    const [applied, rejected] = within(cards).getAllByRole("listitem");
    expect(applied).toHaveTextContent("Aplicado");
    expect(applied).toHaveTextContent("Decidido por Marina");
    expect(rejected).toHaveTextContent("Recusado");
    expect(rejected).toHaveTextContent("Decidido por —");
  });
});
