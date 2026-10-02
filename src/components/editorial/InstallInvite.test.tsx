import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const send = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => send }));

import { EMPTY_APP_STATE } from "@/lib/app/invites";
import { resetInstallPromptForTests, captureInstallPrompt } from "@/lib/app/install";
import { resetInviteSlotsForTests, claimInviteSlot } from "@/lib/app/slot";
import { writeAppState, readAppState } from "@/lib/app/storage";
import { InstallInvite } from "./InstallInvite";
import { IosInstallSteps } from "./IosInstallSteps";

function firePrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  ev.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetInstallPromptForTests();
  resetInviteSlotsForTests();
  send.mockClear();
  pathname = "/";
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: false }),
    configurable: true,
  });
});
afterEach(() => vi.useRealTimers());

describe("InstallInvite (C07)", () => {
  it("aparece na 2ª visita com beforeinstallprompt; Agora não silencia e registra", async () => {
    writeAppState({
      ...EMPTY_APP_STATE,
      visits: 1,
      lastVisitDay: "2026-09-01",
      lastVisitAt: "2026-09-01T10:00:00Z",
    });
    captureInstallPrompt();
    firePrompt();
    render(<InstallInvite />);
    const region = await screen.findByRole("region", { name: "Instalar o app" });
    expect(region).toHaveTextContent(
      "Leia o CityNews como app: abre mais rápido e funciona sem internet.",
    );
    expect(readAppState()?.visits).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("region", { name: "Instalar o app" })).toBeNull();
    const s = readAppState()!;
    expect(s.install.refusals).toBe(1);
    expect(Date.parse(s.install.silencedUntil!)).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(send).toHaveBeenCalledWith("install_prompt_dismissed", {
      platform: "desktop",
      refusals: 1,
    });
  });

  it("Instalar chama prompt(); aceito marca instalado e appinstalled registra", async () => {
    writeAppState({ ...EMPTY_APP_STATE, visits: 3 });
    captureInstallPrompt();
    const ev = firePrompt("accepted");
    render(<InstallInvite />);
    await screen.findByRole("region", { name: "Instalar o app" });
    await userEvent.click(screen.getByRole("button", { name: "Instalar" }));
    expect(ev.prompt).toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(readAppState()?.install.installed).toBe(true);
    expect(send).toHaveBeenCalledWith("app_installed", { via: "prompt" });
    expect(screen.queryByRole("region", { name: "Instalar o app" })).toBeNull();
  });

  it("não aparece na 1ª visita, sem beforeinstallprompt, sem armazenamento ou com outro convite na frente", async () => {
    writeAppState({ ...EMPTY_APP_STATE, visits: 0 });
    captureInstallPrompt();
    firePrompt();
    const { unmount } = render(<InstallInvite />);
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Instalar o app" })).toBeNull();
    unmount();

    writeAppState({ ...EMPTY_APP_STATE, visits: 5 });
    resetInstallPromptForTests();
    const r2 = render(<InstallInvite />);
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Instalar o app" })).toBeNull();
    r2.unmount();

    captureInstallPrompt();
    firePrompt();
    claimInviteSlot("consent", "/");
    render(<InstallInvite />);
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Instalar o app" })).toBeNull();
  });

  it("registra install_prompt_shown depois de 1 s visível", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    writeAppState({ ...EMPTY_APP_STATE, reads: 3 });
    captureInstallPrompt();
    firePrompt();
    render(<InstallInvite />);
    await screen.findByRole("region", { name: "Instalar o app" });
    expect(send).not.toHaveBeenCalledWith("install_prompt_shown", expect.anything());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(send).toHaveBeenCalledWith("install_prompt_shown", {
      platform: "desktop",
      trigger: "reads",
    });
  });
});

describe("IosInstallSteps (C08)", () => {
  it("três passos, nota, Entendi e Agora não (conta recusa)", async () => {
    const onClose = vi.fn();
    HTMLDialogElement.prototype.showModal ??= function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
    render(<IosInstallSteps open safari={false} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Adicionar o CityNews à Tela de Início" });
    const items = dialog.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Toque em Compartilhar na barra de endereço");
    expect(items[1]).toHaveTextContent("Escolha Adicionar à Tela de Início");
    expect(items[2]).toHaveTextContent("Toque em Adicionar");
    expect(dialog).toHaveTextContent(
      "Depois, abra o CityNews pela Tela de Início para receber avisos.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(onClose).toHaveBeenCalledWith("not_now");
  });
});
