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
  // Pedido antigo (fluxo de antes da 0158): não vira mais botão "Aplicar".
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
  const setRoles = vi.fn().mockResolvedValue(ok);
  render(
    <StaffTable
      staff={[marta, joao]}
      sections={[]}
      currentUserId="u1"
      invite={vi.fn()}
      setRoles={setRoles}
    />,
  );
  return { setRoles };
}

async function openRoles(name: string) {
  const row = screen.getByRole("row", { name: new RegExp(name) });
  await userEvent.click(within(row).getByRole("button", { name: "Editar papéis" }));
  return screen.getByRole("dialog", { name: `Papéis de ${name}` });
}

describe("StaffTable · papel numa ação só (item 61, A-150)", () => {
  it("conceder papel comum salva numa ação, sem confirmação extra", async () => {
    const { setRoles } = setup();
    const dialog = await openRoles("João Paulo Arruda");
    await userEvent.click(within(dialog).getByLabelText("Analista"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar papéis" }));
    expect(setRoles).toHaveBeenCalledTimes(1);
    expect(setRoles).toHaveBeenCalledWith({
      userId: "u3",
      roles: [
        { role: "editor_chefe", sections: [] },
        { role: "analista", sections: [] },
      ],
      justification: "",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("conceder administração pede confirmação com nome e efeito e chama a action uma vez", async () => {
    const { setRoles } = setup();
    const dialog = await openRoles("João Paulo Arruda");
    await userEvent.click(within(dialog).getByLabelText("Administração"));
    await userEvent.type(within(dialog).getByLabelText(/Justificativa/), "Cobrir férias");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar papéis" }));
    expect(setRoles).not.toHaveBeenCalled();
    const confirm = screen.getByRole("dialog", {
      name: "Conceder administração a João Paulo Arruda?",
    });
    expect(confirm).toHaveTextContent(/passa a administrar/);
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Conceder administração a João Paulo Arruda" }),
    );
    expect(setRoles).toHaveBeenCalledTimes(1);
    expect(setRoles).toHaveBeenCalledWith({
      userId: "u3",
      roles: [
        { role: "admin", sections: [] },
        { role: "editor_chefe", sections: [] },
      ],
      justification: "Cobrir férias",
    });
  });

  it("revogar administração pede justificativa e confirmação destrutiva", async () => {
    const { setRoles } = setup();
    const dialog = await openRoles("Marta Figueiredo");
    await userEvent.click(within(dialog).getByLabelText("Administração"));
    const save = within(dialog).getByRole("button", { name: "Salvar papéis" });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Justificativa/), "Saiu da equipe");
    await userEvent.click(save);
    const confirm = screen.getByRole("dialog", {
      name: "Revogar o acesso de administração de Marta Figueiredo?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Revogar acesso de Marta Figueiredo" }),
    );
    expect(setRoles).toHaveBeenCalledTimes(1);
    expect(setRoles).toHaveBeenCalledWith({
      userId: "u2",
      roles: [],
      justification: "Saiu da equipe",
    });
  });

  it("Cancelar a confirmação não chama a action e mantém a edição aberta", async () => {
    const { setRoles } = setup();
    const dialog = await openRoles("João Paulo Arruda");
    await userEvent.click(within(dialog).getByLabelText("Administração"));
    await userEvent.type(within(dialog).getByLabelText(/Justificativa/), "Cobrir férias");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar papéis" }));
    const confirm = screen.getByRole("dialog", {
      name: "Conceder administração a João Paulo Arruda?",
    });
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(setRoles).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Conceder administração/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Papéis de João Paulo Arruda" })).toBeVisible();
    expect(within(dialog).getByLabelText("Administração")).toBeChecked();
  });

  it("pedido antigo aprovado não vira botão Aplicar: a concessão é uma ação só", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^Aplicar/ })).toBeNull();
  });
});
