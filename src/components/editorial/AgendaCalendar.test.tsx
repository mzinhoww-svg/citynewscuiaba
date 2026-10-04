import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgendaCalendar } from "./AgendaCalendar";

const base = {
  month: "2026-10",
  title: "outubro de 2026",
  prevHref: "/agenda?mes=2026-09",
  nextHref: "/agenda?mes=2026-11",
};

describe("AgendaCalendar · dia de hoje (UX-W1-T4, item 10)", () => {
  it("dia de hoje sem evento: aria-current=date e 'hoje' em texto", () => {
    const { container } = render(<AgendaCalendar {...base} days={[]} today="2026-10-04" />);
    const current = container.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toMatch(/4/);
    expect(current[0]!.textContent).toMatch(/hoje/);
  });

  it("dia de hoje com evento: o link marca a data atual e diz 'hoje' no nome", () => {
    const { container } = render(
      <AgendaCalendar
        {...base}
        today="2026-10-04"
        days={[
          {
            key: "2026-10-04",
            count: 2,
            href: "/agenda?dia=2026-10-04",
            label: "domingo, 4 de outubro",
          },
        ]}
      />,
    );
    const current = container.querySelector('[aria-current="date"]')!;
    expect(current.tagName).toBe("A");
    expect(current.getAttribute("aria-label")).toMatch(/hoje/);
  });

  it("sem hoje no mês, nenhuma célula marcada", () => {
    const { container } = render(<AgendaCalendar {...base} days={[]} today="2026-11-04" />);
    expect(container.querySelector('[aria-current="date"]')).toBeNull();
  });
});
