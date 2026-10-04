import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { Rail } from "./Rail";

function setup(props: Partial<Parameters<typeof Rail>[0]> = {}) {
  render(
    <Rail label="Assuntos em destaque" {...props}>
      <button type="button">Primeiro</button>
      <button type="button">Segundo</button>
      <button type="button">Terceiro</button>
    </Rail>,
  );
  return screen.getByRole("list", { name: "Assuntos em destaque" });
}

/** Simula a medida do navegador e avisa o trilho (como faria um resize). */
function overflow(el: HTMLElement, client: number, scroll: number) {
  Object.defineProperty(el, "clientWidth", { value: client, configurable: true });
  Object.defineProperty(el, "scrollWidth", { value: scroll, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

describe("Rail", () => {
  it("é uma lista nomeada, com um item por filho e encaixe obrigatório", () => {
    const list = setup();
    expect(list.className).toMatch(/snap-x/);
    expect(list.className).toMatch(/snap-mandatory/);
    expect(list.className).toMatch(/overflow-x-auto/);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.className).toMatch(/snap-start/);
  });

  it("tabIndex só quando há o que rolar (UX item 77)", () => {
    const list = setup();
    // jsdom: sem layout, nada transborda; o trilho não é parada de Tab à toa.
    expect(list).not.toHaveAttribute("tabindex");
    overflow(list, 300, 900);
    expect(list).toHaveAttribute("tabindex", "0");
    overflow(list, 900, 900);
    expect(list).not.toHaveAttribute("tabindex");
  });

  it("esmaece a borda que ainda tem itens, só no celular (data-fade + max-lg:scroll-fade)", () => {
    const list = setup();
    expect(list.className).toMatch(/(^|\s)max-lg:scroll-fade(\s|$)/);
    expect(list).toHaveAttribute("data-fade", "none");
    overflow(list, 300, 900);
    expect(list).toHaveAttribute("data-fade", "end");
    act(() => {
      list.scrollLeft = 300;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list).toHaveAttribute("data-fade", "both");
    act(() => {
      list.scrollLeft = 600;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list).toHaveAttribute("data-fade", "start");
  });

  it("largura do item vem de itemWidth (sm menor que md)", () => {
    const sm = setup({ itemWidth: "sm" });
    const smClass = within(sm).getAllByRole("listitem")[0]!.className;
    document.body.innerHTML = "";
    const md = setup({ itemWidth: "md" });
    const mdClass = within(md).getAllByRole("listitem")[0]!.className;
    expect(smClass).not.toEqual(mdClass);
  });

  it("setas e Home/End rolam por teclado, sem autoplay", () => {
    const list = setup();
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    list.scrollBy = scrollBy as unknown as typeof list.scrollBy;
    list.scrollTo = scrollTo as unknown as typeof list.scrollTo;
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]![0].left).toBeGreaterThanOrEqual(0);
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[1]![0].left).toBeLessThanOrEqual(0);
    fireEvent.keyDown(list, { key: "Home" });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("button", { name: "Segundo" }), { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(list, { key: "a" });
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("não rola sozinho: nenhum temporizador é criado na montagem", () => {
    vi.useFakeTimers();
    setup();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
