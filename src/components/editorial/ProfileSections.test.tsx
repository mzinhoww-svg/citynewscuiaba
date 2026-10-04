import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";

const PROFILE = {
  anonId: "anon-123",
  createdAt: "2026-10-02T12:00:00.000Z",
  follows: [{ kind: "source", id: "mt-agora", at: "2026-10-02T12:00:00.000Z" }],
  saved: [
    { ref: "article:a", at: "2026-10-02T12:00:00.000Z", progress: 0 },
    { ref: "article:b", at: "2026-10-02T12:00:00.000Z", progress: 0 },
  ],
  history: [],
  searches: [],
  interests: [],
  hidden: [],
  collections: [],
  alerts: [],
} as unknown as AnonProfile;

const state = vi.hoisted(() => ({
  profile: null as AnonProfile | null,
  degraded: false,
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({
    profile: state.profile,
    degraded: state.degraded,
    ready: state.profile !== null,
    act: vi.fn(),
  }),
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("./download", () => ({ downloadJson: download }));

import { ExportAccountRow } from "./AccountForms";
import { BrowserDataDetails, EditProfile, ProfileActivityRows } from "./ProfileSections";

// O jsdom não abre `<dialog>` com showModal(); o navegador abre (e2e cobre o modal de verdade).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

beforeEach(() => {
  state.profile = PROFILE;
  state.degraded = false;
  download.mockReset();
});

describe("ProfileActivityRows", () => {
  it("mostra as contagens deste navegador nas linhas de Favoritos e Alertas", () => {
    render(<ProfileActivityRows />);
    const fav = screen.getByRole("link", { name: /Favoritos/ });
    expect(fav).toHaveAttribute("href", "/favoritos");
    expect(within(fav).getByText("2 salvas · 1 seguido · 0 coleções")).toBeVisible();
    expect(
      within(screen.getByRole("link", { name: /Alertas/ })).getByText("0 alertas"),
    ).toBeVisible();
  });

  it("enquanto o perfil local carrega, as linhas já navegam, sem contagem", () => {
    state.profile = null;
    render(<ProfileActivityRows />);
    expect(screen.getByRole("link", { name: "Favoritos" })).toBeInTheDocument();
  });
});

describe("EditProfile", () => {
  it("abre a folha; Salvar só ativa quando algo muda; salvar fecha e avisa", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "saved" as const }));
    render(
      <EditProfile
        action={action}
        name="Ana Cuiabana"
        email="ana@exemplo.com"
        neighborhood="Porto"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText("Nome de exibição");
    await user.clear(name);
    await user.type(name, "Ana do Porto");
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(screen.queryByLabelText("Nome de exibição")).toBeNull());
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Dados salvos.");
  });

  it("Cancelar fecha sem enviar", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "saved" as const }));
    render(<EditProfile action={action} name="Ana" email="ana@exemplo.com" neighborhood={null} />);
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Nome de exibição")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});

describe("ExportAccountRow", () => {
  it("baixa um arquivo só: dados da conta na raiz e o navegador em browser", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: true as const,
      data: JSON.stringify({ account: { email: "ana@exemplo.com" } }),
    }));
    render(<ExportAccountRow action={action} />);
    await user.click(screen.getByRole("button", { name: /Baixar meus dados/ }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [file, json] = download.mock.calls[0] as [string, string];
    expect(file).toBe("citynews-minha-conta.json");
    const parsed = JSON.parse(json) as { account: { email: string }; browser: { anonId: string } };
    expect(parsed.account.email).toBe("ana@exemplo.com");
    expect(parsed.browser.anonId).toBe("anon-123");
  });

  it("falha avisa e não baixa", async () => {
    const user = userEvent.setup();
    render(<ExportAccountRow action={async () => ({ ok: false })} />);
    await user.click(screen.getByRole("button", { name: /Baixar meus dados/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não conseguimos preparar/);
    expect(download).not.toHaveBeenCalled();
  });
});

describe("BrowserDataDetails", () => {
  it("guarda o identificador local recolhido em Detalhes técnicos", async () => {
    const user = userEvent.setup();
    render(<BrowserDataDetails signedIn={false} />);
    const summary = screen.getByText("Detalhes técnicos");
    expect(screen.getByText("anon-123")).not.toBeVisible();
    await user.click(summary);
    expect(screen.getByText("anon-123")).toBeVisible();
  });
});
