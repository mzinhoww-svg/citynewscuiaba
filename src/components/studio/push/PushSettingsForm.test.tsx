import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushSettingsView } from "@/lib/db/queries/push-admin";
import { PushSettingsForm } from "./PushSettingsForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const save = vi.fn();
const pause = vi.fn();
const requestResume = vi.fn();
const approveResume = vi.fn();
const actions = { save, pause, requestResume, approveResume };

const base: PushSettingsView = {
  dailyLimit: 3,
  quietStart: 22,
  quietEnd: 7,
  templates: [],
  paused: { on: false, by: null, at: null, reason: null },
  vapid: { ok: false, missing: ["VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
};

beforeEach(() => {
  for (const f of [save, pause, requestResume, approveResume, refresh]) f.mockReset();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("PushSettingsForm (spec §10.5)", () => {
  it("silêncio só oferece 18–22h e 7–10h com a nota; VAPID só nomes; salvar envia os valores", async () => {
    save.mockResolvedValue({ ok: true, message: "Configurações salvas" });
    render(
      <PushSettingsForm
        settings={base}
        pendingResume={null}
        currentUserId="u1"
        canApprove
        actions={actions}
      />,
    );
    const start = screen.getByLabelText("Início do silêncio") as HTMLSelectElement;
    expect([...start.options].map((o) => o.textContent)).toEqual([
      "18h",
      "19h",
      "20h",
      "21h",
      "22h",
    ]);
    const end = screen.getByLabelText("Fim do silêncio") as HTMLSelectElement;
    expect([...end.options].map((o) => o.textContent)).toEqual(["7h", "8h", "9h", "10h"]);
    expect(screen.getAllByText("Sempre contém 22h–7h.")).toHaveLength(2);
    expect(
      screen.getByText("Push indisponível: configure VAPID_PRIVATE_KEY, VAPID_SUBJECT na Vercel."),
    ).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Limite diário padrão"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar modelo" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Padrão");
    await userEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const form = save.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(form.entries())).toMatchObject({
      dailyLimit: "2",
      quietStart: "22",
      quietEnd: "7",
    });
    expect(JSON.parse(String(form.get("templates")))).toEqual([
      { name: "Padrão", title: "{titulo}", body: "{linha_fina}" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Configurações salvas");
    expect(refresh).toHaveBeenCalled();
  });

  it("pausar exige motivo e PAUSAR digitado; erro do servidor fica no diálogo", async () => {
    pause.mockResolvedValueOnce({ ok: false, message: "Digite PAUSAR para confirmar." });
    render(
      <PushSettingsForm
        settings={base}
        pendingResume={null}
        currentUserId="u1"
        canApprove
        actions={actions}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pausar todos os envios" }));
    const dialog = screen.getByRole("dialog", { name: "Pausar todos os envios?" });
    const confirm = screen.getByRole("button", { name: "Pausar envios" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo"), "incidente");
    await userEvent.type(screen.getByLabelText("Digite PAUSAR para confirmar"), "pausar");
    expect(screen.getByText("Digite exatamente PAUSAR.")).toBeVisible();
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Digite PAUSAR para confirmar"));
    await userEvent.type(screen.getByLabelText("Digite PAUSAR para confirmar"), "PAUSAR");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries((pause.mock.calls[0]![0] as FormData).entries())).toEqual({
      reason: "incidente",
      confirm: "PAUSAR",
    });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Digite PAUSAR para confirmar.");
  });

  it("pausado: mostra quem pausou, 'Retomar envios' cria o pedido; pendente mostra Aprovar a quem pode aprovar", async () => {
    approveResume.mockResolvedValue({ ok: true, message: "Envios retomados" });
    requestResume.mockResolvedValue({
      ok: true,
      message: "Retomada pedida.",
      data: { approvalId: "a1" },
    });
    const paused = {
      ...base,
      paused: {
        on: true,
        by: { id: "u2", name: "Helena Costa" },
        at: "2026-09-29T17:32:00Z",
        reason: "incidente",
      },
    };
    const { rerender } = render(
      <PushSettingsForm
        settings={paused}
        pendingResume={null}
        currentUserId="u1"
        canApprove
        actions={actions}
      />,
    );
    expect(
      screen.getByText(/Envios pausados por Helena Costa às \d{2}:\d{2}: incidente/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pausar todos os envios" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retomar envios" }));
    await userEvent.type(screen.getByLabelText("Motivo"), "resolvido");
    await userEvent.click(screen.getByRole("button", { name: "Pedir retomada" }));
    await waitFor(() => expect(requestResume).toHaveBeenCalledTimes(1));
    rerender(
      <PushSettingsForm
        settings={paused}
        pendingResume={{
          id: "a1",
          requestedBy: { id: "u2", name: "Helena Costa" },
          reason: "resolvido",
          createdAt: "2026-09-29T17:40:00Z",
        }}
        currentUserId="u1"
        canApprove
        actions={actions}
      />,
    );
    expect(
      screen.getByText(
        "Retomada pedida por Helena Costa. Quem tem permissão de aprovar precisa confirmar.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Aprovar retomada" }));
    await waitFor(() => expect(approveResume).toHaveBeenCalledTimes(1));
    // A-128: quem pediu e pode aprovar também vê o botão de aprovar.
    rerender(
      <PushSettingsForm
        settings={paused}
        pendingResume={{
          id: "a1",
          requestedBy: { id: "u1", name: "Eu" },
          reason: "resolvido",
          createdAt: "2026-09-29T17:40:00Z",
        }}
        currentUserId="u1"
        canApprove
        actions={actions}
      />,
    );
    expect(screen.getByText(/Você pediu a retomada/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Aprovar retomada" })).toBeVisible();
  });
});
