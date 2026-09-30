import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PushStatusBadge } from "./PushStatusBadge";

describe("PushStatusBadge", () => {
  it("mostra o texto do estado (nunca só cor) e o motivo", () => {
    const { container } = render(<PushStatusBadge status="pending_approval" />);
    expect(screen.getByText("Aguardando aprovação")).toBeVisible();
    expect(container.querySelector("[data-status='pending_approval']")).not.toBeNull();
    render(<PushStatusBadge status="cancelled" reason="Matéria despublicada" />);
    expect(screen.getByText("Cancelado")).toBeVisible();
    expect(screen.getByText("Matéria despublicada")).toBeVisible();
  });
});
