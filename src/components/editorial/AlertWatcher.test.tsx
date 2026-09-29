import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushState = { value: { status: "off" } as { status: string } };
vi.mock("@/lib/push/client", () => ({ usePushState: () => pushState.value }));
const alerts = [
  {
    id: "a",
    kind: "bairro",
    target: "cpa",
    label: "CPA",
    frequency: "immediate",
    channel: "browser",
    status: "active",
    at: "2026-09-28T10:00:00Z",
  },
  {
    id: "b",
    kind: "tema",
    target: "cidade",
    label: "Cidade",
    frequency: "daily",
    channel: "browser",
    status: "active",
    at: "2026-09-28T10:00:00Z",
  },
];
vi.mock("@/lib/anon/store", () => ({ getAnonStore: () => ({ get: async () => ({ alerts }) }) }));
const due = vi.fn();
vi.mock("@/lib/alerts/match", () => ({
  EMPTY_STATE: { seen: [], sentAt: [], digestAt: {} },
  pollSince: () => "2026-09-28T10:00:00Z",
  dueNotifications: (a: unknown[]) => {
    due(a);
    return { notifications: [], state: { seen: [], sentAt: [], digestAt: {} } };
  },
}));
vi.mock("@/lib/offline/sw", () => ({ showNotification: vi.fn() }));

import { AlertWatcher } from "./AlertWatcher";

beforeEach(() => {
  due.mockClear();
  Object.defineProperty(window, "Notification", {
    value: { permission: "granted" },
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("fetch", async () => Response.json({ items: [] }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AlertWatcher (D-P20)", () => {
  it("sem push, imediatos e resumos passam pelo vigia", async () => {
    pushState.value = { status: "off" };
    render(<AlertWatcher />);
    await waitFor(() => expect(due).toHaveBeenCalled());
    expect((due.mock.calls[0]![0] as { id: string }[]).map((a) => a.id)).toEqual(["a", "b"]);
  });
  it("com push ativo não mostra imediatos; resumo diário continua", async () => {
    pushState.value = { status: "on" };
    render(<AlertWatcher />);
    await waitFor(() => expect(due).toHaveBeenCalled());
    expect((due.mock.calls[0]![0] as { id: string }[]).map((a) => a.id)).toEqual(["b"]);
  });
});
