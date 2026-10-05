import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffMember } from "@/lib/db/queries/admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { StaffTable } from "./StaffTable";

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const marta: StaffMember = {
  id: "u2",
  name: "Marta Figueiredo",
  email: "marta@citynews.test",
  roles: [{ role: "admin", sections: [] }],
  pendingInvite: false,
  lastSignInAt: null,
  adminApproval: null,
  adminRevokeApproval: { id: "ap1", status: "approved", requestedBy: "u1" },
};

const joao: StaffMember = {
  ...marta,
  id: "u3",
  name: "João Paulo Arruda",
  roles: [{ role: "editor_chefe", sections: [] }],
  adminRevokeApproval: null,
  adminApproval: { id: "ap2", status: "approved", requestedBy: "u1" },
};

const ok = { ok: true, message: "Feito." };

function setup() {
  const applyAdmin = vi.fn().mockResolvedValue(ok);
  const applyAdminRevoke = vi.fn().mockResolvedValue(ok);
  render(
    <StaffTable
      staff={[marta, joao]}
      sections={[]}
      currentUserId="u1"
      invite={vi.fn()}
      setRoles={vi.fn()}
      applyAdmin={applyAdmin}
      applyAdminRevoke={applyAdminRevoke}
    />,
  );
  return { applyAdmin, applyAdminRevoke };
}

describe("StaffTable · confirmação de ações sensíveis (item 24)", () => {
  it("Aplicar revogação abre diálogo com nome e efeito, sem chamar a action", async () => {
    const { applyAdminRevoke } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar revogação" }));
    expect(applyAdminRevoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Marta Figueiredo");
    expect(dialog).toHaveTextContent(/deixa de administrar/);
    expect(
      within(dialog).getByRole("button", { name: "Revogar acesso de Marta Figueiredo" }),
    ).toBeVisible();
  });

  it("confirmar chama a action uma vez, com a pessoa certa", async () => {
    const { applyAdminRevoke } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar revogação" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Revogar acesso de Marta Figueiredo" }),
    );
    expect(applyAdminRevoke).toHaveBeenCalledTimes(1);
    expect(applyAdminRevoke).toHaveBeenCalledWith({ userId: "u2" });
    expect(refresh).toHaveBeenCalled();
  });

  it("Cancelar fecha sem chamar a action e devolve o foco ao botão", async () => {
    const { applyAdminRevoke } = setup();
    const trigger = screen.getByRole("button", { name: "Aplicar revogação" });
    await userEvent.click(trigger);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(applyAdminRevoke).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("aplicar o papel de administração também pede confirmação com o nome", async () => {
    const { applyAdmin } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(applyAdmin).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("João Paulo Arruda");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Conceder administração a João Paulo Arruda" }),
    );
    expect(applyAdmin).toHaveBeenCalledTimes(1);
    expect(applyAdmin).toHaveBeenCalledWith({ userId: "u3" });
  });
});
