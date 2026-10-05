import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/db/queries/studio-corrections", () => ({
  calendarItems: vi.fn().mockResolvedValue([]),
}));

import CalendarPage from "./page";

describe("/estudio/calendario · dia de hoje (UX-W1-T4, item 9)", () => {
  it("o dia atual tem aria-current=date e o rótulo visível 'Hoje'", async () => {
    const el = await CalendarPage({ searchParams: Promise.resolve({}) });
    const { container } = render(el);
    const current = container.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    const label = within(current[0] as HTMLElement).getByText("Hoje");
    expect(label).not.toHaveClass("sr-only");
  });

  it("semana sem hoje não marca nenhum dia", async () => {
    const el = await CalendarPage({ searchParams: Promise.resolve({ semana: "2020-01-01" }) });
    const { container } = render(el);
    expect(container.querySelector('[aria-current="date"]')).toBeNull();
  });
});
