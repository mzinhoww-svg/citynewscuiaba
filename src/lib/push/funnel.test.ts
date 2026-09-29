import { describe, expect, it } from "vitest";
import {
  biggestDrop,
  formatCount,
  funnelRange,
  funnelRows,
  funnelSummary,
  parseFunnelFilter,
} from "./funnel";

describe("funil do app (spec §9.3, §10.6)", () => {
  it("conversão é etapa ÷ anterior; zero anterior dá null", () => {
    const rows = funnelRows({ install_prompt_shown: 1240, app_installed: 180 });
    expect(rows[1]).toEqual({ stage: "app_installed", n: 180, pctOfPrevious: 14.5 });
    expect(rows[0]!.pctOfPrevious).toBeNull();
    // Etapas seguintes sem dados: anterior zero → null, nunca divisão por zero.
    expect(rows[3]).toEqual({ stage: "notif_permission_granted", n: 0, pctOfPrevious: null });
    expect(rows).toHaveLength(7);
  });

  it("resumo textual da spec", () => {
    const rows = funnelRows({
      install_prompt_shown: 1240,
      app_installed: 180,
      notif_preprompt_shown: 150,
      notif_permission_granted: 57,
      sent_measurable: 50,
      delivered: 40,
      clicked: 20,
    });
    expect(biggestDrop(rows)).toEqual({
      from: "notif_preprompt_shown",
      to: "notif_permission_granted",
      pct: 38,
    });
    expect(funnelSummary(rows, 30)).toBe(
      "Em 30 dias, 1 240 convites de instalação viraram 180 instalações (14,5%). A maior perda está entre o pré-prompt e a permissão (38% aceitam).",
    );
    expect(funnelSummary(funnelRows({}), 7)).toBe("Em 7 dias, sem dados no período.");
    expect(formatCount(1234567)).toBe("1 234 567");
  });

  it("filtros da URL: período, personalizado válido, aparelho e navegador; inválidos ignorados", () => {
    expect(
      parseFunnelFilter(new URLSearchParams("periodo=7&aparelho=mobile&navegador=chrome")),
    ).toEqual({
      days: 7,
      device: "mobile",
      browser: "chrome",
    });
    expect(parseFunnelFilter(new URLSearchParams("periodo=99&aparelho=tv&navegador=x"))).toEqual({
      days: 30,
    });
    expect(
      parseFunnelFilter(new URLSearchParams("periodo=personalizado&de=2026-09-01&ate=2026-09-10")),
    ).toEqual({ days: null, from: "2026-09-01", to: "2026-09-10" });
    expect(
      parseFunnelFilter(new URLSearchParams("periodo=personalizado&de=2026-09-10&ate=2026-09-01")),
    ).toEqual({
      days: 30,
    });
    const today = new Date("2026-09-29T15:00:00Z");
    expect(funnelRange({ days: 7 }, today)).toEqual({
      from: "2026-09-23",
      to: "2026-09-29",
      days: 7,
    });
    expect(funnelRange({ days: null, from: "2026-09-01", to: "2026-09-10" }, today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
      days: 10,
    });
  });
});
