import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { funnelRows, funnelSummary } from "@/lib/push/funnel";
import { FunnelChart } from "./FunnelChart";

describe("FunnelChart (spec §10.6)", () => {
  it("7 etapas com número e % da anterior, resumo textual e tabela equivalente, sem gradiente", () => {
    const rows = funnelRows({
      install_prompt_shown: 1240,
      app_installed: 180,
      notif_preprompt_shown: 150,
      notif_permission_granted: 57,
    });
    const summary = funnelSummary(rows, 30);
    render(<FunnelChart rows={rows} summary={summary} />);
    expect(screen.getByRole("img", { name: new RegExp("1 240 convites") })).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeVisible();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(7);
    expect(within(table).getByRole("rowheader", { name: "2. Instalação" })).toBeVisible();
    const cells = within(table)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toContain("1 240");
    expect(cells).toContain("14,5%");
    expect(document.querySelector("linearGradient")).toBeNull();
  });
});
