import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./SearchBox";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const RECENT_KEY = "cn:buscas-recentes";
const fetchMock = vi.fn();

function suggestions(list: string[]) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ suggestions: list }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const box = () => screen.getByRole("combobox", { name: "Buscar no CityNews" });

describe("SearchBox · sugestões", () => {
  it("busca sugestões ao digitar, navega por setas e Enter leva à sugestão com os filtros", async () => {
    suggestions(["viaduto da Beira Rio", "viaduto do CPA"]);
    const user = userEvent.setup();
    render(<SearchBox hidden={{ origem: "citynews" }} />);
    await user.type(box(), "viad");

    const list = await screen.findByRole("listbox", { name: "Sugestões" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/search/suggest?q=viad",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(box()).toHaveAttribute("aria-expanded", "true");
    const options = within(list).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["viaduto da Beira Rio", "viaduto do CPA"]);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(box()).toHaveAttribute("aria-activedescendant", options[1]!.id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(box()).toHaveAttribute("aria-activedescendant", options[0]!.id);

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/busca?q=viaduto+da+Beira+Rio&origem=citynews");
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(["viaduto da Beira Rio"]);
  });

  it("Esc fecha a lista; menos de 2 letras não pede sugestão", async () => {
    suggestions(["ônibus do CPA"]);
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(box(), "ô");
    // A espera do debounce passa sem pedido: o campo continua fechado.
    await new Promise((r) => setTimeout(r, 250));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(box(), "n");
    await screen.findByRole("listbox", { name: "Sugestões" });
    await user.keyboard("{Escape}");
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SearchBox · erro", () => {
  it("falha de rede nas sugestões não abre lista e a busca pelo texto digitado continua", async () => {
    fetchMock.mockRejectedValue(new TypeError("rede"));
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(box(), "  agenda   cultural ");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(box()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/busca?q=agenda+cultural");
  });

  it("resposta de erro do servidor também deixa o campo sem sugestões", async () => {
    fetchMock.mockResolvedValue(new Response("falhou", { status: 500 }));
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(box(), "clima");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(box()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("option", { hidden: true })).toHaveLength(0);
  });

  it("armazenamento bloqueado não impede a busca", async () => {
    suggestions([]);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(box(), "viaduto{Enter}");
    expect(push).toHaveBeenCalledWith("/busca?q=viaduto");
    setItem.mockRestore();
  });
});

describe("SearchBox · vazio e buscas recentes", () => {
  it("campo vazio não navega", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(box());
    await user.type(box(), "   {Enter}");
    expect(push).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem buscas recentes, o foco no campo vazio não abre nada", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.click(box());
    expect(screen.queryByRole("heading", { name: "Buscas recentes" })).toBeNull();
  });

  it("com o campo vazio mostra as buscas recentes, que saem uma a uma", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["viaduto", "agenda"]));
    const user = userEvent.setup();
    render(<SearchBox hidden={{ origem: "citynews" }} />);
    await user.click(box());
    const recent = screen.getByRole("heading", { name: "Buscas recentes" }).parentElement!;
    expect(within(recent).getByRole("link", { name: "viaduto" })).toHaveAttribute(
      "href",
      "/busca?q=viaduto&origem=citynews",
    );
    await user.click(
      within(recent).getByRole("button", { name: "Remover “viaduto” das buscas recentes" }),
    );
    expect(within(recent).queryByRole("link", { name: "viaduto" })).toBeNull();
    expect(JSON.parse(localStorage.getItem(RECENT_KEY)!)).toEqual(["agenda"]);
  });
});
