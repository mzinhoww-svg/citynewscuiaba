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

  it("mostra o aviso do aparelho e o convite de conta com benefícios e Agora não", () => {
    render(<FavoritesClient sourceNames={{}} />);
    expect(screen.getByText("Salvos só neste aparelho")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Por que criar uma conta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma matéria salva")).toBeInTheDocument();
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
