import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";
import { FavoritesClient } from "./FavoritesClient";

/* UI-T14: aviso do aparelho, convite com benefícios e "Agora não", erro ligado ao campo. */

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
vi.mock("next/navigation", () => ({
  usePathname: () => "/favoritos",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: PROFILE, ready: true, degraded: false, act }),
}));
vi.mock("@/lib/offline/sw", () => ({ cacheSaved: vi.fn() }));

describe("FavoritesClient", () => {
  beforeEach(() => window.localStorage.clear());

  it("mostra o conteúdo antes do convite de conta (benefícios e Agora não)", () => {
    render(<FavoritesClient sourceNames={{}} />);
    const invite = screen.getByRole("region", { name: "Por que criar uma conta" });
    expect(screen.getByRole("button", { name: "Agora não" })).toBeInTheDocument();
    const empty = screen.getByText("Nenhuma matéria salva");
    const tabs = screen.getByRole("tablist", { name: "Seus favoritos" });
    // No celular a ordem do DOM é a ordem na tela: abas e salvos primeiro, convite depois.
    expect(tabs.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(empty.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O aviso de aparelho mora no cabeçalho da página, não numa caixa repetida.
    expect(screen.queryByText("Salvos só neste aparelho")).toBeNull();
  });

  it("coleção sem nome: erro com exemplo ligado ao campo, nada é criado", async () => {
    render(<FavoritesClient sourceNames={{}} />);
    await userEvent.click(screen.getByRole("tab", { name: "Coleções pessoais" }));
    await userEvent.click(screen.getByRole("button", { name: "Criar coleção" }));
    const field = screen.getByLabelText("Nome da nova coleção");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/Exemplo: Para ler no fim de semana/);
    expect(field).toHaveFocus();
    expect(act).not.toHaveBeenCalled();
  });
});
