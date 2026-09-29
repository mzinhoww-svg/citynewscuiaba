import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { breakdownSummary, PushBreakdown } from "./PushBreakdown";

const rows = [
  { device: "mobile", browser: "chrome", sent: 120, delivered: 80, clicked: 12 },
  { device: "desktop", browser: "firefox", sent: 30, delivered: 10, clicked: 1 },
];

describe("PushBreakdown (spec §10.4)", () => {
  it("gráfico tem resumo textual e tabela equivalente", () => {
    render(<PushBreakdown rows={rows} />);
    const summary = "90 recebidos e 13 tocados; a maior parte em Celular · Chrome.";
    expect(breakdownSummary(rows)).toBe(summary);
    expect(screen.getByRole("img", { name: new RegExp(summary) })).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeVisible();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Aparelho", "Navegador", "Enviados", "Recebidos", "Tocados"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(document.querySelector("linearGradient")).toBeNull();
  });

  it("sem recebidos: texto em vez de gráfico", () => {
    render(<PushBreakdown rows={[]} />);
    expect(screen.getByText("Sem recebidos ainda.")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
