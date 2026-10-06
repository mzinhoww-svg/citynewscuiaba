import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comboOf, helpEntries, isEditable, useHotkeys } from "./use-hotkeys";

function press(target: EventTarget, init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("comboOf", () => {
  it("tecla simples vira ela mesma; Ctrl e ⌘ viram mod", () => {
    expect(comboOf(new KeyboardEvent("keydown", { key: "j" }))).toBe("j");
    expect(comboOf(new KeyboardEvent("keydown", { key: "?", shiftKey: true }))).toBe("?");
    expect(comboOf(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }))).toBe("mod+s");
    expect(comboOf(new KeyboardEvent("keydown", { key: "S", metaKey: true }))).toBe("mod+s");
  });

  it("Alt, Shift com letra e Ctrl+Shift não casam com atalho nenhum", () => {
    expect(comboOf(new KeyboardEvent("keydown", { key: "j", altKey: true }))).toBeNull();
    expect(comboOf(new KeyboardEvent("keydown", { key: "J", shiftKey: true }))).toBe("J");
    expect(
      comboOf(new KeyboardEvent("keydown", { key: "S", ctrlKey: true, shiftKey: true })),
    ).toBeNull();
  });
});

describe("isEditable", () => {
  it("campo de texto, área de texto, lista e contenteditable são editáveis; caixa de seleção não", () => {
    document.body.innerHTML = `
      <input id="t" type="text" /><input id="c" type="checkbox" /><textarea id="a"></textarea>
      <select id="s"><option>1</option></select><div id="e" contenteditable="true"><p id="p">x</p></div>
      <button id="b">b</button>`;
    const $ = (id: string) => document.getElementById(id);
    expect(isEditable($("t"))).toBe(true);
    expect(isEditable($("a"))).toBe(true);
    expect(isEditable($("s"))).toBe(true);
    expect(isEditable($("p"))).toBe(true);
    expect(isEditable($("c"))).toBe(false);
    expect(isEditable($("b"))).toBe(false);
  });
});

describe("useHotkeys (UX-W3-T5, item 53)", () => {
  it("j dispara fora de campo e não dispara com foco num input", () => {
    const j = vi.fn();
    renderHook(() => useHotkeys({ j }));
    document.body.innerHTML = `<input id="t" /><button id="b">b</button>`;

    press(document.getElementById("b")!, { key: "j" });
    expect(j).toHaveBeenCalledTimes(1);

    press(document.getElementById("t")!, { key: "j" });
    expect(j).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+S e ⌘+S disparam mesmo no campo e impedem o salvar do navegador", () => {
    const save = vi.fn();
    renderHook(() => useHotkeys({ "mod+s": save }));
    document.body.innerHTML = `<textarea id="a"></textarea>`;
    const a = document.getElementById("a")!;

    const e1 = press(a, { key: "s", ctrlKey: true });
    const e2 = press(a, { key: "s", metaKey: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(e1.defaultPrevented).toBe(true);
    expect(e2.defaultPrevented).toBe(true);
  });

  it("tecla sem atalho segue normal (Tab não é tocado)", () => {
    const j = vi.fn();
    renderHook(() => useHotkeys({ j }));
    const e = press(document.body, { key: "Tab" });
    expect(e.defaultPrevented).toBe(false);
    expect(j).not.toHaveBeenCalled();
  });

  it("enabled: false desliga; atalho simples não dispara com diálogo modal aberto", () => {
    const j = vi.fn();
    const { rerender } = renderHook(({ on }) => useHotkeys({ j }, { enabled: on }), {
      initialProps: { on: false },
    });
    press(document.body, { key: "j" });
    expect(j).not.toHaveBeenCalled();

    rerender({ on: true });
    document.body.innerHTML = `<dialog open><button id="b">b</button></dialog>`;
    press(document.getElementById("b")!, { key: "j" });
    expect(j).not.toHaveBeenCalled();
  });

  it("registra a ajuda enquanto montado e a retira ao desmontar", () => {
    const help = [{ keys: ["j"], label: "Próxima" }];
    const { unmount } = renderHook(() => useHotkeys({ j: () => {} }, { help }));
    expect(helpEntries()).toEqual(help);
    unmount();
    expect(helpEntries()).toEqual([]);
  });
});
