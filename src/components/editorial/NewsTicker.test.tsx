import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewsTicker } from "./NewsTicker";

const ITEMS = [
  { title: "Obra no Coxipó", href: "/materia/obra", scope: "cuiaba" as const },
  { title: "Safra em MT", href: "/materia/safra", scope: "mt" as const },
];

describe("NewsTicker", () => {
  it("mostra o rótulo e links reais para cada manchete", () => {
    render(<NewsTicker items={ITEMS} />);
    const region = screen.getByRole("region", { name: "Últimas notícias" });
    expect(within(region).getByText("Última hora")).toBeInTheDocument();
    const links = within(region).getAllByRole("link", { name: "Obra no Coxipó" });
    expect(links[0]).toHaveAttribute("href", "/materia/obra");
  });

  it("uma lista só, sem cópia escondida (não há laço)", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.querySelectorAll('[aria-hidden="true"] a')).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("não se move sozinho: sem animação, com rolagem manual e encaixe", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.innerHTML).not.toMatch(/animate-ticker|animation-play-state/);
    expect(container.querySelector("[aria-live]")).toBeNull();
    const scroller = container.querySelector("ul")!.parentElement!;
    expect(scroller).toHaveClass("overflow-x-auto", "snap-x");
  });

  it("manchetes e rótulo em caixa de frase, 14 px", () => {
    const { container } = render(<NewsTicker items={ITEMS} />);
    expect(container.innerHTML).not.toMatch(/uppercase/);
    for (const a of screen.getAllByRole("link")) {
      expect(a).toHaveClass("text-14", "min-h-tap");
      expect(a.className).not.toMatch(/text-12/);
    }
    expect(screen.getByText("Última hora")).toHaveClass("text-14");
  });

  describe("rolagem por mouse no desktop (sem barra visível, sem movimento automático)", () => {
    function setup(scrollLeft = 0) {
      const { container } = render(<NewsTicker items={ITEMS} />);
      const scroller = container.querySelector("ul")!.parentElement!;
      Object.defineProperty(scroller, "clientWidth", { value: 300, configurable: true });
      Object.defineProperty(scroller, "scrollWidth", { value: 900, configurable: true });
      scroller.scrollLeft = scrollLeft;
      const scrollBy = vi.fn();
      scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      return { container, scroller, scrollBy };
    }

    it("sem o que rolar, não mostra os botões", () => {
      render(<NewsTicker items={ITEMS} />);
      expect(screen.queryByRole("button", { name: "Próximas manchetes" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Manchetes anteriores" })).toBeNull();
    });

    it("botões anterior e próximo rolam a faixa; só no desktop; rolagem suave só com motion-safe", () => {
      const { scroller, scrollBy } = setup();
      expect(scroller.className).toMatch(/(^|\s)motion-safe:scroll-smooth(\s|$)/);
      const next = screen.getByRole("button", { name: "Próximas manchetes" });
      const prev = screen.getByRole("button", { name: "Manchetes anteriores" });
      expect(next.parentElement!.className).toMatch(/(^|\s)hidden(\s|$)/);
      expect(next.parentElement!.className).toMatch(/lg:flex/);
      for (const b of [next, prev]) expect(b).toHaveClass("size-tap");
      // No começo: "anterior" fica indisponível, mas focável (o foco nunca cai no body).
      expect(prev).toHaveAttribute("aria-disabled", "true");
      expect(prev).not.toBeDisabled();
      fireEvent.click(prev);
      expect(scrollBy).not.toHaveBeenCalled();
      fireEvent.click(next);
      expect(scrollBy).toHaveBeenCalledTimes(1);
      expect(scrollBy.mock.calls[0]![0].left).toBeGreaterThan(0);
      // CSS decide a suavidade (motion-safe:scroll-smooth): nada de behavior "smooth" no código.
      expect(scrollBy.mock.calls[0]![0].behavior).toBeUndefined();
    });

    it("no fim, 'próximo' fica indisponível e 'anterior' volta", () => {
      const { scroller, scrollBy } = setup();
      act(() => {
        scroller.scrollLeft = 600;
        scroller.dispatchEvent(new Event("scroll"));
      });
      const next = screen.getByRole("button", { name: "Próximas manchetes" });
      expect(next).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(next);
      expect(scrollBy).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Manchetes anteriores" }));
      expect(scrollBy.mock.calls[0]![0].left).toBeLessThan(0);
    });

    it("a roda do mouse (vertical) rola a faixa na horizontal enquanto houver para onde ir", () => {
      const { scroller, scrollBy } = setup();
      const down = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
      act(() => {
        scroller.dispatchEvent(down);
      });
      expect(down.defaultPrevented).toBe(true);
      expect(scrollBy).toHaveBeenCalledTimes(1);
      expect(scrollBy.mock.calls[0]![0].left).toBe(120);
      // No começo, rolar "para cima" não tem para onde ir: a página rola normalmente.
      const up = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
      act(() => {
        scroller.dispatchEvent(up);
      });
      expect(up.defaultPrevented).toBe(false);
      expect(scrollBy).toHaveBeenCalledTimes(1);
      // Gesto horizontal do trackpad fica com o navegador.
      const side = new WheelEvent("wheel", {
        deltaX: 80,
        deltaY: 5,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        scroller.dispatchEvent(side);
      });
      expect(side.defaultPrevented).toBe(false);
    });

    it("não cria intervalo nem quadro de animação (nada se move sozinho)", () => {
      // O `Link` do Next agenda o prefetch com setTimeout; o que moveria a faixa seria um
      // intervalo ou um laço de requestAnimationFrame.
      const interval = vi.spyOn(window, "setInterval");
      const raf = vi.spyOn(window, "requestAnimationFrame");
      setup();
      expect(interval).not.toHaveBeenCalled();
      expect(raf).not.toHaveBeenCalled();
      interval.mockRestore();
      raf.mockRestore();
    });
  });

  it("não renderiza sem itens", () => {
    const { container } = render(<NewsTicker items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
