import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("Rail", () => {
  it("é uma lista nomeada, focável, com um item por filho e encaixe obrigatório", () => {
    const list = setup();
    expect(list).toHaveAttribute("tabindex", "0");
    expect(list.className).toMatch(/snap-x/);
    expect(list.className).toMatch(/snap-mandatory/);
    expect(list.className).toMatch(/overflow-x-auto/);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.className).toMatch(/snap-start/);
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
