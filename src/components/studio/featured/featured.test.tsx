import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeaturedHistoryRow } from "@/lib/db/queries/admin";
import type { BoardItem, BoardSlot } from "@/lib/studio/featured";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { FeaturedBoard } from "./FeaturedBoard";
import { PinHistory } from "./PinHistory";
import type { FeaturedApi, SearchHit } from "./types";

// 14h10 em Cuiabá
const NOW = "2026-10-03T18:10:00.000Z";
const inHours = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
  pinId: null,
  articleId: "a1",
  title: "Plantio de soja em MT avança",
  href: "/materia/plantio-de-soja",
  sectionName: "Economia",
  publishedAt: "2026-10-03T16:00:00.000Z",
  imageSrc: "/api/media/m1",
  pinnedBy: null,
  note: "",
  endsAt: null,
  ...over,
});

const slot = (over: Partial<BoardSlot> = {}): BoardSlot => ({
  id: "home.lead",
  slotKey: "home.lead",
  label: "Início · manchete",
  page: "home",
  capacity: 1,
  section: null,
  items: [item()],
  source: "automatic",
  until: "2026-10-03T19:00:00.000Z",
  dropped: [],
  free: 1,
  ...over,
});

function api(over: Partial<FeaturedApi> = {}): FeaturedApi {
  return {
    pin: vi.fn().mockResolvedValue({ ok: true, message: "ok" }),
    unpin: vi.fn().mockResolvedValue({ ok: true, message: "Fixação removida." }),
    reorder: vi.fn().mockResolvedValue({ ok: true, message: "Ordem atualizada." }),
    search: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

describe("FeaturedBoard · estados", () => {
  it("vazio: sem posições, explica em vez de deixar a tela em branco", () => {
    render(<FeaturedBoard board={[]} api={api()} nowIso={NOW} />);
    expect(screen.getByText("Sem matéria nesta posição")).toBeInTheDocument();
  });

  it("automático: mostra o ocupante e 'Sem pino: o automático ocupa até 15h.'", () => {
    render(<FeaturedBoard board={[slot()]} api={api()} nowIso={NOW} />);
    const card = screen.getByRole("region", { name: "Início · manchete" });
    expect(within(card).getByText(/Automático/)).toBeInTheDocument();
    expect(within(card).getByText("Sem pino: o automático ocupa até 15h.")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Plantio de soja em MT avança" }),
    ).toHaveAttribute("href", "/materia/plantio-de-soja");
    expect(within(card).getByRole("button", { name: /Fixar matéria/ })).toBeEnabled();
    expect(within(card).queryByRole("button", { name: /Remover/ })).toBeNull();
  });

  it("posição sem candidata: texto de vazio próprio", () => {
    render(
      <FeaturedBoard
        board={[slot({ items: [], until: null, free: 1 })]}
        api={api()}
        nowIso={NOW}
      />,
    );
    expect(
      screen.getByText("Sem pino e sem matéria com capa para o automático."),
    ).toBeInTheDocument();
  });

  it("manual: mostra quem fixou, o prazo e os botões Trocar e Remover", () => {
    const pinned = item({ pinId: "p1", pinnedBy: "Maria", endsAt: inHours(3) });
    render(
      <FeaturedBoard
        board={[slot({ items: [pinned], source: "manual", free: 0, until: inHours(3) })]}
        api={api()}
        nowIso={NOW}
      />,
    );
    expect(screen.getByTestId("pin-info")).toHaveTextContent("Fixada por Maria · até 17h");
    expect(screen.getByRole("button", { name: /Trocar/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Remover/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Fixar matéria/ })).toBeDisabled();
  });

  it("pino cuja matéria saiu do ar avisa e oferece escolher outra", () => {
    render(
      <FeaturedBoard
        board={[
          slot({
            dropped: [{ pinId: "p9", title: "Matéria antiga", reason: "gone" }],
            free: 0,
          }),
        ]}
        api={api()}
        nowIso={NOW}
      />,
    );
    expect(screen.getByText(/saiu do ar/)).toBeInTheDocument();
    expect(screen.getByText("Matéria antiga")).toBeInTheDocument();
  });
});

describe("FeaturedBoard · remover", () => {
  const pinnedSlot = (endsAt: string | null) =>
    slot({
      items: [item({ pinId: "p1", pinnedBy: "Maria", endsAt })],
      source: "manual",
      free: 0,
    });

  it("faltando até 24 h remove direto, sem digitar", async () => {
    const a = api();
    render(<FeaturedBoard board={[pinnedSlot(inHours(5))]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Remover/ }));
    await waitFor(() => expect(a.unpin).toHaveBeenCalledWith({ id: "p1" }));
    expect(await screen.findByText("Fixação removida.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("faltando mais de 24 h (ou sem prazo) exige digitar REMOVER", async () => {
    const a = api();
    render(<FeaturedBoard board={[pinnedSlot(inHours(72))]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Remover/ }));
    expect(a.unpin).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Remover fixação" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Digite REMOVER"), "remover");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(a.unpin).toHaveBeenCalledWith({ id: "p1" }));
  });

  it("sem prazo também pede a confirmação digitada", async () => {
    const a = api();
    render(<FeaturedBoard board={[pinnedSlot(null)]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Remover/ }));
    expect(screen.getByText(/sem prazo/)).toBeInTheDocument();
    expect(a.unpin).not.toHaveBeenCalled();
  });

  it("erro do servidor aparece como alerta e a tela não recarrega", async () => {
    const a = api({
      unpin: vi.fn().mockResolvedValue({ ok: false, message: "A fixação não foi encontrada." }),
    });
    render(<FeaturedBoard board={[pinnedSlot(inHours(1))]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Remover/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A fixação não foi encontrada.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("FeaturedBoard · reordenar", () => {
  const three = slot({
    id: "home.destaques",
    slotKey: "home.destaques",
    label: "Início · destaques",
    capacity: 3,
    source: "manual",
    free: 1,
    items: [
      item({ pinId: "p1", articleId: "a1", title: "Primeira", endsAt: null }),
      item({ pinId: "p2", articleId: "a2", title: "Segunda", endsAt: null }),
    ],
  });

  it("botões Subir e Descer (sem arrastar), com os limites desabilitados", async () => {
    const a = api();
    render(<FeaturedBoard board={[three]} api={a} nowIso={NOW} />);
    expect(screen.getByRole("button", { name: "Subir: Primeira" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer: Segunda" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Subir: Segunda" }));
    await waitFor(() =>
      expect(a.reorder).toHaveBeenCalledWith({ slotKey: "home.destaques", ids: ["p2", "p1"] }),
    );
  });
});

describe("FeaturedBoard · fixar", () => {
  const hits: SearchHit[] = [
    {
      id: "n1",
      title: "Nova ponte é inaugurada",
      sectionName: "Cidade",
      publishedAt: "2026-10-03T17:30:00.000Z",
      imageSrc: "/api/media/m9",
      imageAlt: "Ponte",
    },
    {
      id: "n2",
      title: "Reunião sem foto",
      sectionName: "Política",
      publishedAt: "2026-10-03T17:00:00.000Z",
      imageSrc: null,
      imageAlt: "",
    },
  ];

  it("busca, bloqueia matéria sem capa, mostra a pré-visualização e fixa", async () => {
    const a = api({ search: vi.fn().mockResolvedValue(hits) });
    render(<FeaturedBoard board={[slot()]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Fixar matéria/ }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await userEvent.type(within(dialog).getByLabelText("Buscar por título"), "ponte");
    expect(await within(dialog).findByText("Nova ponte é inaugurada")).toBeInTheDocument();

    // Sem capa: aviso e botão Escolher desabilitado
    expect(within(dialog).getByText("Sem capa aprovada")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Escolher: Reunião sem foto" }),
    ).toBeDisabled();

    const fix = within(dialog).getByRole("button", { name: "Fixar" });
    expect(fix).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Escolher: Nova ponte é inaugurada" }),
    );
    expect(within(dialog).getByTestId("pin-preview")).toHaveTextContent(
      "Início · manchete passa a mostrar: Nova ponte é inaugurada.",
    );
    expect(within(dialog).getByText("Fica até você remover.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("radio", { name: "6 h" }));
    expect(
      within(dialog).getByText(/Termina 20h10; depois volta ao automático\./),
    ).toBeInTheDocument();

    expect(fix).toBeEnabled();
    await userEvent.click(fix);
    await waitFor(() =>
      expect(a.pin).toHaveBeenCalledWith({
        slotKey: "home.lead",
        sectionSlug: undefined,
        articleId: "n1",
        duration: "6h",
        note: undefined,
        replaceId: undefined,
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("falha do servidor fica no formulário, com a mensagem", async () => {
    const a = api({
      search: vi.fn().mockResolvedValue([hits[0]]),
      pin: vi.fn().mockResolvedValue({ ok: false, message: "A posição está cheia." }),
    });
    render(<FeaturedBoard board={[slot()]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Fixar matéria/ }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await userEvent.type(within(dialog).getByLabelText("Buscar por título"), "ponte");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Escolher: Nova ponte é inaugurada" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Fixar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A posição está cheia.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("data final inválida bloqueia o envio", async () => {
    const a = api({ search: vi.fn().mockResolvedValue([hits[0]]) });
    render(<FeaturedBoard board={[slot()]} api={a} nowIso={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /Fixar matéria/ }));
    const dialog = screen.getByRole("dialog", { hidden: true });
    await userEvent.type(within(dialog).getByLabelText("Buscar por título"), "ponte");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Escolher: Nova ponte é inaugurada" }),
    );
    await userEvent.click(within(dialog).getByRole("radio", { name: "Até data e hora" }));
    expect(within(dialog).getByRole("button", { name: "Fixar" })).toBeDisabled();
  });
});

describe("PinHistory", () => {
  const row = (over: Partial<FeaturedHistoryRow> = {}): FeaturedHistoryRow => ({
    id: "h1",
    at: "2026-10-03T18:05:00.000Z",
    slotKey: "home.lead",
    sectionSlug: null,
    articleId: "a1",
    title: "Plantio de soja em MT avança",
    by: "Maria",
    note: "",
    endsAt: null,
    endedAt: null,
    state: "active",
    ...over,
  });

  it("vazio: explica", () => {
    render(<PinHistory rows={[]} slotLabel={(k) => k} />);
    expect(screen.getByText("Nenhuma fixação ainda.")).toBeInTheDocument();
  });

  it("lista quando, posição, matéria, quem e situação", () => {
    render(
      <PinHistory
        rows={[row(), row({ id: "h2", state: "removed", endedAt: NOW, title: "Outra" })]}
        slotLabel={() => "Início · manchete"}
      />,
    );
    const table = screen.getByRole("table", { name: "Últimos 30 pinos" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByText("Maria", { selector: "td" })).toHaveLength(2);
    expect(within(table).getByText(/Ativo/)).toBeInTheDocument();
    expect(within(table).getByText("Removido")).toBeInTheDocument();
  });
});
