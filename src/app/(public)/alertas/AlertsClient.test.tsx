import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";
import { ToastProvider } from "@/components";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { AlertsClient } from "./AlertsClient";

/* UI-T14: erro de formulário ligado ao campo, estado de erro dos assuntos e convite de conta. */

const PROFILE = {
  anonId: null,
  createdAt: "2026-10-01T12:00:00Z",
  follows: [],
  saved: [],
  history: [],
  searches: [],
  interests: [],
  hidden: [],
  collections: [],
  alerts: [],
} as unknown as AnonProfile;

const act = vi.fn();
const current = { profile: PROFILE };
vi.mock("next/navigation", () => ({
  usePathname: () => "/alertas",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: current.profile, ready: true, degraded: false, act }),
}));
vi.mock("@/components", async (orig) => ({
  ...(await orig<typeof import("@/components")>()),
  PushSettings: () => null,
  NotificationInviteSlot: () => null,
}));

const TARGETS = {
  bairro: [{ value: "cpa", label: "CPA" }],
  tema: [{ value: "cidade", label: "Cidade" }],
  assunto: [],
};

describe("AlertsClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    current.profile = PROFILE;
    act.mockReset();
  });

  it("remover alerta que falha ao gravar avisa por toast e o alerta continua (item 88)", async () => {
    current.profile = {
      ...PROFILE,
      alerts: [
        {
          id: "a1",
          kind: "bairro",
          target: "cpa",
          label: "CPA",
          frequency: "daily",
          channel: "browser",
          status: "active",
          at: "2026-10-01T12:00:00Z",
        },
      ],
    } as unknown as AnonProfile;
    act.mockResolvedValue({ ok: false, error: "storage" });
    render(
      <ToastProvider>
        <AlertsClient targets={TARGETS} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remover alerta CPA" }));
    expect(await screen.findByText(ANON_TEXT.actFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: "Remover alerta CPA" })).toBeInTheDocument();
  });

  it("e-mail inválido: erro com ícone e exemplo ligado ao campo, sem chamar a API", async () => {
    render(<AlertsClient targets={TARGETS} />);
    await userEvent.click(screen.getByRole("radio", { name: "E-mail" }));
    const field = screen.getByRole("textbox", { name: "E-mail" });
    await userEvent.type(field, "ana@");
    await userEvent.click(screen.getByRole("button", { name: "Criar alerta" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Exemplo: ana@exemplo.com/);
    expect(field).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("assuntos indisponíveis: explica em vez de deixar o botão mudo", async () => {
    render(<AlertsClient targets={TARGETS} topicsError />);
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "assunto");
    expect(screen.getByText(/Não conseguimos carregar os assuntos agora/)).toBeInTheDocument();
  });

  it("vazio explica e há convite de conta opcional com Agora não", () => {
    render(<AlertsClient targets={TARGETS} />);
    expect(screen.getByText("Nenhum alerta ainda")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Por que criar uma conta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeInTheDocument();
  });
});
