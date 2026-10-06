import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { newsroomStats, QueueShortcuts } from "./newsroom";

afterEach(cleanup);

const KPIS = { publishedToday: 4, auto24h: 2, exceptions: 3, overdue: 1, scheduled: 5 };

describe("Redação (item 59)", () => {
  it("Publicadas hoje e Agendadas levam ao calendário", () => {
    const items = newsroomStats(KPIS, true);
    const byLabel = new Map(items.map((i) => [i.label, i]));
    expect(byLabel.get(T.kpi.publishedToday)?.href).toBe("/estudio/calendario");
    expect(byLabel.get(T.kpi.scheduled)?.href).toBe("/estudio/calendario");
    expect(byLabel.get(T.kpi.exceptions)?.href).toBe("/estudio/fila?aba=exceptions");
    expect(byLabel.get(T.kpi.overdue)?.href).toBe("/estudio/fila?prazo=vencido");
  });

  it("sem acesso à redação, nenhum número vira link", () => {
    expect(newsroomStats(KPIS, false).every((i) => i.href === undefined)).toBe(true);
  });

  it("abas viram atalhos Ver na Fila, todos links reais e nenhum marcado como atual", () => {
    render(<QueueShortcuts />);
    const nav = screen.getByRole("navigation", { name: T.seeInQueue });
    expect(within(nav).getByText(T.seeInQueue)).toBeInTheDocument();
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/estudio/fila?aba=all",
      "/estudio/fila?aba=exceptions",
      "/estudio/fila?aba=auto24h",
      "/estudio/fila?aba=mine",
      "/estudio/fila?aba=sensitive",
    ]);
    for (const l of links) expect(l).not.toHaveAttribute("aria-current");
  });
});
