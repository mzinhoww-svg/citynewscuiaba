import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMonitor, type LiveData } from "./LiveMonitor";

const initial: LiveData = {
  at: "2026-10-04T15:00:00Z",
  run: { id: "r1", startedAt: "2026-10-04T14:58:00Z", state: "running", pending: 2, failed: 0 },
  phases: [],
  queue: [],
  events: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...initial }) }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("LiveMonitor · região viva (UX-W1-T10, item 20)", () => {
  it("o relógio fica fora de qualquer região viva", () => {
    render(<LiveMonitor initial={initial} endpoint="/api/control/live" />);
    const clock = screen.getByText(/Atualizado às/);
    expect(clock).not.toHaveAttribute("aria-live");
    expect(clock).not.toHaveAttribute("role", "status");
    expect(clock.closest("[aria-live],[role=status],[role=alert]")).toBeNull();
  });

  it("a região viva diz o estado do ciclo, sem horário", () => {
    render(<LiveMonitor initial={initial} endpoint="/api/control/live" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Em andamento");
    expect(status.textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it("pausar muda o texto da região viva", async () => {
    render(<LiveMonitor initial={initial} endpoint="/api/control/live" />);
    await userEvent.click(screen.getByRole("button", { name: "Pausar atualização" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/pausada/i));
  });
});
