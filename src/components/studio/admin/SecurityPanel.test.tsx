import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityOverview } from "@/lib/db/queries/admin-ops";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SecurityPanel } from "./SecurityPanel";

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const data = {
  settings: { require2fa: false, sessionHours: 12, retentionDays: 60 },
  requests: [],
  access: [],
  keys: [
    {
      key: "OPENROUTER_API_KEY",
      label: "Modelos",
      integration: "openrouter",
      rotateEveryDays: 90,
      rotatedAt: null,
      rotatedBy: null,
    },
  ],
} as unknown as SecurityOverview;

const ok = { ok: true, message: "Feito." };

function setup() {
  const saveSettings = vi.fn().mockResolvedValue(ok);
  const rotateKey = vi.fn().mockResolvedValue(ok);
  render(
    <SecurityPanel
      data={data}
      now="2026-10-04T12:00:00.000Z"
      saveSettings={saveSettings}
      savePrivacy={vi.fn()}
      rotateKey={rotateKey}
    />,
  );
  return { saveSettings, rotateKey };
}

describe("SecurityPanel · confirmação das ações de segurança (item 24)", () => {
  it("rotação de chave confirma com o nome da chave e o efeito", async () => {
    const { rotateKey } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Marcar como rotacionada" }));
    expect(rotateKey).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("OPENROUTER_API_KEY");
    expect(dialog).toHaveTextContent(/prazo da próxima/);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Marcar OPENROUTER_API_KEY como rotacionada" }),
    );
    expect(rotateKey).toHaveBeenCalledTimes(1);
    expect(rotateKey).toHaveBeenCalledWith({ key: "OPENROUTER_API_KEY" });
  });

  it("Cancelar na rotação não chama a action", async () => {
    const { rotateKey } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Marcar como rotacionada" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(rotateKey).not.toHaveBeenCalled();
  });

  it("salvar as políticas confirma mostrando os novos valores", async () => {
    const { saveSettings } = setup();
    const hours = screen.getByRole("textbox", { name: /sessão/i });
    await userEvent.clear(hours);
    await userEvent.type(hours, "8");
    await userEvent.click(screen.getByRole("button", { name: "Salvar políticas" }));
    expect(saveSettings).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/8 h/);
    expect(dialog).toHaveTextContent(/60 dias/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Aplicar políticas" }));
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledWith({ sessionHours: 8, retentionDays: 60 });
  });
});
