import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { value: { status: "unknown" } as Record<string, unknown> };
const updatePushPrefs = vi.fn();
const disablePush = vi.fn();
const enablePush = vi.fn();
vi.mock("@/lib/push/client", () => ({
  usePushState: () => state.value,
  pushSupport: () => "granted",
  updatePushPrefs: (p: unknown) => updatePushPrefs(p),
  disablePush: () => disablePush(),
  enablePush: (t: string) => enablePush(t),
}));

import { PushSettings } from "./PushSettings";

const ON = {
  status: "on",
  id: "s1",
  prefs: {
    follow: true,
    urgent: true,
    highlight: true,
    quietStart: 22,
    quietEnd: 7,
    dailyLimit: 3,
  },
  targets: ["source:mt-agora", "bairro:cpa"],
};

beforeEach(() => {
  updatePushPrefs.mockReset();
  disablePush.mockReset();
  enablePush.mockReset();
  state.value = { status: "unknown" };
});

describe("PushSettings (P18)", () => {
  it("estados sem suporte, sem chave e iPhone fora do app", () => {
    const { rerender } = render(<PushSettings support="unsupported" />);
    expect(
      screen.getByText("Avisos pelo celular ainda não estão disponíveis neste navegador."),
    ).toBeVisible();
    rerender(<PushSettings support="no_keys" />);
    expect(screen.getByText("Avisos pelo celular ainda não estão disponíveis.")).toBeVisible();
    rerender(<PushSettings support="ios_needs_install" />);
    expect(
      screen.getByText("No iPhone, os avisos funcionam com o CityNews na Tela de Início."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Como adicionar" })).toBeVisible();
  });

  it("desligado mostra o texto do pré-prompt e Ativar avisos; perdida pergunta se ativa de novo", async () => {
    state.value = { status: "off" };
    enablePush.mockResolvedValue({ ok: true, value: ON });
    const { rerender } = render(<PushSettings support="default" />);
    expect(
      screen.getByText(
        "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Ativar avisos" }));
    expect(enablePush).toHaveBeenCalledWith("settings");
    state.value = { status: "lost" };
    rerender(<PushSettings support="granted" />);
    expect(
      screen.getByText("Os avisos deste navegador foram desativados. Ativar de novo?"),
    ).toBeVisible();
  });

  it("negado mostra as instruções do Chrome/Edge para UA de Chrome e Já reativei", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0 Mobile Safari/537.36",
      configurable: true,
    });
    render(<PushSettings support="denied" />);
    expect(screen.getByText("Os avisos estão bloqueados neste navegador.")).toBeVisible();
    expect(screen.getByText(/Chrome ou Edge .*cadeado ao lado do endereço/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Já reativei" })).toBeVisible();
  });

  it("ativo: silêncio só oferece 18–22 e 7–10; limite 1–3; salva na hora; erro restaura o valor anterior", async () => {
    state.value = ON;
    render(<PushSettings support="granted" />);
    const start = screen.getByLabelText("Início") as HTMLSelectElement;
    expect([...start.options].map((o) => o.value)).toEqual(["18", "19", "20", "21", "22"]);
    const end = screen.getByLabelText("Fim") as HTMLSelectElement;
    expect([...end.options].map((o) => o.value)).toEqual(["7", "8", "9", "10"]);
    const limit = screen.getByLabelText("Máximo por dia") as HTMLSelectElement;
    expect([...limit.options].map((o) => o.value)).toEqual(["1", "2", "3"]);
    expect(screen.getByText("Urgentes podem chegar no silêncio.")).toBeVisible();
    updatePushPrefs.mockResolvedValueOnce({ ok: true, value: ON });
    await userEvent.click(screen.getByRole("switch", { name: "Destaques da redação" }));
    expect(updatePushPrefs).toHaveBeenCalledWith({ highlight: false });
    updatePushPrefs.mockResolvedValueOnce({ ok: false, error: "server_failed" });
    await userEvent.selectOptions(start, "20");
    expect(updatePushPrefs).toHaveBeenCalledWith({ quietStart: 20 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos salvar agora.");
    // O estado (mockado) não mudou: o valor anterior continua.
    expect((screen.getByLabelText("Início") as HTMLSelectElement).value).toBe("22");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    // Alvos enviados (transparência).
    const list = screen.getByRole("list", { name: "O que você segue" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Fonte: mt-agora", "Bairro: cpa"]);
    disablePush.mockResolvedValue({ ok: true });
    await userEvent.click(screen.getByRole("button", { name: "Desativar avisos" }));
    expect(disablePush).toHaveBeenCalled();
  });
});
