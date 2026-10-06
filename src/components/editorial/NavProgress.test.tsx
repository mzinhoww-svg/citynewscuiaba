/* eslint-disable @next/next/no-html-link-for-pages -- o teste usa `<a>` puro: o `<Link>`
   precisa do roteador do App Router, e o NavProgress escuta o clique no documento de todo jeito. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

import { NavProgress } from "./NavProgress";

function setup(links: React.ReactNode) {
  return render(
    <>
      <NavProgress />
      {links}
    </>,
  );
}

const bar = () => screen.queryByRole("progressbar");

// Como o `<Link>`: cancela a navegação do documento (o jsdom não navega) depois da captura.
const likeLink = (e: MouseEvent) => {
  if (e.target instanceof Element && e.target.closest("a")) e.preventDefault();
};

beforeEach(() => {
  pathname = "/";
  search = "";
  window.history.replaceState(null, "", "/");
  document.addEventListener("click", likeLink);
});
afterEach(() => {
  document.removeEventListener("click", likeLink);
  vi.useRealTimers();
});

describe("NavProgress", () => {
  it("fica fora da árvore enquanto nada carrega", () => {
    setup(<a href="/cidade">Cidade</a>);
    expect(bar()).toBeNull();
  });

  it("aparece ao clicar num link interno, sem aria-live, e some quando a rota troca", () => {
    const view = setup(<a href="/cidade">Cidade</a>);
    fireEvent.click(screen.getByRole("link", { name: "Cidade" }));
    const pb = bar();
    expect(pb).not.toBeNull();
    expect(pb).toHaveAccessibleName("Carregando a página");
    expect(pb).not.toHaveAttribute("aria-live");
    expect(pb).not.toHaveAttribute("aria-valuenow");
    expect(pb?.className).toContain("motion-safe:");
    pathname = "/cidade";
    view.rerender(
      <>
        <NavProgress />
        <a href="/cidade">Cidade</a>
      </>,
    );
    expect(bar()).toBeNull();
  });

  it("some quando só a busca da URL troca (filtro)", () => {
    pathname = "/agenda";
    window.history.replaceState(null, "", "/agenda");
    const view = setup(<a href="/agenda?gratuito=1">Gratuito</a>);
    fireEvent.click(screen.getByRole("link", { name: "Gratuito" }));
    expect(bar()).not.toBeNull();
    search = "gratuito=1";
    view.rerender(
      <>
        <NavProgress />
        <a href="/agenda?gratuito=1">Gratuito</a>
      </>,
    );
    expect(bar()).toBeNull();
  });

  it("ignora nova aba, link externo, âncora na mesma página e download", () => {
    setup(
      <>
        <a href="/cidade">Cidade</a>
        <a href="https://exemplo.test/x">Fora</a>
        <a href="/#agora">Agora</a>
        <a href="/cidade" target="_blank" rel="noreferrer">
          Nova aba
        </a>
        <a href="/api/arquivo.csv" download>
          Baixar
        </a>
      </>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Cidade" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Cidade" }), { button: 1 });
    fireEvent.click(screen.getByRole("link", { name: "Fora" }));
    fireEvent.click(screen.getByRole("link", { name: "Agora" }));
    fireEvent.click(screen.getByRole("link", { name: "Nova aba" }));
    fireEvent.click(screen.getByRole("link", { name: "Baixar" }));
    expect(bar()).toBeNull();
  });

  it("aparece ao enviar um formulário GET interno", () => {
    setup(
      <form action="/busca" method="get" onSubmit={(e) => e.preventDefault()}>
        <button type="submit">Buscar</button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(bar()).not.toBeNull();
  });

  it("não reaparece ao voltar para a página onde o clique aconteceu", () => {
    const view = setup(<a href="/cidade">Cidade</a>);
    fireEvent.click(screen.getByRole("link", { name: "Cidade" }));
    const again = () =>
      view.rerender(
        <>
          <NavProgress />
          <a href="/cidade">Cidade</a>
        </>,
      );
    pathname = "/cidade";
    again();
    expect(bar()).toBeNull();
    pathname = "/";
    again();
    expect(bar()).toBeNull();
  });

  it("tem estado final: some sozinho se a navegação nunca terminar", () => {
    vi.useFakeTimers();
    setup(<a href="/cidade">Cidade</a>);
    fireEvent.click(screen.getByRole("link", { name: "Cidade" }));
    expect(bar()).not.toBeNull();
    act(() => vi.advanceTimersByTime(15_000));
    expect(bar()).toBeNull();
  });
});
