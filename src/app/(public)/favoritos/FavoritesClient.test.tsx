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
const replace = vi.fn();
const current = { profile: PROFILE };
vi.mock("next/navigation", () => ({
  usePathname: () => "/favoritos",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: current.profile, ready: true, degraded: false, act }),
}));
vi.mock("@/lib/offline/sw", () => ({ cacheSaved: vi.fn() }));

describe("FavoritesClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    current.profile = PROFILE;
    act.mockClear();
    replace.mockClear();
  });

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

  describe("UX-W4-T4 (item 71)", () => {
    const WITH_SAVED = {
      ...PROFILE,
      saved: [
        {
          ref: "a1",
          at: "2026-10-03T12:00:00Z",
          progress: 0,
          title: "Obra na avenida do CPA",
          href: "/materia/obra",
        },
        {
          ref: "a2",
          at: "2026-10-02T12:00:00Z",
          progress: 40,
          title: "Feira no Porto",
          href: "/materia/feira",
        },
      ],
    } as unknown as AnonProfile;

    it("remover leva o foco ao Desfazer, no lugar do item", async () => {
      current.profile = WITH_SAVED;
      render(<FavoritesClient sourceNames={{}} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Remover dos salvos: Obra na avenida do CPA" }),
      );
      expect(act).toHaveBeenCalledTimes(1);
      const undo = screen.getByRole("button", {
        name: "Desfazer a remoção de Obra na avenida do CPA",
      });
      expect(undo).toHaveTextContent("Desfazer");
      expect(document.activeElement).toBe(undo);
      expect(screen.getByText("Removido: Obra na avenida do CPA")).toBeInTheDocument();
      // O item removido sai da lista; o outro continua.
      expect(screen.queryByRole("link", { name: "Obra na avenida do CPA" })).toBeNull();
      expect(screen.getByRole("link", { name: "Feira no Porto" })).toBeInTheDocument();
    });

    it("Desfazer devolve o item e o foco vai ao botão dele, nunca ao body", async () => {
      current.profile = WITH_SAVED;
      render(<FavoritesClient sourceNames={{}} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Remover dos salvos: Obra na avenida do CPA" }),
      );
      await userEvent.click(screen.getByRole("button", { name: /^Desfazer/ }));
      expect(act).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: /^Desfazer/ })).toBeNull();
      const restored = screen.getByRole("button", {
        name: "Remover dos salvos: Obra na avenida do CPA",
      });
      expect(document.activeElement).toBe(restored);
      expect(document.activeElement).not.toBe(document.body);
    });

    it("remover o último salvo mantém o Desfazer em vez do estado vazio", async () => {
      current.profile = { ...WITH_SAVED, saved: WITH_SAVED.saved.slice(0, 1) };
      render(<FavoritesClient sourceNames={{}} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Remover dos salvos: Obra na avenida do CPA" }),
      );
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Desfazer/ }));
    });

    it("a aba vem de ?aba= e trocar de aba atualiza o endereço", async () => {
      render(<FavoritesClient sourceNames={{}} initialTab="fontes" />);
      expect(screen.getByRole("tab", { name: "Fontes seguidas" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await userEvent.click(screen.getByRole("tab", { name: "Coleções pessoais" }));
      expect(replace).toHaveBeenCalledWith("/favoritos?aba=colecoes", { scroll: false });
      await userEvent.click(screen.getByRole("tab", { name: "Salvos" }));
      expect(replace).toHaveBeenLastCalledWith("/favoritos", { scroll: false });
    });
  });
});
