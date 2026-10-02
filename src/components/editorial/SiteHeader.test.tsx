import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader";

const scrollIntoView = vi.fn();
let reduced = false;

beforeEach(() => {
  scrollIntoView.mockReset();
  reduced = false;
  Element.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

describe("SiteHeader", () => {
  it("tem 4 destinos principais, Busca, Favoritos, Perfil e AGORA", () => {
    render(<SiteHeader active="home" />);
    const main = screen.getByRole("navigation", { name: "Principal" });
    expect(
      within(main)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Início", "Explorar", "Agenda", "Fontes"]);
    const quick = screen.getByRole("navigation", { name: "Busca e conta" });
    const links = within(quick).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/busca", "/favoritos", "/perfil"]);
    expect(within(quick).getByRole("link", { name: "Busca" })).toBeInTheDocument();
    expect(within(quick).getByRole("link", { name: "Favoritos" })).toBeInTheDocument();
    expect(within(quick).getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("Agora")).toBeInTheDocument();
  });

  it("marca a editoria ativa com aria-current e não marca as outras", () => {
    render(<SiteHeader active="politica" />);
    const sections = screen.getByRole("navigation", { name: "Editorias" });
    expect(within(sections).getByRole("link", { name: "Política" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sections).getByRole("link", { name: "Cidade" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("centraliza a editoria ativa ao carregar", () => {
    render(<SiteHeader active="politica" />);
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  });

  it("sem animação sob prefers-reduced-motion", () => {
    reduced = true;
    render(<SiteHeader active="politica" />);
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "center",
      block: "nearest",
      behavior: "auto",
    });
  });

  it("indica borda rolável em data-fade", () => {
    render(<SiteHeader active="cidade" />);
    const scroller = screen.getByRole("navigation", { name: "Editorias" }).querySelector("ul");
    expect(scroller).not.toBeNull();
    const el = scroller as HTMLUListElement;
    Object.defineProperty(el, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(el, "scrollWidth", { value: 900, configurable: true });
    act(() => {
      el.scrollLeft = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el).toHaveAttribute("data-fade", "end");
    act(() => {
      el.scrollLeft = 300;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el).toHaveAttribute("data-fade", "both");
    act(() => {
      el.scrollLeft = 600;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el).toHaveAttribute("data-fade", "start");
  });

  it("liga data-scrolled ao rolar a página e desliga ao voltar ao topo", () => {
    const { container } = render(<SiteHeader />);
    const header = container.querySelector("header") as HTMLElement;
    expect(header).toHaveAttribute("data-scrolled", "false");
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header).toHaveAttribute("data-scrolled", "true");
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header).toHaveAttribute("data-scrolled", "false");
  });

  it("o pulso de AGORA para sob prefers-reduced-motion", () => {
    const { container } = render(<SiteHeader />);
    const pulse = container.querySelector(".motion-reduce\\:hidden");
    expect(pulse).not.toBeNull();
    expect(pulse?.className).toContain("motion-safe:animate-live-pulse");
  });
});
