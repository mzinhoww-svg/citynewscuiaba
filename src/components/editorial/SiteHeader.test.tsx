import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

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
  pathname = "/";
});

const scrollTo = (y: number) =>
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });

describe("SiteHeader", () => {
  it("o logo não leva padding vertical que o faça passar da altura da linha principal", () => {
    const { container } = render(<SiteHeader active="home" />);
    const logos = container.querySelectorAll("a[aria-label] svg");
    expect(logos.length).toBe(2);
    logos.forEach((svg) => {
      const cls = svg.getAttribute("class") ?? "";
      expect(cls).not.toContain("box-content");
      expect(cls).not.toMatch(/\bp-\d/);
    });
  });

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

  it("indica borda rolável em data-fade no <nav>, nunca com máscara na lista rolável", () => {
    render(<SiteHeader active="cidade" />);
    const nav = screen.getByRole("navigation", { name: "Editorias" });
    const scroller = nav.querySelector("ul");
    expect(scroller).not.toBeNull();
    const el = scroller as HTMLUListElement;
    Object.defineProperty(el, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(el, "scrollWidth", { value: 900, configurable: true });
    act(() => {
      el.scrollLeft = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(nav).toHaveAttribute("data-fade", "end");
    act(() => {
      el.scrollLeft = 300;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(nav).toHaveAttribute("data-fade", "both");
    act(() => {
      el.scrollLeft = 600;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(nav).toHaveAttribute("data-fade", "start");
    // Safari do iPhone pinta de preto um contêiner rolável com `mask-image` (faixa preta).
    expect(el).not.toHaveAttribute("data-fade");
    expect(el.className).not.toContain("scroll-fade");
    expect(nav.className).toContain("scroll-fade");
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
  it("recolhe as editorias ao rolar para baixo além de 48 px e mostra ao rolar para cima", () => {
    render(<SiteHeader />);
    const sections = screen.getByRole("navigation", { name: "Editorias" });
    expect(sections).toHaveAttribute("data-hidden", "false");
    scrollTo(40);
    expect(sections).toHaveAttribute("data-hidden", "false");
    scrollTo(300);
    expect(sections).toHaveAttribute("data-hidden", "true");
    scrollTo(240);
    expect(sections).toHaveAttribute("data-hidden", "false");
    scrollTo(600);
    expect(sections).toHaveAttribute("data-hidden", "true");
    scrollTo(0);
    expect(sections).toHaveAttribute("data-hidden", "false");
  });

  it("o ajuste de poucos pixels do navegador ao encolher o cabeçalho não traz a fileira de volta", () => {
    render(<SiteHeader />);
    const sections = screen.getByRole("navigation", { name: "Editorias" });
    scrollTo(800);
    scrollTo(812);
    expect(sections).toHaveAttribute("data-hidden", "true");
    // Ancoragem da rolagem: o navegador devolve 12 px para cima, em passos.
    for (const y of [809, 804, 802, 800]) scrollTo(y);
    expect(sections).toHaveAttribute("data-hidden", "true");
    // A pessoa sobe de verdade.
    scrollTo(700);
    expect(sections).toHaveAttribute("data-hidden", "false");
  });

  it("o recolhimento move só transform, com transição apenas sem movimento reduzido", () => {
    render(<SiteHeader />);
    const cls = screen.getByRole("navigation", { name: "Editorias" }).className;
    expect(cls).toContain("data-[hidden=true]:-translate-y-full");
    // Teclado: um link focado na fileira recolhida a traz de volta.
    expect(cls).toContain("data-[hidden=true]:focus-within:translate-y-0");
    expect(cls).toContain("motion-safe:transition-transform");
    expect(cls.split(/\s+/)).not.toContain("transition-transform");
  });

  it("publica a altura do cabeçalho em --cn-header-h", () => {
    const observed: Element[] = [];
    let notify: () => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      },
    );
    let h = 102;
    const spy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === "HEADER" ? h : 0;
    });
    const { container, unmount } = render(<SiteHeader />);
    const root = document.documentElement;
    expect(observed).toContain(container.querySelector("header"));
    expect(root.style.getPropertyValue("--cn-header-h")).toBe("102px");
    h = 90;
    act(() => notify());
    expect(root.style.getPropertyValue("--cn-header-h")).toBe("90px");
    unmount();
    expect(root.style.getPropertyValue("--cn-header-h")).toBe("");
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("AGORA leva a /#agora e pulsa só na home", () => {
    pathname = "/";
    const { container, unmount } = render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "Agora" });
    expect(link).toHaveAttribute("href", "/#agora");
    expect(link.className).toContain("min-h-tap");
    expect(container.querySelector(".motion-safe\\:animate-live-pulse")).not.toBeNull();
    unmount();
    pathname = "/agenda";
    const other = render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Agora" })).toHaveAttribute("href", "/#agora");
    expect(other.container.querySelector(".motion-safe\\:animate-live-pulse")).toBeNull();
  });
});
