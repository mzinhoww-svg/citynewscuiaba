import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNSAVED_TEXT } from "@/content/pt-BR/studio";
import { useUnsavedGuard } from "./use-unsaved-guard";

function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "ir";
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.append(a);
  return a;
}

/** Clica e devolve se a navegação foi cancelada (jsdom não navega: o teste só olha o evento). */
function click(a: HTMLElement, init: MouseEventInit = {}): boolean {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  // Último ouvinte (bolha na janela): impede o jsdom de tentar navegar.
  let prevented = false;
  let reached = false;
  const tail = (e: Event) => {
    reached = true;
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener("click", tail);
  a.dispatchEvent(ev);
  window.removeEventListener("click", tail);
  // O guarda cancela na captura e para a propagação: o ouvinte de teste nem chega a rodar.
  return prevented || (ev.defaultPrevented && !reached);
}

function unload(): Event & { returnValue: unknown } {
  const ev = new Event("beforeunload", { cancelable: true }) as Event & { returnValue: unknown };
  // `returnValue` de `BeforeUnloadEvent` aceita texto; no `Event` do jsdom é booleano.
  Object.defineProperty(ev, "returnValue", { value: "", writable: true });
  window.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useUnsavedGuard (item 47, E-03)", () => {
  it("com alteração pendente, sair da página pede confirmação do navegador", () => {
    renderHook(() => useUnsavedGuard(true));
    const ev = unload();
    expect(ev.defaultPrevented).toBe(true);
    expect(ev.returnValue).toBe(UNSAVED_TEXT.leave);
  });

  it("sem alteração pendente, não interfere", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderHook(() => useUnsavedGuard(false));
    expect(unload().defaultPrevented).toBe(false);
    expect(click(link("/estudio/fila"))).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("clicar num link interno chama confirm; cancelar fica na página", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true));
    expect(click(link("/estudio/fila"))).toBe(true);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_TEXT.leave);
  });

  it("confirmar deixa a navegação seguir", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHook(() => useUnsavedGuard(true, "Sair sem salvar?"));
    // O ouvinte de teste cancela a navegação do jsdom; aqui só importa que o guarda não cancelou.
    const a = link("/estudio/fila");
    let preventedByGuard = true;
    a.addEventListener("click", (e) => {
      preventedByGuard = e.defaultPrevented;
    });
    click(a);
    expect(confirm).toHaveBeenCalledWith("Sair sem salvar?");
    expect(preventedByGuard).toBe(false);
  });

  it("clique em elemento dentro do link também é interceptado", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true));
    const a = link("/estudio/fila");
    const span = document.createElement("span");
    a.append(span);
    expect(click(span)).toBe(true);
    expect(confirm).toHaveBeenCalled();
  });

  it("ignora nova aba, link externo, âncora na mesma página e clique com modificador", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true));
    click(link("/estudio/fila", { target: "_blank" }));
    click(link("https://exemplo.com/fora"));
    click(link(`${location.pathname}${location.search}#secao`));
    click(link("/estudio/fila"), { ctrlKey: true });
    click(link("/estudio/fila"), { metaKey: true });
    click(link("/arquivo.csv", { download: "" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("para de vigiar ao desmontar", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    unmount();
    expect(unload().defaultPrevented).toBe(false);
    click(link("/estudio/fila"));
    expect(confirm).not.toHaveBeenCalled();
  });
});
