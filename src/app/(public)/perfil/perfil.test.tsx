import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* UX-W4-T4 (item 70): perfil com erro de leitura mostra o alerta com "Tentar de novo" e mantém
   as sessões e o "Sair" (a sessão existe mesmo sem os dados da conta). */

const readAccountProfile = vi.fn();
vi.mock("@/lib/auth/reader", () => ({
  getReader: vi.fn().mockResolvedValue({
    db: {},
    user: { id: "u1", email: "ana@exemplo.com", last_sign_in_at: null },
  }),
}));
vi.mock("@/lib/db/account", () => ({
  readAccountProfile: (...args: unknown[]) => readAccountProfile(...args),
}));
vi.mock("./actions", () => ({
  cancelDeletionAction: vi.fn(),
  exportAccountAction: vi.fn(),
  requestDeletionAction: vi.fn(),
  signOutAction: vi.fn(),
  updateProfileAction: vi.fn(),
}));
vi.mock("../redefinir-senha/actions", () => ({ newPasswordAction: vi.fn() }));
vi.mock("@/components", async (orig) => ({
  ...(await orig<typeof import("@/components")>()),
  LocalProfileCard: () => null,
  ProfileDetailsForm: () => <p>formulario-da-conta</p>,
  NewPasswordForm: () => <p>formulario-da-senha</p>,
  ExportAccountButton: () => null,
  DeleteAccount: () => null,
}));

import ProfilePage from "./page";

describe("/perfil · erro de leitura (UX-W4-T4, item 70)", () => {
  beforeEach(() => {
    readAccountProfile.mockReset();
  });

  it("falha ao ler a conta: alerta com Tentar de novo; sessões e Sair continuam", async () => {
    readAccountProfile.mockRejectedValue(new Error("rede"));
    render(await ProfilePage({ searchParams: Promise.resolve({}) }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não conseguimos carregar os dados da sua conta agora");
    expect(within(alert).getByRole("link", { name: "Tentar de novo" })).toHaveAttribute(
      "href",
      "/perfil",
    );
    const sessions = screen.getByRole("region", { name: "Sessões" });
    expect(within(sessions).getByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(
      within(sessions).getByRole("button", { name: "Sair de todos os dispositivos" }),
    ).toBeInTheDocument();
    // Sem os dados, o que depende deles não aparece.
    expect(screen.queryByText("formulario-da-conta")).toBeNull();
  });

  it("leitura ok: sem alerta de erro", async () => {
    readAccountProfile.mockResolvedValue({
      displayName: "Ana",
      neighborhood: null,
      deleteRequestedAt: null,
      staff: false,
    });
    render(await ProfilePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("formulario-da-conta")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sessões" })).toBeInTheDocument();
  });
});
