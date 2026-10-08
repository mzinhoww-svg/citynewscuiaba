import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastInput } from "./Toast";

function Trigger({ toast }: { toast: ToastInput }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(toast)}>
      Remover
    </button>
  );
}

function setup(toast: ToastInput) {
  render(
    <ToastProvider>
      <Trigger toast={toast} />
    </ToastProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Remover" });
  act(() => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  return trigger;
}

describe("Toast (item 36)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("região viva existe antes de qualquer aviso, sem duplicar o status da página", () => {
    const { container } = render(
      <ToastProvider>
        <p>conteúdo</p>
      </ToastProvider>,
    );
    const region = container.querySelector("[data-toast-region]");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a região que recebe o aviso é a mesma que já estava montada", () => {
    const { container } = render(
      <ToastProvider>
        <Trigger toast={{ message: "Fonte removida" }} />
      </ToastProvider>,
    );
    const before = container.querySelector("[data-toast-region]");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Remover" })));
    expect(screen.getByRole("status")).toBe(before);
  });

  it("show põe a mensagem na região status", () => {
    setup({ message: "Fonte removida" });
    expect(screen.getByRole("status")).toHaveTextContent("Fonte removida");
  });

  it("some sozinho depois de 6 s", () => {
    setup({ message: "Fonte removida" });
    act(() => vi.advanceTimersByTime(5900));
    expect(screen.getByRole("status")).toHaveTextContent("Fonte removida");
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Fonte removida")).toBeNull();
  });

  it("com foco no botão de ação não some; volta a contar quando o foco sai", () => {
    const trigger = setup({
      message: "Fonte removida",
      action: { label: "Desfazer", onClick: () => {} },
    });
    const undo = screen.getByRole("button", { name: "Desfazer" });
    act(() => undo.focus());
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toHaveTextContent("Fonte removida");
    act(() => trigger.focus());
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.queryByText("Fonte removida")).toBeNull();
  });

  it("pausa com o ponteiro sobre o aviso", () => {
    setup({ message: "Fonte removida" });
    const toast = screen.getByText("Fonte removida");
    act(() => fireEvent.mouseEnter(toast.closest("[data-toast]") as Element));
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toHaveTextContent("Fonte removida");
    act(() => fireEvent.mouseLeave(toast.closest("[data-toast]") as Element));
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.queryByText("Fonte removida")).toBeNull();
  });

  it("Desfazer chama onClick, fecha e devolve o foco a quem abriu (nunca o body)", () => {
    const onClick = vi.fn();
    const trigger = setup({ message: "Fonte removida", action: { label: "Desfazer", onClick } });
    const undo = screen.getByRole("button", { name: "Desfazer" });
    act(() => undo.focus());
    act(() => fireEvent.click(undo));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Fonte removida")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
  });

  it("fechar com foco no aviso e gatilho já removido leva o foco ao conteúdo, não ao body", () => {
    function Removable() {
      const { show } = useToast();
      return (
        <main id="conteudo">
          <button type="button" onClick={() => show({ message: "Salvo" })}>
            Salvar
          </button>
        </main>
      );
    }
    const { rerender } = render(
      <ToastProvider>
        <Removable />
      </ToastProvider>,
    );
    const save = screen.getByRole("button", { name: "Salvar" });
    act(() => {
      save.focus();
      fireEvent.click(save);
    });
    const close = screen.getByRole("button", { name: "Fechar aviso" });
    act(() => close.focus());
    rerender(
      <ToastProvider>
        <main id="conteudo">
          <p>sem botão</p>
        </main>
      </ToastProvider>,
    );
    act(() => fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" })));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe("conteudo");
  });

  it("durationMs personaliza o tempo", () => {
    setup({ message: "Rápido", durationMs: 1000 });
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Rápido")).toBeNull();
  });

  it("useToast fora do provider não quebra a tela", () => {
    function Lone() {
      const { show } = useToast();
      return (
        <button type="button" onClick={() => show({ message: "x" })}>
          ok
        </button>
      );
    }
    render(<Lone />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "ok" }))).not.toThrow();
  });
});
