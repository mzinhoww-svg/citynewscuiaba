import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => vi.fn() }));
const loaded = vi.fn();
vi.mock("./InstallInviteBar", () => {
  loaded();
  return { InstallInviteBar: () => <p>faixa de instalação</p> };
});

import { EMPTY_APP_STATE } from "@/lib/app/invites";
import { captureInstallPrompt, resetInstallPromptForTests } from "@/lib/app/install";
import { readAppState, writeAppState } from "@/lib/app/storage";
import { InstallInviteSlot } from "./InstallInviteSlot";

function firePrompt() {
  const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  ev.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(ev);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetInstallPromptForTests();
  loaded.mockClear();
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false }),
    configurable: true,
  });
});

describe("InstallInviteSlot (item 85: faixa sob demanda)", () => {
  it("na 1ª visita conta a visita e não baixa a faixa", async () => {
    writeAppState(EMPTY_APP_STATE);
    captureInstallPrompt();
    firePrompt();
    render(<InstallInviteSlot />);
    await new Promise((r) => setTimeout(r, 20));
    expect(readAppState()?.visits).toBe(1);
    expect(loaded).not.toHaveBeenCalled();
    expect(screen.queryByText("faixa de instalação")).toBeNull();
  });

  it("na 2ª visita, com como instalar, baixa e mostra a faixa", async () => {
    writeAppState({
      ...EMPTY_APP_STATE,
      visits: 1,
      lastVisitDay: "2026-09-01",
      lastVisitAt: "2026-09-01T10:00:00Z",
    });
    captureInstallPrompt();
    firePrompt();
    render(<InstallInviteSlot />);
    expect(await screen.findByText("faixa de instalação")).toBeInTheDocument();
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
