import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => send }));
const enablePush = vi.fn();
vi.mock("@/lib/push/client", () => ({ enablePush: (t: string) => enablePush(t) }));

import { EMPTY_APP_STATE } from "@/lib/app/invites";
import { readAppState, writeAppState } from "@/lib/app/storage";
import { NotificationInvite } from "./NotificationInvite";

beforeEach(() => {
  localStorage.clear();
  send.mockClear();
  enablePush.mockReset();
  writeAppState(EMPTY_APP_STATE);
  Object.defineProperty(window, "Notification", {
    value: { permission: "default", requestPermission: vi.fn() },
    configurable: true,
    writable: true,
  });
});

describe("NotificationInvite (C09)", () => {
  it("Agora não nunca chama o pedido nativo e silencia 14 dias", async () => {
    const spy = vi.spyOn(window.Notification, "requestPermission");
    const onDone = vi.fn();
    render(<NotificationInvite trigger="follow" onDone={onDone} />);
    expect(screen.getByRole("region", { name: "Quer receber avisos?" })).toBeVisible();
    expect(
      screen.getByText(
        "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(spy).not.toHaveBeenCalled();
    expect(enablePush).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    const s = readAppState()!;
    expect(s.notif.refusals).toBe(1);
    expect(Date.parse(s.notif.silencedUntil!)).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(send).toHaveBeenCalledWith("notif_preprompt_dismissed", {
      trigger: "follow",
      refusals: 1,
    });
  });

  it("Ativar chama enablePush com o gatilho e mostra o toast com link para Alertas", async () => {
    enablePush.mockResolvedValue({ ok: true, value: { status: "on" } });
    render(<NotificationInvite trigger="alert" />);
    await userEvent.click(screen.getByRole("button", { name: "Ativar" }));
    expect(enablePush).toHaveBeenCalledWith("alert");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Avisos ativados. Ajuste em Alertas.",
    );
    expect(screen.getByRole("link", { name: "Alertas" })).toHaveAttribute("href", "/alertas");
  });

  it("negada mostra o texto e nunca mais pré-prompt; falha mostra erro com Tentar de novo", async () => {
    enablePush.mockResolvedValueOnce({ ok: false, error: "denied" });
    const { unmount } = render(<NotificationInvite trigger="urgent_article" />);
    await userEvent.click(screen.getByRole("button", { name: "Ativar" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Tudo bem. Se mudar de ideia, veja em Alertas como reativar.",
    );
    expect(readAppState()!.notif.refusals).toBe(3);
    unmount();
    enablePush.mockResolvedValueOnce({ ok: false, error: "server_failed" });
    render(<NotificationInvite trigger="follow" />);
    await userEvent.click(screen.getByRole("button", { name: "Ativar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível ativar os avisos agora. Tente de novo mais tarde.",
    );
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  });

  it("registra notif_preprompt_shown depois de 1 s visível", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotificationInvite trigger="follow" />);
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(send).toHaveBeenCalledWith("notif_preprompt_shown", { trigger: "follow" });
    vi.useRealTimers();
  });
});
