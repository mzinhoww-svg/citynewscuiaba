import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";
import { ToastProvider } from "@/components";
import { FAVORITES_TEXT } from "@/content/pt-BR/favorites";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import type { Result } from "@/lib/result";
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

const OK: Result<unknown, "storage"> = { ok: true, value: undefined };
const FAIL: Result<unknown, "storage"> = { ok: false, error: "storage" };
const act = vi.fn(async (): Promise<Result<unknown, "storage">> => OK);
const requestLoginInvite = vi.fn();
vi.mock("@/lib/anon/invite", async (orig) => ({
  ...(await orig<typeof import("@/lib/anon/invite")>()),
  requestLoginInvite: (...a: unknown[]) => requestLoginInvite(...a),
}));
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
    act.mockReset();
    act.mockResolvedValue(OK);
    replace.mockClear();
    requestLoginInvite.mockClear();
  });

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

  describe("UX-W5-T3 (item 88): falha ao gravar vira aviso e nada muda", () => {
    const WITH_ALL = {
      ...PROFILE,
      saved: [
        {
          ref: "a1",
          at: "2026-10-03T12:00:00Z",
          progress: 0,
          title: "Obra na avenida do CPA",
          href: "/materia/obra",
        },
      ],
      follows: [{ kind: "source", id: "folha", at: "2026-10-01T12:00:00Z" }],
      collections: [{ id: "c1", name: "Fim de semana", items: [], at: "2026-10-01T12:00:00Z" }],
    } as unknown as AnonProfile;
    const renderFav = (tab?: string) =>
      render(
        <ToastProvider>
          <FavoritesClient sourceNames={{ folha: "Folha do Cerrado" }} initialTab={tab} />
        </ToastProvider>,
      );
    const expectToast = async () =>
      expect(await screen.findByText(ANON_TEXT.actFailed)).toBeVisible();

    beforeEach(() => {
      current.profile = WITH_ALL;
      act.mockResolvedValue(FAIL);
    });

    it("remover que falha devolve o item ao lugar, com o foco nele, e avisa", async () => {
      renderFav();
      await userEvent.click(
        screen.getByRole("button", { name: FAVORITES_TEXT.removeLabel("Obra na avenida do CPA") }),
      );
      await expectToast();
      expect(screen.queryByText(FAVORITES_TEXT.removed("Obra na avenida do CPA"))).toBeNull();
      expect(screen.getByRole("link", { name: "Obra na avenida do CPA" })).toBeInTheDocument();
      const remove = screen.getByRole("button", {
        name: FAVORITES_TEXT.removeLabel("Obra na avenida do CPA"),
      });
      expect(document.activeElement).toBe(remove);
    });

    it("desfazer que falha mantém o Desfazer e avisa", async () => {
      act.mockResolvedValueOnce(OK);
      renderFav();
      await userEvent.click(
        screen.getByRole("button", { name: FAVORITES_TEXT.removeLabel("Obra na avenida do CPA") }),
      );
      await userEvent.click(
        await screen.findByRole("button", {
          name: FAVORITES_TEXT.undoLabel("Obra na avenida do CPA"),
        }),
      );
      await expectToast();
      const undo = screen.getByRole("button", {
        name: FAVORITES_TEXT.undoLabel("Obra na avenida do CPA"),
      });
      expect(document.activeElement).toBe(undo);
    });

    it("deixar de seguir que falha avisa", async () => {
      renderFav("fontes");
      await userEvent.click(
        screen.getByRole("button", { name: FAVORITES_TEXT.unfollowLabel("Folha do Cerrado") }),
      );
      await expectToast();
    });

    it("criar coleção que falha mantém o nome digitado, avisa e não convida", async () => {
      renderFav("colecoes");
      const field = screen.getByLabelText(FAVORITES_TEXT.newCollection);
      await userEvent.type(field, "Para ler depois");
      await userEvent.click(screen.getByRole("button", { name: FAVORITES_TEXT.create }));
      await expectToast();
      expect(field).toHaveValue("Para ler depois");
      expect(requestLoginInvite).not.toHaveBeenCalled();
    });

    it("renomear que falha mantém o campo aberto com o nome novo e avisa", async () => {
      renderFav("colecoes");
      await userEvent.click(
        screen.getByRole("button", { name: FAVORITES_TEXT.renameLabel("Fim de semana") }),
      );
      const field = screen.getByLabelText(FAVORITES_TEXT.renameField("Fim de semana"));
      await userEvent.clear(field);
      await userEvent.type(field, "Sábado");
      await userEvent.click(screen.getByRole("button", { name: FAVORITES_TEXT.saveName }));
      await expectToast();
      expect(screen.getByLabelText(FAVORITES_TEXT.renameField("Fim de semana"))).toHaveValue(
        "Sábado",
      );
    });
  });
});
